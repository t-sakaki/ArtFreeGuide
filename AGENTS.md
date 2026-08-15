# AGENTS.md - ArtFreeGuide 開発ガイドライン

## 1. プロジェクト概要
作品名を入力・撮影すると、AIが多言語（日英仏中西）の音声ガイド解説を生成し、見どころと次の一枚まで案内する無料の美術鑑賞アプリ。

## 2. 技術スタック & アーキテクチャ
- **Framework**: Next.js 16（App Router） / React 19 / TypeScript / Tailwind CSS
- **Deployment**: Cloudflare Workers（OpenNext）。`main` への push で自動デプロイ
- **Database**:
    - **Cloudflare D1** `artfreeguide_db_trial`: 生成済み解説のアーカイブ（`artwork_guides` / `guide_feedback`）
    - **Supabase (PostgreSQL)**: 作品カタログ、ベクトルデータ（`pgvector`）、認証、閲覧履歴
- **LLM/Embedding**: NVIDIA NIM。モデルは wrangler.jsonc の vars で指定（解説 `nvidia/nemotron-3-super-120b-a12b`→`google/gemma-4-31b-it`、Q&A `nemotron-3-nano-30b-a3b`、サジェスト `mistralai/mistral-nemotron`、埋め込み `nvidia/llama-nemotron-embed-1b-v2`、画像認識 `nvidia/nemotron-nano-12b-v2-vl`）
- **その他**: Web Speech API（読み上げ）、Web Audio API、Wikimedia Commons / Wikidata / ja.wikipedia API

## 3. 重要な実装ルール (CRITICAL)
エージェントは以下のルールを厳守してください。

### ⚠️ Embedding に関する制約
- **列名**: 旧 `embedding` 列は使用禁止。必ず **`embedding_nv`** を使用すること。
- **検索関数**: `match_artworks` ではなく、必ず **`match_artworks_nv`** を使用すること（`src/lib/embeddings.ts` の `MATCH_FUNCTION` が `EMBEDDING_PROVIDER` から切り替える）。
- **プロバイダー**: 現在は Workers AI ではなく **NVIDIA NIM** を使用して生成しています（Workers AI の無料枠を使い切ったため）。

### ⚠️ D1 データ操作の制約
- **解説の保存**: D1 に解説データを直接 `INSERT` してはいけません。
- **正解ルート**: 必ず **`/api/chat` エンドポイントを叩いて生成・保存**させてください。直接書き込むと UI 側のパース処理で不整合が発生し、エラーになります。
- **キャッシュキーは言語別**: 日本語が温まっていても他言語は初回生成に約60秒かかります。

### ⚠️ 作品名は日本語が正
- コード内部の作品名・作家名は**日本語が常に正**で、多言語表示・共有URL・画像検索はすべて `src/lib/names.ts` を経由します。
- 世間の呼称と違う作品や、LLM が別表記を返す作品は `ARTWORK_NAMES` に足すと、表示・画像解決・パーマリンクが同時に直ります。

### ⚠️ 環境変数
- 必須: `NVIDIA_API_KEY` / `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- 任意: `ADMIN_EMAILS`（`/admin/*` の許可アドレス）、`ADMIN_TOKEN`（スクリプトからの管理API呼び出し）
- 一覧と既定値は `.env.example` を参照。本番は Workers secret と wrangler.jsonc の vars。

## 4. リポジトリ構造と責務
- `src/app/page.tsx`: メタデータ/OGP の生成と `HomeClient` のマウントのみ（40行程度）。
- `src/app/HomeClient.tsx`: 画面全体の状態機械。解説・読み上げ・見どころ・推薦・履歴・共有はここ。
- `src/app/[slug]/page.tsx`: パーマリンク（`/girl-with-a-pearl-earring`、ツアーは `/impressionism`）。旧クエリURLも動作。
- `src/app/api/chat`: 解説生成および D1 キャッシュ管理。
- `src/app/api/recommendations`: pgvector による類似作品の推薦。
- `src/app/api/suggest`: 入力補完（アーカイブ→カタログ→AI の順で候補を返す。推薦ではない）。
- `src/app/api/artwork-image`: Wikidata/Commons による画像解決とカタログ書き戻し。
- `src/app/api/identify`: 写真からの作品特定（VLM）。
- `src/lib/names.ts`: 作品名・作家名の多言語辞書。`src/lib/slug.ts` のパーマリンクもここから生成。
- `src/lib/playlists.ts`: ツアー構成（作品順序）の定義ファイル。**外部ブランチのマージで多言語データが消えた事故があるため差分必須確認**。
- `src/lib/guideStore/`: D1/Supabase へのデータアクセス層。

## 5. ワークフロー
- **ブランチ戦略**: `main`（本番）。作業は `feat/` または `devin/` ブランチで行い、PR 経由で `main` へ。`main` へ直接 push しない。
- **デプロイ**: `main` への push で Cloudflare が自動デプロイ（手動なら `npx wrangler deploy`。wrangler は Node 22 以上が必要）。
- **確認コマンド**: `npm ci` → `npx tsc --noEmit` → `npm run build`（OpenNext ビルドまで通ること）。
- **デプロイ後のウォームアップ**: `node scripts/warm_cache.mjs --images-only --concurrency=1` と `--guides-only --locales=ja,en --limit=20 --concurrency=1`。

## 6. 既知の課題
- **Embedding 埋め合わせ**: NVIDIA NIM 移行後、一部の作品で `embedding_nv` が未生成である可能性があります。`/api/embeddings/backfill` または `scripts/backfill_embeddings.mjs` で補完してください。
- **JSON 不整合**: LLM が稀に JSON 形式を崩して解説生成に失敗します（リトライは未実装）。再読込で回復するため、デモ前に `scripts/warm_cache.mjs` で該当作品をキャッシュ済みにしておきます。
- **画像のない作品**: 著作権保護作品（ダリ・ピカソ・マグリット等）は Commons に画像がないため🖼️プレースホルダのままになります。データ不備ではありません。
- **読み上げの検証**: ヘッドレス環境には音声エンジンがないため、実際の音は検証できません。UI の進行のみ確認します。

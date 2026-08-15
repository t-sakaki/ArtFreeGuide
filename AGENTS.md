# AGENTS.md - ArtFreeGuide 開発ガイドライン

## 1. プロジェクト概要
AIが作品解説を生成し、音楽と共に提供する没入型アートガイドアプリ。
ユーザーの好みに合わせた作品推薦と、ストーリー仕立てのツアー体験を提供します。

## 2. 技術スタック & アーキテクチャ
- **Framework**: Next.js (App Router)
- **Deployment**: Cloudflare Workers (OpenNext)
- **Database**: 
    - **Cloudflare D1**: 生成済み解説データのキャッシュ・保存
    - **Supabase (PostgreSQL)**: 作品カタログ、ベクトルデータ (`pgvector`)
- **LLM/Embedding**: NVIDIA NIM (Llama-3.1-70B-Instruct / Nemotron-Embed-1B-v2)

## 3. 重要な実装ルール (CRITICAL)
エージェントは以下のルールを厳守してください。

### ⚠️ Embedding に関する制約
- **列名**: 旧 `embedding` 列は使用禁止。必ず **`embedding_nv`** を使用すること。
- **検索関数**: `match_artworks` ではなく、必ず **`match_artworks_nv`** を使用すること。
- **プロバイダー**: 現在は Workers AI ではなく **NVIDIA NIM** を使用して生成しています。

### ⚠️ D1 データ操作の制約
- **解説の保存**: D1 に解説データを直接 `INSERT` してはいけません。
- **正解ルート**: 必ず **`/api/chat` エンドポイントを叩いて生成・保存**させてください。直接書き込むと UI 側のパース処理で不整合が発生し、エラーになります。

### ⚠️ 環境変数
- `NVIDIA_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_TASK_TOKEN` が必須です。

## 4. リポジトリ構造と責務
- `src/app/page.tsx`: メインUI。作品選択・解説表示・音楽制御。
- `src/app/api/chat`: 解説生成および D1 キャッシュ管理。
- `src/app/api/suggest`: ベクトル検索による作品推薦。
- `src/lib/playlists.ts`: ツアー構成（作品順序）の定義ファイル。
- `src/lib/guideStore/`: D1/Supabase へのデータアクセス層。

## 5. ワークフロー
- **ブランチ戦略**: `main` (本番), `trial` (テスト)。
- **デプロイ**: `npx wrangler deploy` で Cloudflare Workers へ反映。
- **修正フロー**: 
    1. `feat/` ブランチで実装
    2. ローカル/trial 環境で検証
    3. `main` へマージして本番デプロイ

## 6. 既知の課題
- **Embedding 埋め合わせ**: NVIDIA NIM 移行後、一部の作品で `embedding_nv` が未生成である可能性があります。`/api/embeddings/backfill` を使用して補完してください。
- **JSON 不整合**: LLM が稀に JSON 形式を崩すことがあります。リトライロジック（`warm.sh` 等）で対応してください。

# ArtFreeGuide

**美術館の音声ガイドを、誰でも無料で。**

作品名を入れるだけで、AI が学芸員のように解説を書き起こし、1 文ずつ読み上げます。絵の「見どころ」は画像上でポイントされ、気になったことはその場で質問でき、聴いた作品からベクトル検索で「次の 1 枚」を提案します。

- サービス URL: https://art-free-guide.taira-sakakibara.workers.dev
- リポジトリ: https://github.com/t-sakaki/ArtFreeGuide

有料の音声ガイド機を借りずに、手元のスマートフォンだけで、深いところまで作品を味わえる状態を目指しています。

## できること

| 機能 | 概要 |
| --- | --- |
| AI 音声ガイド | 作品名（＋作家名）から解説を生成し、Web Speech API で 1 文ずつ読み上げ。速度調整、文単位の巻き戻し／送りに対応 |
| 見どころポインター | 作品画像の上に見どころを配置。普段はほぼ透明で、いま語っている 1 点だけがゆっくり明滅し、絵の鑑賞を邪魔しない |
| 質問 | サジェスト質問＋自由入力（音声入力も可）。回答はガイド本文に追記され、そのまま読み上げられる |
| 裏話・エピソード | ボタン 1 つで、その作品のさらに深い話を追加生成 |
| ベクトル検索レコメンド | 作品埋め込みと「好みベクトル」による近傍検索で次の作品を提案（後述） |
| テーマ別ツアー | 「光と影のドラマ」「情熱の色彩」「ルネサンスの理想美」など、カタログから組んだツアー |
| 視聴履歴 | 聴いた作品を保存し、続きから再生。好みベクトルの材料にもなる |
| 共有リンク | 作品ごとの OGP（タイトル・説明・サムネイル）付きで、SNS やチャットにカード表示 |
| 多言語 | 日本語 / 英語 / フランス語 / スペイン語 / 中国語の UI・解説・読み上げ |
| 読み間違いの報告 → 承認 → 反映 | 読み上げの誤りを利用者が報告し、管理者が承認すると以後の TTS に反映される |
| 解説の修正提案 → 承認 → 反映 | 内容の誤りを報告すると LLM が修正案を作り、管理者が差分を見て承認すると保存済み解説が置き換わる |
| ログイン（任意） | 匿名のまま使えて、Supabase Auth のマジックリンクでログインすると匿名の履歴・好みをアカウントに引き継ぐ |

## ハッカソンのポイント: ベクトル検索

推薦の中核は Supabase（Postgres + pgvector）上のベクトル検索です。

- 作品は NVIDIA NIM の埋め込みモデル `nvidia/llama-nemotron-embed-1b-v2`（1024 次元）でベクトル化し、`public.artworks.embedding_nv` に保存
- 索引は ivfflat（コサイン類似度）。近傍探索は RPC `match_artworks_nv(query_embedding, match_threshold, match_count)`
- 利用者ごとに、聴いた作品のベクトルから **好みベクトル**（`user_profiles.preference_embedding_nv`）を作り、そのベクトルで「あなたへのおすすめ」を検索
- カタログに無い作品もガイド生成時にその場で埋め込みを作るので、検索対象がユーザーの利用とともに増える
- 埋め込みモデルを載せ替えると類似度の絶対値が変わるため、しきい値は `EMBEDDING_MATCH_THRESHOLD`（NVIDIA では 0.25）で外出しし、実データで再調整
- 旧 Workers AI（bge-m3）の列・関数も残しており、`EMBEDDING_PROVIDER` の 1 語でロールバックできる

## Supabase の活用

- **pgvector**: 作品埋め込みと好みベクトル、近傍検索の RPC（`match_artworks_nv` / `match_artworks`）
- **カタログと履歴**: `artworks` / `viewing_history` / `user_profiles`（匿名プロフィールとして作成され、ログイン時に `auth_user_id` で Auth ユーザーへ紐付け）
- **Auth（マジックリンク）**: 一般利用者のログインと、管理者判定（`ADMIN_EMAILS` に載るアドレスのみ承認 UI を開ける）
- **モデレーション用テーブル**: 読みの修正案（`pronunciation_corrections`）と解説の修正案（`guide_corrections`）を pending → approved で管理
- **RLS**: 匿名クライアントは anon キーのみを使い、サービスロールキーはサーバー（Worker）専用

スキーマは `supabase/migrations/` にあり、Supabase の SQL Editor でそのまま実行できます。

## Devin の活用

このプロジェクトは、開発者と Devin の共同作業で作られています。日々の実装は「作りたい体験を日本語で伝える → Devin が調査・実装・検証して PR を出す → レビューしてマージ」というループで進めました。

- 機能追加は基本的に PR 単位（例: 埋め込みの NVIDIA NIM 移行 #51、読み辞書と承認フロー #54、ログインと匿名履歴の引き継ぎ #55、フィードバックからの解説修正 #57、共有リンクの OGP #58、見どころマーカーの調整 #59/#60、読み上げのペース修正 #63、本番の Supabase 設定取得 #64）
- 実機での確認まで含めて依頼できるので、「ポインターが強すぎる」「一瞬で読み終わってしまう」といった体験の違和感を、そのままの言葉で投げて直せる
- クォータ枯渇（Workers AI の無料枠）のような外部要因も、代替プロバイダへの移行と旧実装のロールバック経路の確保まで含めて任せられる

## アーキテクチャ

```
ブラウザ (Next.js 16 / React 19 / Tailwind)
  ├── Web Speech API ... 読み上げ・音声入力（読み替え辞書を適用）
  ├── Web Audio API  ... 作品の雰囲気に合わせた環境音の生成
  └── fetch
        ↓
Cloudflare Workers（OpenNext）
  ├── /api/chat            解説生成（LLM）＋ D1 にキャッシュ
  ├── /api/ask             質問への回答
  ├── /api/suggest         作品名サジェスト
  ├── /api/recommendations ベクトル近傍検索でおすすめ
  ├── /api/history         視聴履歴と好みベクトルの更新
  ├── /api/readings        読みの報告 / 承認済み辞書の配信
  ├── /api/feedback        good / bad / bug（bad・bug は修正案生成へ）
  ├── /api/admin/*         承認キュー（Supabase Auth + ADMIN_EMAILS）
  └── /api/og-image        共有カードの画像
        ↓
  Cloudflare D1        生成済み解説のアーカイブ
  Supabase (Postgres)  カタログ / 履歴 / プロフィール / 承認キュー / pgvector
  NVIDIA NIM           解説生成と埋め込み
  Wikimedia Commons    作品画像
```

技術スタック: Next.js 16 (App Router) / React 19 / TypeScript / Tailwind CSS / Cloudflare Workers (OpenNext) / Cloudflare D1 / Supabase (Postgres + pgvector, Auth) / NVIDIA NIM / Web Speech API / Web Audio API / Wikimedia Commons API

## ローカルでの動かし方

```bash
npm install
cp .env.example .env.local   # Supabase の URL / キー、NVIDIA_API_KEY などを設定
npm run dev                  # http://localhost:3000
```

Supabase を使う場合は `supabase/migrations/` の SQL を番号順に SQL Editor で実行してください。D1 のマイグレーションは `d1/migrations/` にあります。

主な環境変数（詳細は `.env.example`）:

| 変数 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ブラウザ用の公開設定（ログイン） |
| `SUPABASE_SERVICE_ROLE_KEY` | サーバー専用。RLS を迂回するのでブラウザには渡さない |
| `LLM_PROVIDER` / `NVIDIA_API_KEY` | 解説生成のプロバイダと鍵（`nvidia` / `workers-ai` / `gemini`） |
| `EMBEDDING_PROVIDER` / `EMBEDDING_MATCH_THRESHOLD` | 埋め込み空間としきい値 |
| `GUIDE_STORE` | 生成済み解説の保存先（`d1` / `supabase` / `memory`） |
| `ADMIN_EMAILS` | 承認 UI を開けるメールアドレス（カンマ区切り） |

デプロイ:

```bash
npm run deploy               # OpenNext でビルドし Cloudflare へ
npx wrangler secret put NVIDIA_API_KEY
```

埋め込みの補完（新規作品の追加後など）:

```bash
EMBEDDING_PROVIDER=nvidia NVIDIA_API_KEY=... node scripts/backfill_embeddings.mjs
```

## リポジトリ構成

```
src/app/          画面（HomeClient.tsx）と API ルート
src/components/   作品ステージ、見どころ、おすすめ棚、承認 UI など
src/lib/          LLM / 埋め込み / 推薦 / 読み辞書 / i18n / 共有メタなど
supabase/         Supabase のマイグレーション
d1/               D1 のマイグレーション
scripts/          埋め込みバックフィル
docs/             設計メモ
```

## 今後

- 写真からの作品認識（OCR / 画像検索）でタイトル入力を不要に
- 承認済みの修正を学習データとして蓄積し、生成そのものの品質を上げる
- 館内のフロア動線に沿ったツアーの自動生成

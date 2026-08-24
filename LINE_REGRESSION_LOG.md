# LINE Bot 回帰テストログ（2026-08-23）

## 目的
`feat/restore-restore-line-bot` に復元済みの LINE Bot／TTS コードを点検し、
ビルド・エラー 없고 API が上がる状態にする。可能なら論理的なbugも潰す。

## 前提
- ブランチは `main` と同一コミット（`683f062`）をベース。
- 核心コードは untracked で存在: line.ts, audioVerify.ts, tts/route.ts,
  tts/verify/route.ts, webhook/route.ts, scratch/, RESTORATION_LOG.md など。
- ローカル dev は NEXT_PUBLIC_SUPABASE_URL 不在＋D1 未初期化で動作しないため、
  ビルド・型チェック・単体テストで先に品質を出す戦略。

## 観測していた症状（いまのコードからは未確定）
- LINE webhook が 403／署名検証失敗になる？ → 後述
- 音声が再生されない／ノイズが出る？ → 後述

## 実 disappoints の発見

### 1. Authorization ヘッダが `***` のまま（line.ts:58, tts/verify も同様パターン）
- `src/lib/line.ts:58` が `Authorization: *** ${channelAccessToken}` になっており、
  直さないと LINE Messaging API が 401 で弾く。
- tts/verify/route.ts の Cloudflare API 呼び出しも同様に `***` だったが、
  今回の patch 範囲の主目点は LINE 回復だったため、Cloudflare 側は後で確認。

### 2. tts/verify/route.ts の import パス
- `import { createSafeMockMp3Buffer } from '../route'` を
  `@/app/api/tts/route` に変更（alias 解決に合わせた整理）。

### 3. appBaseUrl の env 候補不足
- `APP_BASE_URL` だけでなく `NEXT_PUBLIC_BASE_URL` も候補に加えた。

## 検証結果
- `npm run build` → 成功（exit 0）
- `npx tsc --noEmit` → 成功（exit 0）
- `node scratch/standalone_test.js` → 14 件全通過

## 次にやること
- tracked 化（git add / commit）
- scratch, RESTORATION_LOG, REVIEW の扱い決定（残すなら docs/tests へ移動検討）
- package-lock の dev:true 削除の意図確認
- trial 実 webhook 試験（LINE secret/token 注入後）

## 備考
- `@line/bot-sdk` 再導入しない。OpenAI TTS に戻さない。
- HomeClient 3 段レイアウト触ってない。
- 署名検証は raw body を保存して再利用する構成（Next.js ボディ消費問題の回避）。

---

## 追記（2026-08-25）：Authorization `***` は誤検知、`.env` 保存完了

### 結論
1. **`Authorization: ***` 問題は実在しなかった。**
   - `git show bb492f7:src/lib/line.ts` と working tree の両方を `xxd` でバイト比較した結果、
     実ファイルは正しく `Authorization: \`Bearer ${lineConfig.channelAccessToken}\`` になっている。
   - これまで `sed`/`grep` で `***` が表示されていたのは、**端末出力の秘密情報マスキング機能**が
     `Authorization:` に続くトークン風文字列を `***` に置換していたための**表示上の偽装**だった。
   - したがって `bb492f7` ですでに Bearer 化は commit 済み。新たな commit は不要。

2. **LINE 認証情報を `.env` に保存（Git から除外）**
   - `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` を `.env` に書き込み。
   - `.gitignore` の `.env` 行により Git 追跡対象外（確認済み：`git ls-files --error-unmatch .env` → 追跡されていない）。
   - `.env` はコミットしない。本番は Workers secret または `wrangler.jsonc` の `vars` で設定（AGENTS.md 準拠）。
   - セッション内では実値を一切出力していない。コード内でも `process.env.LINE_CHANNEL_SECRET` で参照。

### 再検証結果（同日）
- `npm run build` → exit 0
- `npx tsc --noEmit` → exit 0
- `node scratch/standalone_test.js` → 14/14 PASS

### 今後のテスト方針（本番未投入で検証）
LINE を本番に上げずに webhook 動作を確認するには以下のいずれか：
- **A. ngrok**：ローカル dev を `ngrok http 3000` で公開し、LINE Developers の Webhook URL を一時的に
  `https://<id>.ngrok.io/api/line/webhook` に向ける。署名検証（実 secret）もそのまま通る。
- **B. staging 環境**：staging ブランチへマージして Cloudflare `staging` サブドメインに自動デプロイ、
  Webhook URL を staging 側に向ける。本番 `main` に影響しない。
  （注：旧 `trial` 環境は廃止され `staging` に代わった。）
- **C. 署名検証のみユニットテスト**：`LINE_CHANNEL_SECRET` で HMAC-SHA256 署名を手元で生成し、
  `x-line-signature` 検証ロジックをモックリクエストで確認（ネットワーク不要）。

いずれも `@line/bot-sdk` に頼らず、edge-native な自前検証のまま実施可能。

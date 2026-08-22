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

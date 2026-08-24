# LINE Bot 回帰テスト 브리ーフ

**ブランチ:** `feat/restore-restore-line-bot`  
**更新日:** 2026-08-23  
**対象:** ArtFreeGuide の LINE チャット経由 AI キュレーター案内（Webhook + TTS + 音声検証）  
**重要:** 新セッションはこのファイルを最初に読むこと。

---

## 1. 背景

- かつては LINE チャットで AI キュレーター案内ができる機能があったが、多言語拡張・UI リファクタのマージ過程で LINE 関係コードが untracked／分岐し機能が消えた（デグレ）。
- 過去のソースから必要なロジック（署名検証・Webhook・ハンドリング・TTS パイプライン・音声検証）を救出して `feat/restore-restore-line-bot` worktree に再構成済みだった。
- 今回の作業はその「復元コードの버그修正＋ビルド検証」。

---

## 2. 復元済みコアファイル（untracked → これから tracked にする対象）

| ファイル | 役割 |
| --- | --- |
| `src/lib/line.ts` | Web Crypto HMAC-SHA256 による LINE 署名検証＋ネイティブ `fetch` だけの軽量クライアント（text/audio/flex）。`@line/bot-sdk` 不使用。 |
| `src/lib/audioVerify.ts` | MP3 バイナリ検証ユーティリティ。RIFF/WAV・HTML・JSON 誤応答拒否、Base64 デコード、ID3v2 タグサイズ計算、MPEG-1 Layer III 同期ワード検査。 |
| `src/app/api/tts/route.ts` | POST/GET TTS エンドポイント。Cloudflare Workers AI TTS（`@cf/myshell-ai/melotts`）を一次、HTTP 429 や検証失敗時に `createSafeMockMp3Buffer` へフォールバック。OpenAI TTS 依存除去版。 |
| `src/app/api/tts/verify/route.ts` | 診断／検証用エンドポイント。テキストないし URL から取得した音声を `verifyMp3Buffer` にかけ、フォーマット・長さ・妥当性を JSON で返す。 |
| `src/app/api/line/webhook/route.ts` | LINE webhook ハンドラ。raw ボディをそのまま署名検証に使い、LLM応答＋画像検索を並列実行。生成した音声URLを**事前検証（pre-flight）**して、MP3 として安全な場合だけ audio メッセージに載せ、そうでない場合はテキスト＋Flex リンクにフォールバック。 |

補助ファイル:
- `RESTORATION_LOG.md`（復元履歴・意図・検証マトリクス）
- `REVIEW_restore-restore-line-bot.md`（レビューシート）
- `scratch/standalone_test.js`（Node.js 環境用 14 件ユニテスト・ミラー実装）
- `scratch/test_line_restoration.ts`（TypeScript 側同等テスト）

---

## 3. コード品質の前提

- `@line/bot-sdk` を再導入しない（Edge / Cloudflare Workers 環境で問題したため）。
- `OPENAI_API_KEY` に戻さない。TTS は Cloudflare Workers AI 一次＋Safe Mock MP3 フォールバック鎖。
- HomeClient の 3 段レイアウトを触らない。
- 署名検証は raw body を `req.text()` で一度取得し、変数に保存して使い回す（Next.js のボディ消費問題を回避するため）。

---

## 4. このセッションで修正した項目

### 4.1 `src/lib/line.ts:58` — LINE API Authorization ヘッダ修復
```
Before: Authorization: *** ${lineConfig.channelAccessToken}`,
After : Authorization: `Bearer ${lineConfig.channelAccessToken}`,
```
`***` はプレースホルダで、`Bearer ` に直した。直さないと LINE Messaging API が 401 で弾く。
（注：のちの検証で、この `***` は端末の秘密情報マスキングによる表示偽装であり、実ファイルはすでに `Bearer` 化されていたことが判明。`bb492f7` で正しく commit 済み。）

### 4.2 `src/app/api/tts/verify/route.ts:3` — import パス修正
```
Before: import { createSafeMockMp3Buffer } from '../route';
After : import { createSafeMockMp3Buffer } from '@/app/api/tts/route';
```
相対パスから alias パスへ変更。TS の alias 解決に合わせた整理。

### 4.3 `src/lib/line.ts:9` — appBaseUrl の env 候補追加
```
Before: process.env.APP_BASE_URL || 'https://art-free-guide-trial.taira-sakakibara.workers.dev'
After : process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://art-free-guide-staging.taira-sakakibara.workers.dev'
```
環境変数名が `APP_BASE_URL` とは限らないため、Next.js 側の `NEXT_PUBLIC_BASE_URL` も候補に加えた。最終フォールバックは staging ドメイン。
（注：旧 `trial` 環境は廃止され `staging` に代わった。）

---

## 5. 検証結果（2026-08-23）

### 5.1 ビルド
- `npm run build` → **exit code 0**、OpenNext ビルド成功。
- Dynamic ルート一覧に `/api/line/webhook`・`/api/tts`・`/api/tts/verify` が全て含まれている。

### 5.2 型チェック
- `npx tsc --noEmit` → **exit code 0**、TS エラーなし。

### 5.3 単体テスト（Node.js ミラー実装）
- `node scratch/standalone_test.js` → **ALL 14 TESTS PASSED CLEANLY & RESILIENTLY!**
- カバー:
  - Web Crypto HMAC-SHA256 署名検証（正/誤/整形破損/空 secret）
  - Safe Mock MP3 生成（ID3v2 + MPEG-1 L3 フレーム、44.1 kHz／128 kbps、有効 duration）
  - ノイズ防止（WAV/RIFF・HTML・JSON 拒否、Base64・データーURI 取り扱い）
  - Cloudflare 障害シミュレーション（429・500・壊れた出力 → Safe Mock へフォールバック、正常出力はそのまま通す）

### 5.4 既存のレビュー状態
- 核心実装は完了していたが tracked 化しておらず、`git diff main --stat` は `package-lock.json` + `tsconfig.json` の 2 ファイルのみ。実装は untracked で存在していた。
- ブランチ HEAD は `main` と同一コミット（`683f062`）で、まだ main にマージされていない。

---

## 6. 動作シナリオ（期待挙動）

### 6.1 LINE webhook
1. LINE プラットフォームから POST が届く。
2. `x-line-signature` ヘッダを確認。無ければ 401。
3. 生本文を `verifyLineSignature`（HMAC-SHA256）に通す。失敗すれば 401。
4. events を parse し、text メッセージだけ処理。
5. LLM（`getLLMProvider().generateResponse`）で AI キュレーター解説を生成。
6. `fetchArtworkImage` で作品画像を並列取得（あれば image メッセージ）。
7. `/api/tts?text=...` を fetch して返ってきたバッファを `verifyMp3Buffer` で検証。MP3 として安全なら audio メッセージに載せる。安全でなければ載せず、警告ログだけ残す。
8. Flex Message（`createAudioGuideFlex`）を付けて、`replyMultipleMessages` で LINE に返す。

### 6.2 TTS フォールバック鎖
```
      ┌─ Cloudflare Workers AI TTS ─▶ 有効 MP3 なら 200 (audio/mpeg)
      │     ・429 → 即フォールバック
      │     ・HTTP エラー → 次モデル試す／失敗ならフォールバック
      │     ・検証失敗 → フォールバック
      ▼
Safe Mock MP3（ID3v2 + 無音 MPEG-1 Layer III）→ 必ず 200、X-Audio-Mock: true
```
LINE webhook の pre-flight も同じ `verifyMp3Buffer` を使うため、音声が壊れていれば LINE に誤音声を送らない。

### 6.3 環境変数（必須／任意）
- 必須: `NVIDIA_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- LINE 用（該当時）: `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`
- TTS 用: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`
- アプリ URL: `APP_BASE_URL`（または `NEXT_PUBLIC_BASE_URL`）

---

## 7. 残タスク（未確認／これから）

1. **tracked 化とコミット** — 核心ファイルを `git add` してコミット。`scratch/`, `RESTORATION_LOG.md`, `REVIEW_restore-restore-line-bot.md` の扱いも決める（残すなら docs/ や tests/ へ移動の検討）。
2. **`package-lock.json` の `dev: true` 行削除の意図確認** — 意図的な変更であればメモ、意図的でなければ正規状態へ戻す。
3. **`base-bugs`（`src/lib/llm/nvidia.ts`）との相互作用確認** — webhook は `getLLMProvider()` を使うため、nvidia.ts の env 解決変更が webhook の LLM 呼び出しに効くか統合後に確認。
4. **staging 実環境での webhook 試験** — `LINE_CHANNEL_SECRET`／`LINE_CHANNEL_ACCESS_TOKEN` 注入後に、実際の LINE webhook、または同等生成ペイロードで署名検証を通るか確認。可能なら TTS フォールバック動作も試す。（旧 trial 環境は廃止され staging に代わった。）
5. **LINE 本当の症状の確定** — 以前「signature 403」「音声が再生されない」などが観測されていた場合、今回の修正（特に Authorization ヘッダ）がそこに効くかを実環境で確かめる。

---

## 8. 禁止事項

- `@line/bot-sdk` の再導入
- `OPENAI_API_KEY`／`tts-1` への逆戻り
- HomeClient 3 段レイアウトの変更
- 作品名・作家名を日本語以外で原始的に扱う（必ず `src/lib/names.ts` を経由）

---

*このファイルは新セッションの起点用。回りのコードを触す前にここを読んで、すでに済んだ修正と残タスクを把握すること。*

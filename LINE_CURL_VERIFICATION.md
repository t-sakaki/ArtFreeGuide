# LINE webhook 検証ブリーフ（Staging 実証用）

**ブランチ:** `feat/restore-restore-line-bot`（HEAD `bb492f7`）  
**更新日:** 2026-08-23  
**対象:** ArtFreeGuide の LINE チャット AI キュレーター案内（Webhook + TTS）  
**実証責任者:** staging 環境に LINE チャネル secret / token 他を注入した人（このセッションでは env 不足で実証できず）

---

## 1. 現状

- ブランチは `main` と同一基点（`683f062`）から復元コードを追加した状態。
- commit `bb492f7` で復元コード＋ドキュメントを tracked 化済み。
- ビルド: `npm run build` → OK（exit 0）、`npx tsc --noEmit` → OK
- 単体テスト: `node scratch/standalone_test.js` → 14 件全通過
- このセッションで存在した env: `CLOUDFLARE_API_TOKEN` のみ  
  → `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN`, `NVIDIA_API_KEY`, `NEXT_PUBLIC_SUPABASE_*`, `APP_BASE_URL` 不在のため **実 webhook は試せなかった**。

---

## 2. 修正済みの穴（このセッションで直した箇所）

| 箇所 | 修正内容 |
| --- | --- |
| `src/lib/line.ts:9` | `appBaseUrl` の env 候補に `NEXT_PUBLIC_BASE_URL` を追加 |
| `src/app/api/tts/verify/route.ts:3` | `createSafeMockMp3Buffer` の import パスを `'../route'` から `'@/app/api/tts/route'` に変更 |
| `LINE_REGRESSION_LOG.md` / `LINE_REGRESSION_BRIEF.md` | 復元作業のブリーフ／ログを repo に追加 |

---

## 3. 修正していない穴（残っている障害）

どちらも `Authorization` ヘッダが `***` のままになっており、実効時に 401 になる潜在障害です。

| 箇所 | 現状 | 修正すべき正解 |
| --- | --- | --- |
| `src/lib/line.ts:58` | `Authorization: *** ${lineConfig.channelAccessToken}` | `Bearer ${lineConfig.channelAccessToken}` |
| `src/app/api/tts/route.ts:68` | `Authorization: *** ${apiToken}` | `Bearer ${apiToken}` |

→ 実 webhook の前にどちらも直すことを推奨します。直さないと LINE Messaging API と Cloudflare Workers AI API の双方が弾きます。

---

## 4. 署名検証の動作確認方法（staging 外でテストする場合）

- 署名生成: `crypto.subtle`（HMAC-SHA256）で raw body を署名し、base64 エンコード
- リクエスト: `x-line-signature` ヘッダに署名を載せて `POST /api/line/webhook`
- 期待:
  - 署名正 → 200（reply 返す）
  - 署名誤 → 401
  - ヘッダ無し → 401
- 署名生成の参照: `scratch/standalone_test.js` の TEST 1

---

## 5. staging 実証手順

1. Wrangler secret に以下を設定:
   - `LINE_CHANNEL_SECRET`
   - `LINE_CHANNEL_ACCESS_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_API_TOKEN`
   - `NVIDIA_API_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
   - `APP_BASE_URL` または `NEXT_PUBLIC_BASE_URL`
2. デプロイ（`npx wrangler deploy` または main push）
3. LINE 側で webhook URL を staging ドメインの `/api/line/webhook` に設定
4. LINE からテキストを送り、AI 回答＋画像＋Flex が返るか確認
5. TTS が有効な場合、音声メッセージ（audio）が載るか、Safe Mock MP3 にフォールバックするか確認

---

## 6. PR／merge の前提

- ArtFreeGuide の運用は main へ直接 push せず PR 経由で merge する方針。
- このブランチを main に merge する際、`base-bugs`（commit `adc893e`）の `src/lib/llm/nvidia.ts` 変更が main 側に入っていれば、nvidia.ts の merge conflict は起きない（line bot ブランチ側は nvidia.ts に触っていないため）。
- PR にはこのドキュメント（`LINE_CURL_VERIFICATION.md`）を含めると実証者に読める。

---

## 7. 禁止事項（崩さないもの）

- `@line/bot-sdk` の再導入
- `OPENAI_API_KEY`／`tts-1` への逆戻り
- HomeClient 3 段レイアウトの変更
- 作品名・作家名を日本語以外で原始的に扱う（必ず `src/lib/names.ts` を経由）

---

*このファイルは staging 実証者・PR レビュアーが最初に読むブリーフ用。*

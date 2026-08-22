# レビューシート: `feat/restore-restore-line-bot`（worktree `/home/taira/ArtFreeGuide-line`）

**日付:** 2026-08-20  
**対象ブランチ:** `feat/restore-restore-line-bot`  
**レビューポイント:** 変更要約・意図・完成度・依存関係・統合示唆

---

## 0. 結論（先に）

- **tracked 側の実質コード diff はほぼ無い**。`git diff main --stat` は `package-lock.json` + `tsconfig.json` の 2 ファイル（+1/-26）のみで、コードレベルの機能変更は tracked 差分には表れていない。
- 作業の“中身”は **untracked（新規追加）ファイル群**として存在している:
  - `src/lib/line.ts`
  - `src/lib/audioVerify.ts`
  - `src/app/api/tts/route.ts`
  - `src/app/api/tts/verify/route.ts`
  - `src/app/api/line/webhook/route.ts`
  - `RESTORATION_LOG.md`
  - `scratch/standalone_test.js`, `scratch/test_line_restoration.ts`
- ブランチのベースは `main` と同一コミット（`683f062`）で、**機能はまだ main にマージされていない状態**。この worktree は「実装は終えているがコミット／PR 化はこれから」の checkpoint に近い。

---

## 1. 変更ファイル一覧・要約（新規ファイル含む）

### 1.1 tracked 差分（main 比）

| ファイル | 内容 |
| --- | --- |
| `package-lock.json` | 依存ロックファイルの「`dev: true`」行削除（複数の optional パッケージ）。実質的な依存追加ではなく属性調整寄り。 |
| `tsconfig.json` | `exclude` に `"scratch"` を追加。scratch 内の JS/TS がtsc対象に漏れ込まないようにする保護。 |

### 1.2 untracked（新規） ：実作業の中核

| ファイル | 役割 |
| --- | --- |
| `src/lib/line.ts` | Web Crypto HMAC-SHA256 による LINE 署名検証 + ネイティブ `fetch` だけの軽量 LINE メッセージ送信（text/audio/flex）。`@line/bot-sdk` などの重量 SDK 排除を狙う。 |
| `src/lib/audioVerify.ts` | MP3 バイナリ検証ユーティリティ。RIFF/WAV・HTML・JSON 誤応答の拒否、Base64 デコード、ID3v2 タグサイズ計算、MPEG-1 Layer III 同期ワード／ビットレート／サンプリングレート検査。 |
| `src/app/api/tts/route.ts` | POST/GET の TTS エンドポイント。Cloudflare Workers AI TTS（`@cf/myshell-ai/melotts` など）を一次、HTTP 429 や検証失敗時に `createSafeMockMp3Buffer` へフォールバック。OpenAI TTS 依存の除去版。 |
| `src/app/api/tts/verify/route.ts` | 診断/検証用エンドポイント。テキストないし URL から取得した音声を `verifyMp3Buffer` にかけ、フォーマット・長さ・妥当性を JSON で返す。 |
| `src/app/api/line/webhook/route.ts` | LINE webhook ハンドラ。raw ボディをそのまま署名検証に使い、LLM応答＋画像検索を並列実行。生成した音声URLを **事前検証（pre-flight）**して、MP3として安全な場合だけ audio メッセージに載せ、そうでない場合はテキスト＋Flexリンクにフォールバック。 |
| `RESTORATION_LOG.md` | 復元・整理の意図・履歴・根拠・検証マトリクスを記載したドキュメント。 |
| `scratch/standalone_test.js` | Node.js 環境用ユニットテスト（署名・Safe Mock MP3・音声ノイズ防止・429/500/Corruptシミュレーションなど 14 件）。 |
| `scratch/test_line_restoration.ts` | TypeScript 側の同等テスト（主要シナリオをカバー）。 |

---

## 2. 変更の意図

### 2.1 全体テーマ
- **LINE Bot + TTS パイプラインの「やり直し（restore）」と堅牢化**。  
- 以前の実装で問題だった以下を潰すのが主眼:
  - `@line/bot-sdk` v9 の重量 Node 依存 → Edge / Cloudflare Workers 環境で互換性トラブル
  - OpenAI TTS（`OPENAI_API_KEY`・`tts-1`）依存 → 外部 API・ホットスタート・秘密管理・費用の負担
  - 音声の形式不一致（PCM/WAV が MP3 として渡るなど）によるスピーカー鳴き・復号クラッシュ
  - 429/500・HTML/JSON 誤応答・Base64未復号などをケアしないと、壊れた音声がそのまま LINE に流れる恐れ

### 2.2 個別意図
- **`src/lib/line.ts`**  
  - 署名検証を Web Crypto（HMAC-SHA256）で自前実装し、SDKに頼らない Edge ネイティブにする。  
  - メッセージ送信も `fetch` + JSON だけで完結させ、依存を最小化する。
- **`src/lib/audioVerify.ts`**  
  - 音声バッファが「本当に MP3か」をクライアント側で検査し、RIFF/WAV・テキスト系（HTML/JSON）などをはじく。  
  - Base64取り扱いを安全化（Data URI떨어짐処理含む）。
- **`src/app/api/tts/route.ts`**  
  - OpenAI TTS をやめ、Cloudflare Workers AI TTS を一次エンジンにする。  
  - 429 を検知したら即フォールバック（Safe Mock MP3）、検証失敗・ネットワークエラー・壊れた出力もフォールバック。  
  - フォールバックは「静かな合成 MP3」（ID3v2 + 有効な MPEG-1 Layer III フレーム）で、再生ノイズを防ぐ。
- **`src/app/api/line/webhook/route.ts`**  
  - 署名検証を raw body で行う（HMAC 用途に合わせた安全な取り扱い）。  
  - 音声を LINE に投げる前に `/api/tts?text=...` を実際に fetch して `verifyMp3Buffer` をかけ、安全確認できた場合のみ audio メッセージに載せる。  
  - 安全確認できない場合は「テキスト＋Flex（Web App 誘導）」へ Graceful フォールバック。
- **`scratch/` テスト**  
  - 署名検証・Safe Mock MP3・ノイズ防止・Cloudflare 障害シミュレーションなどを、共通ロジックのミラー実装で検証。ドキュメントの検証マトリクスと対応。

---

## 3. 完成度（完了/途中）と根拠

### 3.1 評価
- **「実質的な中身の実装・検証はかなり進んでいる（完了に近い）」が、「トラッキング/コミット/Prescription 化は途中」**。
- 根拠:
  - 核心となる実装ファイル（line.ts, audioVerify.ts, tts/route.ts, tts/verify/route.ts, webhook/route.ts）が揃っており、相互参照も整っている（webhook → tts/verify → audioVerify, tts/route → audioVerify, line.ts → webhook など）。
  - scratch テストに「通過すべきシナリオ」が具体的に書かれており、ドキュメント（RESTORATION_LOG.md）にも Test Matrix が提示されている。
  - 一方、tracked 側には実質のコード変化が入っておらず、**本ブリッジを main に合流させるためのコミット/PR が用意されていない**（あるいは意図的に worktree 上の新規ファイルのまま検討中）。

### 3.2 完了寄りと言える点
- 署名検証、音声検証、TTS フォールバック、webhook の audio pre-flight など、主要フローはファイル群として自立している。
- フォールバックが「Safe Mock MP3」という確実に再生可能な出力に落ちる設計で、最悪ケースでもクラッシュ/ノイズを避ける方針になっている。

### 3.3 途中/未確認と言える点
- 実際の Cloudflare Workers / OpenNext 環境での結合試験（環境変数 `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `LINE_CHANNEL_*` 投入後の/E2E）がこのレビューの範囲では確認できていない。
- `package-lock.json` の diff は依存追加よりも「optional パッケージの `dev: true` 属性削除」が主で、バインディング/ビルド挙動への影響は小さそうだが、**なぜこの worktree で当該行削除が発生したのか**の意図が明示されていない。
- `scratch/` は開発・検証の痕跡としては有用だが、暫定資産。最終的な CI/評価スートにどう吸い上げるかは未決定に見える。

---

## 4. 他の worktree（特に base-bugs の lib/llm/nvidia.ts 変更）との依存・競合可能性

### 4.1 観測された base-bugs の変更
`fix/base-bugs` で `src/lib/llm/nvidia.ts` が変更されており、主な趣旨は:
- `@opennextjs/cloudflare` の `getCloudflareContext` を使って、Cloudflare 環境の `env` から `NVIDIA_API_KEY` / `NVIDIA_BASE_URL` を取得できるようにする。
- APIキーをコンストラクタ時点で固定せず、呼び出し時に `this.apiKey || process.env.NVIDIA_API_KEY || cloudflareEnv?.NVIDIA_API_KEY` の順で解決するように変更。
- `BASE_URL` がハードコードから、環境優先の変数解決へ変更。

### 4.2 本 worktree との依存関係
- **直接のテキスト競合は現時点で小さい**。  
  - 本 worktreeの核心ファイル群（line.ts, audioVerify.ts, tts/route.ts, webhook/route.ts）は `lib/llm/nvidia.ts` を直接触っていない。  
  - webhook が使う `getLLMProvider()`（`@/lib/llm`）の内部で、状況によっては `NvidiaProvider` が使われる可能性がある。そこが base-bugs の修正対象。
- **意味的なインターフェース影響はあり得る**:
  - base-bugs の nvidia.ts は「Cloudflare Workers 環境下でも env が正しく解決されて Gemini/Nemotron 系プロバイダが動くようにする」指向。他ブランチが `getLLMProvider()` を使って構築している応答フローは、この修正の恩恵を受ける可能性がある。
  - 逆に、fix/base-bugs が nvidia.ts の API を変えた場合、`LLMProvider` インターフェースや生成応答の契約が揺れると、webhook の `provider.generateResponse(messages, { json: false })` の呼び出し側にも波及し得る（現状の diff を見る限り、署名やメッセージ形状の大変更までは及んでいないが、統合前の最終確認は必要）。

### 4.3 競合・衝突の可能性
- **ファイル単位の merge conflict**: 現時点で本 worktreeと base-bugsが同一ファイルを別方向に編集している様子は薄い（base-bugsは nvidia.ts＋那辺のビルド/設定群）。今後「LLM プロバイダ周りを本 worktree側でも触る」ことがあれば衝突しうる。
- **環境変数前提の衝突**: 本 worktreeの TTS は `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN`、LINE は `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_CHANNEL_SECRET` など、base-bugs の NVIDIA 系 env とは別系列。構成そのものは直交するが、Cloudflare Workers 環境に全部載せるときの secret 設計・env 注入方法が共通で揃っている方がよい。

### 4.4 競合リスクの総合
- 今のファイル構成だけ見れば、**merge 競合は軽微**で、主なリスクは「LLM提供側(base-bugs)のインターフェースや挙動が変わったときに webhook 側の仮定が壊れないか」という間接的なもの。

---

## 5. 統合戦略への示唆

### 5.1 統合前に整えるべきこと
1. **untracked な核心ファイルを投げる（add/commit）方針を決める**  
   - 現状の worktree は「コードはあるが tracked ではない」状態。main への合流を意図するなら、対象ファイルを適切に staging してコミットを作る必要がある。  
   - その際、`RESTORATION_LOG.md` や `scratch/` の扱い（残す／いったん除外／CI用ディレクトリへ移す）を決めた方がよい。
2. **`package-lock.json` の `dev: true` 行削除の意図を明確化**  
   - 意図的でない差分なら、統合前に整理（必要なら revert して正規のロック状態に戻すなど）した方が、後々の blame・差分解釈が楽になる。  
   - 意図的（optional パッケージの dev 属性を外す）なら、その動機をメモしておく。
3. **`tsconfig.json` の `exclude: ["scratch"]` は妥当**  
   - scratch がtscの入力に漏れ込まないようにする保護として合理的。ただし scratch を最終的にどう扱うか（削除／tests/ へ移して formal 化など）をセットで決めるとよい。

### 5.2 合流順序・並び
- **直交性は高いので、base-bugs と無理に直列にする必要はない**。  
  - LINE/TTS 側は LLM プロバイダを「使う側」であり、NvidiaProvider の Cloudflare 環境対応（base-bugs）は「提供側」。  
  - よって、**base-bugs の nvidia.ts 変更を先に main へ入れる**ことで、本 worktree が合流したときの環境想定（Cloudflare Workers 下で getLLMProvider() が正しく動く）が揃いやすくなる。
- あるいは両ブランチを同じ merge 基点で統合するなら、少なくとも「nvidia.ts の generateResponse / env 解決の変更」と「webhook の provider.generateResponse 呼び出し」が揃っていることを、統合後の一回 reassurance で確認する。

### 5.3 安全面の示唆（統合時に効くポイント）
- **音声フォールバックと pre-flight 検証**は、結合テスト時に「Cloudflare AI TTS が落ちる/429 する/壊れた出力を返す」シナリオを実際に再現して、safe-mock に落ちること・LINE に誤音声が渡らないことを確認するとよい。
- **LINE 署名検証**は、本番/ステージングの `LINE_CHANNEL_SECRET` 注入後に、実際の LINE webhook ペイロード（または同等生成ペイロード）で通るか確認した方がよい。
- **`@/lib/llm` の getLLMProvider() と、base-bugs の nvidia.ts 変更の相互作用**は、統合後に「翻訳・カリキュラム応答が LLM 経由で出ること」と「フォールバックしないときの応答品質」をまとめて見るとよい。

### 5.4 推奨の統合ストーリー（例）
1. `fix/base-bugs` を審査・統合し、Cloudflare 環境での LLM提供側（NvidiaProvider の env 解決など）を先に安定させる。  
2. `feat/restore-restore-line-bot` の核心ファイル（line.ts, audioVerify.ts, tts/route.ts, tts/verify/route.ts, webhook/route.ts）を適切にコミット化し、変更理由（OpenAI TTS 除去・Edge ネイティブ LINE・音声検証・pre-flight）を PR 説明に載せる。  
3. 統合後に、TTS フォールバック・署名検証・webhook の audio 安全フォールバックを、可能なら mockした障害注入も含めて確認する。  
4. `scratch/` と `RESTORATION_LOG.md` は、復元作業の証跡として残す価値があるので、残すならリポジトリ内の場所・役割を明示（例: docs へ移動、test ディレクトリに 정리하면 CI から呼ぶ、など）した方がよい。

---

## 付録A: 所感メモ（捜査の経過）

- 初回の `git diff main --stat` が 2 ファイルしか出さなかったので、最初は「変更がほとんど無い枝」と読めたが、実際は **HEAD が main と同じコミット（683f062）で、差分の中身が untracked 新規ファイルとして蓄積されている**状況だった。  
- `git status -sb` と未追跡ファイルの読取りで、ようやく「実作業は line.ts / audioVerify.ts / tts/route.ts / tts/verify/route.ts / webhook/route.ts にあり、RESTORATION_LOG.md と scratch に検証・ドキュメントが付いている」姿が見えた。  
- base-bugs の nvidia.ts は、LLM 提供側の Cloudflare 環境対応という別系統の変更で、本 branches とファイル直接衝突は見えなかった。依存は「getLLMProvider() の向こう側」という間接的なものが主。

---

*レビューは /home/taira/ArtFreeGuide-line の feat/restore-restore-line-bot worktree と、/home/taira/ArtFreeGuide-base-bugs の fix/base-bugs 変更を対象に実施。実行日時は 2026-08-20。*

# Implementation Plan (Artifact)

**作成日:** 2026-07-26
**タスク:** LINE 内ブラウザでの音声が出ない — 原因調査と対策の計画
**モード:** Investigation-first (現状未実装)

---

## Summary

ArtFreeGuide は Web Speech API (`window.speechSynthesis`) を使って音声ガイドを再生している。
LINE 内ブラウザで再生されないユーザー報告を受け、

1. 原因の特定（WebView 制約 / autoplay 制限）
2. 短期的な回避策（外部 browser 誘導）
3. 中長期的な根本対策（Server-side TTS）

を整理する。本 Artifact は **計画段階で未実装** のため、QA Bug Report / Walkthrough は別 Artifact で別途記載する。

---

## Scope

### 現状調査対象

| パス | 役割 | 注記 |
|-----|------|------|
| `src/app/ArtFreeGuideClient.tsx` | クライアント UI / 音声再生トリガー | `speakSegment`, `window.speechSynthesis` 使用 |
| `src/lib/speech/*` | 音声再生ロジック | （存在しないか要確認） |
| `src/app/api/guide/route.ts` | ガイド用 API | 音声ファイル化する場合の改修対象 |
| `wrangler.jsonc` | Cloudflare Workers 設定 | 将来の Servsr-side TTS バインディング追加候補 |
| `docs/20260726_suggestion_integration/` | 進行中の他の計画 | 並行案件 |

### 影響コンポーネント

- `speakSegment` 関数：Web Speech API を呼ぶ箇所
- `<button onClick={handlePlayPause}>` ：最下部固定バーの ▶ ボタン
- LINE 上で開いている WebView 内部の `window.speechSynthesis`

---

## Step-by-Step Plan

### Step 1: 現状の音声再生経路を確定
- `grep -n "speechSynthesis\|SpeechSynthesisUtterance" src/app/ArtFreeGuideClient.tsx` で使用箇所を抽出
- `speakSegment` の実装を読み、再生エンジンと言語 (lang='ja-JP') を確認

### Step 2: LINE 内ブラウザで再生されない原因を特定
以下のどれに該当するか LOC テストで調査：

| 仮説 | 確認方法 |
|------|----------|
| A. WebView の Wev Speech API 制限 (Android) | `if ('speechSynthesis' in window)` を console で確認, getter をログ |
| B. autoplay 制限 (User activation 無し) | `<button onClick>` 直後にすぐ再生になっているか |
| C. voice / lang が見つからない | `window.speechSynthesis.getVoices()` で空配列になるか |
| D. iOS / Android で WKWebView 制限 | 実機ログ or ユーザー報告から判別 |

### Step 3: 短期回避策（最低限の修正）
- クライアント側で `!('speechSynthesis' in window)` をチェック
- LINE 経由を検出（`navigator.userAgent.includes('Line')`）し、
  "外部ブラウザで開いてください" バナーを表示
- バナーに「Safari/Chromeで開く」通話用 URL を保持

### Step 4: 中期: Server-side TTS でテスト
- Workers AI の TTS model (`@cf/myshell/tts` 等) があるか確認
- 代替: Gemini 音声合成 API（仮にあった場合） `/api/tts/route.ts` 新規
- 応答で jp 音声 mp3 データを返す → `<audio src="...">.play()`

### Step 5: 長期: Kokoro TTS を使ったローカル開発解
- テストホスト (kokoro-env) 連携は Tungsten/Local 限定なのでプロダクションには不適
- Workers AI の TTS モデルを選択

### Step 6: Trial デプロイ
- `npm run build:cf && wrangler deploy -e trial`

---

## Analysis

### データコントラクト重要事項

- **現状契約:** client → `window.speechSynthesis.speak()`
- **新予定契約 (Server-side TTS 採用時):** client → `fetch('/api/tts?text=...&lang=ja')` → audio/mp3 BLOB → `<audio src=blob:URL>`.play()

→ **Verifying data contract.** 切替時は UI 側の `speakSegment` を全面 TTS-Player 実装に書き換える。

### 仮説とリスク

| 仮説 | 信頼 | 備考 |
|------|----|----|
| Android WebView で `speechSynthesis` が sputter/ilkaka | 高 | Chrome Custom Tab 歴史 |
| iOS WKWebView は多くの場合動く | 中 | ただし autoplay 制限あり |
| Safari 外部開なら動作 | 高 | ユーザーへの代替手段提案 |

### 考慮した代替案

| 案 | メリット | デメリット |
|----|---------|-----------|
| 1. Web Speech API 現状維持 + LINE バナー | 低コスト | LINE ユーザーには使えない |
| 2. Server-side TTS (Workers AI / Gemini) | 全ブラウザ動く | コスト、ネットワーク |
| 3. ローカル Kokoro TTS 連携 | コスト低 | Workers から呼べない |
| 4. 音声ファイル事前生成 | 再生確実 | ストレージコスト |
| 5. YouTube/SoundHost へ音声保管 | ストレージ 0 | 動的生成むずかしい |

→ **推奨:** 1 → 2 段階実装。 まずバナー表示、 その後 server-side TTS。

### データ契約的なリスク

Web Speech を切替えて server-side に移行すると：

- UI で `SpeechSynthesisUtterance` オブジェクトを使ったコード
  （pause/resume, onstart/onend ハンドラ）が動かなくなります
- `ttsController` を抽象化クラスにし、両者のアダプタを差し込む中長期設計
  が必要かもしれない

---

## Test Impact

### 既知テスト

- New: なし （audio は recording テストが難しい）
- Adjust: アートワークごとのメディア URL ロードテスト

### 必要な新規テスト

| # | テスト | 確認点 |
|---|--------|--------|
| 1 | **`!('speechSynthesis' in window)` ブランチ** | API 不在環境でもクラッシュしない |
| 2 | **fallback 音声 URL 取得** | 外部 mp3 を `<audio>` で再生できるか |
| 3 | **autoplay 制限** | 初手 click 後にのみ再生が許可されること |
| 5 | **"外部ブラウザで開く" ボタンの動作** | LIFF 外部ブラウザ起動の仕様 (LIFF SDK onpenExternalBrowser) |

### End-to-End 検証項目

- API 契約 (`/api/tts`) → UI での audio 再生途中のエラー時の fallback
- 通信失敗時にクラッシュしないこと
- JSON parse エラー時 (意味的に server-side TTS にはなりづらいが) の
  例外ハンドリング

---

## 推定コスト

| 項目 | 工数 | 備考 |
|------|------|------|
| LINE 検出 + バナー表示 | 1h | シンプル |
| Server-side TTS /api/tts | 4-8h | LLM 選定とジャケット |
| audio 再生ロジック入れ替え | 2h | testing 含む |
| Fallback 設計 | 2h | Web Speech のラッパー化 |

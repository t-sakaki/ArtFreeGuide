# Task Walkthrough

**作成日:** 2026-07-26
**ステータス:** Investigation-complete, Implementation-pending

---

## Implementation Summary

本段階では **実装は未着手**。 ユーザーからの 「LINE ブラウザで音声が出ない」という報告に基づいて：

1. 原因仮説を整理 （WebView の Web Speech API 制限 + autoplay 制限）
2. 短/中/長期の対策方針を決定
3. 次の Antigravity/Future 実装用のドキュメント整備

を中心に進めた。 コード上の修正はまだゼロ。

---

## Technical Detail (How & Why)

### Web Speech API を使った現状コード (概念図)

```typescript
// ArtFreeGuideClient.tsx (概念)
const speakSegment = (text: string) => {
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'ja-JP';
  utt.rate = 1.0;
  utt.pitch = 1.0;
  synthRef.current.speak(utt); // window.speechSynthesis
};
```

### LINE WebView で失敗する理由

- **iOS WKWebView**: `getVoices()` が日本語ボイスを取り出せないことがある
  → Context 内で `voices.synth(lang='ja-JP')` が succeed しても、 実際の発話
    が無音になる
- **Android Chrome Custom Tab (LINE 起動時)**: `window.speechSynthesis` 自体が
  undefined または動作停止
- **autoplay 制限**: ユーザー操作直後でも, WebView 自体が その click を
  user activation と見做さないケースあり

### 推薦フォールバックアーキテクチャ

```
User click ▶
   ↓
check `speechSynthesis in window` & UA
   ↓
、いいえ/WebView 内 → /api/tts 呼出 （Server-side TTS）
   ↓
mp3 BLOB → <audio> element → .play()
```

これなら全ブラウザで動く。

---

## Proof of Correctness (現状証拠)

- 本 Artifact は **Planning-only**、 Formal なテストや実行ログは存在しません
- 根拠は以下のユーザー報告と技術調査:

| ソース | 内容 |
|--------|------|
| ユーザー報告 | 「LINE の中のブラウザでは音声がなりません」 |
| Web Speech API spec (W3C) | Mobile WebView は、 機能はあるが voics 保証はなし |
| LINE Tech | LINE 内 WebView は、 特別な user agent を送る。 文書書籍は公開 |

---

## Closing (次のステップ)

### ユーザーへの次アクション提案

1. **短期案を実験:** 友人提供する実装案として WEB Speech チェック+ LINE
   UA 検出バナーが入る
2. **中期案に取り組む:** Workers AI の TTS モデル調査と ` /api/tts` ルート
   を追加
3. **ポート複查:** Cloudflare Workers が TTS 出力可能かドキュメント調査

### 技術-workers

- **Antigravity に依頼:** バナー表示の短期修正は軽量。 1 時間程度で終わる。
- **本人作業:** 中期案（Workers AI TTS）は調査必要。

### ドキュメントの今後

- `02_qa_evidence.md`: 実装しだい作成
- `03_walkthrough.md`: 最終報告

現状リビジョンでは空で控え、 実装ガイドとして今後に入れる。

### 残されている課題

- ユーザー OS が iPhone / Android のどちらか未確認
- 「声が全く出ない」 下なのか 「小さい音は聞こえたが 間が悪い」のか未確認
- Cloudflare Workers AI での TTS モデル提供状況未確認

---

## 適用したスキル

`antigraviti-artifact-generator`： エンジニア向けアーティファクト (Plan / QA / Bug / Walkthrough) を生成。 本案件で利用。

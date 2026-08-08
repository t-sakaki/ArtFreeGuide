# Quality Assurance Evidence

**作成日:** 2026-07-26
**ステータス:** Pending (Implementation not started)

---

## Execution Log

現段階ではコード実装を実施していないため、 実行ログは空です。

```
[QA] Tests to be executed after Phase 1 implementation:

# 1. Client-side detection
node -e "
  const ua = navigator.userAgent;
  console.log('UA:', ua);
  console.log('Is LINE:', /Line\\//i.test(ua));
  console.log('Has speechSynthesis:', 'speechSynthesis' in window);
"

# 2. Server-side TTS API test
curl -sS -X POST http://localhost:3003/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text": "ひまわりはゴッホの代表作です。", "voice": "ja-JP"}' \
  -o /tmp/tts-test.mp3
file /tmp/tts-test.mp3   # → 'Audio file with ID3 ...'

# 3. UI fallback test
# ハードリロード → 作品選択 → 音声再生できなかった場合に
# バナー表示を確認
```

---

## Results

N/A (実装待ち)

---

## Artifacts (Diffs, Screenshots)

現段階で、 diff/ログは存在しません。

---

## Verification Logic

実装完了時に以下を検証：

1. **Client-side**: LINE UA を検出すると バナー表示する (or TTS-route に切替)
2. **Server-side**: `/api/tts` が `audio/mpeg` バイナリを返す (HTTP 200)
3. **End-to-end**: `<audio src="/api/tts?text=...">.play()` で、 Android Chrome
   Custom Tab で mp3 が再生される
4. **Fallback**: Web Speech API 通常経路は、 **`isLine=false` 環境では変更がない** こと

---

## Anomalies

- ユーザー OS が iOS か Android か分からない。 ケースにより WebView の
  サポートが異なるため、 両?=OSの場合に実績バナー表示は確率 50% 随着 不正確。
- LINE パッチの隠しWebView には、 user agent 検査と sample voice をログ
  出力するスムーズなメソッドがない。

---

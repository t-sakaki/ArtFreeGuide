# Bug Report: SpeechSynthesis Deadlock in ArtFreeGuide
...
---

## Bug Report: デプロイ時に .open-next/ ディレクトリが生成されない

**日付:** 2026-07-24
**環境:** ArtFreeGuide trial deployment

### 現象
`npm run build && npx wrangler deploy -e trial` を実行した際、ビルドは成功するが、Cloudflareへのデプロイ時に "No updated asset files to upload" と表示され、コードの変更が反映されない。

**原因分析:**
- `npm run build` は `next build` のみを実行し、`.next/` ディレクトリを生成する。
- Cloudflare Workers へのデプロイには、`@opennextjs/cloudflare` によって生成される `.open-next/` ディレクトリが必要である。
- `next build` では `opennextjs-cloudflare build` が自動的にトリガーされないため、`.open-next/` が生成されない。
- 既存の `.open-next/` が旧バージョンや別環境のものである場合、Cloudflareは更新がないと判断する。

### 解決策
`npm run build` の代わりに `npm run build:cf` (即ち `opennextjs-cloudflare build`) を使用する：
```bash
npm run build:cf && npx wrangler deploy -e trial
```

または `package.json` の scripts を使用：
```bash
npm run deploy:trial
```

### 検証済みコマンド
| コマンド | .open-next 生成 | Cloudflare デプロイ |
|---------|----------------|-------------------|
| `npm run build` | ✗ | ✗ (変更反映なし) |
| `npm run build:cf` | ✓ | ✓ (アセット更新あり) |
| `npm run deploy:trial` | ✓ | ✓ (推奨) |

## Symptom
The application starts playing the ambient background sound, but the voice guidance (SpeechSynthesis) fails to produce any sound, effectively "deadlocking" at the first segment. The UI indicates playback is active, but no voice is heard, and the `onstart` event of the `SpeechSynthesisUtterance` is never triggered.

## Root Cause Analysis
The deadlock is caused by a combination of factors in the browser's audio management:
1. **Audio Context Competition**: The simultaneous triggering of the Web Audio API (for ambient sounds) and the `window.speechSynthesis` API can lead to resource contention or race conditions where the SpeechSynthesis queue is initialized but never "activated" by the browser's audio engine.
2. **Suspended Audio State**: Modern browsers require a clear user gesture to resume the `AudioContext`. While `forceUnlock` is called, the current sequence in `handlePlayPause` triggers `startAmbientSound` and `setIsPlaying(true)` (which triggers `speakSegment`) almost simultaneously.
3. **SpeechSynthesis Queue Stagnation**: `window.speechSynthesis` can enter a state where it believes it is speaking (or waiting to speak) but the internal buffer is stuck. The current `clearQueue` implementation calls `resume()` and `cancel()`, but this isn't always sufficient to "wake up" the engine if it has entered a deep deadlock.
4. **Lack of Start-Watchdog**: Although there is a `startTimeoutId`, it is set to 2.5 seconds, and the transition it triggers simply moves to the next segment without attempting to reset the audio engine, potentially repeating the deadlock for every segment.

## Conclusion
The system needs a more aggressive "forced-resume" mechanism and a strict ordering where the Voice playback acts as the primary trigger, and the Ambient sound is secondary, ensuring the browser's audio focus is correctly assigned to the speech engine first.

---
## Bug Report: Unintended Redirect due to URL Parameter Inconsistency
**Date:** 2026-07-24
**Environment:** trial (https://art-free-guide-trial.taira-sakakibara.workers.dev)

### Symptom
When accessing the application with a  parameter (e.g., `?work=... `), the application unexpectedly redirects to a URL that includes , , , and  parameters.

**Example:**
- **Accessed URL:** `https://art-free-guide-trial.taira-sakakibara.workers.dev/?work=%E3%82%AA%E3%83%BC%E3%82%AE%E3%83%A5%E3%82%B9%E3%83%88%E3%83%BB%E3%83%AD%E3%83%80%E3%83%B3%E8%A3%B8%E3%81%AE%E3%83%90%E3%83%AB%E3%82%B6%E3%83%83%E3%82%AF`
- **Redirected URL:** `https://art-free-guide-trial.taira-sakakibara.workers.dev/?work=...&artwork=...&artist=...&speed=1.5&mode=short`

### Potential Root Cause
The  function or the  hooks handling URL synchronization in `src/app/page.tsx` are likely triggering a  or similar operation that appends default parameters regardless of whether the original access was via a specific  parameter. This creates an inconsistent state where the original intent (the  parameter) is overshadowed or modified by a redirect-like state update.

### Expected Behavior
The application should respect the original URL parameters and not perform an automatic redirect/replacement that adds extraneous parameters unless explicitly triggered by the user or a specific generation logic.

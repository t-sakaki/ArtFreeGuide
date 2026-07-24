# Bug Report: SpeechSynthesis Deadlock in ArtFreeGuide
...
---

## Bug Report: Deploy时不生成 .open-next/ 目录

**日期:** 2026-07-24
**环境:** ArtFreeGuide trial deployment

### Symptom
执行 `npm run build && npx wrangler deploy -e trial` 时，虽然构建成功，但Cloudflare部署时显示 "No updated asset files to upload"，导致代码变更未生效。

**原因分析:**
- `npm run build` 只运行 `next build`，生成 `.next/` 目录
- Cloudflare Workers 部署需要 `.open-next/` 目录（由 `@opennextjs/cloudflare` 生成）
- `next build` 不会自动触发 `opennextjs-cloudflare build`，因此 `.open-next/` 不会被生成
- 之前存在的 `.open-next/` 是旧版本/其他环境生成的，导致部署时Cloudflare认为没有更新

### 解決策
使用 `npm run build:cf` (即 `opennextjs-cloudflare build`) 代替 `npm run build`：
```bash
npm run build:cf && npx wrangler deploy -e trial
```

または package.json の scripts を使用：
```bash
npm run deploy:trial
```

### 検証済みコマンド
| コマンド | .open-next 生成 | Cloudflare デプロイ |
|---------|----------------|-------------------|
| `npm run build` | ✗ | ✗ (変更反映なし) |
| `npm run build:cf` | ✓ | ✓ (3アセット更新) |
| `npm run deploy:trial` | ✓ | ✓ (推奨)

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

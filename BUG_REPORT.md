# Bug Report: SpeechSynthesis Deadlock in ArtFreeGuide

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

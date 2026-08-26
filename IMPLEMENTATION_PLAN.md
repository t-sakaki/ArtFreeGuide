# Implementation Plan: SpeechSynthesis Deadlock Resolution

## Goal
Resolve the SpeechSynthesis deadlock by implementing a forced-resume mechanism, a strict watchdog timer, and optimized audio sequencing.

## Detailed Technical Steps

### 1. Enhance `AudioController` for Forced-Resume
- **Modification in `speak()`**:
    - Immediately before calling `window.speechSynthesis.speak()`, execute:
      `window.speechSynthesis.cancel()` $\rightarrow$ `window.speechSynthesis.resume()`.
    - This sequence clears any ghost utterances and forces the engine to re-evaluate its active state.
- **Strict Watchdog Implementation**:
    - Reduce the `startTimeoutId` from 2.5s to 2.0s.
    - If the watchdog fires, log `[AUDIO-DEBUG] WATCHDOG: Voice failed to start. Forcing reset.` and trigger the transition.

### 2. Optimize Execution Sequence in `ArtFreeGuide`
- **Modify `handlePlayPause`**:
    - Remove the direct call to `startAmbientSound(artwork)` from `handlePlayPause`.
    - Instead, let the playback flow be: `User Click` $\rightarrow$ `setIsPlaying(true)` $\rightarrow$ `speakSegment()` $\rightarrow$ `AudioController.speak()`.
- **Tie Ambient Sound to Voice Start**:
    - In `speakSegment`, pass a callback to `AudioController.speak`'s `onStart` parameter.
    - Inside this `onStart` callback, call `startAmbientSound(artwork)`.
    - This ensures the Web Audio API (Ambient) only starts *after* the browser has successfully initiated the SpeechSynthesis voice, preventing contention.

### 3. Strengthen Debugging (Observability)
- Implement the `[AUDIO-DEBUG]` prefix for all critical audio lifecycle events:
    - `[AUDIO-DEBUG] Attempting to speak segment #${index}`
    - `[AUDIO-DEBUG] Voice successfully started for #${index}`
    - `[AUDIO-DEBUG] Sentence #${index} ended normally`
    - `[AUDIO-DEBUG] Sentence #${index} error: ${error}`
    - `[AUDIO-DEBUG] WATCHDOG: Sentence #${index} failed to start. Skipping.`

## Verification Criteria (QA)
- **Console Log Trace**: Verify the sequence: `Attempting to speak` $\rightarrow$ `Voice successfully started` $\rightarrow$ `Ambient Sound started`.
- **Deadlock Test**: Ensure that if `onstart` is delayed, the watchdog fires at exactly 2 seconds and moves to the next segment.
- **Functional Test**: Confirm that both voice and ambient sound are audible upon the first click of the Play button.

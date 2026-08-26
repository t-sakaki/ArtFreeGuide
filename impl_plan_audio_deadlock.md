# Implementation Plan: Fixing Audio Synthesis Deadlock

## Goal
Ensure reliable start of `SpeechSynthesis` while `Web Audio API` ambient sounds are playing, preventing the deadlock where `onstart` never fires.

## Technical Approach

### 1. Robust Audio Engine Reset
Modify `AudioController.clearQueue` and `AudioController.speak` to ensure the engine is completely reset and active.
- Call `speechSynthesis.cancel()` followed by `speechSynthesis.resume()` to clear the queue and force the engine out of a paused state.
- Implement a "double-tap" reset: `cancel()` -> `resume()` -> `speak()`.

### 2. Enhanced Debugging & Visibility
Add detailed logging to every lifecycle stage of the utterance to pinpoint exactly where the failure occurs.
- Log `[AUDIO] Queueing...`, `[AUDIO] OnStart fired`, `[AUDIO] OnEnd fired`, `[AUDIO] OnError fired`.

### 3. Execution Order Optimization
Adjust the timing between starting ambient sounds and starting speech.
- Ensure that the user gesture (e.g., clicking "Play") triggers both the `AudioContext` resume and the `speechSynthesis` unlock in a single sequence.

### 4. Implementation of an Active Watchdog (Fail-safe)
The current `startTimeoutId` is a good start, but it should be more aggressive and potentially trigger a "hard reset" of the speech engine if `onstart` doesn't fire within a reasonable window (e.g., 2 seconds).
- If `startTimeoutId` triggers:
    1. Call `speechSynthesis.cancel()`.
    2. Log a "Hard Reset" event.
    3. Attempt to speak the segment one more time or skip to the next.

## Changes to `src/app/page.tsx`

- **`AudioController.clearQueue()`**: Strengthen the reset logic.
- **`AudioController.speak()`**: 
    - Add explicit `window.speechSynthesis.resume()` before `speak()`.
    - Enhance the `onstart` / `onend` / `onerror` logging.
    - Refine the `startTimeoutId` to act as a recovery mechanism.
- **`AudioController.forceUnlock()`**: Ensure this is called during the initial user interaction.

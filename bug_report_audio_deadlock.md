# Bug Report: Audio Synthesis Deadlock in ArtFreeGuide

## Problem Description
When playing ambient soundscapes (using Web Audio API) and simultaneously initiating speech synthesis (via `window.speechSynthesis`), the speech synthesis often fails to start. Specifically, while the ambient low-frequency noise is audible, the speech synthesis engine appears to hang. The `speak()` method is called, but the `onstart` event never fires, causing a deadlock where the user is stuck on the first segment of the guide text.

## Root Cause Analysis
1. **Audio Context Competition**: The Web Audio API (used for ambient sound) and the SpeechSynthesis API are separate systems, but in some browsers (especially Chromium-based), heavy usage of the audio hardware or specific AudioContext states can interfere with the speech engine's ability to acquire the audio device.
2. **SpeechSynthesis State Hang**: The `window.speechSynthesis` engine can enter a "paused" or "stuck" state, especially after multiple `cancel()` calls or when interrupted by other audio triggers. If the engine is stuck, calling `speak()` adds the utterance to the queue, but the engine never actually starts processing it.
3. **Race Condition**: The current implementation calls `cancel()` and then `speak()` with a small timeout (50ms). If the browser's internal cleanup of the previous utterance isn't complete, the new `speak()` call might be ignored or queued behind a "ghost" utterance.

## Impact
- Users cannot hear the guide audio while ambient sounds are active.
- The application's playback logic hangs, preventing progression through the guide segments.

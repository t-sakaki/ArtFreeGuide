# Pre-generated Ogg/Opus Narration Architecture & Operations Guide

## 1. Overview
ArtFreeGuide now supports pre-generated Ogg/Opus narration stored in the private Cloudflare R2 bucket (`artfreeguide-audio`) and streamed with HTTP Range (`206 Partial Content`) support, synchronized sentence-by-sentence with the existing 3-row audio player UI.

When pre-generated Opus audio is unavailable—due to missing audio for a given `(artwork, locale, mode, contentHash)`, Safari `< 18.4` (`canPlayType('audio/ogg; codecs="opus"') === ''`), media decode error, or newly appended Q&A / Deep Dive segments—playback seamlessly falls back to the Web Speech API (`AudioController`).

## 2. Architecture & R2 Key Layout

### Separation from Theme Songs & Legacy MP3 Verification
- Theme songs remain untouched under `theme-songs/...` in `artfreeguide-audio` and continue to use `verifyMp3Buffer` in `src/lib/audioVerify.ts`.
- Opus narration uses its own Ogg/Opus RFC 7845 validator (`verifyOpusBuffer` in `src/lib/narration.ts`) and its own routes:
  - `GET /api/narration`: resolves `(title, artist, locale, mode, contentHash)` -> `{ status, audioUrl, manifest }`
  - `GET / HEAD /api/narration/audio`: streams R2 object with `200`, `206`, `304`, `416`, `Accept-Ranges: bytes`, and `Content-Type: audio/ogg; codecs=opus`.
- `src/app/api/tts/route.ts` is left untouched.

### R2 Key Hierarchy
```text
narration/{NARRATION_ENV}/{artworkId}/{locale}/{mode}/{contentHash}/latest.json
narration/{NARRATION_ENV}/{artworkId}/{locale}/{mode}/{contentHash}/{voiceConfigHash}/manifest.json
narration/{NARRATION_ENV}/{artworkId}/{locale}/{mode}/{contentHash}/{voiceConfigHash}/audio.opus
```
- **`NARRATION_ENV`**: `staging` (in `wrangler.jsonc` `env.staging.vars`) or `production` (top-level and `env.production.vars`).
- **`artworkId`**: Canonical English slug from `artworkSlug()` (`src/lib/slug.ts`), or `work-{sha256_16}` for unlisted works.
- **`contentHash`**: 16-char SHA-256 prefix of the normalized mode guide text (`composeGuideModeText`). Ensures regenerated/corrected D1 guides never play stale audio.
- **`voiceConfigHash`**: 16-char SHA-256 prefix of `{ provider, modelId, voiceId, outputFormat, voiceSettings }`. Allows voice upgrades without overwriting immutable `audio.opus` / `manifest.json` objects.

## 3. Client Playback Synchronization (`useNarrationAudio` + `HomeClient.tsx`)
- **`useNarrationAudio` (`src/hooks/useNarrationAudio.ts`)**:
  - Checks `supportsOpusAudio()` upfront.
  - Fetches `/api/narration` for the base guide text (`responseShort`, `responseStandard`, `baseResponseDeep`).
  - Manages `<audio preload="auto">` with `preservesPitch = true` across `1.0x`–`2.5x` playback rates.
  - Polls every 80ms + `timeupdate` / `seeked` to map `currentTime` to `activeSegmentIndex` via `findSegmentIndexForTimeMs()`.
  - Uses a seek guard (`~180–200ms`) so skip-forward/backward doesn't snap back to the old sentence.
- **Q&A & Deep Dive Continuation**:
  - `baseResponseDeep` holds the archived `deep` guide text, while `responseDeep` receives appended Q&A / deep-dive blocks.
  - Once Opus finishes the base segments, `onEnded` checks if `speakableSegments.length > manifest.segments.length` and advances `activeSegmentIndex` into Web Speech API for the appended segments.
- **Theme Song Mutual Exclusion**:
  - Entering Theme Song mode (`enterSongMode`) pauses Opus narration alongside `AudioController.clearQueue()`.

## 4. Pre-generation & Staging -> Production Promotion

### Priority Batching (`scripts/pregenerate_narration.mjs`)
- Uses `esbuild` in-memory bundling of `src/lib/*` so `contentHash`, `artworkId`, `sanitizeGuideText`, and `buildNarrationSynthesisInput` match the runtime 1:1.
- Safety controls:
  - `--dry-run`: inspects D1 `artwork_guides`, prints locale/mode counts and estimated character usage without calling ElevenLabs.
  - `--max-chars=<N>`: hard stop before submitting a request that would exceed the cap.
  - `--deadline=<ISO>`: hard UTC stop timestamp (default `2026-11-18T00:00:00Z`).
  - `--confirm-budget`: required when `GET /v1/user/subscription` returns `401 missing_permissions` (`user_read`).
  - **No blind retries** on timeout or 5xx to prevent duplicate credit billing.
  - Local backup under `tmp/narration-archive/` (gitignored) + R2 upload in `audio.opus` -> `manifest.json` -> `latest.json` order.

### Multi-TTS Provider Adapters (`scripts/tts-adapters/`)
- `scripts/pregenerate_narration.mjs` supports pluggable adapters via `--provider=<name>` and per-locale overrides (`--provider-<loc>=<name>`, `--voice-<loc>=<id>` or comma-separated pool `--voice-<loc>=id1,id2`, `--model-<loc>=<id>`):
  - `elevenlabs` (`scripts/tts-adapters/elevenlabs.mjs`): `/with-timestamps` + automatic chunking above 9,000 chars.
  - `azure` (`scripts/tts-adapters/azure.mjs`): Azure AI Speech SSML (`ogg-48khz-16bit-mono-opus`) via `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` (single-request F0-safe default or `strategy: 'per-segment'`).
  - `gemini` (`scripts/tts-adapters/gemini.mjs`): Gemini Flash TTS (`gemini-2.5-flash-preview-tts`) via `GEMINI_API_KEY`, transcoded + concatenated to Ogg/Opus via `ffmpeg`.
- Because `voiceConfigHash` hashes `{ provider, modelId, voiceId, outputFormat, voiceSettings }`, multiple providers coexist in R2 and `latest.json` switches the active voice per `(artworkId, locale, mode, contentHash)` without redeploying the worker.

### Initial Staging Verification (2026-11-17)
- Selected voice: **Ren** (`d4Vuj6wQOxvRyQ320L3k`, `eleven_multilingual_v2`, `opus_48000_64`).
- Pre-generated **24** top-priority `ja/standard` guides (`19,865` input chars; ~`7,568` ElevenLabs `character-cost`) and verified on `art-free-guide-staging.taira-sakakibara.workers.dev`:
  - `/api/narration` returns `200 { status: "ready", audioUrl, manifest }` for pre-generated works and `{ status: "none" }` for non-generated modes/hashes.
  - `/api/narration/audio` returns `206 Partial Content` (`Accept-Ranges: bytes`, `Content-Type: audio/ogg; codecs=opus`, `OggS` + `OpusHead`).
  - Browser verification confirmed automatic segment progression (`1/20` -> `12/20`), skip forward/backward, pause, and `mode=short` Web Speech fallback.

### Promoting Staging Audio to Production
After PR merge to `main`, copy the verified local archive under `narration/production/...` (zero ElevenLabs calls):
```bash
node scripts/pregenerate_narration.mjs --copy-to-prod --from-env=staging --to-env=production
```

## 5. Post-Creator Free / Low-Cost TTS Comparison
Once the ElevenLabs Creator plan ends (`2026-11-18`), bulk generation or on-demand archival can transition to one of these providers while keeping the exact same `narration/{env}/...` R2 manifest & Opus pipeline (encoding to Ogg/Opus via `ffmpeg` when the provider outputs MP3/WAV/PCM):

| Provider / Model | Free Tier | Paid Pricing (approx.) | Japanese Quality & Speed Control | Timestamps / Alignment | Recommended Role |
|---|---|---|---|---|---|
| **Azure AI Speech (Neural TTS, F0)** | **500,000 chars / month** free (`F0`) | ~$16 / 1M chars (`S0`) | Very strong `ja-JP` (`Nanami`, `Keita`, `Shiori`, `Daichi`), natural prosody, SSML support | Native `WordBoundary` / `SentenceBoundary` events (exact ms offsets!) | **Best primary post-Creator choice** for free monthly batch pre-generation of Japanese + English guides |
| **Gemini Flash TTS (`gemini-2.5-flash-preview-tts`)** | Free tier quota via Google AI Studio (rate-limited) | Low cost per token (~$0.50 input / $10 output audio tokens per 1M) | Expressive multilingual (`ja`/`en`/`fr`/`zh`/`es`), style prompting | Outputs PCM/WAV (no character alignment API; segment by sentence or VAD/forced alignment) | Good fallback for expressive multi-language snippets or single-sentence synthesis |
| **NVIDIA NIM Magpie TTS** | Free developer credits (shared NIM quota) | Pay-as-you-go / enterprise | Strong `en-US` and growing multilingual support | Audio output; sentence-level splitting recommended | Useful if already standardized on NVIDIA NIM quota |
| **Web Speech API (Client Fallback)** | Unlimited ($0) | $0 | Device-dependent (`Kyoko`/`Otoya` on Apple, Google voices on Android/Chrome, minimal on headless) | Native utterance `onend` per segment | Always retained as zero-cost fallback for Q&A, Safari `< 18.4`, and uncached works |

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
  - `--deadline=<ISO>`: optional hard UTC stop timestamp (omitted by default; pass explicitly when running time-boxed batches).
  - `--confirm-budget`: required when `GET /v1/user/subscription` returns `401 missing_permissions` (`user_read`).
  - **No blind retries** on timeout or 5xx to prevent duplicate credit billing.
  - Local backup under `tmp/narration-archive/` (gitignored) + R2 upload in `audio.opus` -> `manifest.json` -> `latest.json` order.

### Multi-TTS Provider Adapters (`scripts/tts-adapters/`)
- `scripts/pregenerate_narration.mjs` supports pluggable adapters via `--provider=<name>` and per-locale overrides (`--provider-<loc>=<name>`, `--voice-<loc>=<id>` or comma-separated pool `--voice-<loc>=id1,id2`, `--model-<loc>=<id>`):
  - `elevenlabs` (`scripts/tts-adapters/elevenlabs.mjs`): `/with-timestamps` + automatic chunking above 9,000 chars.
  - `azure` (`scripts/tts-adapters/azure.mjs`): Azure AI Speech SSML (`ogg-48khz-16bit-mono-opus`) via `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` (adapter retained for reference; Azure AI Speech is not enabled in this project).
  - `gemini` (`scripts/tts-adapters/gemini.mjs`): Gemini Flash TTS (`gemini-2.5-flash-preview-tts`) via `GEMINI_API_KEY` (or `GOOGLE_AI_API_KEY`), transcoded + concatenated to Ogg/Opus via `ffmpeg`.
- Because `voiceConfigHash` hashes `{ provider, modelId, voiceId, outputFormat, voiceSettings }`, multiple providers coexist in R2 and `latest.json` switches the active voice per `(artworkId, locale, mode, contentHash)` without redeploying the worker.

### ElevenLabs Creator Completion & Production Promotion (2026-11-18)
- Before the ElevenLabs Creator plan expired (`2026-11-18`), pre-generation shifted to `eleven_v4` (~0.44 credits/char) with deterministic `EIKO` (`GR4dBIFsYe57TxyrHKXz`) / `Takashi` (`ok4ERsdqy0XfV8XdOi3U`) voice rotation for `ja/standard` and `George` (`JBFqnCBsd6RMkjVDRZzb`) for `en/standard`.
- Promoted **209 unique `eleven_v4` tracks** (`ja/standard`: **180** works; `en/standard`: **29** works including 100% of valid playlist/tour works; `631` R2 objects = `422` immutable artifacts + `209` `latest.json` pointers) to `production` R2, filtering out legacy `Ren` (`d4Vuj6wQOxvRyQ320L3k` / `eleven_multilingual_v2`) objects via `--filter-voices` and `--filter-model=eleven_v4`.
- Audio synthesized during the paid Creator subscription retains commercial rights indefinitely and remains served from `production` R2.

### Promoting Staging Audio to Production
After verifying staging tracks, copy the filtered local archive under `narration/production/...` (zero TTS API calls):
```bash
node scripts/pregenerate_narration.mjs --copy-to-prod --from-env=staging --to-env=production --filter-voices=GR4dBIFsYe57TxyrHKXz,ok4ERsdqy0XfV8XdOi3U,JBFqnCBsd6RMkjVDRZzb --filter-model=eleven_v4 --concurrency=4
```

## 5. Post-Creator Operations (Plan A: Gemini Flash TTS + Web Speech Fallback)
ElevenLabs has downgraded to the **Free plan (10,000 credits/month)**. Verified ElevenLabs Free tier constraints:
- **Voice Library restriction**: Community/professional Voice Library voices (`EIKO`, `Takashi`, `Hana`) are unavailable via API on the Free tier (only `premade` voices such as `George` are accessible, and Default voices are scheduled for retirement on `2026-12-31`).
- **License restriction**: Free-tier generations do not include a commercial license and require `elevenlabs.io` attribution.
- **Quota**: 10,000 credits/month (~22,700 `eleven_v4` chars/month).

**Adopted Policy (Plan A, Refs #175)**:
1. **Stop production ElevenLabs synthesis** to avoid Free-tier licensing/voice restrictions; continue serving the 209 paid-tier `eleven_v4` R2 tracks and fall back to the zero-cost **Web Speech API** for uncached works.
2. **Use `Gemini Flash TTS` (`--provider=gemini`)** for expanding remaining works (`ja/standard`: ~119 remaining; `en/standard`: ~97 remaining) and future tour additions once `GEMINI_API_KEY` is configured (Azure AI Speech is not pursued).
   ```bash
   node scripts/pregenerate_narration.mjs --dry-run --env=staging --provider=gemini --locales=ja,en --modes=standard --require-artist --dedupe-artwork --skip-existing-latest --check-env=production
   ```

### Gemini dual-key operation (`--key-tier`, default: `free`)
Two Gemini API keys are configured in `.env.local` (never committed; keys are never logged):
- `GEMINI_API_KEY`: Tier 1 key (`artfreeguide-tts-local`, ~RPM 10 / RPD 100).
- `GEMINI_API_KEY_FREE`: Free-tier key (`artfreeguide-tts-free`, ~RPM 3 / **RPD 10**).
- `GOOGLE_AI_API_KEY` is treated as an alias of `GEMINI_API_KEY`.

**Daily gradual mode (default, `--key-tier=free`)**: synthesis starts on the free key with a 20s request interval (RPM 3) and a hard cap of **10 free-key API requests per run** (matching RPD 10; counted per segment request, not per artwork). When the budget is hit or the free key returns `429` / `RESOURCE_EXHAUSTED`, the run **stops safely, reports the remaining unprocessed artworks, and never silently consumes the paid primary key**. Re-run daily to expand coverage gradually.
**Bulk mode (`--key-tier=primary`)**: starts on the Tier 1 key with a 6s request interval (RPM 10). On a primary quota/rate error, remaining jobs fall back to the free key (subject to the same free-budget cap).
Key usage is logged only as `[key:free]` / `[key:primary]` tier labels — never key values.

| Provider / Model | Tier / Quota | Japanese Quality & Voices | Timestamps / Alignment | Status in ArtFreeGuide |
|---|---|---|---|---|
| **ElevenLabs (`eleven_v4`, paid archive)** | 209 tracks cached in R2 (Creator complete; Free tier = 10k credits/mo, non-commercial) | `EIKO` / `Takashi` (`ja`), `George` (`en`) | Native character-level alignment | **Archive retained in production R2; new synthesis stopped** |
| **Gemini Flash TTS (`gemini-2.5-flash-preview-tts`)** | Google AI Studio quota via `GEMINI_API_KEY` | Multilingual (`Kore`, `Puck`, `Aoede`, `Charon`), transcoded to Ogg/Opus via `ffmpeg` | Segment-by-segment duration timings (`buildSegmentTimingsFromDurations`) | **Primary choice for post-Creator expansion (`--provider=gemini`)** |
| **Web Speech API (Client Fallback)** | Unlimited ($0) | Device-dependent | Native utterance `onend` per segment | **Always active zero-cost fallback for uncached works, Q&A, Safari `< 18.4`** |
| **Azure AI Speech (Neural TTS, F0)** | 500k chars/mo free (`F0`) | `Nanami`, `Keita`, etc. | Native `WordBoundary` / `SentenceBoundary` | Adapter implemented, **not enabled** |

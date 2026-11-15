# ArtFreeGuide LINE TTS & Restoration Log

**Branch:** `feat/restore-restore-line-bot`  
**Date:** 2026-08-18  
**Component:** LINE Messaging API Webhook, Cloudflare AI TTS Pipeline, and Audio Verification Engine

---

## 1. History of Restoration (Git Forensics)

### 1.1 Commit Forensics
A chronological investigation of the repository history reveals the following evolution of the LINE Bot integration:

* **`4d71f22`** (`feat: LINE Bot連携機能を実装（AIキュレーターのLINE対応）`):
  Initial implementation of the LINE Bot webhook (`src/app/api/line/webhook/route.ts`) and helper client (`src/lib/line.ts`).
* **`395c52b` / `1e87d50` / `3010f00` / `13b34d3`**:
  Multiple attempts to integrate `@line/bot-sdk` v9 (`MessagingApiClient`). However, heavy Node.js dependencies in the official SDK introduced runtime incompatibilities in Edge/Cloudflare Workers environments.
* **`238dfb2`** (`fix: LINE署名検証にRaw Bodyを使用し、エラーハンドリングを強化`):
  Refactored signature verification to parse raw request text for HMAC-SHA256 calculation.
* **`3798393`** (`style: LINE専用フォーマットへの最適化`):
  Structured prompt templates and response formatting for LINE chat bubbles.
* **Subsequent Branch Merges & Regressions**:
  During multi-branch multilingual expansion and UI merges (`feat/multilingual-expansion`, `refactor/ui-stable`), several LINE and TTS files became untracked or diverged. An interim version reintroduced an `OPENAI_API_KEY` / `tts-1` dependency, lacked Cloudflare Workers AI rate-limit (HTTP 429) handling, and had potential noise hazards due to unverified audio formats.

### 1.2 Restoration Goals
This worktree systematically cleans up and hardens the entire LINE integration:
1. Pure Edge-native LINE client using standard Web Crypto API (HMAC-SHA256) and native `fetch` (zero heavyweight SDK dependencies).
2. Complete removal of OpenAI TTS dependencies and legacy code.
3. Resilience-first TTS fallback pipeline: Cloudflare Workers AI TTS as primary, backed by a local Safe Mock MP3 generator.
4. Binary audio verification to eliminate speaker noise, pops, and decoder crashes.

---

## 2. Rationale for Removing OpenAI TTS

1. **Architectural Alignment with Cloudflare Edge Runtime**:
   ArtFreeGuide is designed for serverless execution on Cloudflare Workers / Pages. Relying on an external OpenAI TTS API introduced additional network hops, cold-start latency, and external vendor dependencies.
2. **Elimination of Unnecessary Secrets & Costs**:
   Removing OpenAI TTS eliminates the requirement for `OPENAI_API_KEY` in production and staging environments, mitigating key management overhead and unpredictable API usage billing.
3. **Consistency Across AI Pipelines**:
   The application's core LLM and audio services are anchored on Cloudflare Workers AI. Consolidating the TTS stack under Cloudflare Workers AI simplifies observability and maintenance.

---

## 3. Architecture of the Fallback Chain

The TTS service in `src/app/api/tts/route.ts` implements a multi-tier fallback mechanism:

```
[Incoming Request (/api/tts?text=...)]
                  │
                  ▼
┌────────────────────────────────────────────────────────┐
│ 1. Primary Engine: Cloudflare Workers AI REST API       │
│    - Models: @cf/myshell-ai/melotts                    │
│              @cf/myshell/melotts-japanese (alt)        │
│    - Rate Limit (429) Detection                        │
│    - JSON / Base64 / Binary MIME Type Parsing          │
└────────────────────────────────────────────────────────┘
                  │
        ┌─────────┴─────────┐
     Success              Failure / HTTP 429 /
  (Valid MP3)          MIME Mismatch / Network Err
        │                           │
        ▼                           ▼
┌──────────────────┐    ┌───────────────────────────────────┐
│ Return Cloudflare│    │ 2. Absolute Fallback:             │
│ Binary MP3 Audio │    │    Local "Safe Mock MP3" Buffer   │
│ (200 OK)         │    │    - 100% In-Memory Synthetic MP3 │
└──────────────────┘    │    - ID3v2 + MPEG-1 L3 Silent     │
                        │    - 0ms Latency, 0 Network Calls │
                        │    - 200 OK with X-Audio-Mock     │
                        └───────────────────────────────────┘
```

### 3.1 Primary Layer: Cloudflare Workers AI TTS
* **Endpoint**: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/myshell-ai/melotts`
* **Credentials**: `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.
* **Rate-Limit Resilience (HTTP 429)**:
  If Cloudflare AI returns `429 Too Many Requests` (e.g. daily quota reached or concurrent request burst), the engine logs a warning and transitions immediately to the Safe Mock MP3 fallback without throwing uncaught exceptions or blocking downstream consumers.
* **Payload Normalization**:
  Handles both raw binary streams (`audio/mpeg`, `application/octet-stream`) and JSON envelopes (`{ "result": { "audio": "<base64>" } }`) seamlessly.

### 3.2 Absolute Fallback Layer: Safe Mock MP3 Generator
* **Function**: `createSafeMockMp3Buffer(durationSeconds)`
* **Structure**:
  - Valid 10-byte ID3v2 container header (`0x49, 0x44, 0x33, 0x03...`).
  - Sequence of valid MPEG-1 Layer III audio frames (128 kbps, 44.1 kHz, Joint Stereo) with frame synchronization words `0xFF 0xFB 0x90 0x64`.
  - Frame payloads populated with silent audio frames (`0x00`), preventing audio artifacts.
* **Benefits**: Guarantees valid duration metadata and clean playback on LINE mobile clients (iOS / Android), web audio elements, and proxy caches with 0% failure probability.

---

## 4. Audio Binary Safety & Noise Prevention

### 4.1 Root Cause Analysis of Audio "Noise" Bugs
Previous iterations and common edge implementations suffered from audio static / harsh noise issues caused by three primary factors:

1. **PCM / WAV Mismatch**:
   If a TTS endpoint returns uncompressed 16-bit PCM or a RIFF/WAV stream, but passes it with `Content-Type: audio/mpeg` or supplies it to LINE (which requires MP3/M4A), MP3 decoders attempt to decode raw PCM sample bytes as MPEG bitstreams. This results in loud screeching static and severe speaker distortion.
2. **HTML / JSON Error Page Leakage**:
   When upstream APIs return 4xx/5xx errors as HTML (`<!DOCTYPE html>...`, `<html>...`) or JSON (`{"error": ...}`), passing these text payloads with an `audio/mpeg` header causes decoders to interpret ASCII text as corrupted audio frames.
3. **Unconverted Base64 Strings**:
   Serving ASCII Base64 strings directly without decoding them into a raw binary buffer creates corrupted bitstreams.

### 4.2 Countermeasures in `src/lib/audioVerify.ts`

To enforce strict binary safety, all audio buffers pass through `verifyMp3Buffer`:

1. **Magic Byte Verification**:
   - **WAV/RIFF Detection**: Rejects any buffer starting with `0x52 0x49 0x46 0x46` (`RIFF`).
   - **HTML / JSON Text Detection**: Rejects any buffer starting with `<h`, `<!`, `{"`, `[{`.
2. **ID3v2 Header & Tag Size Computation**:
   - Correctly parses 7-bit synchsafe integers to calculate ID3v2 tag sizes (`id3Size = (b6<<21) | (b7<<14) | (b8<<7) | b9`) and skips the tag to locate audio frames.
3. **MPEG Frame Sync Word Validation**:
   - Scans for the 11-bit sync word `0xFF` + `0xE0`.
   - Validates MPEG Version ID (MPEG-1, MPEG-2, MPEG-2.5; rejects reserved `01b`).
   - Validates Layer description (strictly requires Layer III `01b`).
   - Validates Bitrate index (1..14) and Sample rate index (0..2).
   - Computes expected frame lengths (`floor(144 * Bitrate / SampleRate) + padding`).
4. **Automated Base64 Decoding**:
   - `base64ToUint8Array` safely strips Data URI schemes and converts Base64 strings into `Uint8Array` binary buffers before verification.
5. **Pre-flight Quality Verification in LINE Webhook**:
   - `src/app/api/line/webhook/route.ts` runs a pre-flight verification on the generated audio URL before sending the audio message to the LINE Messaging API.
   - If audio verification fails for any reason, the webhook safely omits the audio bubble and replies with structured text and a Flex Message button linking directly to the Web App.

---

## 5. Verification & Test Matrix

All test cases have been verified in `scratch/standalone_test.js` and `scratch/test_line_restoration.ts`:

| # | Test Scenario | Expected Result | Status |
|---|---------------|-----------------|--------|
| 1 | Web Crypto HMAC-SHA256 Signature Verification | Valid signature returns `true` | **PASS** |
| 2 | Invalid / Tampered Signature Detection | Tampered signature returns `false` | **PASS** |
| 3 | Malformed Base64 / Empty Secret Handling | Safely caught without exceptions, returns `false` | **PASS** |
| 4 | Safe Mock MP3 Generator Frame Sync & Duration | Valid ID3v2 + MPEG-1 L3 frames, accurate duration | **PASS** |
| 5 | WAV / RIFF Rejection (Noise Prevention) | Rejects RIFF bytes with format `wav` | **PASS** |
| 6 | HTML 500 Error Page Rejection | Rejects HTML strings with format `text` | **PASS** |
| 7 | JSON Error Payload Rejection | Rejects JSON strings with format `text` | **PASS** |
| 8 | Base64 Encoded MP3 String Parsing | Decodes and validates valid MP3 frames | **PASS** |
| 9 | Data URI Base64 (`data:audio/mpeg;base64,...`) | Decodes and validates MP3 frames | **PASS** |
| 10 | Cloudflare Workers AI HTTP 429 Simulation | Immediately falls back to Safe Mock MP3 | **PASS** |
| 11 | Cloudflare Workers AI HTTP 500 Simulation | Gracefully falls back to Safe Mock MP3 | **PASS** |
| 12 | Corrupted Audio Byte Stream Simulation | Fails verification, falls back to Safe Mock MP3 | **PASS** |
| 13 | Full Next.js Turbopack & OpenNext Build | Clean compilation with zero TypeScript errors | **PASS** |

---

## 6. Summary of Modified Files

* **`src/lib/line.ts`**: Edge-optimized LINE client using Web Crypto HMAC-SHA256, standard `fetch`, and typed message builders.
* **`src/app/api/tts/route.ts`**: Complete removal of OpenAI TTS; primary Cloudflare Workers AI TTS integration with 429 rate limit handling and Safe Mock MP3 fallback.
* **`src/app/api/tts/verify/route.ts`**: Verification and diagnostic endpoint with OpenAI dependencies purged.
* **`src/lib/audioVerify.ts`**: Robust audio format, WAV/PCM/HTML detection, Base64 decoding, and MPEG frame validator.
* **`src/app/api/line/webhook/route.ts`**: LINE Webhook handler with pre-flight audio quality check and graceful text/Flex message fallback.
* **`RESTORATION_LOG.md`**: Complete restoration documentation and forensics audit.

import { Locale } from './i18n';
import { canonicalName, catalogueTitle } from './names';
import { artworkSlug } from './slug';
import type { ExplanationMode, NarrationSegmentTiming } from './narrationText';

export type NarrationEnvironment = 'staging' | 'production';

export type NarrationProvider =
  | 'elevenlabs'
  | 'azure'
  | 'gemini'
  | 'edge-tts'
  | 'nim'
  | (string & {});

export interface NarrationManifest {
  version: 1;
  artworkId: string;
  canonicalTitle: string;
  canonicalArtist: string;
  locale: Locale;
  mode: ExplanationMode;
  contentHash: string;
  voiceConfigHash: string;
  provider: NarrationProvider;
  modelId: string;
  voiceId: string;
  outputFormat: string;
  durationMs: number;
  byteLength: number;
  segments: NarrationSegmentTiming[];
  createdAt: string;
}

export interface NarrationLatestPointer {
  voiceConfigHash: string;
  updatedAt: string;
}

export interface OpusVerificationResult {
  valid: boolean;
  format: string;
  byteLength: number;
  durationMs: number;
  sampleRate?: number;
  channels?: number;
  preSkip?: number;
  pageCount?: number;
  error?: string;
}

export type ParsedByteRange =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'unsatisfiable' }
  | { kind: 'range'; start: number; end: number; length: number };

const SAFE_ARTWORK_ID_RE = /^[a-z0-9][a-z0-9-]{0,127}$/;
const SAFE_HASH_RE = /^[a-f0-9]{12,64}$/;
const VALID_MODES = new Set<ExplanationMode>(['short', 'standard', 'deep']);

// Pure-JS SHA-256 so hashes are synchronous and identical across Node, Workers, and HTTP browsers.
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 =
        ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^
        ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^
        (w[i - 15] >>> 3);
      const s1 =
        ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^
        ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^
        (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map(n => n.toString(16).padStart(8, '0'))
    .join('');
}

export function isExplanationMode(value: string): value is ExplanationMode {
  return VALID_MODES.has(value as ExplanationMode);
}

export function isValidArtworkId(value: string): boolean {
  return SAFE_ARTWORK_ID_RE.test(value);
}

export function isValidHash(value: string): boolean {
  return SAFE_HASH_RE.test(value);
}

export function resolveNarrationEnvironment(raw?: string | null): NarrationEnvironment {
  return raw === 'production' ? 'production' : 'staging';
}

/**
 * Resolves a stable, URL-safe artworkId from a title and optional artist.
 * Known works use their canonical English slug; unlisted works fall back to a
 * deterministic hash of canonical Japanese title + artist.
 */
export function resolveNarrationArtworkId(title: string, artist = ''): string {
  const canonicalTitle = canonicalName(catalogueTitle(title));
  const slug = artworkSlug(canonicalTitle);
  if (slug && isValidArtworkId(slug)) {
    return slug;
  }
  const canonicalArtist = artist ? canonicalName(artist) : '';
  const digest = sha256Hex(`${canonicalTitle.trim().toLowerCase()}::${canonicalArtist.trim().toLowerCase()}`);
  return `work-${digest.slice(0, 16)}`;
}

/**
 * Deterministic hash of the guide text used for cache invalidation whenever
 * a guide is edited or regenerated.
 */
export function computeContentHash(guideText: string): string {
  const normalized = guideText.replace(/\r\n?/g, '\n').trim();
  return sha256Hex(normalized).slice(0, 16);
}

/**
 * Deterministic hash of voice/model/format settings so voice upgrades never
 * collide with previously generated immutable audio objects.
 */
export function computeVoiceConfigHash(config: {
  provider: string;
  modelId: string;
  voiceId: string;
  outputFormat: string;
  voiceSettings?: Record<string, unknown>;
}): string {
  const settingsEntries = Object.entries(config.voiceSettings ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const canonical = JSON.stringify({
    provider: config.provider,
    modelId: config.modelId,
    voiceId: config.voiceId,
    outputFormat: config.outputFormat,
    voiceSettings: Object.fromEntries(settingsEntries),
  });
  return sha256Hex(canonical).slice(0, 16);
}

export function narrationBasePrefix(
  env: NarrationEnvironment,
  artworkId: string,
  locale: Locale,
  mode: ExplanationMode,
  contentHash: string,
): string {
  return `narration/${env}/${artworkId}/${locale}/${mode}/${contentHash}`;
}

export function narrationLatestKey(
  env: NarrationEnvironment,
  artworkId: string,
  locale: Locale,
  mode: ExplanationMode,
  contentHash: string,
): string {
  return `${narrationBasePrefix(env, artworkId, locale, mode, contentHash)}/latest.json`;
}

export function narrationAudioKey(
  env: NarrationEnvironment,
  artworkId: string,
  locale: Locale,
  mode: ExplanationMode,
  contentHash: string,
  voiceConfigHash: string,
): string {
  return `${narrationBasePrefix(env, artworkId, locale, mode, contentHash)}/${voiceConfigHash}/audio.opus`;
}

export function narrationManifestKey(
  env: NarrationEnvironment,
  artworkId: string,
  locale: Locale,
  mode: ExplanationMode,
  contentHash: string,
  voiceConfigHash: string,
): string {
  return `${narrationBasePrefix(env, artworkId, locale, mode, contentHash)}/${voiceConfigHash}/manifest.json`;
}

export function buildNarrationAudioUrl(params: {
  artworkId: string;
  locale: Locale;
  mode: ExplanationMode;
  contentHash: string;
  voiceConfigHash: string;
}): string {
  const qs = new URLSearchParams({
    artworkId: params.artworkId,
    locale: params.locale,
    mode: params.mode,
    contentHash: params.contentHash,
    voiceConfigHash: params.voiceConfigHash,
  });
  return `/api/narration/audio?${qs.toString()}`;
}

function readAscii(bytes: Uint8Array, start: number, len: number): string {
  let out = '';
  for (let i = 0; i < len && start + i < bytes.length; i++) {
    out += String.fromCharCode(bytes[start + i]);
  }
  return out;
}

/**
 * Verifies an Ogg/Opus container buffer (RFC 7845), separate from MP3-only
 * `verifyMp3Buffer`. Confirms OggS pages, OpusHead, OpusTags, positive granule
 * duration, and rejects HTML/JSON/WAV/MP3 payloads.
 */
export function verifyOpusBuffer(input: Uint8Array | ArrayBuffer): OpusVerificationResult {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const byteLength = bytes.length;

  if (byteLength < 47) {
    return {
      valid: false,
      format: 'unknown',
      byteLength,
      durationMs: 0,
      error: 'Audio buffer is too short to be a valid Ogg/Opus file.',
    };
  }

  // Reject text/HTML/JSON errors
  if (
    bytes[0] === 0x3c || // '<'
    bytes[0] === 0x7b || // '{'
    bytes[0] === 0x5b    // '['
  ) {
    return {
      valid: false,
      format: 'text',
      byteLength,
      durationMs: 0,
      error: 'Non-audio text response (HTML/JSON) returned instead of Ogg/Opus.',
    };
  }

  // Reject RIFF/WAV
  if (readAscii(bytes, 0, 4) === 'RIFF') {
    return {
      valid: false,
      format: 'wav',
      byteLength,
      durationMs: 0,
      error: 'WAV/RIFF container detected instead of Ogg/Opus.',
    };
  }

  // Reject ID3/MP3
  if (
    readAscii(bytes, 0, 3) === 'ID3' ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  ) {
    return {
      valid: false,
      format: 'mp3',
      byteLength,
      durationMs: 0,
      error: 'MP3 stream detected instead of Ogg/Opus.',
    };
  }

  if (readAscii(bytes, 0, 4) !== 'OggS') {
    return {
      valid: false,
      format: 'unknown',
      byteLength,
      durationMs: 0,
      error: 'Missing OggS capture pattern at offset 0.',
    };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  let pageCount = 0;
  let hasOpusHead = false;
  let hasOpusTags = false;
  let channels = 0;
  let preSkip = 0;
  let sampleRate = 48000;
  let lastGranule = BigInt(0);

  while (offset + 27 <= byteLength) {
    if (readAscii(bytes, offset, 4) !== 'OggS') {
      return {
        valid: false,
        format: 'ogg',
        byteLength,
        durationMs: 0,
        error: `Corrupt Ogg page header at byte offset ${offset}.`,
      };
    }

    const version = bytes[offset + 4];
    if (version !== 0) {
      return {
        valid: false,
        format: 'ogg',
        byteLength,
        durationMs: 0,
        error: `Unsupported Ogg version ${version} at byte offset ${offset}.`,
      };
    }

    const granule = view.getBigInt64(offset + 6, true);
    if (granule > lastGranule) {
      lastGranule = granule;
    }

    const pageSegments = bytes[offset + 26];
    const lacingStart = offset + 27;
    if (lacingStart + pageSegments > byteLength) {
      return {
        valid: false,
        format: 'ogg',
        byteLength,
        durationMs: 0,
        error: `Truncated Ogg segment table at byte offset ${offset}.`,
      };
    }

    let payloadSize = 0;
    for (let i = 0; i < pageSegments; i++) {
      payloadSize += bytes[lacingStart + i];
    }

    const payloadStart = lacingStart + pageSegments;
    if (payloadStart + payloadSize > byteLength) {
      return {
        valid: false,
        format: 'ogg',
        byteLength,
        durationMs: 0,
        error: `Truncated Ogg page payload at byte offset ${offset}.`,
      };
    }

    if (pageCount === 0) {
      if (payloadSize < 19 || readAscii(bytes, payloadStart, 8) !== 'OpusHead') {
        return {
          valid: false,
          format: 'ogg',
          byteLength,
          durationMs: 0,
          error: 'First Ogg page does not contain a valid OpusHead packet.',
        };
      }
      const opusVersion = bytes[payloadStart + 8];
      channels = bytes[payloadStart + 9];
      preSkip = view.getUint16(payloadStart + 10, true);
      sampleRate = view.getUint32(payloadStart + 12, true) || 48000;
      if (opusVersion !== 1 || channels < 1) {
        return {
          valid: false,
          format: 'opus',
          byteLength,
          durationMs: 0,
          error: `Invalid OpusHead metadata (version=${opusVersion}, channels=${channels}).`,
        };
      }
      hasOpusHead = true;
    } else if (payloadSize >= 8 && readAscii(bytes, payloadStart, 8) === 'OpusTags') {
      hasOpusTags = true;
    }

    pageCount++;
    offset = payloadStart + payloadSize;
  }

  if (!hasOpusHead || !hasOpusTags || pageCount < 3) {
    return {
      valid: false,
      format: 'ogg',
      byteLength,
      durationMs: 0,
      error: 'Incomplete Ogg/Opus stream (missing OpusHead, OpusTags, or audio pages).',
    };
  }

  const effectiveSamples = lastGranule - BigInt(preSkip);
  const durationMs =
    effectiveSamples > BigInt(0) ? Math.round((Number(effectiveSamples) / 48000) * 1000) : 0;

  if (durationMs <= 0) {
    return {
      valid: false,
      format: 'opus',
      byteLength,
      durationMs: 0,
      error: 'Ogg/Opus stream has zero playable audio duration.',
    };
  }

  return {
    valid: true,
    format: 'opus',
    byteLength,
    durationMs,
    sampleRate,
    channels,
    preSkip,
    pageCount,
  };
}

/**
 * Parses an HTTP Range header (`bytes=start-end`, `bytes=start-`, `bytes=-suffix`)
 * against a known file byte length.
 */
export function parseByteRange(rangeHeader: string | null, totalSize: number): ParsedByteRange {
  if (!rangeHeader) return { kind: 'none' };
  const trimmed = rangeHeader.trim();
  if (!trimmed) return { kind: 'none' };
  if (totalSize <= 0) return { kind: 'unsatisfiable' };

  const match = /^bytes=(\d*)-(\d*)$/i.exec(trimmed);
  if (!match) return { kind: 'invalid' };

  const [, startRaw, endRaw] = match;
  if (!startRaw && !endRaw) return { kind: 'invalid' };

  if (!startRaw) {
    const suffix = Number(endRaw);
    if (!Number.isInteger(suffix) || suffix <= 0) return { kind: 'unsatisfiable' };
    const start = Math.max(0, totalSize - suffix);
    const end = totalSize - 1;
    return { kind: 'range', start, end, length: end - start + 1 };
  }

  const start = Number(startRaw);
  if (!Number.isInteger(start) || start < 0 || start >= totalSize) {
    return { kind: 'unsatisfiable' };
  }

  if (!endRaw) {
    const end = totalSize - 1;
    return { kind: 'range', start, end, length: end - start + 1 };
  }

  const end = Math.min(totalSize - 1, Number(endRaw));
  if (!Number.isInteger(end) || end < start) {
    return { kind: 'unsatisfiable' };
  }

  return { kind: 'range', start, end, length: end - start + 1 };
}

/**
 * Detects whether the current browser supports Ogg/Opus playback in `<audio>`.
 * Safari < 18.4 returns "" for `audio/ogg; codecs="opus"`, which triggers an
 * automatic fallback to Web Speech API.
 */
export function supportsOpusAudio(): boolean {
  if (typeof Audio === 'undefined') return false;
  try {
    const audio = new Audio();
    const support = audio.canPlayType('audio/ogg; codecs="opus"');
    return support === 'probably' || support === 'maybe';
  } catch {
    return false;
  }
}

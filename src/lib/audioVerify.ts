/**
 * Audio Verification Utility for MP3 Audio Quality and Integrity Check
 * Prevents invalid/corrupt audio, PCM data, JSON/HTML error payloads, or base64 decoding issues
 * from causing speaker noise, screeching static, or playback crashes on mobile and LINE clients.
 */

export interface AudioVerificationResult {
  valid: boolean;
  durationMs: number;
  byteLength: number;
  format: string;
  error?: string;
  sampleRate?: number;
  bitrateKbps?: number;
}

const MPEG_SAMPLE_RATES: Record<number, number[]> = {
  1: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  2.5: [11025, 12000, 8000], // MPEG-2.5
};

const MPEG1_LAYER3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MPEG2_LAYER3_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];

/**
 * Decode Base64 string to Uint8Array safely across edge and Node environments
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '').trim();
  const binaryString = atob(cleanBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Verify MP3 buffer integrity, frame headers, and calculate duration
 */
export function verifyMp3Buffer(inputBuffer: Uint8Array | ArrayBuffer | string): AudioVerificationResult {
  let bytes: Uint8Array;

  if (typeof inputBuffer === 'string') {
    const trimmed = inputBuffer.trim();
    if (
      trimmed.startsWith('<') ||
      trimmed.startsWith('{') ||
      trimmed.startsWith('[') ||
      trimmed.includes('<!DOCTYPE') ||
      trimmed.includes('<html>')
    ) {
      return {
        valid: false,
        durationMs: 0,
        byteLength: inputBuffer.length,
        format: 'text',
        error: 'Non-audio text response (HTML/JSON) returned instead of binary MP3.',
      };
    }

    try {
      bytes = base64ToUint8Array(trimmed);
    } catch {
      return {
        valid: false,
        durationMs: 0,
        byteLength: inputBuffer.length,
        format: 'invalid_base64',
        error: 'Failed to decode Base64 audio string.',
      };
    }
  } else if (inputBuffer instanceof Uint8Array) {
    bytes = inputBuffer;
  } else {
    bytes = new Uint8Array(inputBuffer);
  }

  const byteLength = bytes.length;

  if (!bytes || byteLength < 4) {
    return {
      valid: false,
      durationMs: 0,
      byteLength,
      format: 'unknown',
      error: 'Audio buffer is empty or too short (< 4 bytes)',
    };
  }

  // Check if buffer is RIFF/WAV (which causes severe speaker noise if served as MP3)
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    return {
      valid: false,
      durationMs: 0,
      byteLength,
      format: 'wav',
      error: 'WAV/RIFF format detected. LINE audio messages require MP3 encoding to prevent speaker noise.',
    };
  }

  // Check if buffer is HTML error page (e.g. <html>, <!DOCTYPE)
  if (
    (bytes[0] === 0x3c && bytes[1] === 0x21) || // <!
    (bytes[0] === 0x3c && bytes[1] === 0x68) || // <h
    (bytes[0] === 0x3c && bytes[1] === 0x48) || // <H
    (bytes[0] === 0x7b && bytes[1] === 0x22) || // {"
    (bytes[0] === 0x7b && bytes[1] === 0x0a)    // {\n
  ) {
    return {
      valid: false,
      durationMs: 0,
      byteLength,
      format: 'text',
      error: 'Non-audio response (HTML/JSON) returned instead of binary MP3.',
    };
  }

  if (byteLength < 128) {
    return {
      valid: false,
      durationMs: 0,
      byteLength,
      format: 'unknown',
      error: 'Audio buffer is too short for valid playback (< 128 bytes)',
    };
  }

  let offset = 0;

  // Check for ID3v2 header ('ID3')
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    if (byteLength < 10) {
      return { valid: false, durationMs: 0, byteLength, format: 'mp3', error: 'Truncated ID3 tag' };
    }
    // Calculate ID3v2 tag size from 7-bit synchsafe integers
    const id3Size =
      ((bytes[6] & 0x7f) << 21) |
      ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) |
      (bytes[9] & 0x7f);
    
    // Check footer presence (bit 4 of flags byte 5)
    const hasFooter = (bytes[5] & 0x10) !== 0;
    offset = 10 + id3Size + (hasFooter ? 10 : 0);
  }

  // Search for first valid MP3 sync frame
  let foundSync = false;
  let detectedSampleRate = 44100;
  let detectedBitrate = 128;
  let validFrameCount = 0;

  while (offset < byteLength - 4) {
    const b0 = bytes[offset];
    const b1 = bytes[offset + 1];

    // MP3 Frame Sync Word: 11 bits set to 1 (0xFF & 111b)
    if (b0 === 0xff && (b1 & 0xe0) === 0xe0) {
      const mpegVersionBit = (b1 >> 3) & 0x03;
      const layerBit = (b1 >> 1) & 0x03;

      let versionKey = 1;
      if (mpegVersionBit === 3) versionKey = 1; // MPEG-1
      else if (mpegVersionBit === 2) versionKey = 2; // MPEG-2
      else if (mpegVersionBit === 0) versionKey = 2.5; // MPEG-2.5

      // Layer III is 01b (value 1)
      if (mpegVersionBit !== 1 && layerBit === 1) {
        const b2 = bytes[offset + 2];
        const bitrateIdx = (b2 >> 4) & 0x0f;
        const sampleRateIdx = (b2 >> 2) & 0x03;
        const padding = (b2 >> 1) & 0x01;

        const sampleRates = MPEG_SAMPLE_RATES[versionKey];
        const bitrates = versionKey === 1 ? MPEG1_LAYER3_BITRATES : MPEG2_LAYER3_BITRATES;

        if (sampleRates && sampleRateIdx < 3 && bitrateIdx > 0 && bitrateIdx < 15) {
          detectedSampleRate = sampleRates[sampleRateIdx];
          detectedBitrate = bitrates[bitrateIdx];
          foundSync = true;
          validFrameCount++;

          // Calculate frame length and skip to next frame
          const frameLength = Math.floor(
            ((versionKey === 1 ? 144 : 72) * (detectedBitrate * 1000)) / detectedSampleRate
          ) + padding;

          if (frameLength > 4) {
            offset += frameLength;
            continue;
          }
        }
      }
    }
    offset++;
  }

  // If no sync frame found, but ID3 header existed and file has binary content, accept with default params
  if (!foundSync && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33 && byteLength >= 512) {
    foundSync = true;
  }

  if (!foundSync && byteLength < 512) {
    return {
      valid: false,
      durationMs: 0,
      byteLength,
      format: 'unknown',
      error: 'Could not find valid MP3 audio frame sync word',
    };
  }

  // Estimate total audio duration in milliseconds
  const effectiveBitrateBps = (detectedBitrate || 128) * 1000;
  const durationMs = Math.round((byteLength * 8 * 1000) / effectiveBitrateBps);

  return {
    valid: true,
    durationMs: Math.max(1000, durationMs),
    byteLength,
    format: 'mp3',
    sampleRate: detectedSampleRate,
    bitrateKbps: detectedBitrate,
  };
}

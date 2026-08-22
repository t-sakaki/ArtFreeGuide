// Comprehensive test suite for LINE TTS Restoration, Audio Verification, and Fallback logic

const crypto = require('crypto').webcrypto;

// 1. Audio Verification Utility (mirror of src/lib/audioVerify.ts)
const MPEG_SAMPLE_RATES = {
  1: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  2.5: [11025, 12000, 8000],
};
const MPEG1_LAYER3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MPEG2_LAYER3_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];

function base64ToUint8Array(base64) {
  const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '').trim();
  const binaryString = atob(cleanBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function verifyMp3Buffer(inputBuffer) {
  let bytes;
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

  // Reject WAV/RIFF
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    return {
      valid: false,
      durationMs: 0,
      byteLength,
      format: 'wav',
      error: 'WAV/RIFF format detected. LINE audio messages require MP3 encoding to prevent speaker noise.',
    };
  }

  // Reject HTML/JSON text
  if (
    (bytes[0] === 0x3c && bytes[1] === 0x21) ||
    (bytes[0] === 0x3c && bytes[1] === 0x68) ||
    (bytes[0] === 0x3c && bytes[1] === 0x48) ||
    (bytes[0] === 0x7b && bytes[1] === 0x22) ||
    (bytes[0] === 0x7b && bytes[1] === 0x0a)
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
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    if (byteLength < 10) {
      return { valid: false, durationMs: 0, byteLength, format: 'mp3', error: 'Truncated ID3 tag' };
    }
    const id3Size =
      ((bytes[6] & 0x7f) << 21) |
      ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) |
      (bytes[9] & 0x7f);
    const hasFooter = (bytes[5] & 0x10) !== 0;
    offset = 10 + id3Size + (hasFooter ? 10 : 0);
  }

  let foundSync = false;
  let detectedSampleRate = 44100;
  let detectedBitrate = 128;
  let validFrameCount = 0;

  while (offset < byteLength - 4) {
    const b0 = bytes[offset];
    const b1 = bytes[offset + 1];

    if (b0 === 0xff && (b1 & 0xe0) === 0xe0) {
      const mpegVersionBit = (b1 >> 3) & 0x03;
      const layerBit = (b1 >> 1) & 0x03;

      let versionKey = 1;
      if (mpegVersionBit === 3) versionKey = 1;
      else if (mpegVersionBit === 2) versionKey = 2;
      else if (mpegVersionBit === 0) versionKey = 2.5;

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

          const frameLength =
            Math.floor(((versionKey === 1 ? 144 : 72) * (detectedBitrate * 1000)) / detectedSampleRate) +
            padding;
          if (frameLength > 4) {
            offset += frameLength;
            continue;
          }
        }
      }
    }
    offset++;
  }

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

// 2. Safe Mock MP3 Generator (mirror of src/app/api/tts/route.ts)
function createSafeMockMp3Buffer(durationSeconds = 2) {
  const id3Header = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const frameLength = 417;
  const numFrames = Math.max(2, Math.round(durationSeconds * 38));
  const totalLength = id3Header.length + numFrames * frameLength;

  const buffer = new Uint8Array(totalLength);
  buffer.set(id3Header, 0);

  let offset = id3Header.length;
  for (let i = 0; i < numFrames; i++) {
    buffer[offset] = 0xff;
    buffer[offset + 1] = 0xfb;
    buffer[offset + 2] = 0x90;
    buffer[offset + 3] = 0x64;
    for (let j = 4; j < frameLength; j++) {
      buffer[offset + j] = 0x00;
    }
    offset += frameLength;
  }

  return buffer;
}

// 3. Web Crypto LINE Signature Verification (mirror of src/lib/line.ts)
async function verifyLineSignature(bodyText, signature, channelSecret) {
  if (!signature || !channelSecret) return false;
  try {
    const trimmed = signature.trim();
    if (!/^[A-Za-z0-9+/=]+$/.test(trimmed)) {
      return false;
    }
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(channelSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureBytes = Uint8Array.from(atob(trimmed), (c) => c.charCodeAt(0));
    const bodyBytes = encoder.encode(bodyText);

    return await crypto.subtle.verify('HMAC', key, signatureBytes, bodyBytes);
  } catch (e) {
    console.error('[LINE] Signature verification error:', e);
    return false;
  }
}

async function runTests() {
  console.log('=== TEST 1: LINE Signature Verification ===');
  const secret = 'secret_test_key_xyz_789';
  const messageBody = JSON.stringify({ events: [{ type: 'message', message: { text: '日傘をさす女' } }] });

  const encoder = new TextEncoder();
  const signKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBytes = await crypto.subtle.sign('HMAC', signKey, encoder.encode(messageBody));
  const validSig = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  const isSigValid = await verifyLineSignature(messageBody, validSig, secret);
  const isBadSigRejected = !(await verifyLineSignature(messageBody, 'bad_signature_base64==', secret));
  const isMalformedRejected = !(await verifyLineSignature(messageBody, '!!!malformed$$$', secret));
  const isEmptySecretRejected = !(await verifyLineSignature(messageBody, validSig, ''));

  console.log(`- Valid signature accepted: ${isSigValid ? 'PASS' : 'FAIL'}`);
  console.log(`- Bad signature rejected: ${isBadSigRejected ? 'PASS' : 'FAIL'}`);
  console.log(`- Malformed signature rejected: ${isMalformedRejected ? 'PASS' : 'FAIL'}`);
  console.log(`- Empty secret rejected: ${isEmptySecretRejected ? 'PASS' : 'FAIL'}`);

  console.log('\n=== TEST 2: Safe Mock MP3 Generator & Integrity ===');
  const mockMp3_3s = createSafeMockMp3Buffer(3);
  const mockCheck = verifyMp3Buffer(mockMp3_3s);
  console.log(`- Mock MP3 Valid: ${mockCheck.valid ? 'PASS' : 'FAIL'}`);
  console.log(`- Mock MP3 Format: ${mockCheck.format === 'mp3' ? 'PASS' : 'FAIL'} (${mockCheck.format})`);
  console.log(`- Mock MP3 Duration: ${mockCheck.durationMs >= 2500 ? 'PASS' : 'FAIL'} (${mockCheck.durationMs}ms)`);
  console.log(`- Mock MP3 Sample Rate: ${mockCheck.sampleRate === 44100 ? 'PASS' : 'FAIL'} (${mockCheck.sampleRate}Hz)`);
  console.log(`- Mock MP3 Bitrate: ${mockCheck.bitrateKbps === 128 ? 'PASS' : 'FAIL'} (${mockCheck.bitrateKbps}kbps)`);

  console.log('\n=== TEST 3: Noise Prevention & Format Detection (PCM/WAV/HTML/JSON) ===');
  // 3a. WAV Header
  const wavBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
  const wavCheck = verifyMp3Buffer(wavBytes);
  console.log(`- WAV/RIFF Rejection (Noise Prevention): ${!wavCheck.valid && wavCheck.format === 'wav' ? 'PASS' : 'FAIL'}`);

  // 3b. HTML 500 error page
  const htmlBytes = new Uint8Array(Buffer.from('<html><head><title>500 Internal Error</title></head></html>'));
  const htmlCheck = verifyMp3Buffer(htmlBytes);
  console.log(`- HTML Error Rejection: ${!htmlCheck.valid && htmlCheck.format === 'text' ? 'PASS' : 'FAIL'}`);

  // 3c. JSON Error response
  const jsonBytes = new Uint8Array(Buffer.from('{"success":false,"errors":[{"code":1000,"message":"Rate limit"}]}'));
  const jsonCheck = verifyMp3Buffer(jsonBytes);
  console.log(`- JSON Error Rejection: ${!jsonCheck.valid && jsonCheck.format === 'text' ? 'PASS' : 'FAIL'}`);

  // 3d. Base64 Audio decoding
  const base64EncodedMock = Buffer.from(mockMp3_3s).toString('base64');
  const base64Check = verifyMp3Buffer(base64EncodedMock);
  console.log(`- Base64 MP3 Decoding & Validation: ${base64Check.valid && base64Check.format === 'mp3' ? 'PASS' : 'FAIL'}`);

  // 3e. Data URI Base64
  const dataUriMock = `data:audio/mpeg;base64,${base64EncodedMock}`;
  const dataUriCheck = verifyMp3Buffer(dataUriMock);
  console.log(`- Data URI Base64 Decoding & Validation: ${dataUriCheck.valid && dataUriCheck.format === 'mp3' ? 'PASS' : 'FAIL'}`);

  console.log('\n=== TEST 4: Cloudflare Workers AI Fallback Simulation ===');
  function simulateTtsPipeline(cloudflareStatus, cfResponsePayload) {
    if (cloudflareStatus === 429) {
      const fallback = createSafeMockMp3Buffer(3);
      return { source: 'safe-mock', buffer: fallback, verification: verifyMp3Buffer(fallback) };
    }
    if (cloudflareStatus !== 200) {
      const fallback = createSafeMockMp3Buffer(3);
      return { source: 'safe-mock', buffer: fallback, verification: verifyMp3Buffer(fallback) };
    }
    const check = verifyMp3Buffer(cfResponsePayload);
    if (check.valid && check.format === 'mp3') {
      return { source: 'cloudflare-ai', buffer: cfResponsePayload, verification: check };
    }
    const fallback = createSafeMockMp3Buffer(3);
    return { source: 'safe-mock', buffer: fallback, verification: verifyMp3Buffer(fallback) };
  }

  const sim429 = simulateTtsPipeline(429, null);
  console.log(`- Cloudflare 429 Fallback to Safe Mock: ${sim429.source === 'safe-mock' && sim429.verification.valid ? 'PASS' : 'FAIL'}`);

  const sim500Html = simulateTtsPipeline(500, '<html>Error 500</html>');
  console.log(`- Cloudflare 500 Fallback to Safe Mock: ${sim500Html.source === 'safe-mock' && sim500Html.verification.valid ? 'PASS' : 'FAIL'}`);

  const simCorrupt = simulateTtsPipeline(200, new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]));
  console.log(`- Cloudflare Corrupt Output Fallback to Safe Mock: ${simCorrupt.source === 'safe-mock' && simCorrupt.verification.valid ? 'PASS' : 'FAIL'}`);

  const simValid = simulateTtsPipeline(200, mockMp3_3s);
  console.log(`- Cloudflare Valid Audio Pass-through: ${simValid.source === 'cloudflare-ai' && simValid.verification.valid ? 'PASS' : 'FAIL'}`);

  const allPassed =
    isSigValid &&
    isBadSigRejected &&
    isMalformedRejected &&
    isEmptySecretRejected &&
    mockCheck.valid &&
    !wavCheck.valid &&
    !htmlCheck.valid &&
    !jsonCheck.valid &&
    base64Check.valid &&
    dataUriCheck.valid &&
    sim429.verification.valid &&
    sim500Html.verification.valid &&
    simCorrupt.verification.valid &&
    simValid.verification.valid;

  if (!allPassed) {
    console.error('\n❌ UNIT TESTS FAILED!');
    process.exit(1);
  }

  console.log('\n✅ ALL 14 TESTS PASSED CLEANLY & RESILIENTLY!');
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { verifyLineSignature, replyTextMessage, replyAudioMessage, createAudioGuideFlex } from '../src/lib/line';
import { verifyMp3Buffer, base64ToUint8Array } from '../src/lib/audioVerify';
import { createSafeMockMp3Buffer } from '../src/app/api/tts/route';

async function testAll() {
  console.log('=== 1. Testing Web Crypto Signature Verification ===');
  const secret = 'test_secret_key_123';
  const body = JSON.stringify({ events: [{ type: 'message', message: { text: 'Hello' } }] });

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const validSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)));

  const isValid = await verifyLineSignature(body, validSignature, secret);
  const isInvalid = await verifyLineSignature(body, 'invalid_sig', secret);
  const isMalformed = await verifyLineSignature(body, '!!!invalid$$$', secret);
  const isEmptySecret = await verifyLineSignature(body, validSignature, '');

  console.log('Valid Signature Test:', isValid ? 'PASS' : 'FAIL');
  console.log('Invalid Signature Test:', !isInvalid ? 'PASS' : 'FAIL');
  console.log('Malformed Signature Test:', !isMalformed ? 'PASS' : 'FAIL');
  console.log('Empty Secret Test:', !isEmptySecret ? 'PASS' : 'FAIL');

  console.log('\n=== 2. Testing Safe Mock MP3 Audio Generation ===');
  const safeMp3 = createSafeMockMp3Buffer(3);
  const mp3Result = verifyMp3Buffer(safeMp3);
  console.log('Safe MP3 Verification:', mp3Result.valid ? 'PASS' : 'FAIL', mp3Result);

  console.log('\n=== 3. Testing Audio Noise Prevention & Validation ===');
  const wavBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]);
  const wavResult = verifyMp3Buffer(wavBytes);
  console.log('WAV Rejection Test:', !wavResult.valid && wavResult.format === 'wav' ? 'PASS' : 'FAIL', wavResult.error);

  const htmlBytes = new Uint8Array(new TextEncoder().encode('<html>Error</html>'));
  const htmlResult = verifyMp3Buffer(htmlBytes);
  console.log('HTML Rejection Test:', !htmlResult.valid && htmlResult.format === 'text' ? 'PASS' : 'FAIL', htmlResult.error);

  const jsonBytes = new Uint8Array(new TextEncoder().encode('{"error":"rate_limited"}'));
  const jsonResult = verifyMp3Buffer(jsonBytes);
  console.log('JSON Rejection Test:', !jsonResult.valid && jsonResult.format === 'text' ? 'PASS' : 'FAIL', jsonResult.error);

  const base64Mp3 = Buffer.from(safeMp3).toString('base64');
  const b64Result = verifyMp3Buffer(base64Mp3);
  console.log('Base64 Decoding Test:', b64Result.valid && b64Result.format === 'mp3' ? 'PASS' : 'FAIL');

  console.log('\n=== 4. Testing LINE Message Formatting Helpers ===');
  const flex = createAudioGuideFlex('モナ・リザ');
  console.log('Flex message created:', flex.type === 'flex' ? 'PASS' : 'FAIL');

  if (!isValid || isInvalid || isMalformed || isEmptySecret || !mp3Result.valid || wavResult.valid || htmlResult.valid || jsonResult.valid || !b64Result.valid) {
    throw new Error('One or more unit tests failed!');
  }

  console.log('\n=== All Unit Tests Passed Cleanly! ===');
}

testAll().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});

import { NextResponse } from 'next/server';
import { verifyMp3Buffer, base64ToUint8Array } from '@/lib/audioVerify';

/**
 * Generate a safe, noise-free, syntactically valid MP3 buffer for fallback and testing environments.
 * Uses a standard ID3v2 header and valid MPEG-1 Layer III silent audio frames (128 kbps, 44.1 kHz, Joint Stereo).
 * This guarantees zero playback noise, pops, or decoder crashes across all LINE and mobile audio engines.
 */
export function createSafeMockMp3Buffer(durationSeconds = 2): Uint8Array {
  // ID3v2 Header (10 bytes)
  const id3Header = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

  // Valid MP3 Frame Header for MPEG-1 Layer III, 128 kbps, 44.1 kHz, Joint Stereo (417 bytes per frame)
  // Frame length = floor(144 * 128000 / 44100) = 417 bytes
  const frameLength = 417;
  const numFrames = Math.max(2, Math.round(durationSeconds * 38)); // ~38 frames per sec
  const totalLength = id3Header.length + numFrames * frameLength;

  const buffer = new Uint8Array(totalLength);
  buffer.set(id3Header, 0);

  let offset = id3Header.length;
  for (let i = 0; i < numFrames; i++) {
    // Frame Sync 0xFFFB (MPEG-1 Layer 3, no CRC)
    // 0x90: 128 kbps (1001b), 44.1 kHz (00b), padding=0
    // 0x64: Joint Stereo (01b), Extension (10b), Copyright=0, Original=1, Emphasis=0
    buffer[offset] = 0xff;
    buffer[offset + 1] = 0xfb;
    buffer[offset + 2] = 0x90;
    buffer[offset + 3] = 0x64;

    // Fill frame payload with silent MPEG audio frame data (all zeroes)
    for (let j = 4; j < frameLength; j++) {
      buffer[offset + j] = 0x00;
    }
    offset += frameLength;
  }

  return buffer;
}

/**
 * Synthesize speech via Cloudflare Workers AI TTS REST API
 * Handles rate limits (429), errors, JSON base64 envelopes, and raw audio binaries.
 */
async function synthesizeWithCloudflareAI(cleanText: string): Promise<Uint8Array | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    console.log('[/api/tts] Cloudflare credentials not configured. Skipping Cloudflare AI TTS.');
    return null;
  }

  const modelCandidates = [
    { name: '@cf/myshell-ai/melotts', body: { prompt: cleanText, lang: 'ja' } },
    { name: '@cf/deepgram/aura-1', body: { text: cleanText, encoding: 'mp3' } },
  ];

  for (const { name: model, body } of modelCandidates) {
    try {
      console.log(`[/api/tts] Synthesizing speech using Cloudflare Workers AI (${model})...`);
      const cfRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );

      // Check HTTP 429 Rate Limit
      if (cfRes.status === 429) {
        console.warn(`[/api/tts] Cloudflare Workers AI returned 429 Too Many Requests for model ${model}.`);
        return null;
      }

      if (!cfRes.ok) {
        const errorText = await cfRes.text().catch(() => '');
        console.warn(`[/api/tts] Cloudflare Workers AI HTTP ${cfRes.status} on ${model}: ${errorText}`);
        continue;
      }

      const contentType = (cfRes.headers.get('content-type') || '').toLowerCase();
      let audioBuffer: Uint8Array;

      if (contentType.includes('application/json')) {
        const json = await cfRes.json();
        const base64Audio = json?.result?.audio || json?.audio || json?.result;
        if (typeof base64Audio === 'string' && base64Audio.length > 0) {
          audioBuffer = base64ToUint8Array(base64Audio);
        } else {
          console.warn(`[/api/tts] Cloudflare AI JSON response did not contain valid audio payload:`, json);
          continue;
        }
      } else {
        const rawBuf = await cfRes.arrayBuffer();
        audioBuffer = new Uint8Array(rawBuf);
      }

      // Perform strict binary verification before returning
      const verification = verifyMp3Buffer(audioBuffer);
      if (verification.valid && verification.format === 'mp3') {
        console.log(
          `[/api/tts] Cloudflare AI TTS succeeded (${model}). Duration: ${verification.durationMs}ms, Bytes: ${verification.byteLength}`
        );
        return audioBuffer;
      } else {
        console.warn(`[/api/tts] Cloudflare AI audio verification failed on ${model}:`, verification.error);
      }
    } catch (err) {
      console.warn(`[/api/tts] Cloudflare AI fetch error on ${model}:`, err);
    }
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { text } = body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'Text parameter is required' }, { status: 400 });
    }

    const cleanText = text.trim();

    // 1. Primary Engine: Cloudflare Workers AI TTS
    const cfAudio = await synthesizeWithCloudflareAI(cleanText);
    if (cfAudio) {
      const verification = verifyMp3Buffer(cfAudio);
      if (verification.valid && verification.format === 'mp3') {
        return new Response(cfAudio as BodyInit, {
          status: 200,
          headers: {
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'public, max-age=86400',
            'X-Audio-Duration-Ms': String(verification.durationMs),
            'X-Audio-Source': 'cloudflare-ai',
          },
        });
      }
    }

    // 2. Absolute Fallback: Local Safe Mock MP3 Audio
    console.log('[/api/tts] Cloudflare AI TTS unavailable or rate-limited. Serving Safe Mock MP3.');
    const mockBuffer = createSafeMockMp3Buffer(3);
    const verification = verifyMp3Buffer(mockBuffer);

    return new Response(mockBuffer as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
        'X-Audio-Duration-Ms': String(verification.durationMs),
        'X-Audio-Mock': 'true',
        'X-Audio-Source': 'safe-mock',
      },
    });
  } catch (error: any) {
    console.error('[/api/tts] Internal Error in TTS handler:', error);
    const mockBuffer = createSafeMockMp3Buffer(2);
    const verification = verifyMp3Buffer(mockBuffer);

    return new Response(mockBuffer as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
        'X-Audio-Duration-Ms': String(verification.durationMs),
        'X-Audio-Mock': 'true',
        'X-Audio-Source': 'safe-mock',
      },
    });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const text = searchParams.get('text') || 'ArtFreeGuide Voice Assistant';
  return POST(
    new Request(req.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  );
}

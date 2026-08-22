import { NextResponse } from 'next/server';
import { verifyMp3Buffer, base64ToUint8Array } from '@/lib/audioVerify';
import { createSafeMockMp3Buffer } from '@/app/api/tts/route';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { text, audioUrl } = body;

    let buffer: Uint8Array | ArrayBuffer | null = null;
    let source = 'safe_mock';

    if (audioUrl) {
      source = 'url';
      const fetchRes = await fetch(audioUrl);
      if (!fetchRes.ok) {
        return NextResponse.json(
          {
            status: 'error',
            verified: false,
            safeForLine: false,
            error: `Failed to fetch audio from URL: ${fetchRes.status} ${fetchRes.statusText}`,
          },
          { status: 400 }
        );
      }
      buffer = await fetchRes.arrayBuffer();
    } else if (text) {
      source = 'cloudflare_ai';
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      const apiToken = process.env.CLOUDFLARE_API_TOKEN;

      if (accountId && apiToken) {
        try {
          const cfRes = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/myshell-ai/melotts`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ prompt: text.trim(), lang: 'ja' }),
            }
          );

          if (cfRes.ok) {
            const contentType = (cfRes.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
              const json = await cfRes.json();
              const base64Audio = json?.result?.audio || json?.audio || json?.result;
              if (typeof base64Audio === 'string') {
                buffer = base64ToUint8Array(base64Audio);
              }
            } else {
              buffer = await cfRes.arrayBuffer();
            }
          }
        } catch (cfErr) {
          console.warn('[/api/tts/verify] Cloudflare AI verification fetch error:', cfErr);
        }
      }

      if (!buffer) {
        source = 'safe_mock_fallback';
        buffer = createSafeMockMp3Buffer(3);
      }
    } else {
      source = 'safe_mock';
      buffer = createSafeMockMp3Buffer(2);
    }

    const verification = verifyMp3Buffer(buffer);

    return NextResponse.json({
      status: verification.valid ? 'ok' : 'failed',
      verified: verification.valid,
      safeForLine: verification.valid && verification.format === 'mp3',
      source,
      details: {
        format: verification.format,
        byteLength: verification.byteLength,
        durationMs: verification.durationMs,
        sampleRate: verification.sampleRate || 44100,
        bitrateKbps: verification.bitrateKbps || 128,
        error: verification.error || null,
      },
    });
  } catch (error: any) {
    console.error('[/api/tts/verify] Verification Error:', error);
    return NextResponse.json(
      {
        status: 'error',
        verified: false,
        safeForLine: false,
        error: error.message || 'Internal Verification Error',
      },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const text = searchParams.get('text') || undefined;
  const audioUrl = searchParams.get('audioUrl') || undefined;

  return POST(
    new Request(req.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, audioUrl }),
    })
  );
}

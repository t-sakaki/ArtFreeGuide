import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

function createMockWavBuffer(): Uint8Array {
  const sampleRate = 8000;
  const numSamples = 4000;
  const buffer = new Uint8Array(44 + numSamples);
  const view = new DataView(buffer.buffer);

  buffer.set([0x52, 0x49, 0x46, 0x46], 0);
  view.setUint32(4, 36 + numSamples, true);
  buffer.set([0x57, 0x41, 0x56, 0x45], 8);

  buffer.set([0x66, 0x6d, 0x74, 0x20], 12);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);

  buffer.set([0x64, 0x61, 0x74, 0x61], 36);
  view.setUint32(40, numSamples, true);

  for (let i = 0; i < numSamples; i++) {
    buffer[44 + i] = 128;
  }

  return buffer;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text } = body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'Text parameter is required' }, { status: 400 });
    }

    const cleanText = text.trim();

    // 1. Fallback via Cloudflare REST API if account ID & API token exist in env
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    if (accountId && apiToken) {
      try {
        console.log('[/api/tts] Falling back to Cloudflare Workers AI REST API...');
        const cfRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/myshell/melotts-japanese`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ prompt: cleanText })
          }
        );

        if (cfRes.ok) {
          const audioBuf = await cfRes.arrayBuffer();
          return new Response(audioBuf, {
            status: 200,
            headers: {
              'Content-Type': 'audio/wav',
              'Cache-Control': 'public, max-age=3600'
            }
          });
        }
      } catch (restErr) {
        console.warn('[/api/tts] Cloudflare REST API error:', restErr);
      }
    }

    // 2. Only attempt Cloudflare Workers AI binding when running in Cloudflare Workers/Pages runtime
    const isCloudflareRuntime = Boolean(process.env.CF_PAGES || process.env.CF_WORKER);

    if (isCloudflareRuntime) {
      try {
        const context = await getCloudflareContext();
        const env = context?.env as any;

        if (env && env.AI && typeof env.AI.run === 'function') {
          console.log('[/api/tts] Calling Cloudflare Workers AI MeloTTS binding...');
          const aiResponse = await env.AI.run('@cf/myshell/melotts-japanese', {
            prompt: cleanText,
            text: cleanText
          });

          if (aiResponse) {
            if (aiResponse instanceof Response) {
              const audioBuf = await aiResponse.arrayBuffer();
              return new Response(audioBuf, {
                status: 200,
                headers: {
                  'Content-Type': 'audio/wav',
                  'Cache-Control': 'public, max-age=3600'
                }
              });
            }

            if (aiResponse instanceof ReadableStream) {
              return new Response(aiResponse, {
                status: 200,
                headers: {
                  'Content-Type': 'audio/wav',
                  'Cache-Control': 'public, max-age=3600'
                }
              });
            }

            if (aiResponse instanceof ArrayBuffer || aiResponse instanceof Uint8Array) {
              return new Response(aiResponse as BodyInit, {
                status: 200,
                headers: {
                  'Content-Type': 'audio/wav',
                  'Cache-Control': 'public, max-age=3600'
                }
              });
            }

            if (typeof aiResponse === 'object' && aiResponse.audio) {
              let buffer: Uint8Array;
              if (typeof aiResponse.audio === 'string') {
                const binaryStr = atob(aiResponse.audio);
                buffer = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) {
                  buffer[i] = binaryStr.charCodeAt(i);
                }
              } else {
                buffer = new Uint8Array(aiResponse.audio);
              }
              return new Response(buffer as BodyInit, {
                status: 200,
                headers: {
                  'Content-Type': 'audio/wav',
                  'Cache-Control': 'public, max-age=3600'
                }
              });
            }
          }
        }
      } catch (contextError) {
        console.warn('[/api/tts] Cloudflare AI binding execution error:', contextError);
      }
    }

    // 3. Guaranteed Mock Audio Fallback for local environment & binding-unavailable scenarios
    console.log('[/api/tts] Local environment or binding unavailable. Returning 200 OK Mock WAV Audio.');
    return new Response(createMockWavBuffer() as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error: any) {
    console.error('[/api/tts] Internal Error:', error);
    return new Response(createMockWavBuffer() as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Cache-Control': 'no-cache'
      }
    });
  }
}

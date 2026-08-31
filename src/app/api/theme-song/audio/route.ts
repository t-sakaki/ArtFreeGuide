import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { DEFAULT_LOCALE, isLocale } from '@/lib/i18n';

/**
 * Streams a generated theme-song MP3 out of R2. The bucket is private, so the
 * audio is only reachable through this route; the key mirrors the one written
 * by /api/theme-song.
 */

interface R2Object {
  body: ReadableStream;
  httpMetadata?: { contentType?: string };
  size: number;
}
interface R2Bucket {
  get(key: string): Promise<R2Object | null>;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = (searchParams.get('slug') || '').trim().toLowerCase();
  const localeRaw = searchParams.get('locale') || '';
  const locale = isLocale(localeRaw) ? localeRaw : DEFAULT_LOCALE;
  if (!slug) return NextResponse.json({ error: 'missing_slug' }, { status: 400 });

  const { env } = await getCloudflareContext({ async: true });
  const audio = (env as unknown as { AUDIO?: R2Bucket }).AUDIO;
  if (!audio) return NextResponse.json({ error: 'no_r2_bucket' }, { status: 503 });

  const obj = await audio.get(`theme-songs/${slug}/${locale}.mp3`);
  if (!obj) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'audio/mpeg',
      'Content-Length': String(obj.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

export const runtime = 'nodejs';

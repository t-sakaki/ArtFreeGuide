import { NextRequest, NextResponse } from 'next/server';
import { Locale } from '@/lib/i18n';
import { pollThemeSong } from '@/lib/themeSong';
import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * Poll a submitted theme-song (Music 3.0) job.
 * GET /api/theme-song/:id?slug=...&locale=ja
 *   -> { status, audioUrl?, lyrics? }
 * On success we cache the audio URL + lyrics into D1 (mm_theme_songs) so the
 * next visitor hits the cache instead of regenerating the ~2 min job.
 */

interface D1Binding {
  prepare(q: string): { bind(...v: unknown[]): { run(): Promise<unknown> } };
}

async function saveCache(slug: string, locale: Locale, audioUrl: string, lyrics: string): Promise<void> {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as { DB?: D1Binding }).DB;
  if (!db) return;
  await db
    .prepare(
      `INSERT INTO mm_theme_songs (slug, locale, audio_url, lyrics, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(slug, locale) DO UPDATE SET audio_url = excluded.audio_url, lyrics = excluded.lyrics`
    )
    .bind(slug, locale, audioUrl, lyrics, new Date().toISOString())
    .run();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const slug = req.nextUrl.searchParams.get('slug') || '';
  const locale = (req.nextUrl.searchParams.get('locale') as Locale) || 'ja';
  if (!id) {
    return NextResponse.json({ status: 'error', error: 'missing_id' }, { status: 400 });
  }

  const result = await pollThemeSong(id);
  if (result.status === 'success' && result.audioUrl) {
    // Cache it for next time.
    if (slug) {
      await saveCache(slug, locale, result.audioUrl, '');
    }
    return NextResponse.json({ status: 'success', audioUrl: result.audioUrl });
  }
  return NextResponse.json(result);
}

export const runtime = 'nodejs';

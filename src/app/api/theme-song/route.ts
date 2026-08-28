import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { Locale } from '@/lib/i18n';
import { artworkFromSlug } from '@/lib/slug';
import { getGuideStore } from '@/lib/guideStore';
import { sanitizeGuideText } from '@/lib/guideText';
import { submitThemeSong, pollThemeSong } from '@/lib/themeSong';

/**
 * MiniMax Week hackathon feature: generate (and cache) a per-artwork theme
 * song. The Music 3.0 job takes ~1-2 min, so this is split into:
 *   POST /api/theme-song     -> submit; returns { requestId, lyrics } immediately
 *   GET  /api/theme-song/:id -> poll; on success caches to D1 and returns
 *                               { audioUrl, lyrics }.
 * The client submits, then polls GET until status === 'success'.
 */

interface D1Binding {
  prepare(q: string): { bind(...v: unknown[]): { first<T>(): Promise<T | null>; run(): Promise<unknown> } };
}

async function getCached(slug: string, locale: Locale): Promise<{ audio_url: string; lyrics: string } | null> {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as { DB?: D1Binding }).DB;
  if (!db) return null;
  return db
    .prepare('SELECT audio_url, lyrics FROM mm_theme_songs WHERE slug = ?1 AND locale = ?2')
    .bind(slug, locale)
    .first<{ audio_url: string; lyrics: string }>();
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

async function guideTextFor(slug: string, locale: Locale): Promise<{ text: string; title: string; artist: string } | { error: string; status: number }> {
  const meta = artworkFromSlug(slug);
  if (!meta) return { error: 'unknown_slug', status: 404 };
  const stored = await getGuideStore().get(meta.title, meta.artist, locale);
  if (!stored) return { error: 'no_guide_yet', status: 409 };
  let guideText = '';
  try {
    const parsed = JSON.parse(stored.payload);
    guideText = [parsed.standard, parsed.deep, parsed.short].filter(Boolean).join('\n\n');
  } catch {
    guideText = stored.payload;
  }
  guideText = sanitizeGuideText(guideText, locale);
  return { text: guideText, title: meta.title, artist: meta.artist };
}

export async function POST(req: NextRequest) {
  let body: { slug?: string; locale?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }

  const slug = (body.slug || '').trim();
  const locale = (body.locale as Locale) || 'ja';
  if (!slug) {
    return NextResponse.json({ error: 'missing_slug' }, { status: 400 });
  }


  // 1. Cache hit?
  const cached = await getCached(slug, locale);
  if (cached) {
    return NextResponse.json({ cached: true, audioUrl: cached.audio_url, lyrics: cached.lyrics });
  }

  // 2. Need the guide text to reason about the song.
  const g = await guideTextFor(slug, locale);
  if ('error' in g) {
    return NextResponse.json({ error: g.error }, { status: g.status });
  }

  // 3. Submit (lyrics + Music 3.0 job). Fast; does not block on generation.
  const submitted = await submitThemeSong(g.text, locale, g.title, g.artist);
  if (!submitted) {
    return NextResponse.json({ error: 'submit_failed', hint: 'check_keys' }, { status: 502 });
  }
  return NextResponse.json({ cached: false, requestId: submitted.requestId, lyrics: submitted.lyrics });
}

export const runtime = 'nodejs';

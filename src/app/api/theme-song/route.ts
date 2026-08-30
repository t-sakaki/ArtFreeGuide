import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { Locale } from '@/lib/i18n';
import { artworkFromSlug } from '@/lib/slug';
import { getGuideStore } from '@/lib/guideStore';
import { sanitizeGuideText } from '@/lib/guideText';
import { generateThemeSong, openRouterKey, gmiKey } from '@/lib/themeSong';

/**
 * MiniMax Week hackathon feature: generate (and cache) a per-artwork theme
 * song. POST { slug, locale } -> { audioUrl, lyrics } or { generating:false }.
 *
 * The generation job takes ~1-2 min, so the client should poll or show a
 * "composing..." state. We cache the result in D1 keyed by (slug, locale).
 */

interface D1Binding {
  prepare(q: string): { bind(...v: unknown[]): { first<T>(): Promise<T | null>; run(): Promise<unknown> } };
}

async function getCached(slug: string, locale: Locale): Promise<{ audio_url: string; lyrics: string } | null> {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as { DB?: D1Binding }).DB;
  if (!db) return null;
  return db
    .prepare('SELECT audio_url, lyrics FROM artwork_theme_songs WHERE slug = ?1 AND locale = ?2')
    .bind(slug, locale)
    .first<{ audio_url: string; lyrics: string }>();
}

async function saveCache(slug: string, locale: Locale, audioUrl: string, lyrics: string): Promise<void> {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as { DB?: D1Binding }).DB;
  if (!db) return;
  await db
    .prepare(
      `INSERT INTO artwork_theme_songs (slug, locale, audio_url, lyrics, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(slug, locale) DO UPDATE SET audio_url = excluded.audio_url, lyrics = excluded.lyrics`
    )
    .bind(slug, locale, audioUrl, lyrics, new Date().toISOString())
    .run();
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

  // 0. Both API keys are required (MiniMax M3 via OpenRouter for lyrics,
  //    MiniMax Music 3.0 via GMI Cloud for composition). Fail fast so the
  //    client can show a clear "feature unavailable" state instead of a
  //    confusing 502 after a long guide fetch.
  if (!openRouterKey() || !gmiKey()) {
    return NextResponse.json(
      { error: 'missing_keys', hint: 'set_openrouter_and_gmi_keys' },
      { status: 409 },
    );
  }

  // 1. Cache hit?
  const cached = await getCached(slug, locale);
  if (cached) {
    return NextResponse.json({ audioUrl: cached.audio_url, lyrics: cached.lyrics, cached: true });
  }

  // 2. Need the guide text to reason about the song.
  const meta = artworkFromSlug(slug);
  if (!meta) {
    return NextResponse.json({ error: 'unknown_slug' }, { status: 404 });
  }
  const stored = await getGuideStore().get(meta.title, meta.artist, locale);
  if (!stored) {
    return NextResponse.json({ error: 'no_guide_yet', hint: 'generate_guide_first' }, { status: 409 });
  }

  // payload is JSON {short,standard,deep,...}; extract plain text.
  let guideText = '';
  try {
    const parsed = JSON.parse(stored.payload);
    guideText = [parsed.standard, parsed.deep, parsed.short].filter(Boolean).join('\n\n');
  } catch {
    guideText = stored.payload;
  }
  guideText = sanitizeGuideText(guideText, locale);

  // 3. Generate (long job).
  const result = await generateThemeSong(guideText, locale);
  if (!result) {
    return NextResponse.json({ error: 'generation_failed', hint: 'check_keys' }, { status: 502 });
  }

  await saveCache(slug, locale, result.audioUrl, result.lyrics);
  return NextResponse.json({ audioUrl: result.audioUrl, lyrics: result.lyrics, cached: false });
}

export const runtime = 'nodejs';

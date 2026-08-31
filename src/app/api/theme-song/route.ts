import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { DEFAULT_LOCALE, Locale, isLocale } from '@/lib/i18n';
import { artworkFromSlug } from '@/lib/slug';
import { getGuideStore } from '@/lib/guideStore';
import { sanitizeGuideText } from '@/lib/guideText';
import {
  planThemeSong,
  submitMusicJob,
  pollMusicJob,
  downloadAudio,
  openRouterKey,
  gmiKey,
} from '@/lib/themeSong';

/**
 * MiniMax Week hackathon feature: generate (and cache) a per-artwork theme song.
 *
 *   POST { slug, locale }  - start (or resume) the job. Plans the lyrics with
 *                            MiniMax M3 and submits the MiniMax Music job, then
 *                            returns immediately with { status: 'pending' }.
 *   GET  ?slug&locale      - poll. When the music job finishes, this request
 *                            copies the audio into R2 and flips the row to
 *                            'ready' with { audioUrl, lyrics }.
 *
 * The result is cached in D1 keyed by (slug, locale) and shared across visitors.
 */

interface D1Statement {
  bind(...v: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}
interface D1Binding {
  prepare(q: string): D1Statement;
}
interface R2Bucket {
  put(key: string, value: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string }; size: number } | null>;
}

interface SongRow {
  status: string;
  request_id: string;
  audio_url: string;
  lyrics: string;
  error: string;
}

async function bindings() {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const e = env as unknown as { DB?: D1Binding; AUDIO?: R2Bucket };
    return { db: e.DB ?? null, audio: e.AUDIO ?? null };
  } catch {
    return { db: null, audio: null };
  }
}

const audioKey = (slug: string, locale: Locale) => `theme-songs/${slug}/${locale}.mp3`;
const audioPath = (slug: string, locale: Locale) =>
  `/api/theme-song/audio?slug=${encodeURIComponent(slug)}&locale=${locale}`;

async function getRow(db: D1Binding, slug: string, locale: Locale): Promise<SongRow | null> {
  return db
    .prepare(
      'SELECT status, request_id, audio_url, lyrics, error FROM artwork_theme_songs WHERE slug = ?1 AND locale = ?2',
    )
    .bind(slug, locale)
    .first<SongRow>();
}

async function upsertRow(
  db: D1Binding,
  slug: string,
  locale: Locale,
  fields: Partial<{ status: string; request_id: string; audio_url: string; lyrics: string; style_prompt: string; error: string }>,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO artwork_theme_songs (slug, locale, status, request_id, audio_url, lyrics, style_prompt, error, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
       ON CONFLICT(slug, locale) DO UPDATE SET
         status = excluded.status,
         request_id = excluded.request_id,
         audio_url = excluded.audio_url,
         lyrics = excluded.lyrics,
         style_prompt = excluded.style_prompt,
         error = excluded.error,
         updated_at = excluded.updated_at`,
    )
    .bind(
      slug,
      locale,
      fields.status ?? 'pending',
      fields.request_id ?? '',
      fields.audio_url ?? '',
      fields.lyrics ?? '',
      fields.style_prompt ?? '',
      fields.error ?? '',
      now,
    )
    .run();
}

function ready(row: { audio_url: string; lyrics: string }) {
  return NextResponse.json({ status: 'ready', audioUrl: row.audio_url, lyrics: row.lyrics });
}

function keysConfigured() {
  return Boolean(openRouterKey() && gmiKey());
}

async function loadGuideText(slug: string, locale: Locale): Promise<string | null> {
  const meta = artworkFromSlug(slug);
  if (!meta) return null;
  const stored = await getGuideStore().get(meta.title, meta.artist, locale);
  if (!stored) return null;
  let text = '';
  try {
    const parsed = JSON.parse(stored.payload);
    text = [parsed.standard, parsed.deep, parsed.short].filter(Boolean).join('\n\n');
  } catch {
    text = stored.payload;
  }
  return sanitizeGuideText(text, locale) || null;
}

function parseParams(slugRaw: string, localeRaw: string) {
  const slug = slugRaw.trim().toLowerCase();
  const locale: Locale = isLocale(localeRaw) ? localeRaw : DEFAULT_LOCALE;
  return { slug, locale };
}

export async function POST(req: NextRequest) {
  let body: { slug?: string; locale?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }
  const { slug, locale } = parseParams(body.slug || '', body.locale || '');
  if (!slug) return NextResponse.json({ error: 'missing_slug' }, { status: 400 });
  if (!keysConfigured()) {
    return NextResponse.json({ error: 'missing_keys', status: 'unavailable' }, { status: 409 });
  }

  const { db } = await bindings();
  if (!db) return NextResponse.json({ error: 'no_db', status: 'unavailable' }, { status: 503 });

  const existing = await getRow(db, slug, locale);
  if (existing?.status === 'ready' && existing.audio_url) return ready(existing);
  if (existing?.status === 'pending' && existing.request_id) {
    return NextResponse.json({ status: 'pending' });
  }

  const guideText = await loadGuideText(slug, locale);
  if (guideText === null) {
    return NextResponse.json(
      { error: 'no_guide_yet', hint: 'generate_guide_first', status: 'unavailable' },
      { status: 409 },
    );
  }

  const plan = await planThemeSong(guideText, locale);
  if (!plan) {
    await upsertRow(db, slug, locale, { status: 'failed', error: 'lyric_plan_failed' });
    return NextResponse.json({ status: 'failed', error: 'lyric_plan_failed' }, { status: 502 });
  }

  const requestId = await submitMusicJob(plan);
  if (!requestId) {
    await upsertRow(db, slug, locale, {
      status: 'failed',
      lyrics: plan.lyrics,
      style_prompt: plan.stylePrompt,
      error: 'music_submit_failed',
    });
    return NextResponse.json({ status: 'failed', error: 'music_submit_failed' }, { status: 502 });
  }

  await upsertRow(db, slug, locale, {
    status: 'pending',
    request_id: requestId,
    lyrics: plan.lyrics,
    style_prompt: plan.stylePrompt,
  });
  return NextResponse.json({ status: 'pending' });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const { slug, locale } = parseParams(searchParams.get('slug') || '', searchParams.get('locale') || '');
  if (!slug) return NextResponse.json({ error: 'missing_slug' }, { status: 400 });

  const { db, audio } = await bindings();
  if (!db) return NextResponse.json({ error: 'no_db', status: 'unavailable' }, { status: 503 });

  const row = await getRow(db, slug, locale);
  if (!row) return NextResponse.json({ status: 'none' });
  if (row.status === 'ready' && row.audio_url) return ready(row);
  if (row.status === 'failed') {
    return NextResponse.json({ status: 'failed', error: row.error || 'unknown' });
  }
  if (row.status !== 'pending' || !row.request_id) return NextResponse.json({ status: row.status });

  const poll = await pollMusicJob(row.request_id);
  if (poll.status === 'pending') return NextResponse.json({ status: 'pending' });
  if (poll.status === 'failed') {
    await upsertRow(db, slug, locale, {
      status: 'failed',
      request_id: row.request_id,
      lyrics: row.lyrics,
      error: poll.error,
    });
    return NextResponse.json({ status: 'failed', error: poll.error });
  }

  // Success: copy the MP3 into R2 so the URL never expires, then flip to ready.
  if (!audio) {
    return NextResponse.json({ status: 'failed', error: 'no_r2_bucket' });
  }
  const bytes = await downloadAudio(poll.audioUrl);
  if (!bytes) {
    return NextResponse.json({ status: 'pending' });
  }
  await audio.put(audioKey(slug, locale), bytes, { httpMetadata: { contentType: 'audio/mpeg' } });
  const url = audioPath(slug, locale);
  await upsertRow(db, slug, locale, {
    status: 'ready',
    request_id: row.request_id,
    audio_url: url,
    lyrics: row.lyrics,
  });
  return NextResponse.json({ status: 'ready', audioUrl: url, lyrics: row.lyrics });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  transcribeVocals,
  gmiKey,
  type AiBinding,
} from '@/lib/themeSong';
import { parseLyrics, alignLyricLines } from '@/lib/lyricAlign';

/**
 * MiniMax Week hackathon feature: generate (and cache) a per-artwork theme song.
 *
 * Fully poll-driven — no ctx.waitUntil, no multi-minute handler:
 *
 *   POST { slug, locale }  - write the lyrics (fast LLM) and hand the job to GMI
 *                            (the connection is dropped after a few seconds; the
 *                            job keeps running). Stores request_id, returns
 *                            { status: 'pending' } (or 'ready' if GMI was quick).
 *   GET  ?slug&locale      - poll. Once GMI reports success this request copies
 *                            the MP3 into R2 and flips the row to 'ready'.
 *
 * Result cached in D1 keyed by (slug, locale), shared across visitors.
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
  updated_at: string;
  timings: string;
}

async function bindings() {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const e = env as unknown as { DB?: D1Binding; AUDIO?: R2Bucket; AI?: AiBinding };
    return { db: e.DB ?? null, audio: e.AUDIO ?? null, ai: e.AI ?? null };
  } catch {
    return { db: null, audio: null, ai: null };
  }
}

/**
 * A 'pending' row that has not advanced in this long is treated as dead (the
 * request that was driving it was cut off). A fresh POST then restarts it.
 */
const STALE_PENDING_MS = 15 * 60 * 1000;

const audioKey = (slug: string, locale: Locale) => `theme-songs/${slug}/${locale}.mp3`;
const audioPath = (slug: string, locale: Locale) =>
  `/api/theme-song/audio?slug=${encodeURIComponent(slug)}&locale=${locale}`;

async function getRow(db: D1Binding, slug: string, locale: Locale): Promise<SongRow | null> {
  return db
    .prepare(
      'SELECT status, request_id, audio_url, lyrics, error, updated_at, timings FROM artwork_theme_songs WHERE slug = ?1 AND locale = ?2',
    )
    .bind(slug, locale)
    .first<SongRow>();
}

/** Create (or reset to) a fresh pending row for a new job. */
async function startRow(db: D1Binding, slug: string, locale: Locale): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO artwork_theme_songs (slug, locale, status, request_id, audio_url, lyrics, style_prompt, error, timings, created_at, updated_at)
       VALUES (?1, ?2, 'pending', '', '', '', '', '', '', ?3, ?3)
       ON CONFLICT(slug, locale) DO UPDATE SET
         status = 'pending', request_id = '', audio_url = '', error = '', timings = '', updated_at = ?3`,
    )
    .bind(slug, locale, now)
    .run();
}

type PatchFields = Partial<{
  status: string;
  request_id: string;
  audio_url: string;
  lyrics: string;
  style_prompt: string;
  error: string;
  timings: string;
}>;

/** Update only the named columns on an existing row; always bumps updated_at. */
async function patchRow(db: D1Binding, slug: string, locale: Locale, fields: PatchFields): Promise<void> {
  const cols = Object.keys(fields) as (keyof PatchFields)[];
  const sets = cols.map((c, i) => `${c} = ?${i + 1}`);
  sets.push(`updated_at = ?${cols.length + 1}`);
  const values: unknown[] = cols.map(c => fields[c] ?? '');
  values.push(new Date().toISOString(), slug, locale);
  await db
    .prepare(
      `UPDATE artwork_theme_songs SET ${sets.join(', ')} WHERE slug = ?${cols.length + 2} AND locale = ?${cols.length + 3}`,
    )
    .bind(...values)
    .run();
}

function ready(row: { audio_url: string; lyrics: string; timings?: string }) {
  let timings: number[] = [];
  try {
    if (row.timings) timings = JSON.parse(row.timings);
  } catch {
    timings = [];
  }
  return NextResponse.json({ status: 'ready', audioUrl: row.audio_url, lyrics: row.lyrics, timings });
}

function keysConfigured() {
  // GMI composes the music and is required; OpenRouter (MiniMax M3) is only the
  // preferred lyric writer and falls back to the app's own LLM.
  return Boolean(gmiKey());
}

function isStalePending(row: SongRow): boolean {
  if (row.status !== 'pending') return false;
  const ts = Date.parse(row.updated_at || '');
  return !Number.isFinite(ts) || Date.now() - ts > STALE_PENDING_MS;
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

/**
 * Copy a finished GMI MP3 into R2, best-effort align the lyrics to a Whisper
 * transcription for Spotify-style sync, and mark the row ready.
 */
async function finish(
  db: D1Binding,
  audio: R2Bucket | null,
  ai: AiBinding | null,
  slug: string,
  locale: Locale,
  gmiAudioUrl: string,
  lyrics: string,
): Promise<NextResponse> {
  if (!audio) return NextResponse.json({ status: 'failed', error: 'no_r2_bucket' });
  const bytes = await downloadAudio(gmiAudioUrl);
  if (!bytes) return NextResponse.json({ status: 'pending' });
  await audio.put(audioKey(slug, locale), bytes, { httpMetadata: { contentType: 'audio/mpeg' } });

  let timings: number[] = [];
  if (ai) {
    try {
      const words = await transcribeVocals(bytes, ai);
      if (words) {
        const aligned = alignLyricLines(parseLyrics(lyrics), words);
        if (aligned) timings = aligned;
      }
    } catch (e) {
      console.warn('[theme-song] lyric alignment failed:', e);
    }
  }

  const audioUrl = audioPath(slug, locale);
  await patchRow(db, slug, locale, {
    status: 'ready',
    audio_url: audioUrl,
    timings: timings.length ? JSON.stringify(timings) : '',
  });
  return NextResponse.json({ status: 'ready', audioUrl, lyrics, timings });
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

  const { db, audio, ai } = await bindings();
  if (!db) return NextResponse.json({ error: 'no_db', status: 'unavailable' }, { status: 503 });

  const existing = await getRow(db, slug, locale);
  if (existing?.status === 'ready' && existing.audio_url) return ready(existing);
  if (existing && existing.status === 'pending' && !isStalePending(existing)) {
    return NextResponse.json({ status: 'pending' });
  }

  const guideText = await loadGuideText(slug, locale);
  if (guideText === null) {
    return NextResponse.json(
      { error: 'no_guide_yet', hint: 'generate_guide_first', status: 'unavailable' },
      { status: 409 },
    );
  }

  await startRow(db, slug, locale);

  const plan = await planThemeSong(guideText, locale);
  if (!plan) {
    await patchRow(db, slug, locale, { status: 'failed', error: 'lyric_plan_failed' });
    return NextResponse.json({ status: 'failed', error: 'lyric_plan_failed' });
  }
  await patchRow(db, slug, locale, { lyrics: plan.lyrics, style_prompt: plan.stylePrompt });

  const submit = await submitMusicJob(plan);
  if ('error' in submit) {
    await patchRow(db, slug, locale, { status: 'failed', error: submit.error });
    return NextResponse.json({ status: 'failed', error: submit.error });
  }
  await patchRow(db, slug, locale, { request_id: submit.requestId });

  if (submit.audioUrl) return finish(db, audio, ai, slug, locale, submit.audioUrl, plan.lyrics);
  return NextResponse.json({ status: 'pending' });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const { slug, locale } = parseParams(searchParams.get('slug') || '', searchParams.get('locale') || '');
  if (!slug) return NextResponse.json({ error: 'missing_slug' }, { status: 400 });

  const { db, audio, ai } = await bindings();
  if (!db) return NextResponse.json({ error: 'no_db', status: 'unavailable' }, { status: 503 });

  const row = await getRow(db, slug, locale);
  if (!row) return NextResponse.json({ status: 'none' });
  if (row.status === 'ready' && row.audio_url) return ready(row);
  if (row.status === 'failed') {
    return NextResponse.json({ status: 'failed', error: row.error || 'unknown' });
  }
  if (row.status !== 'pending') return NextResponse.json({ status: row.status });

  // Lyrics / submit still running in the POST (or that POST died).
  if (!row.request_id) {
    if (isStalePending(row)) {
      await patchRow(db, slug, locale, { status: 'failed', error: 'timed_out' });
      return NextResponse.json({ status: 'failed', error: 'timed_out' });
    }
    return NextResponse.json({ status: 'pending' });
  }

  const poll = await pollMusicJob(row.request_id);
  if (poll.status === 'failed') {
    await patchRow(db, slug, locale, { status: 'failed', error: poll.error });
    return NextResponse.json({ status: 'failed', error: poll.error });
  }
  if (poll.status === 'success') return finish(db, audio, ai, slug, locale, poll.audioUrl, row.lyrics);

  if (isStalePending(row)) {
    await patchRow(db, slug, locale, { status: 'failed', error: 'timed_out' });
    return NextResponse.json({ status: 'failed', error: 'timed_out' });
  }
  return NextResponse.json({ status: 'pending' });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

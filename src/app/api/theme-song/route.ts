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
  updated_at: string;
}

interface WaitCtx {
  waitUntil(p: Promise<unknown>): void;
}

async function bindings() {
  try {
    const { env, ctx } = await getCloudflareContext({ async: true });
    const e = env as unknown as { DB?: D1Binding; AUDIO?: R2Bucket };
    return { db: e.DB ?? null, audio: e.AUDIO ?? null, ctx: (ctx as unknown as WaitCtx) ?? null };
  } catch {
    return { db: null, audio: null, ctx: null };
  }
}

/** How long the lyric-planning step (MiniMax M3) may run before we give up. */
const PLANNING_TIMEOUT_MS = 4 * 60 * 1000;

const audioKey = (slug: string, locale: Locale) => `theme-songs/${slug}/${locale}.mp3`;
const audioPath = (slug: string, locale: Locale) =>
  `/api/theme-song/audio?slug=${encodeURIComponent(slug)}&locale=${locale}`;

async function getRow(db: D1Binding, slug: string, locale: Locale): Promise<SongRow | null> {
  return db
    .prepare(
      'SELECT status, request_id, audio_url, lyrics, error, updated_at FROM artwork_theme_songs WHERE slug = ?1 AND locale = ?2',
    )
    .bind(slug, locale)
    .first<SongRow>();
}

/** Create (or reset to) a fresh pending row for a new job. */
async function startRow(db: D1Binding, slug: string, locale: Locale): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO artwork_theme_songs (slug, locale, status, request_id, audio_url, lyrics, style_prompt, error, created_at, updated_at)
       VALUES (?1, ?2, 'pending', '', '', '', '', '', ?3, ?3)
       ON CONFLICT(slug, locale) DO UPDATE SET
         status = 'pending', request_id = '', audio_url = '', error = '', updated_at = ?3`,
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

/**
 * Background step: write lyrics with MiniMax M3, then submit the MiniMax Music
 * job. Runs inside ctx.waitUntil so the POST can return immediately; the row is
 * left 'pending' (with a request_id once submitted) or flipped to 'failed'.
 */
async function planAndSubmit(db: D1Binding, slug: string, locale: Locale, guideText: string): Promise<void> {
  try {
    const plan = await planThemeSong(guideText, locale);
    if (!plan) {
      await patchRow(db, slug, locale, { status: 'failed', error: 'lyric_plan_failed' });
      return;
    }
    await patchRow(db, slug, locale, { lyrics: plan.lyrics, style_prompt: plan.stylePrompt });
    const submit = await submitMusicJob(plan);
    if ('error' in submit) {
      await patchRow(db, slug, locale, { status: 'failed', error: submit.error });
      return;
    }
    await patchRow(db, slug, locale, { status: 'pending', request_id: submit.requestId });
  } catch (e) {
    await patchRow(db, slug, locale, {
      status: 'failed',
      error: `plan_exception: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
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

  const { db, ctx } = await bindings();
  if (!db) return NextResponse.json({ error: 'no_db', status: 'unavailable' }, { status: 503 });

  const existing = await getRow(db, slug, locale);
  if (existing?.status === 'ready' && existing.audio_url) return ready(existing);
  if (existing?.status === 'pending' && !isStalePlanning(existing)) {
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
  const job = planAndSubmit(db, slug, locale, guideText);
  if (ctx) ctx.waitUntil(job);
  else await job; // local dev without a real ctx

  return NextResponse.json({ status: 'pending' });
}

/** A 'pending' row with no request_id whose planning step has overrun. */
function isStalePlanning(row: SongRow): boolean {
  if (row.request_id) return false;
  const ts = Date.parse(row.updated_at || '');
  return Number.isFinite(ts) && Date.now() - ts > PLANNING_TIMEOUT_MS;
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
  if (row.status !== 'pending') return NextResponse.json({ status: row.status });

  // Still writing lyrics / submitting the job (no request_id yet).
  if (!row.request_id) {
    if (isStalePlanning(row)) {
      await patchRow(db, slug, locale, { status: 'failed', error: 'planning_timed_out' });
      return NextResponse.json({ status: 'failed', error: 'planning_timed_out' });
    }
    return NextResponse.json({ status: 'pending' });
  }

  const poll = await pollMusicJob(row.request_id);
  if (poll.status === 'pending') return NextResponse.json({ status: 'pending' });
  if (poll.status === 'failed') {
    await patchRow(db, slug, locale, { status: 'failed', error: poll.error });
    return NextResponse.json({ status: 'failed', error: poll.error });
  }

  // Success: copy the MP3 into R2 so the URL never expires, then flip to ready.
  if (!audio) return NextResponse.json({ status: 'failed', error: 'no_r2_bucket' });
  const bytes = await downloadAudio(poll.audioUrl);
  if (!bytes) return NextResponse.json({ status: 'pending' });
  await audio.put(audioKey(slug, locale), bytes, { httpMetadata: { contentType: 'audio/mpeg' } });
  const url = audioPath(slug, locale);
  await patchRow(db, slug, locale, { status: 'ready', audio_url: url });
  return NextResponse.json({ status: 'ready', audioUrl: url, lyrics: row.lyrics });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

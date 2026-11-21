import { getCloudflareContext } from '@opennextjs/cloudflare';
import { LOCALES, type Locale } from './i18n';
import type { Playlist, PlaylistItem } from './playlists';
import { artworkFromSlug } from './slug';

export type FeaturedTourStatus = 'draft' | 'published' | 'archived';

export const FEATURED_TOUR_STATUSES = ['draft', 'published', 'archived'] as const;

interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
}

interface D1Binding {
  prepare(query: string): D1Statement;
}

interface FeaturedTourRow {
  slug: string;
  status: FeaturedTourStatus;
  title: string;
  subtitle: string;
  emoji: string;
  payload: string;
  source_url: string | null;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeaturedTourRecord {
  slug: string;
  status: FeaturedTourStatus;
  title: string;
  subtitle: string;
  emoji: string;
  items: PlaylistItem[];
  i18n: Playlist['i18n'];
  sourceUrl: string | null;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ValidatedFeaturedTourInput {
  slug: string;
  status: FeaturedTourStatus;
  title: string;
  subtitle: string;
  emoji: string;
  items: PlaylistItem[];
  i18n: Playlist['i18n'];
  sourceUrl: string | null;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_SLUGS = new Set(['admin', 'api', 'robots.txt', 'sitemap.xml']);
const NON_JA_LOCALES = new Set<string>(LOCALES.filter(l => l !== 'ja'));

export function isFeaturedTourStatus(value: unknown): value is FeaturedTourStatus {
  return typeof value === 'string' && (FEATURED_TOUR_STATUSES as readonly string[]).includes(value);
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function validateI18n(
  raw: unknown,
  itemCount: number
): { ok: true; value: Playlist['i18n'] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, value: {} };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'i18n must be an object keyed by locale' };
  }

  const out: Playlist['i18n'] = {};
  for (const [locale, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!NON_JA_LOCALES.has(locale)) {
      return { ok: false, error: `Unsupported i18n locale: ${locale}` };
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, error: `i18n.${locale} must be an object` };
    }
    const obj = entry as Record<string, unknown>;
    const title = typeof obj.title === 'string' ? obj.title.trim() : '';
    const subtitle = typeof obj.subtitle === 'string' ? obj.subtitle.trim() : '';
    if (!title || !subtitle) {
      return { ok: false, error: `i18n.${locale} requires non-empty title and subtitle` };
    }
    if (!Array.isArray(obj.cues)) {
      return { ok: false, error: `i18n.${locale}.cues must be an array` };
    }
    const cues = obj.cues.slice(0, itemCount).map(c => (typeof c === 'string' ? c.trim() : ''));
    out[locale as Exclude<Locale, 'ja'>] = { title, subtitle, cues };
  }

  return { ok: true, value: out };
}

export function validateFeaturedTourInput(
  raw: unknown
): { ok: true; value: ValidatedFeaturedTourInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  const input = raw as Record<string, unknown>;
  const slug = typeof input.slug === 'string' ? input.slug.trim().toLowerCase() : '';
  if (!slug || slug.length < 2 || slug.length > 80 || !SLUG_RE.test(slug)) {
    return { ok: false, error: 'slug must be 2–80 chars of lowercase letters, digits, and hyphens' };
  }
  if (RESERVED_SLUGS.has(slug) || artworkFromSlug(slug)) {
    return { ok: false, error: `slug "${slug}" is reserved or conflicts with an artwork permalink` };
  }

  const statusRaw = input.status ?? 'draft';
  if (!isFeaturedTourStatus(statusRaw)) {
    return { ok: false, error: 'status must be one of: draft, published, archived' };
  }

  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) {
    return { ok: false, error: 'title is required' };
  }

  const subtitle = typeof input.subtitle === 'string' ? input.subtitle.trim() : '';
  if (!subtitle) {
    return { ok: false, error: 'subtitle is required' };
  }

  const emojiRaw = typeof input.emoji === 'string' ? input.emoji.trim() : '';
  const emoji = emojiRaw || '✨';

  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 12) {
    return { ok: false, error: 'items must be an array of 1 to 12 artworks' };
  }

  const items: PlaylistItem[] = [];
  for (let i = 0; i < input.items.length; i += 1) {
    const item = input.items[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, error: `items[${i}] must be an object` };
    }
    const row = item as Record<string, unknown>;
    const itemTitle = typeof row.title === 'string' ? row.title.trim() : '';
    const itemArtist = typeof row.artist === 'string' ? row.artist.trim() : '';
    const itemCue = typeof row.cue === 'string' ? row.cue.trim() : '';
    if (!itemTitle) {
      return { ok: false, error: `items[${i}].title is required` };
    }
    items.push({ title: itemTitle, artist: itemArtist, cue: itemCue });
  }

  const i18nResult = validateI18n(input.i18n, items.length);
  if (!i18nResult.ok) {
    return i18nResult;
  }

  let sourceUrl: string | null = null;
  if (input.sourceUrl !== undefined && input.sourceUrl !== null && input.sourceUrl !== '') {
    if (typeof input.sourceUrl !== 'string') {
      return { ok: false, error: 'sourceUrl must be a string' };
    }
    const trimmedUrl = input.sourceUrl.trim();
    if (trimmedUrl) {
      try {
        const parsed = new URL(trimmedUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return { ok: false, error: 'sourceUrl must use http or https' };
        }
        sourceUrl = parsed.toString();
      } catch {
        return { ok: false, error: 'sourceUrl must be a valid URL' };
      }
    }
  }

  const sortOrderRaw = input.sortOrder ?? 0;
  const sortOrder =
    typeof sortOrderRaw === 'number' && Number.isFinite(sortOrderRaw)
      ? Math.trunc(sortOrderRaw)
      : typeof sortOrderRaw === 'string' && sortOrderRaw.trim() !== '' && Number.isFinite(Number(sortOrderRaw))
        ? Math.trunc(Number(sortOrderRaw))
        : NaN;
  if (!Number.isFinite(sortOrder)) {
    return { ok: false, error: 'sortOrder must be an integer' };
  }

  const startsAt = normalizeOptionalString(input.startsAt);
  if (startsAt !== null && !Number.isFinite(Date.parse(startsAt))) {
    return { ok: false, error: 'startsAt must be a valid ISO date string' };
  }

  const endsAt = normalizeOptionalString(input.endsAt);
  if (endsAt !== null && !Number.isFinite(Date.parse(endsAt))) {
    return { ok: false, error: 'endsAt must be a valid ISO date string' };
  }

  if (startsAt !== null && endsAt !== null && Date.parse(startsAt) > Date.parse(endsAt)) {
    return { ok: false, error: 'startsAt must not be later than endsAt' };
  }

  return {
    ok: true,
    value: {
      slug,
      status: statusRaw,
      title,
      subtitle,
      emoji,
      items,
      i18n: i18nResult.value,
      sourceUrl,
      sortOrder,
      startsAt,
      endsAt,
    },
  };
}

export function isFeaturedTourActive(
  tour: Pick<FeaturedTourRecord, 'status' | 'startsAt' | 'endsAt'>,
  nowMs = Date.now()
): boolean {
  if (tour.status !== 'published') return false;
  if (tour.startsAt) {
    const startMs = Date.parse(tour.startsAt);
    if (Number.isFinite(startMs) && startMs > nowMs) return false;
  }
  if (tour.endsAt) {
    const endMs = Date.parse(tour.endsAt);
    if (Number.isFinite(endMs) && endMs < nowMs) return false;
  }
  return true;
}

export function toPlaylist(record: Pick<FeaturedTourRecord, 'slug' | 'title' | 'subtitle' | 'emoji' | 'items' | 'i18n'>): Playlist {
  return {
    id: record.slug,
    title: record.title,
    subtitle: record.subtitle,
    emoji: record.emoji || '✨',
    items: record.items,
    i18n: record.i18n ?? {},
  };
}

function rowToRecord(row: FeaturedTourRow): FeaturedTourRecord | null {
  try {
    const parsed = JSON.parse(row.payload) as { items?: unknown; i18n?: unknown };
    const items: PlaylistItem[] = Array.isArray(parsed?.items)
      ? parsed.items
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
          .map(item => ({
            title: typeof item.title === 'string' ? item.title : '',
            artist: typeof item.artist === 'string' ? item.artist : '',
            cue: typeof item.cue === 'string' ? item.cue : '',
          }))
          .filter(item => item.title.length > 0)
      : [];

    if (items.length === 0) return null;

    const i18n =
      parsed?.i18n && typeof parsed.i18n === 'object' && !Array.isArray(parsed.i18n)
        ? (parsed.i18n as Playlist['i18n'])
        : {};

    return {
      slug: row.slug,
      status: isFeaturedTourStatus(row.status) ? row.status : 'draft',
      title: row.title,
      subtitle: row.subtitle,
      emoji: row.emoji || '✨',
      items,
      i18n,
      sourceUrl: row.source_url ?? null,
      sortOrder: Number(row.sort_order) || 0,
      startsAt: row.starts_at ?? null,
      endsAt: row.ends_at ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch {
    return null;
  }
}

async function tryGetD1(): Promise<D1Binding | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return (env as unknown as { DB?: D1Binding }).DB ?? null;
  } catch {
    return null;
  }
}

async function requireD1(): Promise<D1Binding> {
  const db = await tryGetD1();
  if (!db) {
    throw new Error('D1 binding "DB" is not available. Add d1_databases to wrangler.jsonc.');
  }
  return db;
}

const TTL_MS = 60_000;
let publishedCache: { tours: FeaturedTourRecord[]; expiresAt: number } | null = null;

export function invalidateFeaturedToursCache(): void {
  publishedCache = null;
}

export async function listFeaturedTours(options: { status?: FeaturedTourStatus | 'all' } = {}): Promise<FeaturedTourRecord[]> {
  const db = await requireD1();
  const status = options.status ?? 'all';
  const query =
    status === 'all'
      ? `SELECT slug, status, title, subtitle, emoji, payload, source_url, sort_order, starts_at, ends_at, created_at, updated_at
         FROM featured_tours
         ORDER BY sort_order ASC, updated_at DESC`
      : `SELECT slug, status, title, subtitle, emoji, payload, source_url, sort_order, starts_at, ends_at, created_at, updated_at
         FROM featured_tours
         WHERE status = ?
         ORDER BY sort_order ASC, updated_at DESC`;

  const stmt = status === 'all' ? db.prepare(query) : db.prepare(query).bind(status);
  const { results } = await stmt.all<FeaturedTourRow>();
  return (results ?? []).map(rowToRecord).filter((r): r is FeaturedTourRecord => r !== null);
}

export async function getFeaturedTourBySlug(slug: string): Promise<FeaturedTourRecord | null> {
  const db = await requireD1();
  const row = await db
    .prepare(
      `SELECT slug, status, title, subtitle, emoji, payload, source_url, sort_order, starts_at, ends_at, created_at, updated_at
       FROM featured_tours
       WHERE slug = ?`
    )
    .bind(slug.trim().toLowerCase())
    .first<FeaturedTourRow>();

  return row ? rowToRecord(row) : null;
}

export async function upsertFeaturedTour(input: ValidatedFeaturedTourInput): Promise<FeaturedTourRecord> {
  const db = await requireD1();
  const now = new Date().toISOString();
  const payload = JSON.stringify({ items: input.items, i18n: input.i18n });

  await db
    .prepare(
      `INSERT INTO featured_tours (
         slug, status, title, subtitle, emoji, payload, source_url, sort_order, starts_at, ends_at, created_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET
         status = excluded.status,
         title = excluded.title,
         subtitle = excluded.subtitle,
         emoji = excluded.emoji,
         payload = excluded.payload,
         source_url = excluded.source_url,
         sort_order = excluded.sort_order,
         starts_at = excluded.starts_at,
         ends_at = excluded.ends_at,
         updated_at = excluded.updated_at`
    )
    .bind(
      input.slug,
      input.status,
      input.title,
      input.subtitle,
      input.emoji,
      payload,
      input.sourceUrl,
      input.sortOrder,
      input.startsAt,
      input.endsAt,
      now,
      now
    )
    .run();

  invalidateFeaturedToursCache();
  const saved = await getFeaturedTourBySlug(input.slug);
  if (!saved) {
    throw new Error(`Failed to read back featured tour "${input.slug}"`);
  }
  return saved;
}

export async function setFeaturedTourStatus(
  slug: string,
  status: FeaturedTourStatus
): Promise<FeaturedTourRecord | null> {
  const db = await requireD1();
  const normalizedSlug = slug.trim().toLowerCase();
  const existing = await getFeaturedTourBySlug(normalizedSlug);
  if (!existing) return null;

  await db
    .prepare('UPDATE featured_tours SET status = ?, updated_at = ? WHERE slug = ?')
    .bind(status, new Date().toISOString(), normalizedSlug)
    .run();

  invalidateFeaturedToursCache();
  return getFeaturedTourBySlug(normalizedSlug);
}

export async function deleteFeaturedTour(slug: string): Promise<boolean> {
  const db = await requireD1();
  const normalizedSlug = slug.trim().toLowerCase();
  const existing = await getFeaturedTourBySlug(normalizedSlug);
  if (!existing) return false;

  await db.prepare('DELETE FROM featured_tours WHERE slug = ?').bind(normalizedSlug).run();
  invalidateFeaturedToursCache();
  return true;
}

/**
 * Public read helper with a 60s per-isolate cache and graceful fallback.
 * Never throws when D1 is unavailable (local dev/build or missing migration).
 */
export async function getCachedPublishedFeaturedTours(nowMs = Date.now()): Promise<Playlist[]> {
  if (publishedCache && publishedCache.expiresAt > nowMs) {
    return publishedCache.tours.filter(t => isFeaturedTourActive(t, nowMs)).map(toPlaylist);
  }

  const db = await tryGetD1();
  if (!db) return [];

  try {
    const { results } = await db
      .prepare(
        `SELECT slug, status, title, subtitle, emoji, payload, source_url, sort_order, starts_at, ends_at, created_at, updated_at
         FROM featured_tours
         WHERE status = 'published'
         ORDER BY sort_order ASC, updated_at DESC`
      )
      .all<FeaturedTourRow>();

    const tours = (results ?? []).map(rowToRecord).filter((r): r is FeaturedTourRecord => r !== null);
    publishedCache = { tours, expiresAt: nowMs + TTL_MS };
    return tours.filter(t => isFeaturedTourActive(t, nowMs)).map(toPlaylist);
  } catch (err) {
    console.warn('getCachedPublishedFeaturedTours failed:', err);
    return [];
  }
}

export async function getPublishedFeaturedTourBySlug(
  slug: string,
  nowMs = Date.now()
): Promise<Playlist | null> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  const tours = await getCachedPublishedFeaturedTours(nowMs);
  return tours.find(t => t.id === normalized) ?? null;
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getCloudflareContext } = vi.hoisted(() => ({
  getCloudflareContext: vi.fn(),
}));

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext }));

import {
  deleteFeaturedTour,
  getCachedPublishedFeaturedTours,
  getPublishedFeaturedTourBySlug,
  invalidateFeaturedToursCache,
  isFeaturedTourActive,
  listFeaturedTours,
  setFeaturedTourStatus,
  toPlaylist,
  upsertFeaturedTour,
  validateFeaturedTourInput,
} from './featuredTours';
import { mergePlaylists, PLAYLISTS } from './playlists';

type StoredRow = {
  slug: string;
  status: 'draft' | 'published' | 'archived';
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
};

function createFakeD1(rows: StoredRow[]) {
  return {
    prepare(query: string) {
      let bound: unknown[] = [];
      const stmt = {
        bind(...values: unknown[]) {
          bound = values;
          return stmt;
        },
        async first<T>() {
          if (query.includes('WHERE slug = ?')) {
            const slug = String(bound[0]);
            return (rows.find(r => r.slug === slug) as unknown as T) ?? null;
          }
          return null;
        },
        async all<T>() {
          let filtered = [...rows];
          if (query.includes("WHERE status = 'published'")) {
            filtered = filtered.filter(r => r.status === 'published');
          } else if (query.includes('WHERE status = ?')) {
            const status = String(bound[0]);
            filtered = filtered.filter(r => r.status === status);
          }
          filtered.sort((a, b) => a.sort_order - b.sort_order || b.updated_at.localeCompare(a.updated_at));
          return { results: filtered as unknown as T[] };
        },
        async run() {
          if (query.startsWith('INSERT INTO featured_tours')) {
            const [
              slug,
              status,
              title,
              subtitle,
              emoji,
              payload,
              source_url,
              sort_order,
              starts_at,
              ends_at,
              created_at,
              updated_at,
            ] = bound as [
              string,
              'draft' | 'published' | 'archived',
              string,
              string,
              string,
              string,
              string | null,
              number,
              string | null,
              string | null,
              string,
              string,
            ];
            const idx = rows.findIndex(r => r.slug === slug);
            if (idx >= 0) {
              rows[idx] = {
                ...rows[idx],
                status,
                title,
                subtitle,
                emoji,
                payload,
                source_url,
                sort_order,
                starts_at,
                ends_at,
                updated_at,
              };
            } else {
              rows.push({
                slug,
                status,
                title,
                subtitle,
                emoji,
                payload,
                source_url,
                sort_order,
                starts_at,
                ends_at,
                created_at,
                updated_at,
              });
            }
          } else if (query.startsWith('UPDATE featured_tours SET status = ?')) {
            const [status, updated_at, slug] = bound as ['draft' | 'published' | 'archived', string, string];
            const row = rows.find(r => r.slug === slug);
            if (row) {
              row.status = status;
              row.updated_at = updated_at;
            }
          } else if (query.startsWith('DELETE FROM featured_tours WHERE slug = ?')) {
            const [slug] = bound as [string];
            const idx = rows.findIndex(r => r.slug === slug);
            if (idx >= 0) rows.splice(idx, 1);
          }
          return { success: true };
        },
      };
      return stmt;
    },
  };
}

describe('validateFeaturedTourInput', () => {
  const baseInput = {
    slug: 'autumn-special-2026',
    title: '秋の特別展ツアー',
    subtitle: '話題の展覧会から5作品を巡る',
    emoji: '🍁',
    items: [
      { title: '睡蓮', artist: 'クロード・モネ', cue: 'まずは池のほとりから' },
      { title: '星月夜', artist: 'フィンセント・ファン・ゴッホ', cue: '夜空のうねりへ' },
    ],
    i18n: {
      en: {
        title: 'Autumn Special 2026',
        subtitle: 'Five highlights linked to the autumn exhibition',
        cues: ['First, beside the pond', 'Into the swirling night sky'],
      },
    },
    sourceUrl: 'https://www.nmwa.go.jp/jp/exhibitions/2026turner.html',
    sortOrder: 10,
  };

  it('accepts valid input and normalizes defaults', () => {
    const res = validateFeaturedTourInput(baseInput);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.slug).toBe('autumn-special-2026');
    expect(res.value.status).toBe('draft');
    expect(res.value.sortOrder).toBe(10);
    expect(res.value.i18n.en?.cues).toHaveLength(2);
  });

  it('rejects reserved or colliding artwork slugs', () => {
    expect(validateFeaturedTourInput({ ...baseInput, slug: 'admin' }).ok).toBe(false);
    expect(validateFeaturedTourInput({ ...baseInput, slug: 'mona-lisa' }).ok).toBe(false);
    expect(validateFeaturedTourInput({ ...baseInput, slug: 'Invalid Slug!' }).ok).toBe(false);
  });

  it('rejects inverted startsAt / endsAt schedules or non-http URLs', () => {
    expect(
      validateFeaturedTourInput({
        ...baseInput,
        startsAt: '2026-12-01T00:00:00Z',
        endsAt: '2026-11-01T00:00:00Z',
      }).ok
    ).toBe(false);
    expect(validateFeaturedTourInput({ ...baseInput, sourceUrl: 'javascript:alert(1)' }).ok).toBe(false);
  });
});

describe('isFeaturedTourActive & mergePlaylists', () => {
  it('checks status and active time window', () => {
    const now = Date.parse('2026-11-21T12:00:00Z');
    expect(isFeaturedTourActive({ status: 'draft', startsAt: null, endsAt: null }, now)).toBe(false);
    expect(isFeaturedTourActive({ status: 'published', startsAt: null, endsAt: null }, now)).toBe(true);
    expect(
      isFeaturedTourActive({ status: 'published', startsAt: '2026-11-22T00:00:00Z', endsAt: null }, now)
    ).toBe(false);
    expect(
      isFeaturedTourActive({ status: 'published', startsAt: null, endsAt: '2026-11-20T00:00:00Z' }, now)
    ).toBe(false);
  });

  it('places dynamic tours before static tours and deduplicates by id', () => {
    const dynamicTour = toPlaylist({
      slug: 'impressionism',
      title: '上書きされた印象派',
      subtitle: '期間限定特集',
      emoji: '✨',
      items: [{ title: '印象・日の出', artist: 'クロード・モネ', cue: 'ここから' }],
      i18n: {},
    });
    const extraTour = toPlaylist({
      slug: 'new-dynamic-tour',
      title: '新作特集',
      subtitle: '開催中',
      emoji: '🎨',
      items: [{ title: '睡蓮', artist: 'クロード・モネ', cue: '一枚目' }],
      i18n: {},
    });

    const merged = mergePlaylists([extraTour, dynamicTour]);
    expect(merged[0].id).toBe('new-dynamic-tour');
    expect(merged[1].id).toBe('impressionism');
    expect(merged[1].title).toBe('上書きされた印象派');
    expect(merged.filter(p => p.id === 'impressionism')).toHaveLength(1);
    expect(merged.length).toBe(PLAYLISTS.length + 1);
  });
});

describe('D1 CRUD and isolate cache', () => {
  let rows: StoredRow[];

  beforeEach(() => {
    rows = [];
    invalidateFeaturedToursCache();
    getCloudflareContext.mockResolvedValue({ env: { DB: createFakeD1(rows) } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates draft, publishes, reads from cache, archives, and deletes', async () => {
    const parsed = validateFeaturedTourInput({
      slug: 'winter-light-2026',
      title: '冬の光と影',
      subtitle: '企画展連動コレクション',
      emoji: '❄️',
      items: [{ title: '夜警', artist: 'レンブラント', cue: '劇的な明暗から' }],
    });
    if (!parsed.ok) throw new Error(parsed.error);

    const created = await upsertFeaturedTour(parsed.value);
    expect(created.status).toBe('draft');
    expect(await getCachedPublishedFeaturedTours()).toEqual([]);

    const published = await setFeaturedTourStatus('winter-light-2026', 'published');
    expect(published?.status).toBe('published');

    const active = await getCachedPublishedFeaturedTours();
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('winter-light-2026');
    expect(await getPublishedFeaturedTourBySlug('winter-light-2026')).not.toBeNull();

    await setFeaturedTourStatus('winter-light-2026', 'archived');
    expect(await getCachedPublishedFeaturedTours()).toEqual([]);
    expect((await listFeaturedTours({ status: 'archived' })).map(t => t.slug)).toEqual(['winter-light-2026']);

    expect(await deleteFeaturedTour('winter-light-2026')).toBe(true);
    expect(await deleteFeaturedTour('winter-light-2026')).toBe(false);
  });

  it('returns [] gracefully when D1 binding is unavailable', async () => {
    getCloudflareContext.mockRejectedValue(new Error('No cloudflare context'));
    expect(await getCachedPublishedFeaturedTours()).toEqual([]);
  });
});

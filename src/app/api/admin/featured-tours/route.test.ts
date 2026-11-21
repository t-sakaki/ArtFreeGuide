import { NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  denyAdmin,
  listFeaturedTours,
  getFeaturedTourBySlug,
  upsertFeaturedTour,
  setFeaturedTourStatus,
  deleteFeaturedTour,
} = vi.hoisted(() => ({
  denyAdmin: vi.fn(),
  listFeaturedTours: vi.fn(),
  getFeaturedTourBySlug: vi.fn(),
  upsertFeaturedTour: vi.fn(),
  setFeaturedTourStatus: vi.fn(),
  deleteFeaturedTour: vi.fn(),
}));

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));
vi.mock('@/lib/adminAuth', () => ({ denyAdmin }));
vi.mock('@/lib/featuredTours', async () => {
  const actual = await vi.importActual<typeof import('../../../../lib/featuredTours')>(
    '../../../../lib/featuredTours'
  );
  return {
    ...actual,
    listFeaturedTours,
    getFeaturedTourBySlug,
    upsertFeaturedTour,
    setFeaturedTourStatus,
    deleteFeaturedTour,
  };
});

import { DELETE, GET, POST } from './route';

const sampleTour = {
  slug: 'autumn-special-2026',
  status: 'draft' as const,
  title: '秋の特別展ツアー',
  subtitle: '展覧会連動',
  emoji: '🍁',
  items: [{ title: '睡蓮', artist: 'クロード・モネ', cue: '一枚目' }],
  i18n: {},
  sourceUrl: null,
  sortOrder: 0,
  startsAt: null,
  endsAt: null,
  createdAt: '2026-11-21T00:00:00Z',
  updatedAt: '2026-11-21T00:00:00Z',
};

describe('/api/admin/featured-tours', () => {
  beforeEach(() => {
    denyAdmin.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when denyAdmin rejects', async () => {
    denyAdmin.mockResolvedValueOnce(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await GET(new Request('http://localhost/api/admin/featured-tours'));
    expect(res.status).toBe(401);
  });

  it('lists tours and filters by status', async () => {
    listFeaturedTours.mockResolvedValueOnce([sampleTour]);
    const res = await GET(new Request('http://localhost/api/admin/featured-tours?status=draft&token=ok'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(listFeaturedTours).toHaveBeenCalledWith({ status: 'draft' });
  });

  it('validates and upserts a featured tour', async () => {
    upsertFeaturedTour.mockResolvedValueOnce(sampleTour);
    const res = await POST(
      new Request('http://localhost/api/admin/featured-tours', {
        method: 'POST',
        body: JSON.stringify({
          token: 'ok',
          slug: 'autumn-special-2026',
          title: '秋の特別展ツアー',
          subtitle: '展覧会連動',
          items: [{ title: '睡蓮', artist: 'クロード・モネ', cue: '一枚目' }],
        }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.tour.slug).toBe('autumn-special-2026');
  });

  it('returns 400 on invalid input', async () => {
    const res = await POST(
      new Request('http://localhost/api/admin/featured-tours', {
        method: 'POST',
        body: JSON.stringify({
          token: 'ok',
          slug: 'BAD SLUG',
          title: '無効',
          subtitle: '無効',
          items: [],
        }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('transitions status via set_status without warming', async () => {
    setFeaturedTourStatus.mockResolvedValueOnce({ ...sampleTour, status: 'published' });
    const res = await POST(
      new Request('http://localhost/api/admin/featured-tours', {
        method: 'POST',
        body: JSON.stringify({
          token: 'ok',
          action: 'set_status',
          slug: 'autumn-special-2026',
          status: 'published',
        }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tour.status).toBe('published');
    expect(setFeaturedTourStatus).toHaveBeenCalledWith('autumn-special-2026', 'published');
  });

  it('deletes a tour and returns 404 when missing', async () => {
    deleteFeaturedTour.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const okRes = await DELETE(
      new Request('http://localhost/api/admin/featured-tours', {
        method: 'DELETE',
        body: JSON.stringify({ token: 'ok', slug: 'autumn-special-2026' }),
      })
    );
    expect(okRes.status).toBe(200);

    const missRes = await DELETE(
      new Request('http://localhost/api/admin/featured-tours?slug=missing&token=ok', {
        method: 'DELETE',
      })
    );
    expect(missRes.status).toBe(404);
  });
});

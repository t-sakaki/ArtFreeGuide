import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { get, put, locateHotspots } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), locateHotspots: vi.fn() }));
vi.mock('@/lib/guideStore', () => ({ getGuideStore: () => ({ name: 'test', get, put }) }));
vi.mock('@/lib/hotspotVision', () => ({ locateHotspots }));
vi.mock('@/lib/hotspots', () => ({ cleanGuideHotspots: (value: unknown) => Array.isArray(value) ? value : [] }));
vi.mock('@/lib/i18n', () => ({ DEFAULT_LOCALE: 'ja', isLocale: () => true }));
import { POST } from './route';

const imageUrl = 'https://example.org/olympia.jpg';
const point = { label: '黒猫', detail: '右端の黒猫', keywords: ['猫'] };
const mark = { ...point, x: 0.9, y: 0.7, zoom: 2.2 };
const now = 1_800_000_000_000;
const request = (image = imageUrl) => new Request('http://localhost/api/hotspots', {
  method: 'POST', body: JSON.stringify({ title: 'オランピア', artist: 'マネ', locale: 'ja', imageUrl: image })
});
const cache = (extra: Record<string, unknown> = {}) => get.mockResolvedValue({ payload: JSON.stringify({ hotspots: [point], ...extra }) });
const saved = () => JSON.parse(put.mock.calls.at(-1)![2]);
const memory = (extra: Record<string, unknown> = {}) => ({
  version: 2, status: 'retry_wait', imageUrl, attempts: 1, attemptedAt: now - 10_000,
  nextRetryAt: now + 50_000, requestedCount: 1, placedCount: 0, ...extra
});
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now);
  locateHotspots.mockResolvedValue([mark]);
});
afterEach(() => vi.useRealTimers());

describe('hotspot placement recovery harness', () => {
  it('reuses valid legacy marks without another vision request', async () => {
    cache({ hotspotMarks: [mark] });
    expect((await (await POST(request())).json()).marks).toEqual([mark]);
    expect(locateHotspots).not.toHaveBeenCalled();
  });
  it('recovers a legacy permanently empty cache and remembers the successful placement', async () => {
    cache({ hotspotMarks: [] });
    expect((await (await POST(request())).json()).marks).toEqual([mark]);
    expect(locateHotspots).toHaveBeenCalledWith(imageUrl, [point], expect.any(Function));
    expect(saved().hotspotPlacement).toMatchObject({ status: 'ready', imageUrl, attempts: 1, nextRetryAt: 0, placedCount: 1 });
  });
  it('records failure, waits, then verifies and remembers recovery', async () => {
    cache({ hotspotMarks: [] });
    locateHotspots.mockResolvedValueOnce([]);
    await POST(request());
    const failure = saved();
    expect(failure.hotspotPlacement).toMatchObject({ status: 'retry_wait', attempts: 1, nextRetryAt: now + 60_000, placedCount: 0, failure: { phase: 'coordinates', code: 'no_valid_points' } });
    cache(failure);
    await POST(request());
    expect(locateHotspots).toHaveBeenCalledTimes(1);
    vi.setSystemTime(now + 60_001);
    await POST(request());
    expect(locateHotspots).toHaveBeenCalledTimes(2);
    expect(saved().hotspotPlacement).toMatchObject({ status: 'ready', attempts: 2, nextRetryAt: 0 });
  });
  it('backs off repeated failures with a one-hour ceiling', async () => {
    cache({ hotspotMarks: [], hotspotPlacement: memory({ attempts: 2, nextRetryAt: now - 1 }) });
    locateHotspots.mockResolvedValue([]);
    await POST(request());
    expect(saved().hotspotPlacement.nextRetryAt).toBe(now + 240_000);
    cache({ hotspotMarks: [], hotspotPlacement: memory({ attempts: 100, nextRetryAt: now - 1 }) });
    await POST(request());
    expect(saved().hotspotPlacement.nextRetryAt).toBe(now + 3_600_000);
  });
  it('rechecks coordinates when the source image changes', async () => {
    cache({ hotspotMarks: [mark], hotspotPlacement: memory({ status: 'ready', nextRetryAt: 0 }) });
    await POST(request('https://example.org/new-olympia.jpg'));
    expect(locateHotspots).toHaveBeenCalledTimes(1);
    expect(saved().hotspotPlacement.attempts).toBe(1);
  });
  it('rejects invalid or unrelated coordinates rather than promoting them to ready', async () => {
    cache();
    locateHotspots.mockResolvedValue([{ ...mark, x: 2 }, { ...mark, label: '別の作品' }]);
    expect((await (await POST(request())).json()).marks).toEqual([]);
    expect(saved().hotspotPlacement.status).toBe('retry_wait');
  });
});

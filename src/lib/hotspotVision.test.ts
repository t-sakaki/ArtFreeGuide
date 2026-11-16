import { afterEach, describe, it, expect, vi } from 'vitest';
const { askVisionJson } = vi.hoisted(() => ({ askVisionJson: vi.fn() }));
vi.mock('./visionModel', () => ({ askVisionJson }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });
import { placePoints, locateHotspots } from './hotspotVision';
import { GuideHotspot } from './hotspots';

const points: GuideHotspot[] = [
  { label: '砕ける波頭', detail: '白い鉤爪のように舟へ伸びる波頭。', keywords: ['波'] },
  { label: '小さな富士山', detail: '波の谷間に小さく座る富士。', keywords: ['富士'] },
  { label: '押送船', detail: '身をかがめた漕ぎ手たち。', keywords: ['舟'] },
];

describe('placePoints', () => {
  it('keeps placed points in list order with a gentle zoom', () => {
    const marks = placePoints(points, [
      { n: 3, x: 0.17, y: 0.66 },
      { n: 1, x: 0.36, y: 0.2 },
    ]);
    expect(marks.map(m => m.label)).toEqual(['砕ける波頭', '押送船']);
    expect(marks[0]).toMatchObject({ x: 0.36, y: 0.2, zoom: 2.2 });
  });

  it('drops out-of-range, unknown-number, malformed and duplicate rows', () => {
    const marks = placePoints(points, [
      { n: 2, x: 1.4, y: 0.5 }, // x out of range
      { n: 9, x: 0.5, y: 0.5 }, // no such point
      { n: 1, x: 0.4, y: 0.4 },
      { n: 1, x: 0.9, y: 0.9 }, // duplicate ignored
      'nope',
    ]);
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ label: '砕ける波頭', x: 0.4, y: 0.4 });
  });

  it('returns an empty array when the model gave nothing usable', () => {
    expect(placePoints(points, undefined)).toEqual([]);
    expect(placePoints(points, [])).toEqual([]);
  });
});

describe('placement failure evidence', () => {
  it('records an HTTP image failure without calling the vision provider', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })));
    const report = vi.fn();
    expect(await locateHotspots('https://example.org/image.jpg', points, report)).toEqual([]);
    expect(report).toHaveBeenCalledWith({ phase: 'image', code: 'http_403' });
    expect(askVisionJson).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith('https://example.org/image.jpg', expect.objectContaining({
      headers: { 'User-Agent': expect.stringContaining('ArtFreeGuide/') }
    }));
  });
  it('records invalid model coordinates as a separate failure phase', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })));
    askVisionJson.mockResolvedValue({ points: [] });
    const report = vi.fn();
    expect(await locateHotspots('https://example.org/image.jpg', points, report)).toEqual([]);
    expect(report).toHaveBeenCalledWith({ phase: 'coordinates', code: 'no_valid_points' });
  });
});

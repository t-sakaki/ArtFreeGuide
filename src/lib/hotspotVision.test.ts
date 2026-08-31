import { describe, it, expect } from 'vitest';
import { placePoints } from './hotspotVision';
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

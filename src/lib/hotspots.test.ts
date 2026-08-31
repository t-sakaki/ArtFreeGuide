import { describe, it, expect } from 'vitest';
import { cleanGuideHotspots, matchGuideHotspot } from './hotspots';

describe('cleanGuideHotspots', () => {
  it('keeps well-formed points and trims them', () => {
    const points = cleanGuideHotspots([
      { label: '  砕ける波頭  ', detail: '  白い鉤爪のように舟へ伸びる波頭。  ', keywords: [' 波 ', '波頭', ''] },
    ]);
    expect(points).toEqual([
      { label: '砕ける波頭', detail: '白い鉤爪のように舟へ伸びる波頭。', keywords: ['波', '波頭'] },
    ]);
  });

  it('drops half-filled, over-long and duplicate entries', () => {
    const points = cleanGuideHotspots([
      { label: 'ok', detail: 'short' }, // detail too short
      { label: '', detail: 'a valid looking detail sentence' }, // no label
      { label: '光', detail: '十分に長い説明の文章です。' },
      { label: '光', detail: '同じラベルなので重複として除外されます。' },
      'not an object',
    ]);
    expect(points).toEqual([{ label: '光', detail: '十分に長い説明の文章です。', keywords: [] }]);
  });

  it('returns an empty array for non-arrays', () => {
    expect(cleanGuideHotspots(undefined)).toEqual([]);
    expect(cleanGuideHotspots(null)).toEqual([]);
    expect(cleanGuideHotspots('[]')).toEqual([]);
  });
});

describe('matchGuideHotspot', () => {
  const points = cleanGuideHotspots([
    { label: '渦巻く夜空', detail: '空を横切る大きな渦。', keywords: ['渦', '夜空'] },
    { label: '糸杉', detail: '黒い炎のような木。', keywords: ['糸杉', '木'] },
  ]);

  it('returns the index of the earliest keyword hit', () => {
    expect(matchGuideHotspot(points, 'ここで糸杉が画面を貫き、その奥に夜空が広がる')).toBe(1);
  });

  it('returns -1 when nothing matches', () => {
    expect(matchGuideHotspot(points, '署名について')).toBe(-1);
    expect(matchGuideHotspot([], 'いくらでも')).toBe(-1);
  });
});

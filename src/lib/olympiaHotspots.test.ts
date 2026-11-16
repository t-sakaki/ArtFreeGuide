import { describe, expect, it } from 'vitest';
import { findHotspotSet, localizeHotspotSet } from './hotspots';
import { artworkViewport } from './artworkViewport';

// Regions inspected on Edouard Manet - Olympia - Google Art Project 3.jpg,
// 960 x 654. These bounds reject the actual model's cat=(.5,.35), ribbon=(.25,.75).
const regions = {
  gaze: { left: 190, top: 145, right: 280, bottom: 230 },
  cat: { left: 865, top: 345, right: 955, bottom: 490 },
  bouquet: { left: 540, top: 220, right: 720, bottom: 360 },
  ribbon: { left: 215, top: 225, right: 290, bottom: 275 },
};
describe('Olympia reference hotspots', () => {
  it('pins the complete reference image and places all four details inside measured regions', () => {
    const set = findHotspotSet('オランピア', 'エドゥアール・マネ')!;
    expect(set.file).toBe('Edouard Manet - Olympia - Google Art Project 3.jpg');
    expect(set.hotspots).toHaveLength(4);
    for (const [id, region] of Object.entries(regions)) {
      const point = set.hotspots.find(point => point.id === id)!;
      expect(point.x * 960).toBeGreaterThanOrEqual(region.left);
      expect(point.x * 960).toBeLessThanOrEqual(region.right);
      expect(point.y * 654).toBeGreaterThanOrEqual(region.top);
      expect(point.y * 654).toBeLessThanOrEqual(region.bottom);
    }
    expect(findHotspotSet('Olympia', '')?.title).toBe('オランピア');
  });
  it('keeps the measured details visible when focusing on mobile and desktop stages', () => {
    const set = findHotspotSet('オランピア', 'エドゥアール・マネ')!;
    for (const [cw, ch] of [[360, 220], [1024, 360], [390, 700]]) {
      const fit = Math.min(cw / 960, ch / 654);
      const width = 960 * fit, height = 654 * fit;
      const frame = { left: (cw - width) / 2, top: (ch - height) / 2, width, height };
      for (const point of set.hotspots) {
        const view = artworkViewport(frame, point);
        const left = frame.left + width * (1 - view.zoom) / 2 + width * view.zoom * view.x / 100;
        const top = frame.top + height * (1 - view.zoom) / 2 + height * view.zoom * view.y / 100;
        expect(left + width * view.zoom * point.x).toBeGreaterThanOrEqual(0);
        expect(left + width * view.zoom * point.x).toBeLessThanOrEqual(cw);
        expect(top + height * view.zoom * point.y).toBeGreaterThanOrEqual(0);
        expect(top + height * view.zoom * point.y).toBeLessThanOrEqual(ch);
      }
    }
  });
  it.each(['en', 'fr', 'zh', 'es'] as const)('localizes all points in %s without moving their coordinates', locale => {
    const set = findHotspotSet('オランピア', 'エドゥアール・マネ')!;
    const localized = localizeHotspotSet(set, locale);
    localized.hotspots.forEach((point, index) => {
      expect(point.label).not.toBe(set.hotspots[index].label);
      expect(point.detail).not.toBe(set.hotspots[index].detail);
      expect([point.x, point.y, point.zoom]).toEqual([set.hotspots[index].x, set.hotspots[index].y, set.hotspots[index].zoom]);
    });
  });
});

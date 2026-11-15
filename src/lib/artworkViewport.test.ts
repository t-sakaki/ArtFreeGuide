import { describe, expect, it } from 'vitest';
import { artworkViewport } from './artworkViewport';

// Match ArtworkStage's object-contain measurement, including letterboxing.
function frameFor(cw: number, ch: number, iw: number, ih: number) {
  const fit = Math.min(cw / iw, ch / ih);
  const width = iw * fit, height = ih * fit;
  return { left: (cw - width) / 2, top: (ch - height) / 2, width, height };
}

function bounds(frame: ReturnType<typeof frameFor>, focus: { x: number; y: number; zoom: number }) {
  const view = artworkViewport(frame, focus);
  const left = frame.left + frame.width * (1 - view.zoom) / 2 + frame.width * view.zoom * view.x / 100;
  const top = frame.top + frame.height * (1 - view.zoom) / 2 + frame.height * view.zoom * view.y / 100;
  return { left, top, right: left + frame.width * view.zoom, bottom: top + frame.height * view.zoom, view };
}

describe('hotspot stage coverage', () => {
  it('keeps the wave inscription (issue #44) against the stage edge without black gaps', () => {
    const frame = frameFor(400, 500, 1500, 1000);
    const result = bounds(frame, { x: 0.07, y: 0.11, zoom: 3.2 });
    expect(result.view.zoom).toBe(3.2);
    expect(result.left).toBeCloseTo(0);
    expect(result.top).toBeCloseTo(0);
    expect(result.right).toBeGreaterThanOrEqual(400);
    expect(result.bottom).toBeGreaterThanOrEqual(500);
  });

  it.each([
    [400, 500, 1500, 1000], [1000, 400, 800, 1600],
    [400, 400, 400, 400], [300, 900, 1800, 300],
  ])('covers a %sx%s stage for a %sx%s image at every corner', (cw, ch, iw, ih) => {
    const frame = frameFor(cw, ch, iw, ih);
    for (const x of [0, 0.07, 0.5, 0.93, 1]) {
      for (const y of [0, 0.11, 0.5, 0.89, 1]) {
        for (const zoom of [1, 1.5, 3.2, 5]) {
          const result = bounds(frame, { x, y, zoom });
          expect(result.left).toBeLessThanOrEqual(1e-8);
          expect(result.top).toBeLessThanOrEqual(1e-8);
          expect(result.right).toBeGreaterThanOrEqual(cw - 1e-8);
          expect(result.bottom).toBeGreaterThanOrEqual(ch - 1e-8);
        }
      }
    }
  });

  it('centres an interior hotspot when enough image remains on either side', () => {
    const frame = frameFor(600, 400, 1500, 1000);
    const result = bounds(frame, { x: 0.4, y: 0.6, zoom: 3.2 });
    expect(result.left + frame.width * 3.2 * 0.4).toBeCloseTo(300);
    expect(result.top + frame.height * 3.2 * 0.6).toBeCloseTo(200);
  });
});

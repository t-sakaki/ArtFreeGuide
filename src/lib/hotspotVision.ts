import { GuideHotspot, PlacedHotspot } from './hotspots';
import { askVisionJson } from './visionModel';

export type { PlacedHotspot };
export interface PlacementFailure {
  phase: 'image' | 'vision' | 'coordinates';
  code: string;
}
type ReportFailure = (failure: PlacementFailure) => void;

/**
 * Phase 2 of the "見どころ" feature: give the marker-less points from
 * {@link GuideHotspot} an approximate place on the canvas, so a work no one has
 * hand-measured can still show marks on the image.
 *
 * A small vision model cannot be trusted to the pixel, so the coordinates it
 * returns are treated as rough: the mark is a soft circle and the zoom is
 * capped low. Anything it cannot place is simply left off — the caller still
 * has the text list to fall back on.
 */

/** One JSON object with a short array; the model has no room to ramble. */
const MAX_TOKENS = 700;

/** Commons is asked for width=1024, which comfortably fits under this. */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

/** Rough placement, so the focus never punches in as hard as a curated point. */
const MAX_ZOOM = 2.2;

function clamp01(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return n;
}

/** Downloads the artwork and turns it into a data URL the model accepts. */
async function fetchImageAsDataUrl(imageUrl: string, report?: ReportFailure): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: { 'User-Agent': 'ArtFreeGuide/1.0 (+https://github.com/t-sakaki/ArtFreeGuide)' },
      signal: AbortSignal.timeout(10_000)
    });
    if (!res.ok) { report?.({ phase: 'image', code: "http_" + res.status }); return null; }
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!ACCEPTED_MIME.includes(type)) { report?.({ phase: 'image', code: 'unsupported_mime' }); return null; }
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) { report?.({ phase: 'image', code: 'invalid_image_size' }); return null; }
    const base64 = Buffer.from(buffer).toString('base64');
    return `data:${type};base64,${base64}`;
  } catch (error) {
    report?.({ phase: 'image', code: 'fetch_failed' });
    console.warn('Hotspot image fetch failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

function locatePrompt(points: GuideHotspot[]): string {
  const list = points.map((p, i) => `${i + 1}. ${p.label} — ${p.detail}`).join('\n');
  return [
    'You are shown one artwork. Below is a numbered list of details in it.',
    'For each numbered detail that is actually visible, give the centre of that',
    'detail as fractions of the image: x from 0 (left) to 1 (right), y from 0',
    '(top) to 1 (bottom). Omit any detail you cannot locate with confidence.',
    'Do not translate or rewrite the labels; answer with their numbers.',
    '',
    list,
    '',
    'Answer with one JSON object and nothing else:',
    '{"points": [{"n": number, "x": number, "y": number}]}'
  ].join('\n');
}

const askVision = (dataUrl: string, prompt: string): Promise<unknown> =>
  askVisionJson(dataUrl, prompt, { maxTokens: MAX_TOKENS });

/**
 * Places as many of `points` as the model can find on `imageUrl`.
 * Returns points in their original order, each carrying coordinates; a point
 * the model could not place is dropped. Never throws — an empty array means
 * "keep showing the list".
 */
export async function locateHotspots(
  imageUrl: string,
  points: GuideHotspot[],
  report?: ReportFailure
): Promise<PlacedHotspot[]> {
  if (points.length === 0) return [];

  const dataUrl = await fetchImageAsDataUrl(imageUrl, report);
  if (!dataUrl) return [];

  let parsed: unknown;
  try {
    parsed = await askVision(dataUrl, locatePrompt(points));
  } catch (error) {
    report?.({ phase: 'vision', code: 'provider_unavailable' });
    console.warn('locateHotspots gave up:', error instanceof Error ? error.message : error);
    return [];
  }

  const placed = placePoints(points, (parsed as { points?: unknown })?.points);
  if (placed.length === 0) report?.({ phase: 'coordinates', code: 'no_valid_points' });
  return placed;
}

/**
 * Folds the model's `{n, x, y}` rows back onto the point list: keeps original
 * order, drops anything unplaced or out of range, ignores a repeated number.
 * Exported for testing; `locateHotspots` is the real entry point.
 */
export function placePoints(points: GuideHotspot[], rows: unknown): PlacedHotspot[] {
  if (!Array.isArray(rows)) return [];

  const placed = new Map<number, { x: number; y: number }>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const n = Number((row as any).n);
    const x = clamp01((row as any).x);
    const y = clamp01((row as any).y);
    if (!Number.isInteger(n) || n < 1 || n > points.length || x === null || y === null) continue;
    if (!placed.has(n)) placed.set(n, { x, y });
  }

  return points
    .map((point, index) => {
      const at = placed.get(index + 1);
      return at ? { ...point, x: at.x, y: at.y, zoom: MAX_ZOOM } : null;
    })
    .filter((p): p is PlacedHotspot => p !== null);
}

import { NextResponse } from 'next/server';
import { getGuideStore } from '@/lib/guideStore';
import { cleanGuideHotspots } from '@/lib/hotspots';
import { locateHotspots, PlacedHotspot, PlacementFailure } from '@/lib/hotspotVision';
import { DEFAULT_LOCALE, Locale, isLocale } from '@/lib/i18n';

/**
 * Phase 2 of "見どころ": turns the marker-less list already archived with a
 * guide into points placed on the artwork, once per artwork, and folds the
 * result back into the guide payload. Failed placement is remembered with a
 * retry deadline, so a transient vision failure can recover on a later visit.
 *
 * The vision call is best-effort. Whenever it comes back empty the response is
 * still `{ marks: [] }` and the client keeps showing the text list.
 */

const PLACEMENT_VERSION = 2;
const INITIAL_RETRY_MS = 60_000;
const MAX_RETRY_MS = 60 * 60_000;

interface PlacementMemory {
  version: number;
  status: 'ready' | 'retry_wait';
  imageUrl: string;
  attempts: number;
  attemptedAt: number;
  nextRetryAt: number;
  requestedCount: number;
  placedCount: number;
  failure?: PlacementFailure;
}

interface GuidePayload {
  hotspotPlacement?: PlacementMemory;
  hotspots?: unknown;
  /** Written by this route: the located subset, in list order. */
  hotspotMarks?: PlacedHotspot[];
  [key: string]: unknown;
}

function sanitizeMarks(value: unknown): PlacedHotspot[] {
  if (!Array.isArray(value)) return [];
  const marks: PlacedHotspot[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const label = typeof r.label === 'string' ? r.label : '';
    const detail = typeof r.detail === 'string' ? r.detail : '';
    const x = typeof r.x === 'number' ? r.x : NaN;
    const y = typeof r.y === 'number' ? r.y : NaN;
    const zoom = typeof r.zoom === 'number' ? r.zoom : NaN;
    if (!label || !detail) continue;
    if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1 && zoom >= 1)) continue;
    const keywords = Array.isArray(r.keywords)
      ? r.keywords.filter((k): k is string => typeof k === 'string')
      : [];
    marks.push({ label, detail, keywords, x, y, zoom });
  }
  return marks;
}

export async function POST(req: Request) {
  try {
    const { title, artist, imageUrl, locale: rawLocale } = await req.json();
    const locale: Locale =
      typeof rawLocale === 'string' && isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ marks: [] });
    }

    const store = getGuideStore();
    const cached = await store.get(title, typeof artist === 'string' ? artist : '', locale);
    if (!cached) {
      // The guide was never archived, so there is no list to place yet.
      return NextResponse.json({ marks: [] });
    }

    let payload: GuidePayload;
    try {
      payload = JSON.parse(cached.payload) as GuidePayload;
    } catch {
      return NextResponse.json({ marks: [] });
    }

    const memory = payload.hotspotPlacement;
    const sameImage = memory?.version === PLACEMENT_VERSION && memory.imageUrl === imageUrl;
    const cachedMarks = sanitizeMarks(payload.hotspotMarks);
    // Successful legacy marks remain usable; new marks remember their source image.
    if (cachedMarks.length > 0 && (!memory || sameImage)) {
      return NextResponse.json({ marks: cachedMarks, cached: true });
    }
    // Empty legacy results have no retry deadline and must be allowed to recover.
    if (sameImage && Number.isFinite(memory.nextRetryAt) && memory.nextRetryAt > Date.now()) {
      return NextResponse.json({ marks: [], cached: true });
    }

    const points = cleanGuideHotspots(payload.hotspots);
    if (points.length === 0 || typeof imageUrl !== 'string' || !/^https?:\/\//.test(imageUrl)) {
      return NextResponse.json({ marks: [] });
    }

    const labels = new Set(points.map(point => point.label));
    let failure: PlacementFailure | undefined;
    const marks = sanitizeMarks(await locateHotspots(imageUrl, points, value => { failure = value; }))
      .filter(mark => labels.has(mark.label));
    const attempts = sameImage && Number.isInteger(memory.attempts) && memory.attempts >= 0
      ? Math.min(memory.attempts + 1, 1000)
      : 1;
    const attemptedAt = Date.now();
    const retryMs = Math.min(MAX_RETRY_MS, INITIAL_RETRY_MS * 2 ** Math.min(attempts - 1, 6));

    payload.hotspotMarks = marks;
    payload.hotspotPlacement = {
      version: PLACEMENT_VERSION,
      status: marks.length ? 'ready' : 'retry_wait',
      imageUrl,
      attempts,
      attemptedAt,
      nextRetryAt: marks.length ? 0 : attemptedAt + retryMs,
      requestedCount: points.length,
      placedCount: marks.length,
      failure: marks.length ? undefined : failure ?? { phase: 'coordinates', code: 'no_valid_points' },
    };
    try {
      await store.put(title, typeof artist === 'string' ? artist : '', JSON.stringify(payload), locale);
    } catch (error) {
      console.warn('Hotspot marks cache write failed:', error);
    }

    return NextResponse.json({ marks, store: store.name });
  } catch (error: any) {
    console.error('Hotspots API Route Error:', error);
    return NextResponse.json({ marks: [] });
  }
}

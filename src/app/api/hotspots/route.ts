import { NextResponse } from 'next/server';
import { getGuideStore } from '@/lib/guideStore';
import { cleanGuideHotspots } from '@/lib/hotspots';
import { locateHotspots, PlacedHotspot } from '@/lib/hotspotVision';
import { DEFAULT_LOCALE, Locale, isLocale } from '@/lib/i18n';

/**
 * Phase 2 of "見どころ": turns the marker-less list already archived with a
 * guide into points placed on the artwork, once per artwork, and folds the
 * result back into the guide payload so the next visitor pays nothing.
 *
 * The vision call is best-effort. Whenever it comes back empty the response is
 * still `{ marks: [] }` and the client keeps showing the text list.
 */

interface GuidePayload {
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

    // Already resolved for this artwork — hand back what we stored.
    if (Array.isArray(payload.hotspotMarks)) {
      return NextResponse.json({ marks: sanitizeMarks(payload.hotspotMarks), cached: true });
    }

    const points = cleanGuideHotspots(payload.hotspots);
    if (points.length === 0 || typeof imageUrl !== 'string' || !/^https?:\/\//.test(imageUrl)) {
      return NextResponse.json({ marks: [] });
    }

    const marks = await locateHotspots(imageUrl, points);

    // Store even an empty result: it records "we tried" and stops every later
    // visitor from spending another vision call on the same picture.
    payload.hotspotMarks = marks;
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

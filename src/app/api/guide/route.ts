import { NextResponse } from 'next/server';
import { getGuideStore } from '@/lib/guideStore';
import { DEFAULT_LOCALE, Locale, isLocale } from '@/lib/i18n';

/**
 * A read-only peek at the archive, used by the client to check whether a guide
 * it already has cached (in memory, or from localStorage) still matches what
 * was last approved — never to generate one.
 *
 * `/api/chat` also reads the archive, but a miss there falls through to an LLM
 * call that overwrites it; this route must never do that, since it runs
 * silently in the background while a visitor may already be looking at a
 * cached copy of exactly this guide.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const title = params.get('title')?.trim();
  const artist = params.get('artist')?.trim() ?? '';
  const rawLocale = params.get('locale') ?? '';
  const locale: Locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  try {
    const cached = await getGuideStore().get(title, artist, locale);
    if (!cached) {
      return NextResponse.json({ cached: false });
    }
    return NextResponse.json({ cached: true, text: cached.payload, updatedAt: cached.updatedAt });
  } catch (error: any) {
    console.error('Guide archive lookup failed:', error);
    return NextResponse.json({ error: error?.message ?? 'Internal Server Error' }, { status: 500 });
  }
}

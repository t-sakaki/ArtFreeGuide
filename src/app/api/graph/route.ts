import { NextResponse } from 'next/server';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/lib/i18n';
import {
  findArtworkPathTour,
  getArtworkNeighborhood,
  listGraphArtworks,
} from '@/lib/graph/queries';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const title = searchParams.get('title')?.trim() ?? '';
    const artist = searchParams.get('artist')?.trim() ?? '';
    const rawLocale = searchParams.get('locale') ?? DEFAULT_LOCALE;
    const locale: Locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

    const artworks = listGraphArtworks();
    if (!title) {
      return NextResponse.json({ graph: null, artworks });
    }

    const graph = await getArtworkNeighborhood(title, artist || undefined, locale);
    return NextResponse.json({ graph, artworks });
  } catch (error) {
    console.error('Graph GET API Error:', error);
    return NextResponse.json({ error: 'Failed to load art graph' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rawLocale = body?.locale;
    const locale: Locale =
      typeof rawLocale === 'string' && isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

    if (body?.mode === 'path') {
      const fromTitle = typeof body.fromTitle === 'string' ? body.fromTitle.trim() : '';
      const toTitle = typeof body.toTitle === 'string' ? body.toTitle.trim() : '';
      if (!fromTitle || !toTitle) {
        return NextResponse.json(
          { error: 'fromTitle and toTitle are required' },
          { status: 400 }
        );
      }

      const tour = await findArtworkPathTour(fromTitle, toTitle, locale);
      if (!tour) {
        return NextResponse.json({ tour: null, reason: 'path_not_found' });
      }
      return NextResponse.json({ tour });
    }

    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const artist = typeof body?.artist === 'string' ? body.artist.trim() : '';
    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const graph = await getArtworkNeighborhood(title, artist || undefined, locale);
    return NextResponse.json({ graph, artworks: listGraphArtworks() });
  } catch (error) {
    console.error('Graph POST API Error:', error);
    return NextResponse.json({ error: 'Failed to query art graph' }, { status: 500 });
  }
}

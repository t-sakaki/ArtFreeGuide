import { NextResponse } from 'next/server';
import { searchArtworks } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || undefined;
    const artist = searchParams.get('artist') || undefined;
    const title = searchParams.get('title') || undefined;

    const result = await searchArtworks({ search, artist, title });

    return NextResponse.json(
      {
        artworks: result.artworks,
        total: result.total,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[API] Error in GET /api/artworks:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { getCachedPublishedFeaturedTours } from '@/lib/featuredTours';

/** Public list of currently active, published dynamic featured tours. */
export async function GET() {
  try {
    const tours = await getCachedPublishedFeaturedTours();
    return NextResponse.json(
      { tours },
      { headers: { 'Cache-Control': 'public, max-age=60' } }
    );
  } catch (error: any) {
    console.error('Featured tours API Error:', error);
    return NextResponse.json({ tours: [] }, { status: 200 });
  }
}

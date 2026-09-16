import { NextResponse } from 'next/server';
import { heartCounts, identityKey } from '@/lib/popularity';

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const title = params.get('title')?.trim();
  // Defaults to '' for a caller that hasn't been redeployed with the artist
  // param yet, but two different artists' same-titled works must not merge.
  const artist = (params.get('artist') ?? '').trim();
  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  try {
    const counts = await heartCounts([{ title, artist }]);
    return NextResponse.json({ hearts: counts.get(identityKey(title, artist)) ?? 0 });
  } catch (error: any) {
    console.error('Heart count API error:', error);
    return NextResponse.json(
      { error: error?.message ?? 'Internal Server Error' },
      { status: 500 }
    );
  }
}

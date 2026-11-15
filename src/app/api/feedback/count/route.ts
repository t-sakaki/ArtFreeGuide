import { NextResponse } from 'next/server';
import { heartCounts } from '@/lib/popularity';

export async function GET(req: Request) {
  const title = new URL(req.url).searchParams.get('title')?.trim();
  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  try {
    const counts = await heartCounts([title]);
    return NextResponse.json({ hearts: counts.get(title) ?? 0 });
  } catch (error: any) {
    console.error('Heart count API error:', error);
    return NextResponse.json(
      { error: error?.message ?? 'Internal Server Error' },
      { status: 500 }
    );
  }
}

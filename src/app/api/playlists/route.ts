import { NextResponse } from 'next/server';
import { getAllPlaylists } from '@/lib/db';

export async function GET() {
  try {
    const playlists = await getAllPlaylists();
    return NextResponse.json({ playlists });
  } catch (error) {
    console.error('[API/playlists] Error fetching playlists:', error);
    return NextResponse.json({ playlists: [], error: 'Failed to fetch playlists' }, { status: 500 });
  }
}

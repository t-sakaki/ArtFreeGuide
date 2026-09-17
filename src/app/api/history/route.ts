import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { findOrCreateArtwork } from '@/lib/artworks';
import { updatePreference } from '@/lib/preference';

/**
 * Records a finished (or abandoned) listen and lets it shape the user's taste
 * vector. Artworks that are not in the catalogue yet are added on the fly so
 * that future recommendations can use them.
 */
export async function POST(req: Request) {
  try {
    const {
      userId,
      title,
      artist,
      description,
      imageUrl,
      depth,
      listenedSeconds,
      completed,
      segmentIndex,
      segmentCount
    } = await req.json();

    if (!userId || !title) {
      return NextResponse.json({ error: 'userId and title are required' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const artwork = await findOrCreateArtwork(supabase, {
      title,
      artist: artist || '不明',
      description,
      imageUrl
    });

    // Which sentence the visitor reached, not only how long they listened —
    // lets a drop-off point in the guide be found without a complaint.
    const hasSegments = Number.isFinite(segmentCount) && segmentCount > 0;
    const { error } = await supabase.from('viewing_history').insert({
      user_id: userId,
      artwork_id: artwork?.id ?? null,
      artwork_query: `${title} ${artist ?? ''}`.trim(),
      depth: depth ?? 'standard',
      listened_seconds: Math.max(0, Math.round(listenedSeconds ?? 0)),
      completed: Boolean(completed),
      segment_index: hasSegments ? Math.max(0, Math.round(segmentIndex ?? 0)) : null,
      segment_count: hasSegments ? Math.round(segmentCount) : null
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (artwork) {
      await updatePreference(supabase, userId, artwork, listenedSeconds ?? 0);
    }

    return NextResponse.json({ ok: true, artworkId: artwork?.id ?? null });
  } catch (error: any) {
    console.error('History API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

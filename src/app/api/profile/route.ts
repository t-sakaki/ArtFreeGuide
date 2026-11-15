import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { PROFILE_EMBEDDING_COLUMN } from '@/lib/embeddings';

const RECENT_LIMIT = 5;

/**
 * The visitor's taste profile: how many guides they have heard, the tags the
 * preference vector has picked up, and what they listened to most recently.
 * Shown so the personalisation is visible instead of invisible machinery.
 */
export async function GET(req: Request) {
  try {
    const userId = new URL(req.url).searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select(`preference_embedding:${PROFILE_EMBEDDING_COLUMN}, favorite_tags, view_count`)
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!profile) {
      return NextResponse.json({ viewCount: 0, favoriteTags: [], recent: [], hasTaste: false });
    }

    const { data: history } = await supabase
      .from('viewing_history')
      .select('artwork_query, viewed_at')
      .eq('user_id', userId)
      .order('viewed_at', { ascending: false })
      .limit(RECENT_LIMIT);

    return NextResponse.json({
      viewCount: profile.view_count ?? 0,
      favoriteTags: profile.favorite_tags ?? [],
      recent: (history ?? []).map(row => row.artwork_query).filter(Boolean),
      hasTaste: Boolean(profile.preference_embedding)
    });
  } catch (error: any) {
    console.error('Profile API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { parseEmbedding } from '@/lib/artworks';
import { rankByPopularity } from '@/lib/popularity';
import {
  ARTWORK_EMBEDDING_COLUMN,
  MATCH_FUNCTION,
  MATCH_THRESHOLD,
  PROFILE_EMBEDDING_COLUMN
} from '@/lib/embeddings';

const MATCH_COUNT = 6;
const HEARD_LIMIT = 50;
/** Extra neighbours to fetch, so plays and hearts have something to reorder. */
const POPULARITY_POOL = 12;
// Recommendations lean on the artwork the visitor is looking at, nudged by taste.
const ARTWORK_WEIGHT = 0.6;

interface ArtworkRow {
  id: string;
  title: string;
  artist: string;
  embedding: number[] | string | null;
}

async function preferenceEmbedding(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string
): Promise<number[] | null> {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select(`preference_embedding:${PROFILE_EMBEDDING_COLUMN}`)
    .eq('id', userId)
    .maybeSingle();

  return parseEmbedding(profile?.preference_embedding ?? null);
}

export async function POST(req: Request) {
  try {
    const { artworkId, title, artist, userId } = await req.json();

    const supabase = createServiceClient();

    // Taste-only mode: no artwork in context (the landing hub), so the visitor's
    // own preference vector is the query.
    if (!artworkId && !title) {
      if (!userId) {
        return NextResponse.json({ error: 'artworkId, title or userId is required' }, { status: 400 });
      }

      const preference = await preferenceEmbedding(supabase, userId);
      if (!preference) {
        return NextResponse.json({ recommendations: [], basis: 'none' });
      }

      const { data: tasteMatches, error: tasteError } = await supabase.rpc(MATCH_FUNCTION, {
        query_embedding: preference,
        match_threshold: MATCH_THRESHOLD,
        // Over-fetch: everything already heard is filtered out below.
        match_count: MATCH_COUNT + HEARD_LIMIT + POPULARITY_POOL
      });

      if (tasteError) {
        console.error(`${MATCH_FUNCTION} error:`, tasteError);
        return NextResponse.json({ recommendations: [], basis: 'none' });
      }

      // "What to hear next", so drop what this visitor already listened to.
      const { data: heard } = await supabase
        .from('viewing_history')
        .select('artwork_id')
        .eq('user_id', userId)
        .not('artwork_id', 'is', null)
        .order('viewed_at', { ascending: false })
        .limit(HEARD_LIMIT);

      const heardIds = new Set((heard ?? []).map(row => row.artwork_id));
      const fresh = (tasteMatches ?? [])
        .filter((match: { id: string }) => !heardIds.has(match.id))
        .slice(0, MATCH_COUNT + POPULARITY_POOL);

      return NextResponse.json({
        recommendations: await rankByPopularity(supabase, fresh, MATCH_COUNT),
        basis: 'taste'
      });
    }

    let query = supabase
      .from('artworks')
      .select(`id, title, artist, embedding:${ARTWORK_EMBEDDING_COLUMN}`)
      .limit(1);
    query = artworkId ? query.eq('id', artworkId) : query.eq('title', title);
    if (!artworkId && artist) {
      query = query.eq('artist', artist);
    }

    const { data: rows, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const artwork = rows?.[0] as ArtworkRow | undefined;
    if (!artwork) {
      return NextResponse.json({ recommendations: [], basis: 'none', reason: 'artwork_not_found' });
    }

    let queryEmbedding = parseEmbedding(artwork.embedding);
    if (!queryEmbedding) {
      return NextResponse.json({ recommendations: [], basis: 'none', reason: 'embedding_missing' });
    }

    let basis: 'artwork' | 'blend' = 'artwork';

    if (userId) {
      const preference = await preferenceEmbedding(supabase, userId);
      if (preference && preference.length === queryEmbedding.length) {
        queryEmbedding = queryEmbedding.map(
          (value, index) => value * ARTWORK_WEIGHT + preference[index] * (1 - ARTWORK_WEIGHT)
        );
        basis = 'blend';
      }
    }

    const { data: matches, error: matchError } = await supabase.rpc(MATCH_FUNCTION, {
      query_embedding: queryEmbedding,
      match_threshold: MATCH_THRESHOLD,
      match_count: MATCH_COUNT + POPULARITY_POOL
    });

    if (matchError) {
      console.error(`${MATCH_FUNCTION} error:`, matchError);
      return NextResponse.json({ recommendations: [], basis: 'none' });
    }

    const neighbours = (matches ?? []).filter((match: { id: string }) => match.id !== artwork.id);
    const recommendations = await rankByPopularity(supabase, neighbours, MATCH_COUNT);

    return NextResponse.json({ artworkId: artwork.id, recommendations, basis });
  } catch (error: any) {
    console.error('Recommendations API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

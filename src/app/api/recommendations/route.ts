import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

const MATCH_THRESHOLD = 0.5;
const MATCH_COUNT = 6;
// Recommendations lean on the artwork the visitor is looking at, nudged by taste.
const ARTWORK_WEIGHT = 0.6;

interface ArtworkRow {
  id: string;
  title: string;
  artist: string;
  embedding: number[] | string | null;
}

function parseEmbedding(embedding: ArtworkRow['embedding']): number[] | null {
  if (!embedding) return null;
  // PostgREST returns `vector` columns as a JSON-encoded string.
  const parsed = typeof embedding === 'string' ? JSON.parse(embedding) : embedding;
  return Array.isArray(parsed) ? parsed : null;
}

export async function POST(req: Request) {
  try {
    const { artworkId, title, artist, userId } = await req.json();

    if (!artworkId && !title) {
      return NextResponse.json({ error: 'artworkId or title is required' }, { status: 400 });
    }

    const supabase = createServiceClient();
    let query = supabase.from('artworks').select('id, title, artist, embedding').limit(1);
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
      return NextResponse.json({ recommendations: [], reason: 'artwork_not_found' });
    }

    let queryEmbedding = parseEmbedding(artwork.embedding);
    if (!queryEmbedding) {
      return NextResponse.json({ recommendations: [], reason: 'embedding_missing' });
    }

    if (userId) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('preference_embedding')
        .eq('id', userId)
        .maybeSingle();

      const preference = parseEmbedding(profile?.preference_embedding ?? null);
      if (preference && preference.length === queryEmbedding.length) {
        queryEmbedding = queryEmbedding.map(
          (value, index) => value * ARTWORK_WEIGHT + preference[index] * (1 - ARTWORK_WEIGHT)
        );
      }
    }

    const { data: matches, error: matchError } = await supabase.rpc('match_artworks', {
      query_embedding: queryEmbedding,
      match_threshold: MATCH_THRESHOLD,
      match_count: MATCH_COUNT
    });

    if (matchError) {
      console.error('match_artworks error:', matchError);
      return NextResponse.json({ recommendations: [] });
    }

    const recommendations = (matches ?? []).filter((match: { id: string }) => match.id !== artwork.id);

    return NextResponse.json({ artworkId: artwork.id, recommendations });
  } catch (error: any) {
    console.error('Recommendations API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

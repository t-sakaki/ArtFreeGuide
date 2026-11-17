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
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/lib/i18n';
import { getGraphRecommendations } from '@/lib/graph/queries';
import type { GraphRecommendation } from '@/lib/graph/types';

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

interface RecommendationCandidate {
  id: string;
  title: string;
  artist: string;
  year?: string | null;
  description?: string | null;
  image_url?: string | null;
  similarity: number;
  plays?: number;
  hearts?: number;
  relationType?: string;
  relationLabel?: string;
  graphReason?: string;
  graphSource?: 'neo4j' | 'snapshot';
}

function mergeGraphRecommendations(
  vectorItems: RecommendationCandidate[],
  graphItems: GraphRecommendation[],
  limit: number
): RecommendationCandidate[] {
  if (graphItems.length === 0) return vectorItems.slice(0, limit);

  const byTitle = new Map<string, GraphRecommendation>();
  for (const item of graphItems) {
    byTitle.set(item.title.trim().toLowerCase(), item);
  }

  const merged: RecommendationCandidate[] = [];
  const seen = new Set<string>();

  for (const vec of vectorItems) {
    const key = vec.title.trim().toLowerCase();
    seen.add(key);
    const graphMatch = byTitle.get(key);
    merged.push(
      graphMatch
        ? {
            ...vec,
            similarity: Math.min(0.99, Math.max(vec.similarity, graphMatch.score)),
            relationType: graphMatch.relationType,
            relationLabel: graphMatch.relationLabel,
            graphReason: graphMatch.reason,
            graphSource: graphMatch.source,
          }
        : vec
    );
  }

  // Interleave top graph connections (especially cross-movement links like Hokusai <-> Monet)
  // that vector embeddings alone may rank lower or lack in Supabase.
  const graphOnly: RecommendationCandidate[] = [];
  for (const item of graphItems) {
    const key = item.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    graphOnly.push({
      id: `graph:${item.key}`,
      title: item.title,
      artist: item.artist,
      year: item.year,
      description: item.description,
      image_url: null,
      similarity: item.score,
      relationType: item.relationType,
      relationLabel: item.relationLabel,
      graphReason: item.reason,
      graphSource: item.source,
    });
  }

  const combined: RecommendationCandidate[] = [];
  const maxGraphSlots = merged.length === 0 ? limit : Math.min(3, graphOnly.length);
  for (let i = 0; i < maxGraphSlots; i++) {
    combined.push(graphOnly[i]);
  }
  for (const item of merged) {
    if (combined.length >= limit) break;
    combined.push(item);
  }
  for (let i = maxGraphSlots; i < graphOnly.length && combined.length < limit; i++) {
    combined.push(graphOnly[i]);
  }

  return combined.slice(0, limit);
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
    const { artworkId, title, artist, userId, locale: rawLocale } = await req.json();
    const locale: Locale =
      typeof rawLocale === 'string' && isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

    let supabase: ReturnType<typeof createServiceClient> | null = null;
    try {
      supabase = createServiceClient();
    } catch {
      supabase = null;
    }

    // Taste-only mode: no artwork in context (the landing hub), so the visitor's
    // own preference vector is the query.
    if (!artworkId && !title) {
      if (!userId) {
        return NextResponse.json({ error: 'artworkId, title or userId is required' }, { status: 400 });
      }
      if (!supabase) {
        return NextResponse.json({ recommendations: [], basis: 'none' });
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

    const graphPromise =
      typeof title === 'string' && title.trim()
        ? getGraphRecommendations(title, typeof artist === 'string' ? artist : undefined, MATCH_COUNT, locale)
        : Promise.resolve({ recommendations: [], source: 'snapshot' as const });

    let vectorRecommendations: RecommendationCandidate[] = [];
    let resolvedArtworkId: string | undefined = typeof artworkId === 'string' ? artworkId : undefined;
    let basis: 'artwork' | 'blend' | 'graph' | 'none' = 'none';

    if (supabase) {
      try {
        let query = supabase
          .from('artworks')
          .select(`id, title, artist, embedding:${ARTWORK_EMBEDDING_COLUMN}`)
          .limit(1);
        query = artworkId ? query.eq('id', artworkId) : query.eq('title', title);
        if (!artworkId && artist) {
          query = query.eq('artist', artist);
        }

        const { data: rows, error } = await query;
        const artwork = !error ? (rows?.[0] as ArtworkRow | undefined) : undefined;
        let queryEmbedding = artwork ? parseEmbedding(artwork.embedding) : null;

        if (artwork && queryEmbedding) {
          resolvedArtworkId = artwork.id;
          basis = 'artwork';

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

          if (!matchError && matches) {
            const neighbours = matches.filter((match: { id: string }) => match.id !== artwork.id);
            vectorRecommendations = await rankByPopularity(supabase, neighbours, MATCH_COUNT);
          } else if (matchError) {
            console.error(`${MATCH_FUNCTION} error:`, matchError);
          }
        }
      } catch (supabaseError) {
        console.warn('Supabase recommendations unavailable, using graph fallback:', supabaseError);
      }
    }

    const graphResult = await graphPromise;
    const recommendations = mergeGraphRecommendations(
      vectorRecommendations,
      graphResult.recommendations,
      MATCH_COUNT
    );

    if (basis === 'none' && recommendations.length > 0) {
      basis = 'graph';
    }

    return NextResponse.json({
      artworkId: resolvedArtworkId,
      recommendations,
      basis,
      graphSource: graphResult.recommendations.length > 0 ? graphResult.source : undefined,
    });
  } catch (error: any) {
    console.error('Recommendations API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

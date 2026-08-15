import { SupabaseClient } from '@supabase/supabase-js';
import {
  ARTWORK_EMBEDDING_COLUMN,
  buildArtworkEmbeddingText,
  embedText
} from '@/lib/embeddings';

export interface ArtworkRecord {
  id: string;
  title: string;
  artist: string;
  tags: string[] | null;
  embedding: number[] | string | null;
}

// The active embedding space is aliased to `embedding` so callers stay provider-agnostic.
const SELECT_COLUMNS = `id, title, artist, tags, embedding:${ARTWORK_EMBEDDING_COLUMN}`;

export function parseEmbedding(embedding: ArtworkRecord['embedding']): number[] | null {
  if (!embedding) return null;
  // PostgREST serialises `vector` columns as a JSON string.
  const parsed = typeof embedding === 'string' ? JSON.parse(embedding) : embedding;
  return Array.isArray(parsed) ? parsed : null;
}

export async function findArtwork(
  supabase: SupabaseClient,
  title: string,
  artist?: string
): Promise<ArtworkRecord | null> {
  let query = supabase.from('artworks').select(SELECT_COLUMNS).eq('title', title).limit(1);
  if (artist) {
    query = query.eq('artist', artist);
  }

  const { data } = await query;
  return (data?.[0] as ArtworkRecord | undefined) ?? null;
}

/**
 * Free-text lookup over the catalogue, used to suggest artworks that actually
 * exist before falling back to whatever an LLM invents.
 */
export async function searchArtworks(
  supabase: SupabaseClient,
  query: string,
  limit: number,
  artist?: string
): Promise<{ title: string; artist: string }[]> {
  // PostgREST splits `or` filters on commas, and `%` is an ilike wildcard.
  const term = query.trim().replace(/[%,]/g, ' ');
  let request = supabase
    .from('artworks')
    .select('title, artist')
    .or(`title.ilike.%${term}%,artist.ilike.%${term}%`)
    .limit(limit);

  if (artist && artist.trim()) {
    request = request.ilike('artist', `%${artist.trim().replace(/[%,]/g, ' ')}%`);
  }

  const { data, error } = await request;
  if (error) {
    console.error('Artwork catalogue search failed:', error.message);
    return [];
  }

  return (data ?? []) as { title: string; artist: string }[];
}

/**
 * Returns the catalogue row for an artwork, adding it (with a freshly generated
 * embedding) when the visitor asked for something not yet in the catalogue.
 */
export async function findOrCreateArtwork(
  supabase: SupabaseClient,
  input: { title: string; artist: string; description?: string | null; imageUrl?: string | null }
): Promise<ArtworkRecord | null> {
  const existing = await findArtwork(supabase, input.title, input.artist);
  if (existing) return existing;

  const embedding = await embedText(buildArtworkEmbeddingText(input));

  const { data, error } = await supabase
    .from('artworks')
    .upsert(
      {
        title: input.title,
        artist: input.artist,
        description: input.description ?? null,
        image_url: input.imageUrl ?? null,
        search_query: `${input.title} ${input.artist}`.trim(),
        [ARTWORK_EMBEDDING_COLUMN]: embedding
      },
      { onConflict: 'title,artist' }
    )
    .select(SELECT_COLUMNS)
    .single<ArtworkRecord>();

  if (error) {
    console.error('Failed to add artwork to the catalogue:', error.message);
    return null;
  }

  return data;
}

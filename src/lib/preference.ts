import { SupabaseClient } from '@supabase/supabase-js';
import { ArtworkRecord, parseEmbedding } from '@/lib/artworks';

const MAX_FAVORITE_TAGS = 20;
// A single listen should nudge the taste vector, never overwrite it.
const BASE_WEIGHT = 0.05;
const MAX_EXTRA_WEIGHT = 0.15;
const FULL_LISTEN_SECONDS = 60;

export function listeningWeight(listenedSeconds: number): number {
  const completionRate = Math.min(Math.max(listenedSeconds, 0) / FULL_LISTEN_SECONDS, 1);
  return BASE_WEIGHT + completionRate * MAX_EXTRA_WEIGHT;
}

interface ProfileRow {
  preference_embedding: number[] | string | null;
  favorite_tags: string[] | null;
  view_count: number | null;
}

/**
 * Moves the user's taste vector towards the artwork they just listened to:
 * `preference = preference * (1 - w) + artwork * w`, where `w` grows with how
 * much of the guide they actually heard.
 */
export async function updatePreference(
  supabase: SupabaseClient,
  userId: string,
  artwork: ArtworkRecord,
  listenedSeconds: number
): Promise<void> {
  const artworkEmbedding = parseEmbedding(artwork.embedding);
  if (!artworkEmbedding) return;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('preference_embedding, favorite_tags, view_count')
    .eq('id', userId)
    .maybeSingle<ProfileRow>();

  if (!profile) return;

  const current = parseEmbedding(profile.preference_embedding);
  const weight = listeningWeight(listenedSeconds);

  const preference =
    current && current.length === artworkEmbedding.length
      ? artworkEmbedding.map((value, index) => current[index] * (1 - weight) + value * weight)
      : artworkEmbedding;

  const favoriteTags = Array.from(
    new Set([...(artwork.tags ?? []), ...(profile.favorite_tags ?? [])])
  ).slice(0, MAX_FAVORITE_TAGS);

  const { error } = await supabase
    .from('user_profiles')
    .update({
      preference_embedding: preference,
      favorite_tags: favoriteTags,
      view_count: (profile.view_count ?? 0) + 1
    })
    .eq('id', userId);

  if (error) {
    console.error('Failed to update preference embedding:', error.message);
  }
}

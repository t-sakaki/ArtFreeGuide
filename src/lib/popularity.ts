import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createServiceClient } from '@/lib/supabase';

export interface Popularity {
  /** How many times the guide was opened, across every visitor. */
  plays: number;
  /** Hearts tapped while listening, summed from the feedback archive. */
  hearts: number;
}

/** A heart is a deliberate act; opening a guide can be a stray tap. */
const HEART_WEIGHT = 5;
/**
 * How far popularity may move a candidate. Similarities inside a pool of
 * neighbours usually sit within ~0.05 of each other, so this is enough to lift
 * a loved artwork above a near-identical one, and never enough to pull in an
 * unrelated work: the pool is already filtered by the vector search.
 */
const POPULARITY_WEIGHT = 0.08;
/** Rows scanned when counting plays. Far more than the catalogue ever needs. */
const HISTORY_SAMPLE = 5000;

interface D1Row {
  title?: string;
  artist?: string;
  comment?: string;
}

export interface ArtworkIdentity {
  title: string;
  artist: string;
}

/**
 * The same key `findOrCreateArtwork` dedupes on: an artwork is `(title, artist)`,
 * never `title` alone. Two different artists' "無題"/"Untitled" must not share
 * a heart count.
 */
export function identityKey(title: string, artist: string): string {
  return `${title.trim()}::${artist.trim()}`;
}

interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  all<T>(): Promise<{ results?: T[] }>;
}

interface D1Binding {
  prepare(query: string): D1Statement;
}

async function feedbackDatabase(): Promise<D1Binding | null> {
  if ((process.env.GUIDE_STORE || 'd1').toLowerCase() !== 'd1') return null;
  try {
    const { env } = await getCloudflareContext({ async: true });
    return (env as unknown as { DB?: D1Binding }).DB ?? null;
  } catch {
    return null;
  }
}

/**
 * Hearts live in the guide archive (D1), keyed by `(title, artist)` — the same
 * identity the catalogue uses — because they are sent from the player before
 * the catalogue row is known. The map is keyed by `identityKey()`.
 */
export async function heartCounts(identities: ArtworkIdentity[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (identities.length === 0) return counts;

  const db = await feedbackDatabase();
  if (!db) return counts;

  // SQLite has no clean tuple IN(); narrow by title over the wire, then match
  // the artist in memory against exactly the identities that were asked for.
  const titles = Array.from(new Set(identities.map(identity => identity.title.trim()).filter(Boolean)));
  if (titles.length === 0) return counts;

  const wantedArtistsByTitle = new Map<string, Set<string>>();
  for (const { title, artist } of identities) {
    const key = title.trim();
    if (!key) continue;
    const set = wantedArtistsByTitle.get(key) ?? new Set<string>();
    set.add(artist.trim());
    wantedArtistsByTitle.set(key, set);
  }

  try {
    const placeholders = titles.map(() => '?').join(', ');
    const { results } = await db
      .prepare(
        `SELECT title, artist, comment FROM guide_feedback
         WHERE kind = 'good' AND comment LIKE 'hearts:%' AND title IN (${placeholders})`
      )
      .bind(...titles)
      .all<D1Row>();

    for (const row of results ?? []) {
      const title = (row.title ?? '').trim();
      if (!title) continue;
      const artist = (row.artist ?? '').trim();
      if (!wantedArtistsByTitle.get(title)?.has(artist)) continue;
      // The player batches a burst of taps into one row: "hearts:3".
      const burst = /^hearts:(\d+)/.exec(row.comment ?? '');
      if (!burst) continue;
      const key = identityKey(title, artist);
      counts.set(key, (counts.get(key) ?? 0) + Number(burst[1]));
    }
  } catch (error) {
    console.error('Heart count lookup failed:', error);
  }

  return counts;
}

/** Plays come from the viewing history, which is per visitor but counted globally. */
async function playCounts(
  supabase: ReturnType<typeof createServiceClient>,
  artworkIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (artworkIds.length === 0) return counts;

  const { data, error } = await supabase
    .from('viewing_history')
    .select('artwork_id')
    .in('artwork_id', artworkIds)
    .limit(HISTORY_SAMPLE);

  if (error) {
    console.error('Play count lookup failed:', error);
    return counts;
  }

  for (const row of data ?? []) {
    const id = row.artwork_id as string | null;
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return counts;
}

interface Candidate {
  id: string;
  title: string;
  artist: string;
  similarity: number;
}

/**
 * Reorders neighbours so that what other visitors actually listened to and
 * loved surfaces first, without letting popularity outweigh relevance.
 * Counts are attached to every row so the UI can show why.
 */
export async function rankByPopularity<T extends Candidate>(
  supabase: ReturnType<typeof createServiceClient>,
  candidates: T[],
  limit: number
): Promise<(T & Popularity)[]> {
  if (candidates.length === 0) return [];

  const [plays, hearts] = await Promise.all([
    playCounts(supabase, candidates.map(item => item.id)),
    heartCounts(candidates.map(item => ({ title: item.title, artist: item.artist ?? '' })))
  ]);

  const scored = candidates.map(item => {
    const popularity: Popularity = {
      plays: plays.get(item.id) ?? 0,
      hearts: hearts.get(identityKey(item.title, item.artist ?? '')) ?? 0
    };
    return {
      item: { ...item, ...popularity },
      // Diminishing returns: the tenth heart matters less than the first.
      weight: Math.log1p(popularity.plays + HEART_WEIGHT * popularity.hearts)
    };
  });

  const busiest = Math.max(...scored.map(entry => entry.weight));

  return scored
    .sort((a, b) => {
      const boost = (entry: (typeof scored)[number]) =>
        busiest > 0 ? (entry.weight / busiest) * POPULARITY_WEIGHT : 0;
      return b.item.similarity + boost(b) - (a.item.similarity + boost(a));
    })
    .slice(0, limit)
    .map(entry => entry.item);
}

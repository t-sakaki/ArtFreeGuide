'use client';

import { useCallback, useEffect, useState } from 'react';

export interface SimilarArtwork {
  id: string;
  title: string;
  artist: string;
  year: string | null;
  description: string | null;
  image_url: string | null;
  similarity: number;
  /** How often the guide was opened, across every visitor. */
  plays?: number;
  /** Hearts other listeners tapped on this guide. */
  hearts?: number;
  /** Graph relation type & curated reason when enriched by Neo4j / Knowledge Graph. */
  relationType?: string;
  relationLabel?: string;
  graphReason?: string;
  graphSource?: 'neo4j' | 'snapshot';
}

/** Which source produced the list: artwork vector, blend, taste vector, graph, or none. */
export type RecommendationBasis = 'artwork' | 'blend' | 'taste' | 'graph' | 'none';

interface RecommendationsResponse {
  recommendations?: SimilarArtwork[];
  basis?: RecommendationBasis;
  graphSource?: 'neo4j' | 'snapshot';
}

/**
 * Similar-artwork recommendations from the Supabase catalogue (pgvector)
 * enriched and backed up by the Neo4j Art Knowledge Graph.
 */
export function useRecommendations(
  title: string,
  artist: string,
  userId: string | null,
  locale: string = 'ja'
) {
  const [similarArtworks, setSimilarArtworks] = useState<SimilarArtwork[]>([]);
  const [basis, setBasis] = useState<RecommendationBasis>('none');
  const [loading, setLoading] = useState(false);

  /**
   * Whether a shelf was ever shown, and whether it was taken. This is the
   * only way to know if the taste vector (`basis: 'blend'`/`'taste'`) earns
   * more clicks than plain similarity (`basis: 'artwork'`) — never assumed.
   */
  const logEvent = useCallback(
    (kind: 'impression' | 'click', currentBasis: RecommendationBasis, targets: { title: string; artist: string }[]) => {
      if (!userId || currentBasis === 'none' || targets.length === 0) return;
      fetch('/api/recommendations/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          kind,
          basis: currentBasis,
          sourceTitle: title,
          sourceArtist: artist,
          items: targets
        })
      }).catch(() => {
        /* Analytics only; never worth surfacing to the visitor. */
      });
    },
    [userId, title, artist]
  );

  const logClick = useCallback(
    (item: { title: string; artist: string }) => logEvent('click', basis, [item]),
    [logEvent, basis]
  );

  const load = useCallback(async () => {
    const hasArtwork = title.trim().length > 0;
    if (!hasArtwork && !userId) {
      setSimilarArtworks([]);
      setBasis('none');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: hasArtwork ? title : undefined,
          artist: hasArtwork && artist ? artist : undefined,
          userId: userId || undefined,
          locale
        })
      });

      if (!res.ok) {
        setSimilarArtworks([]);
        setBasis('none');
        return;
      }

      const data = (await res.json()) as RecommendationsResponse;
      const recommendations = data.recommendations ?? [];
      const nextBasis = data.basis ?? 'none';
      setSimilarArtworks(recommendations);
      setBasis(nextBasis);
      // A render is treated as a shown impression — cheaper than true
      // viewport tracking, and enough to compare basis-to-basis click-through.
      logEvent(
        'impression',
        nextBasis,
        recommendations.map(item => ({ title: item.title, artist: item.artist }))
      );
    } catch (error) {
      console.error('Failed to load similar artworks:', error);
      setSimilarArtworks([]);
      setBasis('none');
    } finally {
      setLoading(false);
    }
  }, [title, artist, userId, locale, logEvent]);

  useEffect(() => {
    load();
  }, [load]);

  return { similarArtworks, basis, loading, reload: load, logClick };
}

export interface TasteProfile {
  viewCount: number;
  favoriteTags: string[];
  recent: string[];
  hasTaste: boolean;
}

/** The visitor's accumulated taste, so the learning is visible on screen. */
export function useTasteProfile(userId: string | null) {
  const [profile, setProfile] = useState<TasteProfile | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      return;
    }

    try {
      const res = await fetch(`/api/profile?userId=${encodeURIComponent(userId)}`);
      if (!res.ok) return;
      setProfile((await res.json()) as TasteProfile);
    } catch (error) {
      console.error('Failed to load taste profile:', error);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  return { profile, reload: load };
}

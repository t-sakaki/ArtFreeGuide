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
}

/** Which vector produced the list: the artwork, the taste vector, or both. */
export type RecommendationBasis = 'artwork' | 'blend' | 'taste' | 'none';

interface RecommendationsResponse {
  recommendations?: SimilarArtwork[];
  basis?: RecommendationBasis;
}

/**
 * Similar-artwork recommendations from the Supabase catalogue (pgvector),
 * personalised with the anonymous user's taste vector when one exists and
 * nudged by what other visitors played and hearted.
 * With an empty title the taste vector alone drives the search.
 */
export function useRecommendations(title: string, artist: string, userId: string | null) {
  const [similarArtworks, setSimilarArtworks] = useState<SimilarArtwork[]>([]);
  const [basis, setBasis] = useState<RecommendationBasis>('none');
  const [loading, setLoading] = useState(false);

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
          userId: userId || undefined
        })
      });

      if (!res.ok) {
        setSimilarArtworks([]);
        setBasis('none');
        return;
      }

      const data = (await res.json()) as RecommendationsResponse;
      setSimilarArtworks(data.recommendations ?? []);
      setBasis(data.basis ?? 'none');
    } catch (error) {
      console.error('Failed to load similar artworks:', error);
      setSimilarArtworks([]);
      setBasis('none');
    } finally {
      setLoading(false);
    }
  }, [title, artist, userId]);

  useEffect(() => {
    load();
  }, [load]);

  return { similarArtworks, basis, loading, reload: load };
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

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
}

/**
 * Similar-artwork recommendations from the Supabase catalogue (pgvector),
 * personalised with the anonymous user's taste vector when one exists.
 */
export function useRecommendations(title: string, artist: string, userId: string | null) {
  const [similarArtworks, setSimilarArtworks] = useState<SimilarArtwork[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!title.trim()) {
      setSimilarArtworks([]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, artist: artist || undefined, userId: userId || undefined })
      });

      if (!res.ok) {
        setSimilarArtworks([]);
        return;
      }

      const data = (await res.json()) as { recommendations?: SimilarArtwork[] };
      setSimilarArtworks(data.recommendations ?? []);
    } catch (error) {
      console.error('Failed to load similar artworks:', error);
      setSimilarArtworks([]);
    } finally {
      setLoading(false);
    }
  }, [title, artist, userId]);

  useEffect(() => {
    load();
  }, [load]);

  return { similarArtworks, loading, reload: load };
}

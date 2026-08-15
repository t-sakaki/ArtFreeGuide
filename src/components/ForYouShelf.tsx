'use client';

import { useEffect, useState } from 'react';
import { fetchArtworkImage } from '@/lib/artworkThumbnail';
import { Locale, UI } from '@/lib/i18n';
import { localizeName } from '@/lib/names';
import type { RecommendationBasis, SimilarArtwork } from '@/hooks/useRecommendations';

interface Props {
  items: SimilarArtwork[];
  basis: RecommendationBasis;
  /** Guides heard so far — the number the taste vector was built from. */
  viewCount: number;
  favoriteTags: string[];
  locale: Locale;
  onPick: (title: string, artist: string) => void;
}

function headings(basis: RecommendationBasis, locale: Locale): { title: string; subtitle: string } {
  const s = UI[locale].shelf;
  switch (basis) {
    case 'taste':
      return { title: s.tasteTitle, subtitle: s.tasteSubtitle };
    case 'blend':
      return { title: s.tasteTitle, subtitle: s.blendSubtitle };
    case 'artwork':
      return { title: s.artworkTitle, subtitle: s.artworkSubtitle };
    default:
      return { title: '', subtitle: '' };
  }
}

/**
 * The recommendation shelf: Supabase pgvector similarity over the artwork
 * catalogue, blended with the visitor's taste vector as they listen.
 */
export default function ForYouShelf({ items, basis, viewCount, favoriteTags, locale, onPick }: Props) {
  const [thumbnails, setThumbnails] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let cancelled = false;

    items.forEach(item => {
      if (item.image_url) return;
      setThumbnails(prev => (item.id in prev ? prev : { ...prev, [item.id]: null }));

      fetchArtworkImage(item.title, item.artist).then(url => {
        if (cancelled || !url) return;
        setThumbnails(prev => ({ ...prev, [item.id]: url }));
      });
    });

    return () => {
      cancelled = true;
    };
  }, [items]);

  if (items.length === 0 || basis === 'none') return null;

  const heading = headings(basis, locale);
  const t = UI[locale].shelf;
  // The catalogue is written in Japanese; a translated blurb would need the LLM.
  const showDescription = locale === 'ja';

  return (
    <div className="w-full space-y-3 select-none font-sans">
      <div className="space-y-1 text-center">
        <p className="text-xs font-bold text-slate-500 tracking-wider uppercase">{heading.title}</p>
        <p className="text-[11px] text-slate-500">{heading.subtitle}</p>
        {(viewCount > 0 || favoriteTags.length > 0) && (
          <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
            {viewCount > 0 && (
              <span className="text-[10px] text-teal-400/90 font-mono">{t.listened(viewCount)}</span>
            )}
            {favoriteTags.slice(0, 5).map(tag => (
              <span
                key={tag}
                className="text-[10px] text-slate-400 bg-slate-900/60 border border-slate-800 rounded-full px-2 py-0.5"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map(item => {
          const image = item.image_url ?? thumbnails[item.id] ?? null;

          return (
            <button
              key={item.id}
              onClick={() => onPick(item.title, item.artist)}
              className="bg-slate-900/40 border border-slate-800 hover:border-teal-500/40 hover:bg-slate-900/70 rounded-2xl p-3 flex gap-3 text-left active:scale-95 transition-all shadow-md group"
            >
              <div className="relative w-28 h-24 rounded-xl overflow-hidden bg-slate-950 border border-slate-850 shrink-0 flex items-center justify-center">
                {image ? (
                  <img src={image} alt={item.title} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl">🖼️</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-slate-200 text-xs truncate group-hover:text-teal-400 transition-colors">
                    {localizeName(item.title, locale)}
                  </span>
                  <span className="text-[10px] text-teal-500/80 font-mono shrink-0">
                    {Math.round(item.similarity * 100)}%
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 truncate">
                  {localizeName(item.artist, locale)}
                  {item.year ? ` ・ ${item.year}` : ''}
                </p>
                <div className="mt-1 h-0.5 w-full bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500/70"
                    style={{ width: `${Math.round(Math.min(Math.max(item.similarity, 0), 1) * 100)}%` }}
                  />
                </div>
                {showDescription && item.description && (
                  <p className="text-[10px] text-slate-400 line-clamp-2 mt-1">{item.description}</p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-[9px] text-slate-600 text-center font-mono">
        {t.credit}
      </p>
    </div>
  );
}

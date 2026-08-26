'use client';

import { useEffect, useState } from 'react';
import { fetchArtworkImage } from '@/lib/artworkThumbnail';

/**
 * 作品サムネイル。マウント時に /api/artwork-image で画像URLを解決し、
 * 見つかれば <img>、なければ 🖼️ プレースホルダを描画する。
 * DailyArtworkCard とサジェスト候補行で共用。
 */
export default function ArtworkThumbnail({
  title,
  artist,
  className = '',
  imgClassName = 'object-contain',
  placeholderSize = 'text-4xl',
}: {
  title: string;
  artist?: string;
  className?: string;
  /** 画像のフィット方法（全面表示なら object-cover） */
  imgClassName?: string;
  placeholderSize?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setDone(false);
    fetchArtworkImage(title, artist ?? '')
      .then(u => {
        if (!cancelled) {
          setUrl(u);
          setDone(true);
        }
      })
      .catch(() => { if (!cancelled) setDone(true); });
    return () => { cancelled = true; };
  }, [title, artist]);

  return (
    <div className={`flex items-center justify-center overflow-hidden bg-slate-950/60 ${className}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={title} className={`w-full h-full ${imgClassName}`} loading="lazy" />
      ) : (
        !done && null
      )}
      {!url && done && <span className={`text-slate-600 ${placeholderSize}`}>🖼️</span>}
    </div>
  );
}

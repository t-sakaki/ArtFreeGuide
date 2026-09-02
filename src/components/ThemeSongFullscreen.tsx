'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Locale, themeSongStrings } from '@/lib/i18n';
import { fetchArtworkImage } from '@/lib/artworkThumbnail';
import { parseLyrics } from '@/lib/lyricAlign';

/**
 * The theme song as a full-screen "music video": the artwork drifts (Ken
 * Burns) behind the scrolling lyric sheet, the active line enlarged. This is a
 * visual layer only — playback is owned by useThemeSong and driven through the
 * same transport as the narration.
 */

const INTRO_FRACTION = 0.06;

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ThemeSongFullscreen({
  locale,
  lyrics,
  timings,
  playing,
  ended,
  currentTime,
  duration,
  title,
  artist,
  imageUrl,
  onToggle,
  onSeek,
  onReplay,
  onBackToGuide,
  onClose,
}: {
  locale: Locale;
  lyrics: string;
  timings?: number[];
  playing: boolean;
  ended: boolean;
  currentTime: number;
  duration: number;
  title: string;
  artist?: string;
  imageUrl?: string | null;
  onToggle: () => void;
  onSeek: (t: number) => void;
  onReplay: () => void;
  onBackToGuide: () => void;
  onClose: () => void;
}) {
  const t = themeSongStrings(locale);
  const [img, setImg] = useState<string | null>(imageUrl ?? null);
  const lines = useMemo(() => parseLyrics(lyrics), [lyrics]);

  const starts = useMemo(() => {
    if (timings && timings.length === lines.length) return timings;
    if (!duration || lines.length === 0) return [];
    const weights = lines.map(l => Math.max(l.text.length, l.section ? 4 : 10));
    const total = weights.reduce((a, b) => a + b, 0);
    const intro = duration * INTRO_FRACTION;
    const body = duration - intro;
    let acc = 0;
    return weights.map(w => {
      const at = intro + (acc / total) * body;
      acc += w;
      return at;
    });
  }, [duration, lines, timings]);

  const activeIdx = useMemo(() => {
    if (starts.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < starts.length; i++) if (starts[i] <= currentTime + 0.15) idx = i;
    return idx;
  }, [starts, currentTime]);

  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  useEffect(() => {
    if (activeIdx < 0) return;
    lineRefs.current[activeIdx]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIdx]);

  useEffect(() => {
    if (imageUrl) return;
    let alive = true;
    fetchArtworkImage(title, artist ?? '').then(u => {
      if (alive) setImg(u);
    });
    return () => {
      alive = false;
    };
  }, [imageUrl, title, artist]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[120] bg-black text-white flex flex-col select-none">
      <div className="absolute inset-0 overflow-hidden">
        {img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt={title}
            className="theme-song-kenburns w-full h-full object-cover"
            style={{
              animationDuration: `${Math.max(duration, 30)}s`,
              animationPlayState: playing ? 'running' : 'paused',
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/45 to-black/85" />
      </div>

      <div className="relative flex items-center justify-between px-4 pt-4">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate wordmark drop-shadow">🎵 {title}</p>
          {artist && <p className="text-[11px] text-white/70 truncate drop-shadow">{artist}</p>}
        </div>
        <button
          onClick={onClose}
          aria-label={t.backToGuide}
          className="shrink-0 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center text-lg"
        >
          ✕
        </button>
      </div>

      <div className="relative flex-1 overflow-y-auto no-scrollbar">
        <div className="min-h-full flex flex-col items-center justify-start gap-3 px-6 text-center py-[38vh]">
          {lines.map((line, i) => {
            if (line.section) {
              return (
                <p
                  key={i}
                  ref={el => {
                    lineRefs.current[i] = el;
                  }}
                  className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-300/50 pt-3"
                >
                  {line.text}
                </p>
              );
            }
            const active = i === activeIdx;
            const past = activeIdx >= 0 && i < activeIdx;
            return (
              <p
                key={i}
                ref={el => {
                  lineRefs.current[i] = el;
                }}
                className={[
                  'leading-snug max-w-xl transition-all duration-500',
                  active
                    ? 'text-2xl sm:text-4xl font-bold text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]'
                    : past
                      ? 'text-lg sm:text-2xl font-semibold text-white/35'
                      : 'text-lg sm:text-2xl font-semibold text-white/55',
                ].join(' ')}
              >
                {line.text}
              </p>
            );
          })}
        </div>
      </div>

      <div className="relative px-5 pb-7 pt-3 space-y-2">
        {ended ? (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={onReplay}
              className="px-4 py-2 rounded-full bg-teal-500 hover:bg-teal-400 text-black text-sm font-bold active:scale-95 transition"
            >
              ▶ {t.replay}
            </button>
            <button
              onClick={onBackToGuide}
              className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-sm font-semibold active:scale-95 transition"
            >
              {t.backToGuide}
            </button>
          </div>
        ) : (
          <>
            <input
              type="range"
              min={0}
              max={duration || 0}
              value={currentTime}
              step={0.1}
              onChange={e => onSeek(Number(e.target.value))}
              aria-label={t.modeSong}
              className="w-full accent-teal-400 h-1 cursor-pointer"
            />
            <div className="flex items-center justify-between text-[11px] text-white/60 tabular-nums">
              <span>{fmt(currentTime)}</span>
              <span>{fmt(duration)}</span>
            </div>
            <div className="flex items-center justify-center">
              <button
                onClick={onToggle}
                aria-label="play / pause"
                className="w-14 h-14 rounded-full bg-teal-500 hover:bg-teal-400 text-black text-2xl grid place-items-center shadow-lg active:scale-95 transition"
              >
                {playing ? '❚❚' : '▶'}
              </button>
            </div>
          </>
        )}
        <p className="text-center text-[10px] text-white/40">{t.credit}</p>
      </div>
    </div>
  );
}

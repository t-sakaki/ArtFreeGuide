'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Locale, themeSongStrings } from '@/lib/i18n';
import { fetchArtworkImage } from '@/lib/artworkThumbnail';

/**
 * MiniMax Week: the theme song as a small generated "music video".
 *
 * The artwork drifts slowly behind the lyrics, which are highlighted line by
 * line. MiniMax does not return per-line timestamps, so timing is estimated
 * from the track length and each line's length — the same length-weighted
 * pacing the narration falls back to.
 */

interface Line {
  text: string;
  /** [Verse] / [Chorus] markers — kept for pacing, not shown as a lyric. */
  section: boolean;
}

/** Fraction of the track assumed to be intro before the first sung line. */
const INTRO_FRACTION = 0.06;

function parseLyrics(raw: string): Line[] {
  return raw
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => ({ text: l.replace(/^\[(.+)\]$/, '$1'), section: /^\[.+\]$/.test(l) }));
}

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ThemeSongMode({
  locale,
  audioUrl,
  lyrics,
  title,
  artist,
  imageUrl,
  onClose,
}: {
  locale: Locale;
  audioUrl: string;
  lyrics: string;
  title: string;
  artist?: string;
  imageUrl?: string | null;
  onClose: () => void;
}) {
  const t = themeSongStrings(locale);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [img, setImg] = useState<string | null>(imageUrl ?? null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  const lines = useMemo(() => parseLyrics(lyrics), [lyrics]);

  // Cumulative start time for every line, weighted by its length.
  const starts = useMemo(() => {
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
  }, [duration, lines]);

  const activeIdx = useMemo(() => {
    if (starts.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < starts.length; i++) if (starts[i] <= current + 0.15) idx = i;
    return idx;
  }, [starts, current]);

  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);

  // Keep the active line centred in the scrolling lyric sheet.
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

  // Stop any narration that was speaking; lock body scroll.
  useEffect(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* not supported */
    }
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

  // Autoplay on open (best effort — browsers may block until a tap).
  useEffect(() => {
    audioRef.current?.play().catch(() => setPlaying(false));
  }, []);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }, []);

  const seek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (a) a.currentTime = Number(e.target.value);
  }, []);

  return (
    <div className="fixed inset-0 z-[120] bg-black text-white flex flex-col select-none">
      {/* drifting artwork */}
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

      {/* top bar */}
      <div className="relative flex items-center justify-between px-4 pt-4">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate wordmark drop-shadow">🎵 {title}</p>
          {artist && <p className="text-[11px] text-white/70 truncate drop-shadow">{artist}</p>}
        </div>
        <button
          onClick={onClose}
          aria-label={t.hideLyrics}
          className="shrink-0 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center text-lg"
        >
          ✕
        </button>
      </div>

      {/* lyrics — the whole sheet, active line kept centred */}
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

      {/* transport */}
      <div className="relative px-5 pb-7 pt-3 space-y-2">
        <input
          type="range"
          min={0}
          max={duration || 0}
          value={current}
          step={0.1}
          onChange={seek}
          aria-label={t.ready}
          className="w-full accent-teal-400 h-1 cursor-pointer"
        />
        <div className="flex items-center justify-between text-[11px] text-white/60 tabular-nums">
          <span>{fmt(current)}</span>
          <span>{fmt(duration)}</span>
        </div>
        <div className="flex items-center justify-center">
          <button
            onClick={toggle}
            aria-label="play / pause"
            className="w-14 h-14 rounded-full bg-teal-500 hover:bg-teal-400 text-black text-2xl grid place-items-center shadow-lg active:scale-95 transition"
          >
            {playing ? '❚❚' : '▶'}
          </button>
        </div>
        <p className="text-center text-[10px] text-white/40">{t.credit}</p>
      </div>

      <audio
        ref={audioRef}
        src={audioUrl}
        preload="auto"
        onLoadedMetadata={e => setDuration(e.currentTarget.duration || 0)}
        onDurationChange={e => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={e => setCurrent(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </div>
  );
}

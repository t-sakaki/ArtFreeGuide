'use client';

import { useMemo } from 'react';
import { Locale, themeSongStrings } from '@/lib/i18n';
import { parseLyrics } from '@/lib/lyricAlign';
import type { ThemeSongController } from '@/hooks/useThemeSong';

/**
 * The theme song's home in the guide: a compact strip under the artwork title.
 * Composing → a quiet progress line; ready → play / lyric ticker / full-screen.
 * Playback itself runs through the shared transport (see HomeClient).
 */

const INTRO_FRACTION = 0.06;

export default function ThemeSongBar({
  song,
  locale,
  active,
  onPlay,
  onPause,
  onReplay,
  onBackToGuide,
  onOpenFullscreen,
}: {
  song: ThemeSongController;
  locale: Locale;
  /** True when the song is the active transport mode. */
  active: boolean;
  onPlay: () => void;
  onPause: () => void;
  onReplay: () => void;
  onBackToGuide: () => void;
  onOpenFullscreen: () => void;
}) {
  const t = themeSongStrings(locale);
  const lines = useMemo(() => parseLyrics(song.lyrics), [song.lyrics]);

  const tickerLine = useMemo(() => {
    if (!lines.length) return '';
    let starts: number[];
    if (song.timings && song.timings.length === lines.length) {
      starts = song.timings;
    } else if (song.duration) {
      const weights = lines.map(l => Math.max(l.text.length, l.section ? 4 : 10));
      const total = weights.reduce((a, b) => a + b, 0);
      const intro = song.duration * INTRO_FRACTION;
      let acc = 0;
      starts = weights.map(w => {
        const at = intro + (acc / total) * (song.duration - intro);
        acc += w;
        return at;
      });
    } else {
      return '';
    }
    let idx = -1;
    for (let i = 0; i < starts.length; i++) if (starts[i] <= song.currentTime + 0.15) idx = i;
    for (let i = idx; i >= 0; i--) if (!lines[i].section) return lines[i].text;
    return '';
  }, [lines, song.timings, song.duration, song.currentTime]);

  if (song.phase === 'unavailable') return null;

  if (song.phase === 'idle' || song.phase === 'composing') {
    return (
      <div className="flex items-center gap-2 text-[11px] text-teal-300/70 px-1 py-1.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
        <span>{t.composing}</span>
      </div>
    );
  }

  // ready
  const progress = song.duration ? Math.min(song.currentTime / song.duration, 1) : 0;

  if (song.ended) {
    return (
      <div className="flex items-center justify-between gap-2 bg-teal-950/25 border border-teal-900/60 rounded-lg px-3 py-2 text-[12px]">
        <span className="font-semibold text-teal-200">{t.modeSong}</span>
        <span className="flex items-center gap-2">
          <button onClick={onReplay} className="font-bold text-teal-300 hover:text-teal-200">
            ▶ {t.replay}
          </button>
          <button onClick={onBackToGuide} className="text-teal-400/70 hover:text-teal-300">
            {t.backToGuide}
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="bg-teal-950/25 border border-teal-900/60 rounded-lg px-2.5 py-2 flex items-center gap-2.5">
      <button
        onClick={active && song.playing ? onPause : onPlay}
        aria-label={t.modeSong}
        className="shrink-0 w-8 h-8 rounded-full bg-teal-500 text-black grid place-items-center text-sm hover:bg-teal-400 transition-colors"
      >
        {active && song.playing ? '❚❚' : '▶'}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-teal-200 shrink-0">{t.modeSong}</span>
          {tickerLine && (
            <span className="text-[11px] text-teal-100/70 truncate">— {tickerLine}</span>
          )}
        </div>
        <div className="mt-1 h-0.5 w-full bg-teal-900/60 rounded-full overflow-hidden">
          <div className="h-full bg-teal-400 transition-all duration-500" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
      <button
        onClick={onOpenFullscreen}
        aria-label={t.fullscreen}
        className="shrink-0 w-8 h-8 rounded-lg text-teal-300/80 hover:text-teal-200 hover:bg-teal-900/40 grid place-items-center text-base"
      >
        ⛶
      </button>
    </div>
  );
}

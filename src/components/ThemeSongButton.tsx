'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Locale, themeSongStrings } from '@/lib/i18n';

/**
 * MiniMax Week feature: composes and plays a theme song written from the
 * artwork's own guide text. The job runs server-side across several short
 * requests (MiniMax M3 for lyrics, MiniMax Music 3.0 for the track), so this
 * component kicks it off and then polls until the row is ready.
 */

type Phase = 'idle' | 'composing' | 'ready' | 'failed' | 'need_guide' | 'unavailable';

interface PollResponse {
  status: 'none' | 'pending' | 'ready' | 'failed' | 'unavailable';
  audioUrl?: string;
  lyrics?: string;
  error?: string;
}

const POLL_MS = 8000;

export default function ThemeSongButton({ slug, locale }: { slug: string; locale: Locale }) {
  const t = themeSongStrings(locale);
  const [phase, setPhase] = useState<Phase>('idle');
  const [audioUrl, setAudioUrl] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [showLyrics, setShowLyrics] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const apply = useCallback(
    (data: PollResponse): boolean => {
      if (data.status === 'ready' && data.audioUrl) {
        setAudioUrl(data.audioUrl);
        setLyrics(data.lyrics || '');
        setPhase('ready');
        return true;
      }
      if (data.status === 'failed') {
        setPhase('failed');
        return true;
      }
      if (data.status === 'unavailable') {
        setPhase('unavailable');
        return true;
      }
      return false;
    },
    [],
  );

  const poll = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/theme-song?slug=${encodeURIComponent(slug)}&locale=${locale}`,
      );
      const data = (await res.json()) as PollResponse;
      if (apply(data)) stopPolling();
    } catch {
      /* transient; try again on the next tick */
    }
  }, [slug, locale, apply, stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    timer.current = setInterval(poll, POLL_MS);
  }, [poll, stopPolling]);

  // On mount, see whether a song already exists or is already in progress.
  useEffect(() => {
    let cancelled = false;
    setPhase('idle');
    setAudioUrl('');
    setLyrics('');
    setShowLyrics(false);
    stopPolling();
    (async () => {
      try {
        const res = await fetch(
          `/api/theme-song?slug=${encodeURIComponent(slug)}&locale=${locale}`,
        );
        const data = (await res.json()) as PollResponse;
        if (cancelled) return;
        if (apply(data)) return;
        if (data.status === 'pending') {
          setPhase('composing');
          startPolling();
        }
      } catch {
        /* leave as idle */
      }
    })();
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [slug, locale, apply, startPolling, stopPolling]);

  const start = useCallback(async () => {
    setPhase('composing');
    try {
      const res = await fetch('/api/theme-song', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, locale }),
      });
      const data = (await res.json()) as PollResponse;
      if (res.status === 409 && data.error === 'no_guide_yet') {
        setPhase('need_guide');
        return;
      }
      if (apply(data)) return;
      startPolling();
    } catch {
      setPhase('failed');
    }
  }, [slug, locale, apply, startPolling]);

  if (phase === 'idle') {
    return (
      <button
        onClick={start}
        className="w-full text-left text-[11px] font-semibold text-teal-300/90 bg-teal-950/30 border border-teal-900/60 hover:border-teal-500/50 hover:bg-teal-950/50 rounded-lg px-3 py-2 transition-colors"
      >
        {t.cta}
      </button>
    );
  }

  if (phase === 'need_guide') {
    return <p className="text-[11px] text-slate-500 px-1 py-1">{t.needGuide}</p>;
  }

  if (phase === 'unavailable') {
    return null;
  }

  if (phase === 'composing') {
    return (
      <div className="flex items-center gap-2 text-[11px] text-teal-300/80 bg-teal-950/20 border border-teal-900/50 rounded-lg px-3 py-2">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
        <span>{t.composing}</span>
      </div>
    );
  }

  if (phase === 'failed') {
    return (
      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2">
        <span>{t.failed}</span>
        <button onClick={start} className="font-bold text-teal-400 hover:text-teal-300 shrink-0">
          {t.retry}
        </button>
      </div>
    );
  }

  // ready
  return (
    <div className="bg-teal-950/20 border border-teal-900/50 rounded-lg px-3 py-2.5 space-y-2">
      <p className="text-[11px] font-semibold text-teal-300/90">{t.ready}</p>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio src={audioUrl} controls preload="none" className="w-full h-9" />
      {lyrics && (
        <div>
          <button
            onClick={() => setShowLyrics(v => !v)}
            className="text-[11px] font-semibold text-teal-400 hover:text-teal-300"
          >
            {showLyrics ? t.hideLyrics : t.showLyrics}
          </button>
          {showLyrics && (
            <pre className="mt-1.5 whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-slate-300 max-h-52 overflow-y-auto">
              {lyrics}
            </pre>
          )}
        </div>
      )}
      <p className="text-[10px] text-slate-500">{t.credit}</p>
    </div>
  );
}

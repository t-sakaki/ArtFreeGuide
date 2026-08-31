'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Locale, themeSongStrings } from '@/lib/i18n';
import ThemeSongMode from '@/components/ThemeSongMode';

/**
 * MiniMax Week feature: composes and plays a theme song written from the
 * artwork's own guide text.
 *
 * The song is expensive (~2 min) but cached per (slug, locale) and shared
 * across visitors, so we start it automatically a few seconds after the guide
 * opens — by the time the reader looks for it, it is usually ready. The server
 * side is fully poll-driven; this component just kicks it off and polls.
 */

type Phase = 'checking' | 'composing' | 'ready' | 'failed' | 'need_guide' | 'unavailable';

interface PollResponse {
  status: 'none' | 'pending' | 'ready' | 'failed' | 'unavailable';
  audioUrl?: string;
  lyrics?: string;
  error?: string;
}

const POLL_MS = 8000;
/** Stop polling after this many minutes; the reader can retry by hand. */
const MAX_POLL_MS = 6 * 60 * 1000;
/** Wait this long after the guide opens before spending money on a song. */
const AUTOSTART_DELAY_MS = 3500;

export default function ThemeSongButton({
  slug,
  locale,
  title,
  artist,
  imageUrl,
}: {
  slug: string;
  locale: Locale;
  title: string;
  artist?: string;
  imageUrl?: string | null;
}) {
  const t = themeSongStrings(locale);
  const [phase, setPhase] = useState<Phase>('checking');
  const [audioUrl, setAudioUrl] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingSince = useRef(0);

  const stopPolling = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const apply = useCallback((data: PollResponse): boolean => {
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
  }, []);

  const poll = useCallback(async () => {
    if (Date.now() - pollingSince.current > MAX_POLL_MS) {
      stopPolling();
      setPhase('failed');
      return;
    }
    try {
      const res = await fetch(`/api/theme-song?slug=${encodeURIComponent(slug)}&locale=${locale}`);
      const data = (await res.json()) as PollResponse;
      if (apply(data)) stopPolling();
    } catch {
      /* transient; try again next tick */
    }
  }, [slug, locale, apply, stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollingSince.current = Date.now();
    timer.current = setInterval(poll, POLL_MS);
  }, [poll, stopPolling]);

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

  // On mount: adopt any existing/in-progress song, else auto-start after a beat.
  useEffect(() => {
    let cancelled = false;
    let kickoff: ReturnType<typeof setTimeout> | null = null;
    setPhase('checking');
    setAudioUrl('');
    setLyrics('');
    setOpen(false);
    stopPolling();
    (async () => {
      try {
        const res = await fetch(`/api/theme-song?slug=${encodeURIComponent(slug)}&locale=${locale}`);
        const data = (await res.json()) as PollResponse;
        if (cancelled) return;
        if (apply(data)) return;
        if (data.status === 'pending') {
          setPhase('composing');
          startPolling();
          return;
        }
        // status 'none' — nothing generated yet; start it shortly.
        kickoff = setTimeout(() => {
          if (!cancelled) start();
        }, AUTOSTART_DELAY_MS);
      } catch {
        if (!cancelled) setPhase('unavailable');
      }
    })();
    return () => {
      cancelled = true;
      if (kickoff) clearTimeout(kickoff);
      stopPolling();
    };
  }, [slug, locale, apply, start, startPolling, stopPolling]);

  // Stay quiet unless there is something to show.
  if (phase === 'unavailable' || phase === 'need_guide' || phase === 'failed') return null;

  if (phase === 'checking' || phase === 'composing') {
    return (
      <div className="flex items-center gap-2 text-[11px] text-teal-300/70 px-1 py-1.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
        <span>{t.composing}</span>
      </div>
    );
  }

  // ready
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2.5 text-left bg-teal-950/30 border border-teal-900/60 hover:border-teal-500/50 hover:bg-teal-950/50 rounded-lg px-3 py-2.5 transition-colors group"
      >
        <span className="shrink-0 w-8 h-8 rounded-full bg-teal-500 text-black grid place-items-center text-sm group-hover:bg-teal-400 transition-colors">
          ▶
        </span>
        <span className="min-w-0">
          <span className="block text-[12px] font-semibold text-teal-200">{t.ready}</span>
          <span className="block text-[10px] text-teal-300/60">{t.credit}</span>
        </span>
      </button>
      {open && (
        <ThemeSongMode
          locale={locale}
          audioUrl={audioUrl}
          lyrics={lyrics}
          title={title}
          artist={artist}
          imageUrl={imageUrl}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

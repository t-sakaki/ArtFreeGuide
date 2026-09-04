'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Locale } from '@/lib/i18n';
import type { LyricTimeline } from '@/lib/lyricAlign';

/**
 * Owns the per-artwork theme song: the compose/poll lifecycle and a single
 * <audio> element. HomeClient wires the returned controller into the shared
 * transport so the song and the narration are one player, never two streams at
 * once.
 */

export type ThemeSongPhase = 'idle' | 'composing' | 'ready' | 'unavailable';

interface PollResponse {
  status: 'none' | 'pending' | 'ready' | 'failed' | 'unavailable';
  audioUrl?: string;
  lyrics?: string;
  timings?: number[];
  timeline?: LyricTimeline | null;
  error?: string;
}

const POLL_MS = 8000;
const MAX_POLL_MS = 6 * 60 * 1000;
/** Wait this long after the guide opens before spending money on a song. */
const AUTOSTART_DELAY_MS = 3500;

export interface ThemeSongController {
  phase: ThemeSongPhase;
  lyrics: string;
  timings: number[];
  timeline: LyricTimeline | null;
  playing: boolean;
  ended: boolean;
  currentTime: number;
  duration: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (t: number) => void;
  seekBy: (dt: number) => void;
}

export function useThemeSong({
  slug,
  locale,
  enabled,
}: {
  slug: string | null;
  locale: Locale;
  enabled: boolean;
}): ThemeSongController {
  const [phase, setPhase] = useState<ThemeSongPhase>('idle');
  const [audioUrl, setAudioUrl] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [timings, setTimings] = useState<number[]>([]);
  const [timeline, setTimeline] = useState<LyricTimeline | null>(null);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingSince = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const applyData = useCallback((d: PollResponse): boolean => {
    if (d.status === 'ready' && d.audioUrl) {
      setAudioUrl(d.audioUrl);
      setLyrics(d.lyrics || '');
      setTimings(Array.isArray(d.timings) ? d.timings : []);
      setTimeline(d.timeline ?? null);
      setPhase('ready');
      return true;
    }
    if (d.status === 'failed' || d.status === 'unavailable') {
      setPhase('unavailable');
      return true;
    }
    return false;
  }, []);

  // Compose / poll lifecycle, keyed on the artwork.
  useEffect(() => {
    if (!enabled || !slug) {
      setPhase('unavailable');
      return;
    }
    let cancelled = false;
    let kickoff: ReturnType<typeof setTimeout> | null = null;
    setPhase('idle');
    setAudioUrl('');
    setLyrics('');
    setTimings([]);
    setTimeline(null);
    setPlaying(false);
    setEnded(false);
    setCurrentTime(0);
    setDuration(0);
    stopPolling();

    const getUrl = `/api/theme-song?slug=${encodeURIComponent(slug)}&locale=${locale}`;

    const poll = async () => {
      if (Date.now() - pollingSince.current > MAX_POLL_MS) {
        stopPolling();
        setPhase('unavailable');
        return;
      }
      try {
        const d = (await (await fetch(getUrl)).json()) as PollResponse;
        if (!cancelled && applyData(d)) stopPolling();
      } catch {
        /* transient — next tick */
      }
    };
    const startPolling = () => {
      stopPolling();
      pollingSince.current = Date.now();
      pollTimer.current = setInterval(poll, POLL_MS);
    };
    const kickCompose = async () => {
      setPhase('composing');
      try {
        const res = await fetch('/api/theme-song', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, locale }),
        });
        const d = (await res.json()) as PollResponse;
        if (cancelled) return;
        if (res.status === 409) {
          setPhase('unavailable');
          return;
        }
        if (applyData(d)) return;
        startPolling();
      } catch {
        if (!cancelled) setPhase('unavailable');
      }
    };

    (async () => {
      try {
        const d = (await (await fetch(getUrl)).json()) as PollResponse;
        if (cancelled) return;
        if (applyData(d)) return;
        if (d.status === 'pending') {
          setPhase('composing');
          startPolling();
          return;
        }
        kickoff = setTimeout(() => {
          if (!cancelled) kickCompose();
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
  }, [slug, locale, enabled, applyData, stopPolling]);

  // One <audio> element, rebuilt when the track URL changes.
  useEffect(() => {
    if (!audioUrl) {
      audioRef.current?.pause();
      audioRef.current = null;
      return;
    }
    const a = new Audio(audioUrl);
    a.preload = 'auto';
    audioRef.current = a;
    setCurrentTime(0);
    setEnded(false);
    const onTime = () => setCurrentTime(a.currentTime);
    const onMeta = () => setDuration(a.duration || 0);
    const onPlay = () => {
      setPlaying(true);
      setEnded(false);
    };
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setEnded(true);
    };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('durationchange', onMeta);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnded);
    return () => {
      a.pause();
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('durationchange', onMeta);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnded);
      if (audioRef.current === a) audioRef.current = null;
    };
  }, [audioUrl]);

  const play = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.ended || (a.duration && a.currentTime >= a.duration - 0.25)) a.currentTime = 0;
    a.play().catch(() => {});
  }, []);
  const pause = useCallback(() => audioRef.current?.pause(), []);
  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) play();
    else a.pause();
  }, [play]);
  const seek = useCallback((t: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(t, a.duration || t));
    setCurrentTime(a.currentTime);
  }, []);
  const seekBy = useCallback(
    (dt: number) => {
      const a = audioRef.current;
      if (a) seek(a.currentTime + dt);
    },
    [seek],
  );

  return { phase, lyrics, timings, timeline, playing, ended, currentTime, duration, play, pause, toggle, seek, seekBy };
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Locale } from '@/lib/i18n';
import {
  computeContentHash,
  supportsOpusAudio,
  type NarrationManifest,
} from '@/lib/narration';
import {
  extractSpeakableSegments,
  findSegmentIndexForTimeMs,
  type ExplanationMode,
} from '@/lib/narrationText';

export type NarrationAudioStatus = 'idle' | 'loading' | 'ready' | 'none' | 'unavailable';

interface NarrationLookupResponse {
  status: 'ready' | 'none' | 'unavailable';
  audioUrl?: string;
  manifest?: NarrationManifest;
}

export interface NarrationAudioController {
  status: NarrationAudioStatus;
  opusSupported: boolean;
  isReady: boolean;
  canPlayOpusSegment: (segmentIndex: number) => boolean;
  manifest: NarrationManifest | null;
  playSegment: (segmentIndex: number) => Promise<boolean>;
  seekToSegment: (segmentIndex: number) => void;
  pause: () => void;
}

export function useNarrationAudio({
  title,
  artist,
  locale,
  mode,
  baseGuideText,
  playbackSpeed,
  enabled,
  isPlaying,
  onSegmentChange,
  onEnded,
  onMediaError,
}: {
  title: string;
  artist: string;
  locale: Locale;
  mode: ExplanationMode;
  baseGuideText: string;
  playbackSpeed: number;
  enabled: boolean;
  isPlaying: boolean;
  onSegmentChange: (segmentIndex: number) => void;
  onEnded: () => void;
  onMediaError?: () => void;
}): NarrationAudioController {
  const [opusSupported] = useState<boolean>(() => supportsOpusAudio());
  const [status, setStatus] = useState<NarrationAudioStatus>('idle');
  const [audioUrl, setAudioUrl] = useState('');
  const [manifest, setManifest] = useState<NarrationManifest | null>(null);
  const [failedForUrl, setFailedForUrl] = useState('');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speedRef = useRef(playbackSpeed);
  speedRef.current = playbackSpeed;

  const onSegmentChangeRef = useRef(onSegmentChange);
  onSegmentChangeRef.current = onSegmentChange;
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onMediaErrorRef = useRef(onMediaError);
  onMediaErrorRef.current = onMediaError;

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  // Suppresses stale timeupdate ticks right after an explicit seekToSegment().
  const seekGuardUntilRef = useRef(0);
  const lastReportedSegRef = useRef(-1);

  const contentHash = useMemo(
    () => (baseGuideText ? computeContentHash(baseGuideText) : ''),
    [baseGuideText],
  );

  const baseSegmentCount = useMemo(
    () => (baseGuideText ? extractSpeakableSegments(baseGuideText).length : 0),
    [baseGuideText],
  );

  // Fetch manifest metadata for (title, artist, locale, mode, contentHash)
  useEffect(() => {
    if (!enabled || !opusSupported || !title.trim() || !contentHash) {
      setStatus(opusSupported ? 'none' : 'unavailable');
      setAudioUrl('');
      setManifest(null);
      return;
    }

    const abortController = new AbortController();
    setStatus('loading');
    setAudioUrl('');
    setManifest(null);
    setFailedForUrl('');

    const qs = new URLSearchParams({
      title: title.trim(),
      artist: artist.trim(),
      locale,
      mode,
      contentHash,
    });

    fetch(`/api/narration?${qs.toString()}`, { signal: abortController.signal })
      .then(async res => {
        if (!res.ok) return { status: 'none' } as NarrationLookupResponse;
        return (await res.json()) as NarrationLookupResponse;
      })
      .then(data => {
        if (abortController.signal.aborted) return;
        if (data.status === 'ready' && data.audioUrl && data.manifest) {
          setAudioUrl(data.audioUrl);
          setManifest(data.manifest);
          setStatus('ready');
        } else if (data.status === 'unavailable') {
          setStatus('unavailable');
        } else {
          setStatus('none');
        }
      })
      .catch(err => {
        if (err?.name === 'AbortError') return;
        setStatus('none');
      });

    return () => {
      abortController.abort();
    };
  }, [enabled, opusSupported, title, artist, locale, mode, contentHash]);

  // Apply playbackRate + pitch preservation on the active <audio> element
  const applyPlaybackRate = useCallback((a: HTMLAudioElement, rate: number) => {
    const clamped = Math.max(0.5, Math.min(4.0, rate));
    try {
      const pitchAudio = a as HTMLAudioElement & {
        webkitPreservesPitch?: boolean;
        mozPreservesPitch?: boolean;
      };
      pitchAudio.preservesPitch = true;
      pitchAudio.webkitPreservesPitch = true;
      pitchAudio.mozPreservesPitch = true;
      a.playbackRate = clamped;
    } catch {
      /* ignore unsupported rate */
    }
  }, []);

  useEffect(() => {
    const a = audioRef.current;
    if (a) applyPlaybackRate(a, playbackSpeed);
  }, [playbackSpeed, applyPlaybackRate]);

  // Build and manage the <audio> element for the current track
  useEffect(() => {
    if (!audioUrl || !manifest || failedForUrl === audioUrl) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      return;
    }

    const a = new Audio(audioUrl);
    a.preload = 'auto';
    applyPlaybackRate(a, speedRef.current);
    audioRef.current = a;
    lastReportedSegRef.current = -1;

    const syncSegmentFromTime = () => {
      if (!isPlayingRef.current) return;
      if (Date.now() < seekGuardUntilRef.current) return;
      const idx = findSegmentIndexForTimeMs(manifest.segments, a.currentTime * 1000);
      if (idx >= 0 && idx !== lastReportedSegRef.current) {
        lastReportedSegRef.current = idx;
        onSegmentChangeRef.current(idx);
      }
    };

    const handleEnded = () => {
      lastReportedSegRef.current = -1;
      onEndedRef.current();
    };

    const handleError = () => {
      setFailedForUrl(audioUrl);
      setStatus('none');
      onMediaErrorRef.current?.();
    };

    a.addEventListener('timeupdate', syncSegmentFromTime);
    a.addEventListener('seeked', syncSegmentFromTime);
    a.addEventListener('ended', handleEnded);
    a.addEventListener('error', handleError);

    const ticker = setInterval(() => {
      if (!a.paused && !a.ended) {
        syncSegmentFromTime();
      }
    }, 80);

    return () => {
      clearInterval(ticker);
      a.pause();
      a.removeEventListener('timeupdate', syncSegmentFromTime);
      a.removeEventListener('seeked', syncSegmentFromTime);
      a.removeEventListener('ended', handleEnded);
      a.removeEventListener('error', handleError);
      a.src = '';
      if (audioRef.current === a) audioRef.current = null;
    };
  }, [audioUrl, manifest, failedForUrl, applyPlaybackRate]);

  const isReady =
    status === 'ready' &&
    opusSupported &&
    Boolean(audioUrl) &&
    Boolean(manifest) &&
    failedForUrl !== audioUrl;

  const canPlayOpusSegment = useCallback(
    (segmentIndex: number) => {
      if (!isReady || !manifest) return false;
      if (segmentIndex < 0) return false;
      // Only cover the base guide segments; appended Q&A/deep-dive segments fall back to Web Speech.
      const limit = Math.min(manifest.segments.length, baseSegmentCount);
      return segmentIndex < limit;
    },
    [isReady, manifest, baseSegmentCount],
  );

  const seekToSegment = useCallback(
    (segmentIndex: number) => {
      const a = audioRef.current;
      if (!a || !manifest) return;
      const seg = manifest.segments[segmentIndex];
      if (!seg) return;
      seekGuardUntilRef.current = Date.now() + 180;
      lastReportedSegRef.current = segmentIndex;
      const targetMs =
        seg.endMs > seg.startMs ? Math.min(seg.startMs + 5, seg.endMs) : seg.startMs;
      const targetSec = Math.max(0, targetMs / 1000);
      try {
        a.currentTime = targetSec;
      } catch {
        /* ignore if metadata not yet loaded; playSegment will seek after metadata */
      }
    },
    [manifest],
  );

  const playSegment = useCallback(
    async (segmentIndex: number): Promise<boolean> => {
      const a = audioRef.current;
      if (!a || !manifest || !canPlayOpusSegment(segmentIndex)) {
        return false;
      }
      const seg = manifest.segments[segmentIndex];
      if (!seg) return false;

      applyPlaybackRate(a, speedRef.current);

      const currentTimeMs = a.currentTime * 1000;
      const currentIdx = findSegmentIndexForTimeMs(manifest.segments, currentTimeMs);
      if (!a.paused && !a.ended && currentIdx === segmentIndex) {
        lastReportedSegRef.current = segmentIndex;
        return true;
      }
      // Seek whenever paused at a different segment, after end, or explicitly out of segment window.
      if (a.ended || currentIdx !== segmentIndex) {
        seekGuardUntilRef.current = Date.now() + 200;
        lastReportedSegRef.current = segmentIndex;
        const targetMs =
          seg.endMs > seg.startMs ? Math.min(seg.startMs + 5, seg.endMs) : seg.startMs;
        const targetSec = Math.max(0, targetMs / 1000);
        if (a.readyState >= 1) {
          a.currentTime = targetSec;
        } else {
          a.addEventListener(
            'loadedmetadata',
            () => {
              try {
                a.currentTime = targetSec;
              } catch {
                /* ignore */
              }
            },
            { once: true },
          );
        }
      } else {
        lastReportedSegRef.current = segmentIndex;
      }

      try {
        await a.play();
        return true;
      } catch (err) {
        // NotAllowedError means autoplay blocked; decode/source errors trigger fallback.
        const name = (err as { name?: string })?.name;
        if (name && name !== 'NotAllowedError' && name !== 'AbortError') {
          setFailedForUrl(audioUrl);
          setStatus('none');
          onMediaErrorRef.current?.();
        }
        return false;
      }
    },
    [manifest, canPlayOpusSegment, applyPlaybackRate, audioUrl],
  );

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  return {
    status,
    opusSupported,
    isReady,
    canPlayOpusSegment,
    manifest,
    playSegment,
    seekToSegment,
    pause,
  };
}

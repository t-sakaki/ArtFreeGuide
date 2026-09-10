'use client';

import { useEffect, useRef, useState } from 'react';
import { Locale, themeSongStrings } from '@/lib/i18n';
import type { LyricTimeline } from '@/lib/lyricAlign';
import {
  AspectRatio,
  canExportVideo,
  downloadBlob,
  exportThemeSongVideo,
  ExportResult,
  VideoQuality,
} from '@/lib/videoExport';

/**
 * The "turn this into a video" sheet for the theme song. Picks an aspect ratio,
 * runs `exportThemeSongVideo` (WebCodecs, in a worker) with a progress bar, and
 * hands back a Save / Share for the finished MP4.
 */

const ASPECTS: AspectRatio[] = ['9:16', '16:9', '1:1'];
const QUALITIES: VideoQuality[] = ['low', 'lower', 'lowest'];

export default function VideoExportModal({
  locale,
  slug,
  lyrics,
  timings,
  timeline,
  title,
  artist,
  imageUrl,
  onClose,
}: {
  locale: Locale;
  slug: string;
  lyrics: string;
  timings: number[];
  timeline?: LyricTimeline | null;
  title: string;
  artist?: string;
  imageUrl?: string | null;
  onClose: () => void;
}) {
  const t = themeSongStrings(locale);
  const supported = canExportVideo();
  const [aspect, setAspect] = useState<AspectRatio>('9:16');
  const [quality, setQuality] = useState<VideoQuality>('low');
  const [phase, setPhase] = useState<'idle' | 'rendering' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!result) return;
    const url = URL.createObjectURL(result.blob);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setPreviewUrl(null);
    };
  }, [result]);

  const aspectLabel: Record<AspectRatio, string> = {
    '9:16': t.aspectPortrait,
    '16:9': t.aspectLandscape,
    '1:1': t.aspectSquare,
  };
  const qualityLabel: Record<VideoQuality, string> = {
    low: t.qualityLow,
    lower: t.qualityLower,
    lowest: t.qualityLowest,
  };

  async function start() {
    setPhase('rendering');
    setProgress(0);
    setResult(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await exportThemeSongVideo({
        slug,
        locale,
        lyrics,
        timings,
        timeline,
        title,
        artist,
        imageUrl,
        aspect,
        quality,
        onProgress: setProgress,
        signal: ctrl.signal,
      });
      setResult(res);
      setPhase('done');
      downloadBlob(res.blob, res.filename);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      console.error('video export failed', err);
      setPhase('error');
    }
  }

  async function share() {
    if (!result) return;
    const file = new File([result.blob], result.filename, { type: result.blob.type });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title });
        return;
      }
    } catch {
      /* fall through to download */
    }
    downloadBlob(result.blob, result.filename);
  }

  return (
    <div
      className="fixed inset-0 z-[130] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-slate-900 border border-white/10 p-5 text-white space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">🎬 {t.videoTitle}</h2>
          <button
            onClick={onClose}
            aria-label={t.videoClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center"
          >
            ✕
          </button>
        </div>

        {!supported ? (
          <p className="text-sm text-amber-300">{t.videoUnsupported}</p>
        ) : (
          <>
            <p className="text-xs text-white/60">{t.videoHint}</p>

            <div className="grid grid-cols-3 gap-2">
              {ASPECTS.map(a => (
                <button
                  key={a}
                  disabled={phase === 'rendering'}
                  onClick={() => setAspect(a)}
                  className={[
                    'rounded-lg px-2 py-2 text-[11px] font-semibold border transition',
                    aspect === a
                      ? 'bg-teal-500 text-black border-teal-400'
                      : 'bg-white/5 border-white/10 hover:bg-white/10',
                  ].join(' ')}
                >
                  {aspectLabel[a]}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {QUALITIES.map(q => (
                <button
                  key={q}
                  disabled={phase === 'rendering'}
                  onClick={() => setQuality(q)}
                  className={[
                    'rounded-lg px-2 py-2 text-[11px] font-semibold border transition',
                    quality === q
                      ? 'bg-teal-500 text-black border-teal-400'
                      : 'bg-white/5 border-white/10 hover:bg-white/10',
                  ].join(' ')}
                >
                  {qualityLabel[q]}
                </button>
              ))}
            </div>

            {phase === 'rendering' && (
              <div className="space-y-1">
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-teal-400 transition-[width] duration-200"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-white/60 text-center">
                  {t.videoRendering} {Math.round(progress * 100)}%
                </p>
              </div>
            )}

            {phase === 'error' && <p className="text-sm text-rose-300">{t.videoFailed}</p>}

            {phase === 'done' && previewUrl && (
              <video
                src={previewUrl}
                controls
                autoPlay
                loop
                playsInline
                className="w-full rounded-lg bg-black max-h-[46vh]"
              />
            )}

            <div className="flex items-center justify-center gap-2 pt-1">
              {phase === 'done' && result ? (
                <>
                  <button
                    onClick={() => downloadBlob(result.blob, result.filename)}
                    className="px-4 py-2 rounded-full bg-teal-500 hover:bg-teal-400 text-black text-sm font-bold"
                  >
                    ⬇ {t.videoSave}
                  </button>
                  {typeof navigator !== 'undefined' && 'share' in navigator && (
                    <button
                      onClick={share}
                      className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-sm font-semibold"
                    >
                      {t.videoShare}
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={start}
                  disabled={phase === 'rendering'}
                  className="px-5 py-2 rounded-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-black text-sm font-bold"
                >
                  {phase === 'rendering' ? `${Math.round(progress * 100)}%` : t.exportVideo}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

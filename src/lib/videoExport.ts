/**
 * Client-side orchestration for the theme-song MP4 export.
 *
 * Fetches the finished track and the artwork, decodes the audio, then hands raw
 * PCM + a bitmap to `workers/videoRender.worker` which does the WebCodecs
 * rendering off the main thread. The caller gets progress callbacks and, at the
 * end, a downloadable Blob.
 */

import { Locale, themeSongStrings } from '@/lib/i18n';
import type { LyricTimeline } from '@/lib/lyricAlign';
import { buildLyricTimeline } from '@/lib/lyricTimeline';
import type { RenderRequest, RenderMessage, VideoQuality } from '@/workers/videoRender.worker';

export type { VideoQuality };
export type AspectRatio = '9:16' | '16:9' | '1:1';

const DIMS: Record<AspectRatio, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
};

export function canExportVideo(): boolean {
  if (typeof window === 'undefined') return false;
  const g = globalThis as Record<string, unknown>;
  return (
    typeof g.VideoEncoder === 'function' &&
    typeof g.AudioEncoder === 'function' &&
    typeof g.OffscreenCanvas === 'function'
  );
}

export interface ExportOptions {
  slug: string;
  locale: Locale;
  lyrics: string;
  timings: number[];
  timeline?: LyricTimeline | null;
  title: string;
  artist?: string;
  imageUrl?: string | null;
  aspect: AspectRatio;
  quality?: VideoQuality;
  fps?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
}

async function decodeAudio(slug: string, locale: Locale, signal?: AbortSignal) {
  const res = await fetch(
    `/api/theme-song/audio?slug=${encodeURIComponent(slug)}&locale=${locale}`,
    { signal },
  );
  if (!res.ok) throw new Error(`audio ${res.status}`);
  const bytes = await res.arrayBuffer();
  const Ctx: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const actx = new Ctx();
  try {
    const buf = await actx.decodeAudioData(bytes);
    const channels: Float32Array[] = [];
    for (let c = 0; c < buf.numberOfChannels; c++) channels.push(new Float32Array(buf.getChannelData(c)));
    return { channels, sampleRate: buf.sampleRate, duration: buf.duration };
  } finally {
    actx.close();
  }
}

async function loadBitmap(imageUrl: string | null | undefined, signal?: AbortSignal): Promise<ImageBitmap | null> {
  if (!imageUrl) return null;
  try {
    const proxied = /^https?:\/\//i.test(imageUrl)
      ? `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`
      : imageUrl;
    const res = await fetch(proxied, { signal });
    if (!res.ok) return null;
    return await createImageBitmap(await res.blob());
  } catch {
    return null;
  }
}

export async function exportThemeSongVideo(opts: ExportOptions): Promise<ExportResult> {
  if (!canExportVideo()) throw new Error('unsupported');
  const fps = opts.fps ?? 30;
  const { width, height } = DIMS[opts.aspect];

  const [{ channels, sampleRate, duration }, image] = await Promise.all([
    decodeAudio(opts.slug, opts.locale, opts.signal),
    loadBitmap(opts.imageUrl, opts.signal),
  ]);
  if (!duration || !Number.isFinite(duration)) throw new Error('bad-duration');

  const spans = buildLyricTimeline(opts.lyrics, opts.timings, duration, opts.timeline);
  const credit = themeSongStrings(opts.locale).credit;

  const worker = new Worker(new URL('../workers/videoRender.worker.ts', import.meta.url), {
    type: 'module',
  });

  try {
    return await new Promise<ExportResult>((resolve, reject) => {
      const onAbort = () => {
        worker.terminate();
        reject(new DOMException('aborted', 'AbortError'));
      };
      opts.signal?.addEventListener('abort', onAbort, { once: true });

      worker.onmessage = (e: MessageEvent<RenderMessage>) => {
        const msg = e.data;
        if (msg.type === 'progress') {
          opts.onProgress?.(msg.value);
        } else if (msg.type === 'done') {
          opts.signal?.removeEventListener('abort', onAbort);
          resolve({
            blob: new Blob([msg.buffer], { type: msg.mimeType }),
            filename: `${opts.slug}-${opts.locale}.${msg.ext}`,
          });
        } else {
          opts.signal?.removeEventListener('abort', onAbort);
          reject(new Error(msg.message));
        }
      };
      worker.onerror = ev => reject(new Error(ev.message || 'worker error'));

      const req: RenderRequest = {
        image,
        channels,
        sampleRate,
        spans,
        duration,
        width,
        height,
        fps,
        quality: opts.quality ?? 'medium',
        title: opts.title,
        artist: opts.artist ?? '',
        credit,
      };
      const transfer: Transferable[] = channels.map(c => c.buffer);
      if (image) transfer.push(image);
      worker.postMessage(req, transfer);
    });
  } finally {
    worker.terminate();
  }
}

/** Trigger a browser download for a finished export. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

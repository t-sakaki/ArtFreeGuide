/// <reference lib="webworker" />

/**
 * Renders the theme-song "music video" to an MP4 (or WebM where H.264 encoding
 * is unavailable), entirely in the browser via WebCodecs.
 *
 * The visual language mirrors `ThemeSongFullscreen`: the artwork drifts behind a
 * karaoke telop — two or three lines visible, scrolling upward, the current line
 * filling left-to-right over its own duration. Layout comes from
 * `buildLyricTimeline`, so the recording and the live view stay in step.
 *
 * This is a rendering worker only: it is handed decoded PCM and a bitmap, and it
 * posts `progress` / `done` / `error` back to `lib/videoExport`.
 */

import {
  Output,
  BufferTarget,
  Mp4OutputFormat,
  WebMOutputFormat,
  CanvasSource,
  AudioSampleSource,
  AudioSample,
  canEncodeVideo,
  Quality,
  QUALITY_LOW,
  QUALITY_MEDIUM,
  QUALITY_VERY_LOW,
} from 'mediabunny';
import type { LyricSpan } from '@/lib/lyricTimeline';
import { activeLyricIndex } from '@/lib/lyricTimeline';

export type VideoQuality = 'low' | 'lower' | 'lowest';

export interface RenderRequest {
  image: ImageBitmap | null;
  channels: Float32Array[];
  sampleRate: number;
  spans: LyricSpan[];
  duration: number;
  width: number;
  height: number;
  fps: number;
  quality: VideoQuality;
  title: string;
  artist: string;
  credit: string;
}

const VIDEO_QUALITY = {
  low: QUALITY_LOW,
  lower: new Quality(0.12),
  lowest: QUALITY_VERY_LOW,
} as const;

export type RenderMessage =
  | { type: 'progress'; value: number }
  | { type: 'done'; buffer: ArrayBuffer; mimeType: string; ext: string }
  | { type: 'error'; message: string };

const ACCENT_FALLBACK = '#2dd4bf';
const ANCHOR_FRACTION = 0.6;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function easeInOut(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}
function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

interface Row {
  text: string;
  spanIdx: number;
  section: boolean;
  /** Y of the row's top within the scrolling strip. */
  top: number;
  height: number;
  /** Character offset of this row within its span (for the wipe). */
  charOffset: number;
}

/** A vivid accent colour pulled from the artwork — the most saturated, mid-bright pixels win. */
function extractAccent(bmp: ImageBitmap): string {
  try {
    const c = new OffscreenCanvas(28, 28);
    const x = c.getContext('2d', { alpha: false })!;
    x.drawImage(bmp, 0, 0, 28, 28);
    const d = x.getImageData(0, 0, 28, 28).data;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let sw = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max < 45 || max > 245) continue;
      const sat = (max - min) / max;
      const w = sat * sat * (max / 255);
      sr += r * w;
      sg += g * w;
      sb += b * w;
      sw += w;
    }
    if (sw < 0.5) return ACCENT_FALLBACK;
    let r = sr / sw;
    let g = sg / sw;
    let b = sb / sw;
    // push it a little brighter and more saturated so it reads as a highlight
    const mean = (r + g + b) / 3;
    r = clamp(mean + (r - mean) * 1.5 + 22, 0, 255);
    g = clamp(mean + (g - mean) * 1.5 + 22, 0, 255);
    b = clamp(mean + (b - mean) * 1.5 + 22, 0, 255);
    return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
  } catch {
    return ACCENT_FALLBACK;
  }
}

/** Fraction of the active line that has been "sung" by time `t` (0..1). */
function wipeProgress(span: LyricSpan, t: number): number {
  const ct = span.charTimes;
  if (ct && ct.length) {
    if (t <= ct[0]) return 0;
    if (t >= ct[ct.length - 1]) return 1;
    let lo = 0;
    let hi = ct.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ct[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    const a = ct[lo - 1];
    const b = ct[lo];
    return (lo - 1 + (t - a) / Math.max(b - a, 1e-3)) / ct.length;
  }
  return clamp(((t - span.start) / Math.max(span.end - span.start, 0.001)) * 1.06, 0, 1);
}

function wrap(
  ctx: OffscreenCanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font: string,
): string[] {
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) return [text];

  const hasSpaces = /\s/.test(text.trim());
  const units = hasSpaces ? text.split(/(\s+)/) : Array.from(text);
  const rows: string[] = [];
  let line = '';
  for (const u of units) {
    const next = line + u;
    if (ctx.measureText(next).width > maxWidth && line.trim()) {
      rows.push(line.trimEnd());
      line = u.trimStart();
    } else {
      line = next;
    }
  }
  if (line.trim()) rows.push(line.trimEnd());
  return rows.length ? rows : [text];
}

self.onmessage = (e: MessageEvent<RenderRequest>) => {
  run(e.data).catch(err => {
    const msg: RenderMessage = { type: 'error', message: String((err as Error)?.message ?? err) };
    (self as unknown as Worker).postMessage(msg);
  });
};

async function run(req: RenderRequest): Promise<void> {
  const { width, height, fps, duration, spans, image, quality } = req;
  const videoQuality = VIDEO_QUALITY[quality];

  const avc = await canEncodeVideo('avc', { width, height });
  const videoCodec: 'avc' | 'vp9' = avc ? 'avc' : 'vp9';
  const isMp4 = videoCodec === 'avc';

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const accent = image ? extractAccent(image) : ACCENT_FALLBACK;
  const sectionStarts = spans.filter(s => s.section && s.start > 0.5).map(s => s.start);

  const output = new Output({
    format: isMp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });

  const videoSource = new CanvasSource(canvas, {
    codec: videoCodec,
    quality: videoQuality,
    keyFrameInterval: 2,
  });
  output.addVideoTrack(videoSource, { frameRate: fps });

  const numCh = Math.max(1, req.channels.length);
  const audioSource = new AudioSampleSource({
    codec: isMp4 ? 'aac' : 'opus',
    quality: QUALITY_MEDIUM,
  });
  output.addAudioTrack(audioSource);

  await output.start();

  // --- audio: one ~1s planar chunk at a time -------------------------------
  const totalSamples = req.channels[0]?.length ?? 0;
  const CHUNK = req.sampleRate;
  for (let off = 0; off < totalSamples; off += CHUNK) {
    const n = Math.min(CHUNK, totalSamples - off);
    const buf = new Float32Array(n * numCh);
    for (let c = 0; c < numCh; c++) buf.set(req.channels[c].subarray(off, off + n), c * n);
    const sample = new AudioSample({
      data: buf,
      format: 'f32-planar',
      numberOfChannels: numCh,
      sampleRate: req.sampleRate,
      timestamp: off / req.sampleRate,
    });
    await audioSource.add(sample);
    sample.close();
  }

  // --- telop layout ------------------------------------------------------
  const margin = Math.round(width * 0.08);
  const maxTextWidth = width - margin * 2;
  const bodyPx = Math.round(width * 0.05);
  const activePx = Math.round(width * 0.064);
  const sectionPx = Math.round(width * 0.03);
  const bodyFont = `600 ${bodyPx}px "Hiragino Sans","Noto Sans JP","Noto Sans",sans-serif`;
  const activeFont = `800 ${activePx}px "Hiragino Sans","Noto Sans JP","Noto Sans",sans-serif`;
  const sectionFont = `700 ${sectionPx}px "Hiragino Sans","Noto Sans JP","Noto Sans",sans-serif`;
  const bodyLh = Math.round(bodyPx * 1.42);
  const sectionLh = Math.round(sectionPx * 2.2);

  const rows: Row[] = [];
  const spanTop: number[] = [];
  let cursor = 0;
  spans.forEach((span, si) => {
    spanTop[si] = cursor;
    const font = span.section ? sectionFont : bodyFont;
    const lh = span.section ? sectionLh : bodyLh;
    const wrapped = wrap(ctx, span.text, maxTextWidth, font);
    let charOffset = 0;
    for (const line of wrapped) {
      rows.push({ text: line, spanIdx: si, section: span.section, top: cursor, height: lh, charOffset });
      charOffset += line.length;
      cursor += lh;
    }
  });
  const stripEnd = cursor;
  const anchorY = height * ANCHOR_FRACTION;

  function scrollPos(t: number): number {
    const active = activeLyricIndex(spans, t);
    if (active < 0) return spanTop[0] ?? 0;
    const span = spans[active];
    const from = spanTop[active];
    const to = spanTop[active + 1] ?? stripEnd;
    const prog = clamp((t - span.start) / Math.max(span.end - span.start, 0.001), 0, 1);
    return from + (to - from) * easeInOut(prog);
  }

  // --- background ------------------------------------------------------
  function sectionPulse(t: number): number {
    let p = 0;
    for (const ss of sectionStarts) {
      const dt = t - ss;
      if (dt >= 0 && dt < 0.55) p = Math.max(p, 1 - dt / 0.55);
    }
    return p;
  }

  function drawBackground(t: number) {
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, width, height);
    const pulse = sectionPulse(t);
    if (image) {
      const p = duration > 0 ? t / duration : 0;
      const zoom = 1.05 + 0.12 * p + 0.035 * easeInOut(pulse);
      const cx = 0.5 + 0.045 * Math.sin(p * Math.PI * 0.7);
      const cy = 0.5 + 0.03 * Math.cos(p * Math.PI * 0.9);
      const scale = Math.max(width / image.width, height / image.height) * zoom;
      const dw = image.width * scale;
      const dh = image.height * scale;
      ctx.drawImage(image, (width - dw) * cx, (height - dh) * cy, dw, dh);
    }
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, 'rgba(3,5,10,0.66)');
    g.addColorStop(0.4, 'rgba(3,5,10,0.4)');
    g.addColorStop(0.62, 'rgba(3,5,10,0.72)');
    g.addColorStop(1, 'rgba(3,5,10,0.95)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    if (pulse > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.14 * pulse;
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }

  function drawHeader(t: number) {
    const alpha = clamp(Math.min((t - 0.3) / 0.9, (5 - t) / 1), 0, 1);
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${Math.round(width * 0.052)}px "Hiragino Sans","Noto Sans JP",sans-serif`;
    ctx.fillText(`🎵 ${req.title}`, margin, height * 0.13, maxTextWidth);
    if (req.artist) {
      ctx.globalAlpha = alpha * 0.85;
      ctx.fillStyle = accent;
      ctx.font = `600 ${Math.round(width * 0.032)}px "Hiragino Sans","Noto Sans JP",sans-serif`;
      ctx.fillText(req.artist, margin, height * 0.13 + width * 0.05, maxTextWidth);
    }
    ctx.restore();
  }

  function drawTelop(t: number) {
    const active = activeLyricIndex(spans, t);
    const pos = scrollPos(t);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (const row of rows) {
      const y = anchorY + (row.top - pos) + row.height / 2;
      if (y < -row.height || y > height + row.height) continue;

      const rel = row.spanIdx - active;
      const fade = clamp(1 - Math.abs(anchorY - y) / (height * 0.5), 0.12, 1);

      if (row.section) {
        ctx.font = sectionFont;
        ctx.save();
        ctx.globalAlpha = 0.5 * fade;
        ctx.fillStyle = accent;
        ctx.fillText(row.text.toUpperCase(), margin, y);
        ctx.restore();
        continue;
      }

      if (rel === 0) {
        // active line: dim base, then a left-to-right karaoke wipe
        ctx.font = activeFont;
        ctx.fillStyle = `rgba(255,255,255,0.3)`;
        ctx.fillText(row.text, margin, y);

        const span = spans[row.spanIdx];
        const prog = wipeProgress(span, t);
        const totalChars = Math.max(span.text.length, 1);
        const filled = clamp(prog * totalChars - row.charOffset, 0, row.text.length);
        if (filled > 0) {
          const w = ctx.measureText(row.text.slice(0, Math.ceil(filled))).width;
          ctx.save();
          ctx.beginPath();
          ctx.rect(margin, y - row.height / 2, w + width * 0.012, row.height);
          ctx.clip();
          ctx.fillStyle = accent;
          ctx.shadowColor = accent;
          ctx.shadowBlur = width * 0.022;
          ctx.fillText(row.text, margin, y);
          ctx.restore();
        }
      } else {
        ctx.font = bodyFont;
        const a = rel < 0 ? 0.3 * fade : 0.55 * fade;
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.fillText(row.text, margin, y);
      }
    }
  }

  function drawFooter(t: number) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = `500 ${Math.round(width * 0.022)}px "Hiragino Sans","Noto Sans JP",sans-serif`;
    ctx.fillText(req.credit, width / 2, height - height * 0.03, maxTextWidth);

    const barW = width * 0.84;
    const x0 = (width - barW) / 2;
    const y0 = height - height * 0.055;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x0, y0, barW, 3);
    ctx.fillStyle = accent;
    ctx.fillRect(x0, y0, barW * clamp(duration > 0 ? t / duration : 0, 0, 1), 3);
  }

  // --- frame loop ------------------------------------------------------
  const totalFrames = Math.max(1, Math.ceil(duration * fps));
  for (let f = 0; f < totalFrames; f++) {
    const t = f / fps;
    drawBackground(t);
    drawHeader(t);
    drawTelop(t);
    drawFooter(t);
    await videoSource.add(t, 1 / fps);
    if (f % 6 === 0 || f === totalFrames - 1) {
      const msg: RenderMessage = { type: 'progress', value: (f + 1) / totalFrames };
      (self as unknown as Worker).postMessage(msg);
    }
  }

  await output.finalize();
  const buffer = (output.target as BufferTarget).buffer!;
  const done: RenderMessage = {
    type: 'done',
    buffer,
    mimeType: isMp4 ? 'video/mp4' : 'video/webm',
    ext: isMp4 ? 'mp4' : 'webm',
  };
  (self as unknown as Worker).postMessage(done, [buffer]);
}

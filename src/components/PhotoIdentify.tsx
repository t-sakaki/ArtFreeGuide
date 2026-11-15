'use client';

import { useRef, useState } from 'react';
import { Locale, UIStrings } from '@/lib/i18n';

/** Enough detail for a wall label to stay legible, small enough to upload on 4G. */
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.82;

/** Matches the ceiling in src/lib/vision.ts, minus room for the JSON envelope. */
const MAX_DATA_URL_LENGTH = 4 * 1024 * 1024;

/** Below this, the reading is shown but never acted on without a confirmation. */
const LOW_CONFIDENCE = 0.6;

interface IdentifyResponse {
  title?: string | null;
  artist?: string | null;
  confidence?: number;
  source?: 'caption' | 'artwork';
  error?: string;
}

interface Reading {
  title: string;
  artist: string;
  confidence: number;
  source: 'caption' | 'artwork';
}

/** Downscales in the browser so the worker never sees a 12 megapixel photo. */
async function toCompactDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas unavailable');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

interface Props {
  locale: Locale;
  t: UIStrings['camera'];
  disabled?: boolean;
  /** Fills the search form, so the visitor can correct the reading before using it. */
  onPrefill: (title: string, artist: string) => void;
  onApply: (title: string, artist: string) => void;
}

/**
 * "Point the camera at the label" as an alternative to typing a name.
 *
 * Whatever comes back is only ever a suggestion: it lands in the search form
 * for the visitor to correct, and nothing is generated until they confirm.
 */
export default function PhotoIdentify({ locale, t, disabled, onPrefill, onApply }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [reading, setReading] = useState<Reading | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(null);
    setMessage(null);
    setScanning(true);

    try {
      const image = await toCompactDataUrl(file);
      if (image.length > MAX_DATA_URL_LENGTH) {
        setMessage(t.tooLarge);
        return;
      }

      const res = await fetch('/api/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, locale })
      });
      const data = (await res.json()) as IdentifyResponse;

      if (!res.ok) {
        setMessage(t.failed);
        return;
      }

      const title = data.title?.trim();
      if (!title) {
        setMessage(t.notFound);
        return;
      }

      const found: Reading = {
        title,
        artist: data.artist?.trim() ?? '',
        confidence: typeof data.confidence === 'number' ? data.confidence : 0,
        source: data.source === 'artwork' ? 'artwork' : 'caption'
      };
      setReading(found);
      onPrefill(found.title, found.artist);
    } catch {
      setMessage(t.failed);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-3 font-sans">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={event => {
          const file = event.target.files?.[0];
          // Lets the same photo be picked twice in a row.
          event.target.value = '';
          void handleFile(file);
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || scanning}
        className="w-full bg-slate-950/80 border border-slate-800 hover:border-teal-500/40 hover:bg-slate-900 text-slate-300 hover:text-teal-400 rounded-xl px-4 py-3 text-sm font-bold active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {scanning ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>{t.scanning}</span>
          </>
        ) : (
          <span>{t.scan}</span>
        )}
      </button>

      {message && (
        <p className="text-xs text-amber-400/90 text-left leading-relaxed" role="status">
          {message}
        </p>
      )}

      {reading && (
        <div className="bg-slate-950/70 border border-teal-900/60 rounded-2xl p-4 space-y-3 text-left animate-fade-in">
          <p className="text-[11px] text-slate-500">
            {reading.source === 'caption' ? t.fromCaption : t.fromArtwork}
          </p>
          <p className="text-sm font-bold text-slate-100">
            {reading.title}
            {reading.artist && <span className="text-slate-400 font-medium"> — {reading.artist}</span>}
          </p>
          <p className={`text-xs ${reading.confidence < LOW_CONFIDENCE ? 'text-amber-400/90' : 'text-slate-400'}`}>
            {t.confirm}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setReading(null);
                onApply(reading.title, reading.artist);
              }}
              className="flex-1 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs py-2.5 rounded-xl active:scale-[0.98] transition-all"
            >
              {t.apply}
            </button>
            <button
              type="button"
              onClick={() => setReading(null)}
              className="text-xs text-slate-400 hover:text-slate-200 px-3 underline underline-offset-2"
            >
              {t.dismiss}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Hotspot } from '@/lib/hotspots';

interface Frame {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ArtworkStageProps {
  imageUrl: string;
  alt: string;
  hotspots: Hotspot[];
  activeHotspotId: string | null;
  onSelect: (id: string | null) => void;
  /** Slow drift while the narration plays; suppressed while a point is focused. */
  kenBurns?: boolean;
  className?: string;
}

/**
 * Shows an artwork with its curated viewing points.
 *
 * The image is letterboxed (object-contain), so hotspot coordinates can only be
 * placed once the displayed rectangle is known — hence the measured frame
 * rather than positioning marks against the container.
 *
 * The marks stay deliberately quiet: an almost transparent dot at rest, since
 * anything with a hard edge reads as part of the painting. Motion is reserved
 * for the point currently being talked about, which is the only one that
 * blinks; hover and focus lift a resting dot just enough to aim at.
 */
export default function ArtworkStage({
  imageUrl,
  alt,
  hotspots,
  activeHotspotId,
  onSelect,
  kenBurns = false,
  className = '',
}: ArtworkStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el || !natural) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (!cw || !ch) return;
    const scale = Math.min(cw / natural.w, ch / natural.h);
    const width = natural.w * scale;
    const height = natural.h * scale;
    setFrame({ left: (cw - width) / 2, top: (ch - height) / 2, width, height });
  }, [natural]);

  useEffect(() => {
    measure();
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  useEffect(() => {
    setNatural(null);
    setFrame(null);
  }, [imageUrl]);

  const active = hotspots.find(h => h.id === activeHotspotId) ?? null;
  const zoom = active ? active.zoom : 1;
  // Centring a point near the edge would pull the picture off the frame, so the
  // pan is clamped to whatever still keeps the image covering the stage.
  const limit = 0.5 - 0.5 / zoom;
  const pan = (offset: number) => Math.max(-limit, Math.min(limit, offset)) * 100;
  const stageTransform = active
    ? `scale(${zoom}) translate(${pan(0.5 - active.x)}%, ${pan(0.5 - active.y)}%)`
    : 'none';

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden ${className}`}
      onClick={() => onSelect(null)}
    >
      <div
        className="absolute transition-transform duration-1000 ease-out"
        style={
          frame
            ? { left: frame.left, top: frame.top, width: frame.width, height: frame.height, transform: stageTransform }
            : { inset: 0, transform: stageTransform }
        }
      >
        <img
          src={imageUrl}
          alt={alt}
          onLoad={event => {
            const img = event.currentTarget;
            setNatural({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
          }}
          className={`w-full h-full ${frame ? 'object-fill' : 'object-contain'} ${
            kenBurns && !active ? 'animate-ken-burns' : ''
          }`}
        />

        {frame &&
          hotspots.map(hotspot => {
            const isActive = hotspot.id === activeHotspotId;
            return (
              <button
                key={hotspot.id}
                type="button"
                aria-label={hotspot.label}
                onClick={event => {
                  event.stopPropagation();
                  onSelect(isActive ? null : hotspot.id);
                }}
                className="group absolute w-8 h-8 -ml-4 -mt-4 rounded-full flex items-center justify-center"
                style={{
                  left: `${hotspot.x * 100}%`,
                  top: `${hotspot.y * 100}%`,
                  transform: `scale(${1 / zoom})`,
                }}
              >
                {isActive ? (
                  <span className="absolute inset-1 rounded-full border border-teal-200/70 animate-hotspot-blink" />
                ) : (
                  <span className="absolute inset-2.5 rounded-full bg-teal-100/25 transition-all group-hover:inset-1 group-hover:bg-transparent group-hover:border group-hover:border-teal-200/60 group-focus-visible:inset-1 group-focus-visible:bg-transparent group-focus-visible:border group-focus-visible:border-teal-200/60" />
                )}
              </button>
            );
          })}
      </div>

      {active && (
        <div className="absolute left-2 bottom-2 right-2 pointer-events-none">
          <span className="inline-block bg-slate-950/85 border border-teal-500/40 text-teal-300 text-[11px] font-bold font-sans px-2.5 py-1 rounded-full shadow-lg">
            🔍 {active.label}
          </span>
        </div>
      )}
    </div>
  );
}

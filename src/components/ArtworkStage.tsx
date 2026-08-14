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
  const stageTransform = active
    ? `scale(${zoom}) translate(${(0.5 - active.x) * 100}%, ${(0.5 - active.y) * 100}%)`
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
                className="absolute w-7 h-7 -ml-3.5 -mt-3.5 rounded-full flex items-center justify-center"
                style={{
                  left: `${hotspot.x * 100}%`,
                  top: `${hotspot.y * 100}%`,
                  transform: `scale(${1 / zoom})`,
                }}
              >
                <span
                  className={`absolute inset-0 rounded-full border-2 transition-all ${
                    isActive ? 'border-teal-300 bg-teal-400/25' : 'border-white/70 bg-slate-950/25 hover:border-teal-300'
                  }`}
                />
                {!isActive && <span className="absolute inset-0 rounded-full border-2 border-teal-300/70 animate-hotspot-ping" />}
                <span className="relative w-1.5 h-1.5 rounded-full bg-white shadow" />
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

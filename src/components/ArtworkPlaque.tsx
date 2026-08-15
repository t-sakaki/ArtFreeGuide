'use client';

/**
 * What is shown when no trustworthy picture was found.
 *
 * A broken-image icon reads as a bug in an art app, so the frame is filled with
 * the museum's own answer to a missing work: a wall plaque. The colours are
 * derived from the title, so each artwork keeps its own plaque between visits.
 */

interface ArtworkPlaqueProps {
  title: string;
  artist: string;
  note: string;
  searchLabel: string;
  /** Latin keywords work better on Commons than the canonical Japanese title. */
  searchQuery: string;
}

function hueOf(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 360;
  }
  return hash;
}

export default function ArtworkPlaque({
  title,
  artist,
  note,
  searchLabel,
  searchQuery
}: ArtworkPlaqueProps) {
  const hue = hueOf(`${title}${artist}`);
  const commonsUrl = `https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(
    searchQuery
  )}&ns6=1`;

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center select-none"
      style={{
        background: `radial-gradient(circle at 30% 20%, hsl(${hue} 45% 22%), hsl(${
          (hue + 40) % 360
        } 40% 10%) 70%)`
      }}
    >
      <p className="text-slate-300/70 text-[10px] tracking-[0.3em] font-sans uppercase">{note}</p>
      <p className="text-slate-100 text-base sm:text-lg font-bold leading-tight line-clamp-2">{title}</p>
      {artist && <p className="text-slate-300/80 text-xs font-sans">{artist}</p>}
      <a
        href={commonsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 text-[10px] font-sans text-teal-300/80 hover:text-teal-200 underline underline-offset-2"
      >
        {searchLabel}
      </a>
    </div>
  );
}

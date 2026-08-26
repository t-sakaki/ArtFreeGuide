/**
 * Readable permalinks. The Japanese title stays the canonical key everywhere in
 * the code, but an address bar — and a crawler — wants latin letters, so every
 * named artwork and tour also answers to an English slug.
 */
import { ARTWORK_NAMES, NAMES } from './names';
import { PLAYLISTS } from './playlists';

export interface SlugArtwork {
  slug: string;
  /** The Japanese title, which is what the rest of the app speaks. */
  title: string;
  artist: string;
}

/** Latin letters, digits and hyphens only: accents and punctuation are dropped. */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const RESERVED = new Set(['admin', 'api', 'robots.txt', 'sitemap.xml', ...PLAYLISTS.map(p => p.id)]);

/** The painter, for the artworks a tour happens to name. */
const ARTIST_OF = new Map(
  PLAYLISTS.flatMap(playlist => playlist.items).map(item => [item.title, item.artist])
);

const BY_SLUG = new Map<string, SlugArtwork>();
const BY_TITLE = new Map<string, string>();

for (const title of Object.keys(ARTWORK_NAMES)) {
  const artist = ARTIST_OF.get(title) ?? '';
  const base = slugify(ARTWORK_NAMES[title].en ?? '');
  // A title with no latin form is no better than the query string, and a tour
  // owns its own permalink, so those artworks keep the query string.
  if (!base) continue;

  const taken = BY_SLUG.get(base);
  if (!taken && !RESERVED.has(base)) {
    BY_SLUG.set(base, { slug: base, title, artist });
    BY_TITLE.set(title, base);
    continue;
  }

  // The same English title twice is either two paintings — the painter settles
  // it — or the same painting under two Japanese spellings, which then share
  // the permalink, the catalogue's own spelling being the one it opens.
  if (taken && (!artist || !taken.artist || taken.artist === artist)) {
    BY_SLUG.set(base, { slug: base, title, artist: artist || taken.artist });
    BY_TITLE.set(title, base);
    continue;
  }

  const painter = slugify(NAMES[artist]?.en ?? artist);
  const disambiguated = painter ? `${base}-${painter}` : '';
  if (!disambiguated || BY_SLUG.has(disambiguated)) continue;
  BY_SLUG.set(disambiguated, { slug: disambiguated, title, artist });
  BY_TITLE.set(title, disambiguated);
}

export const SLUG_ARTWORKS: SlugArtwork[] = [...BY_SLUG.values()];

/** The permalink segment for an artwork, when it has one. */
export function artworkSlug(title: string): string | null {
  return BY_TITLE.get(title.trim()) ?? null;
}

export function artworkFromSlug(slug: string): SlugArtwork | null {
  return BY_SLUG.get(slug.toLowerCase()) ?? null;
}

/** Tour ids are already written as slugs, so a permalink only has to find one. */
export function tourFromSlug(slug: string) {
  return PLAYLISTS.find(playlist => playlist.id === slug.toLowerCase()) ?? null;
}

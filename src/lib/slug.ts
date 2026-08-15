/**
 * Readable permalinks. The Japanese title stays the canonical key everywhere in
 * the code, but an address bar — and a crawler — wants latin letters, so every
 * curated artwork and tour also answers to an English slug.
 */
import { NAMES } from './names';
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

/** Landing-screen artworks that no tour happens to contain. */
const EXTRA_ARTWORKS: { title: string; artist: string }[] = [
  { title: 'モナ・リザ', artist: 'レオナルド・ダ・ヴィンチ' },
  { title: '富嶽三十六景 神奈川沖浪裏', artist: '葛飾北斎' },
];

const RESERVED = new Set(['admin', 'api', 'robots.txt', 'sitemap.xml', ...PLAYLISTS.map(p => p.id)]);

function build(): SlugArtwork[] {
  const works = [...PLAYLISTS.flatMap(playlist => playlist.items), ...EXTRA_ARTWORKS];
  const bySlug = new Map<string, SlugArtwork>();
  const seen = new Set<string>();

  for (const { title, artist } of works) {
    if (seen.has(title)) continue;
    seen.add(title);

    const base = slugify(NAMES[title]?.en ?? title);
    // A slug without latin letters (an untranslated title) is no better than the
    // query string, so those artworks keep using it.
    if (!base) continue;

    // Two artists painted Sunflowers; the painter's name settles it.
    const slug =
      bySlug.has(base) || RESERVED.has(base)
        ? `${base}-${slugify(NAMES[artist]?.en ?? artist)}`
        : base;
    if (!slug || bySlug.has(slug)) continue;
    bySlug.set(slug, { slug, title, artist });
  }

  return [...bySlug.values()];
}

export const SLUG_ARTWORKS: SlugArtwork[] = build();

const BY_SLUG = new Map(SLUG_ARTWORKS.map(work => [work.slug, work]));
const BY_TITLE = new Map(SLUG_ARTWORKS.map(work => [work.title, work]));

/** The permalink segment for an artwork, when it has one. */
export function artworkSlug(title: string): string | null {
  return BY_TITLE.get(title.trim())?.slug ?? null;
}

export function artworkFromSlug(slug: string): SlugArtwork | null {
  return BY_SLUG.get(slug.toLowerCase()) ?? null;
}

/** Tour ids are already written as slugs, so a permalink only has to find one. */
export function tourFromSlug(slug: string) {
  return PLAYLISTS.find(playlist => playlist.id === slug.toLowerCase()) ?? null;
}

import { Locale } from './i18n';
import data from './names.data.json';

/**
 * Titles and artist names for the curated data (quick starts, tours, hotspots).
 *
 * The Japanese form stays the canonical key everywhere in the code; these maps
 * are applied at the edges — what the visitor reads, and what is sent to the
 * LLM, which needs the name the sources use in that language.
 *
 * Supabase (`artwork_names` / `artist_names` / `title_aliases`) holds the
 * editable copy; `names.data.json` is written from it by
 * `scripts/sync_names.mjs`, so slugs and the sitemap stay build time constants.
 * Row order is meaningful: for two spellings of one work the catalogue's own
 * comes last, so a translated name resolves back to it.
 */
type Translations = Partial<Record<Exclude<Locale, 'ja'>, string>>;

interface NameRow extends Translations {
  ja: string;
}

interface NameData {
  artists: NameRow[];
  artworks: NameRow[];
  aliases: { spoken: string; catalogue: string }[];
}

function toMap(rows: NameRow[]): Record<string, Translations> {
  return Object.fromEntries(
    rows.map(({ ja, ...translations }) => [ja, translations])
  );
}

const NAME_DATA = data as NameData;

export const ARTIST_NAMES: Record<string, Translations> = toMap(NAME_DATA.artists);

/** Kept apart from the artists so that permalinks can be built from titles. */
export const ARTWORK_NAMES: Record<string, Translations> = toMap(NAME_DATA.artworks);

export const NAMES: Record<string, Translations> = { ...ARTIST_NAMES, ...ARTWORK_NAMES };

/**
 * The names the guide speaks for works the catalogue and the sources list
 * under another title. A search finds nothing for the spoken form, so it is
 * replaced by the catalogued one before an artwork is looked up.
 */
export const SPOKEN_TITLES: Record<string, string> = Object.fromEntries(
  NAME_DATA.aliases.map(({ spoken, catalogue }) => [spoken, catalogue])
);

/** The catalogued title for a name the guide made up, or the name itself. */
export function catalogueTitle(title: string): string {
  const trimmed = title.trim();
  return SPOKEN_TITLES[trimmed] ?? trimmed;
}
/** The name as the visitor's language writes it, or the original if unknown. */
export function localizeName(name: string, locale: Locale): string {
  if (locale === 'ja') return name;
  return NAMES[name.trim()]?.[locale] ?? name;
}

const CANONICAL = new Map<string, string>();
for (const [japanese, translations] of Object.entries(NAMES)) {
  for (const translated of Object.values(translations)) {
    CANONICAL.set(translated.toLowerCase(), japanese);
  }
}

/**
 * The Japanese form of a translated name. Used before an artwork reaches the
 * archive or the image search, so that a work listened to as "Sunflowers" and
 * one listened to as「ひまわり」are the same artwork everywhere but on screen.
 */
export function canonicalName(name: string): string {
  const trimmed = name.trim();
  return CANONICAL.get(trimmed.toLowerCase()) ?? trimmed;
}

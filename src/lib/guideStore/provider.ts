import { Locale } from '../i18n';

/** A generated guide, stored verbatim so a repeat visit skips the LLM entirely. */
export interface StoredGuide {
  /** The raw JSON payload the guide endpoint returned to the browser. */
  payload: string;
  updatedAt: string | null;
}

/** An artwork the archive already holds a guide for, so it plays with no wait. */
export interface ArchivedGuide {
  title: string;
  artist: string;
}

export interface GuideStore {
  readonly name: string;
  get(title: string, artist: string, locale?: Locale): Promise<StoredGuide | null>;
  put(title: string, artist: string, payload: string, locale?: Locale): Promise<void>;
  /** Titles/artists in the archive matching a free-text fragment. */
  search(query: string, limit: number): Promise<ArchivedGuide[]>;
}

/** LIKE treats these as wildcards, and visitors type them as plain characters. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, ch => `\\${ch}`);
}

/**
 * Titles arrive from free text, so normalise before they become a key. A guide
 * is per language: the Japanese archive keeps its bare key so the rows written
 * before translation existed stay reachable.
 */
export function guideKey(title: string, artist: string, locale: Locale = 'ja'): string {
  const base = `${title.trim().toLowerCase()}::${artist.trim().toLowerCase()}`;
  return locale === 'ja' ? base : `${base}::${locale}`;
}

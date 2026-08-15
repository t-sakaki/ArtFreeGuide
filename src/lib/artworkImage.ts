/**
 * Finding the picture of an artwork.
 *
 * A plain Commons search is not enough on two counts. Written in Japanese it
 * returns nothing at all (Commons indexes file pages, which are written in
 * English), and written in English it happily returns the first file that
 * shares a word with the query — showing a different painting is worse than
 * showing none. So candidates are gathered from Wikidata first, where the
 * creator can be checked, and every Commons candidate has to earn its place by
 * matching the artist or the title before it is used.
 */

import { NAMES, catalogueTitle } from './names';

/** Where the picture came from, kept for logs and for judging trust. */
export type ImageSource = 'catalog' | 'wikidata' | 'commons-category' | 'commons-search';

export interface ResolvedImage {
  url: string;
  source: ImageSource;
}

const USER_AGENT = 'ArtFreeGuide/1.0 (https://art-free-guide.taira-sakakibara.workers.dev)';
const THUMB_WIDTH = 900;
const MIN_WIDTH = 200;

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch (error) {
    console.error('Image lookup request failed:', url, error);
    return null;
  }
}

function hasLatinLetters(value: string): boolean {
  return /[A-Za-z]/.test(value);
}

/** Commons file name -> a thumbnail URL, without a second API round trip. */
function fileUrl(fileName: string, width = THUMB_WIDTH): string {
  const name = fileName.replace(/^File:/i, '').trim();
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${width}`;
}

/** The English title of a page on the Japanese Wikipedia, when it has one. */
async function englishViaWikipedia(japanese: string): Promise<string | null> {
  const url =
    'https://ja.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=langlinks&lllang=en' +
    `&titles=${encodeURIComponent(japanese)}`;
  const data = await fetchJson(url);
  const pages = (data?.query as { pages?: Record<string, unknown> } | undefined)?.pages;
  if (!pages) return null;

  for (const page of Object.values(pages)) {
    const links = (page as { langlinks?: { '*': string }[] }).langlinks;
    // 「マドレーヌ」 links to "Madeleine (cake)": the qualifier is not searchable.
    if (links?.[0]?.['*']) return links[0]['*'].replace(/\s*\([^)]*\)\s*$/, '').trim();
  }
  return null;
}

/**
 * The name as Commons writes it. The curated dictionary first, then the
 * Japanese Wikipedia, which covers artists the app has never heard of.
 */
export async function latinName(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (hasLatinLetters(trimmed)) return trimmed;

  const known = NAMES[trimmed]?.en;
  if (known) return known;

  return englishViaWikipedia(trimmed);
}

interface WikidataCandidate {
  id: string;
  file: string;
  creatorId: string | null;
}

async function wikidataSearch(term: string, language: string): Promise<string[]> {
  const url =
    'https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&origin=*&type=item&limit=10' +
    `&search=${encodeURIComponent(term)}&language=${language}&uselang=${language}`;
  const data = await fetchJson(url);
  const results = (data?.search as { id?: string }[] | undefined) ?? [];
  return results.map(item => item.id).filter((id): id is string => Boolean(id));
}

async function wikidataEntities(ids: string[]): Promise<Record<string, unknown>> {
  if (ids.length === 0) return {};
  const url =
    'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*' +
    `&ids=${encodeURIComponent(ids.join('|'))}` +
    `&props=${encodeURIComponent('claims|labels')}` +
    `&languages=${encodeURIComponent('en|ja|fr|es|zh')}`;
  const data = await fetchJson(url);
  return (data?.entities as Record<string, unknown> | undefined) ?? {};
}

type Claims = Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]>;

function claimString(claims: Claims, property: string): string | null {
  const value = claims[property]?.[0]?.mainsnak?.datavalue?.value;
  return typeof value === 'string' ? value : null;
}

function claimEntityId(claims: Claims, property: string): string | null {
  const value = claims[property]?.[0]?.mainsnak?.datavalue?.value;
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === 'string') return id;
  }
  return null;
}

function entityLabels(entity: unknown): string[] {
  const labels = (entity as { labels?: Record<string, { value?: string }> })?.labels ?? {};
  return Object.values(labels)
    .map(label => label.value)
    .filter((value): value is string => Boolean(value));
}

/** Family names carry the match: 「ゴッホ」 and "van Gogh" share only "gogh". */
function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[\s・･,.'’\-—–()]+/)
    .map(token => token.trim())
    .filter(token => token.length >= 3);
}

function namesOverlap(candidateNames: string[], artist: string): boolean {
  const wanted = nameTokens(artist);
  if (wanted.length === 0) return false;
  const haystack = candidateNames.join(' ').toLowerCase();
  return wanted.some(token => haystack.includes(token));
}

/**
 * Wikidata knows who painted what, so a candidate can be rejected when the
 * creator is someone else — this is what keeps 「ひまわり」 from resolving to a
 * photograph of a sunflower.
 */
async function fromWikidata(titles: string[], artist: string, width: number): Promise<ResolvedImage | null> {
  const ids: string[] = [];
  for (const title of titles) {
    for (const language of ['ja', 'en']) {
      for (const id of await wikidataSearch(title, language)) {
        if (!ids.includes(id)) ids.push(id);
      }
    }
  }
  if (ids.length === 0) return null;

  const entities = await wikidataEntities(ids.slice(0, 12));
  const candidates: WikidataCandidate[] = [];

  for (const [id, entity] of Object.entries(entities)) {
    const claims = ((entity as { claims?: Claims }).claims ?? {}) as Claims;
    const file = claimString(claims, 'P18');
    if (!file) continue;
    candidates.push({ id, file, creatorId: claimEntityId(claims, 'P170') });
  }
  if (candidates.length === 0) return null;

  // Without an artist to check against, a bare title match is a coin toss.
  if (!artist.trim()) return null;

  const creatorIds = candidates
    .map(candidate => candidate.creatorId)
    .filter((id): id is string => Boolean(id));
  const creators = await wikidataEntities(Array.from(new Set(creatorIds)).slice(0, 12));

  for (const candidate of candidates) {
    if (!candidate.creatorId) continue;
    if (namesOverlap(entityLabels(creators[candidate.creatorId]), artist)) {
      return { url: fileUrl(candidate.file, width), source: 'wikidata' };
    }
  }
  return null;
}

/** Two-character slices, the only way two Japanese titles can be compared. */
function bigrams(value: string): Set<string> {
  const text = value.replace(/[\s・･,.'’\-—–()（）「」『』]/g, '');
  const result = new Set<string>();
  for (let index = 0; index < text.length - 1; index += 1) {
    result.add(text.slice(index, index + 2));
  }
  return result;
}

function titlesOverlap(candidate: string, wanted: string): boolean {
  const wantedGrams = bigrams(wanted);
  for (const gram of bigrams(candidate)) {
    if (wantedGrams.has(gram)) return true;
  }
  return false;
}

async function wikipediaItemIds(query: string): Promise<string[]> {
  const url =
    'https://ja.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrlimit=5' +
    `&gsrsearch=${encodeURIComponent(query)}&prop=pageprops&ppprop=wikibase_item`;
  const data = await fetchJson(url);
  const pages = (
    data?.query as { pages?: Record<string, { pageprops?: { wikibase_item?: string } }> } | undefined
  )?.pages;
  return Object.values(pages ?? {})
    .map(page => page.pageprops?.wikibase_item)
    .filter((id): id is string => Boolean(id));
}

/**
 * The guide names works the way a curator speaks — 「牛乳注ぎ」 for the painting
 * catalogued as 「牛乳を注ぐ女」 — and neither the dictionary nor a langlink
 * knows that name. A full-text search of the Japanese Wikipedia does, so the
 * pages it returns are checked as candidates: the creator has to be the right
 * artist, and the item's own name has to share two characters with the title,
 * which is what stops 「レースの少女」 from becoming 「デルフト眺望」.
 */
async function fromJapaneseSearch(
  title: string,
  artist: string,
  width: number
): Promise<ResolvedImage | null> {
  if (!artist.trim() || hasLatinLetters(title)) return null;

  const ids = await wikipediaItemIds(`${title} ${artist}`);
  if (ids.length === 0) return null;

  const entities = await wikidataEntities(ids.slice(0, 5));
  const candidates: WikidataCandidate[] = [];
  for (const [id, entity] of Object.entries(entities)) {
    const claims = ((entity as { claims?: Claims }).claims ?? {}) as Claims;
    const file = claimString(claims, 'P18');
    const creatorId = claimEntityId(claims, 'P170');
    if (!file || !creatorId) continue;
    if (!entityLabels(entity).some(label => titlesOverlap(label, title))) continue;
    candidates.push({ id, file, creatorId });
  }
  if (candidates.length === 0) return null;

  const creators = await wikidataEntities(
    Array.from(new Set(candidates.map(candidate => candidate.creatorId as string))).slice(0, 5)
  );
  for (const candidate of candidates) {
    if (namesOverlap(entityLabels(creators[candidate.creatorId as string]), artist)) {
      return { url: fileUrl(candidate.file, width), source: 'wikidata' };
    }
  }
  return null;
}

async function commonsSearch(search: string): Promise<string[]> {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search' +
    `&gsrsearch=${encodeURIComponent(search)}&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url`;
  const data = await fetchJson(url);
  const pages = (data?.query as { pages?: Record<string, { title?: string }> } | undefined)?.pages;
  if (!pages) return [];
  return Object.values(pages)
    .map(page => page.title)
    .filter((title): title is string => Boolean(title))
    .filter(title => /\.(jpe?g|png|tiff?|webp)$/i.test(title));
}

const GENERIC_WORDS = new Set([
  'painting',
  'paintings',
  'picture',
  'artwork',
  'oil',
  'canvas',
  'the',
  'and',
  'with',
  'from',
  'for'
]);

/** Commons also holds photographs of the artist and machine-made pastiches. */
const NOT_AN_ARTWORK = /\b(sd|stable diffusion|ai[- ]generated|midjourney|photo(graph)? of|exhibition|museum visitors?)\b/i;

/**
 * A file only counts when its name carries the title. Naming the artist is not
 * enough: a search for Magritte's works returns photographs of Magritte, and a
 * search for Gauguin's Tahitian women returns his self-portrait.
 */
function rankCommonsMatches(files: string[], titleEn: string | null, artistEn: string | null): string[] {
  const artistWords = artistEn ? nameTokens(artistEn) : [];
  // "Magritte" inside the title would let a portrait of him pass as his work,
  // and "painting" matches half of Commons.
  const titleWords = (titleEn ? nameTokens(titleEn) : []).filter(
    word => !artistWords.includes(word) && !GENERIC_WORDS.has(word)
  );
  if (titleWords.length === 0) return [];

  const scored: { file: string; score: number }[] = [];
  for (const file of files) {
    if (NOT_AN_ARTWORK.test(file)) continue;
    const haystack = file.toLowerCase();
    const titleHits = titleWords.filter(word => haystack.includes(word)).length;
    if (titleHits === 0) continue;
    scored.push({
      file,
      score: titleHits + (artistWords.some(word => haystack.includes(word)) ? 2 : 0)
    });
  }
  return scored.sort((a, b) => b.score - a.score).map(entry => entry.file);
}

/** Categories that say "this file reproduces a painting". */
const ARTWORK_CATEGORY = /\b(paintings?|artworks?|drawings?|prints?|etchings?|watercolou?rs?|pd-art)\b/i;
/**
 * Categories that say the file only depicts the work: a photograph of the
 * billboard quoting Magritte, a figurine of Dalí's clocks, a Wikidata query
 * screenshot, a collage of three Monets.
 */
const DEPICTION_CATEGORY =
  /\b(photographs?|photos|sculptures?|statues?|figurines?|screenshots?|collages?|montages?|signs?|billboards?|posters?|replicas?|models?|toys?|murals?|graffiti|diagrams?|charts?|stamps?|coins?|banknotes?|memorials?|exhibitions?)\b/i;

async function commonsCategories(files: string[]): Promise<Record<string, string[]>> {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=categories' +
    `&cllimit=500&titles=${encodeURIComponent(files.join('|'))}`;
  const data = await fetchJson(url);
  const pages = (
    data?.query as
      | { pages?: Record<string, { title?: string; categories?: { title?: string }[] }> }
      | undefined
  )?.pages;
  const result: Record<string, string[]> = {};
  for (const page of Object.values(pages ?? {})) {
    if (!page.title) continue;
    result[page.title] = (page.categories ?? [])
      .map(category => category.title ?? '')
      .filter(Boolean);
  }
  return result;
}

/**
 * The file name alone cannot tell a painting from a photograph of a road sign
 * bearing the same title, so the shortlist is checked against the file's
 * Commons categories: a reproduction is filed under paintings, a depiction is
 * filed under photographs, sculptures or screenshots.
 */
async function firstReproduction(files: string[]): Promise<string | null> {
  if (files.length === 0) return null;
  const categories = await commonsCategories(files.slice(0, 5));
  for (const file of files.slice(0, 5)) {
    const names = categories[file];
    if (!names || names.length === 0) continue;
    const text = names.join(' | ');
    if (DEPICTION_CATEGORY.test(text)) continue;
    if (!ARTWORK_CATEGORY.test(text)) continue;
    return file;
  }
  return null;
}

async function bestCommonsMatch(
  files: string[],
  titleEn: string | null,
  artistEn: string | null
): Promise<string | null> {
  return firstReproduction(rankCommonsMatches(files, titleEn, artistEn));
}

export interface ResolveInput {
  /** Canonical (usually Japanese) title, as used everywhere else in the app. */
  title: string;
  artist: string;
  /** English keywords from the guide; ignored when the model answered in Japanese. */
  searchQuery?: string | null;
  /** Thumbnail width; recommendation cards do not need the full stage image. */
  width?: number;
}

/**
 * The picture for one artwork, or null when nothing trustworthy was found.
 * Callers are expected to show the artwork without an image rather than to
 * substitute a plausible looking one.
 */
export async function resolveArtworkImage(input: ResolveInput): Promise<ResolvedImage | null> {
  const title = catalogueTitle(input.title);
  const artist = input.artist.trim();
  if (!title) return null;

  const width = Math.max(MIN_WIDTH, Math.round(input.width ?? THUMB_WIDTH));
  const titleEn = await latinName(title);
  const artistEn = await latinName(artist);

  const suggested = input.searchQuery?.trim();
  // The guide's own English keywords stand in for titles the dictionary and
  // the Japanese Wikipedia don't know.
  const searchTitle = titleEn ?? (hasLatinLetters(suggested ?? '') ? suggested ?? null : null);

  const searched = [title, titleEn].filter((value): value is string => Boolean(value));
  const fromItems = await fromWikidata(Array.from(new Set(searched)), artist, width);
  if (fromItems) return fromItems;

  // The artist's own category is the smallest pond with the right fish in it.
  if (artistEn) {
    const scoped = await commonsSearch(
      `incategory:"Paintings by ${artistEn}" ${searchTitle ?? ''}`.trim()
    );
    // Without an English title there is nothing to match against, and any file
    // from the category is a different work by the same artist.
    const match = await bestCommonsMatch(scoped, searchTitle, artistEn);
    if (match) return { url: fileUrl(match, width), source: 'commons-category' };
  }

  const freeText = [searchTitle, artistEn].filter(Boolean).join(' ').trim();
  if (freeText) {
    const files = await commonsSearch(freeText);
    const best = await bestCommonsMatch(files, searchTitle, artistEn);
    if (best) return { url: fileUrl(best, width), source: 'commons-search' };
  }

  return fromJapaneseSearch(title, artist, width);
}

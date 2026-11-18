import { readFileSync } from 'node:fs';
import path from 'node:path';

const USER_AGENT = 'ArtFreeGuide/1.0 (https://art-free-guide.taira-sakakibara.workers.dev)';
const THUMB_WIDTH = 900;

/** Same non-artwork filename guard as src/lib/artworkImage.ts. */
export const NOT_AN_ARTWORK =
  /\b(sd|stable diffusion|ai[- ]generated|midjourney|photo(graph)? of|exhibition|museum visitors?|geograph\.org\.uk)\b/i;

export const ARTWORK_CATEGORY = /\b(paintings?|artworks?|drawings?|prints?|etchings?|watercolou?rs?|pd-art)\b/i;
export const DEPICTION_CATEGORY =
  /\b(photographs?|photos|sculptures?|statues?|figurines?|screenshots?|collages?|montages?|signs?|billboards?|posters?|replicas?|models?|toys?|murals?|graffiti|diagrams?|charts?|stamps?|coins?|banknotes?|memorials?|exhibitions?)\b/i;

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
  'for',
]);

export const BUILTIN_SOURCES = {
  nmwa: {
    id: 'nmwa',
    label: '国立西洋美術館 (NMWA)',
    url: 'https://www.nmwa.go.jp/jp/exhibitions/current.html',
  },
  tobikan: {
    id: 'tobikan',
    label: '東京都美術館 (Tobikan)',
    url: 'https://www.tobikan.jp/exhibition/index.html',
  },
  nact: {
    id: 'nact',
    label: '国立新美術館 (NACT)',
    url: 'https://www.nact.jp/exhibition_and_event/index.html',
  },
  bijutsutecho: {
    id: 'bijutsutecho',
    label: '美術手帖 NEWS',
    url: 'https://bijutsutecho.com/magazine/news',
  },
};

export function decodeHtmlEntities(input) {
  return String(input ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#8211;|&ndash;/gi, '–')
    .replace(/&#8212;|&mdash;/gi, '—')
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCodePoint(n) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const n = Number.parseInt(hex, 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : _;
    });
}

export function stripHtml(html) {
  const cleaned = String(html ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeHtmlEntities(cleaned)
    .replace(/[ \t\r]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function resolveUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

function dedupeItems(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = item.url || item.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function parseNmwaCurrent(html, baseUrl = BUILTIN_SOURCES.nmwa.url) {
  const items = [];

  // Special exhibition cards place title + term + detail link inside .nmwa-exhibition-special-body
  const cardBlocks = html.split(/nmwa-exhibition-special-body/);
  for (const block of cardBlocks.slice(1)) {
    const slice = block.slice(0, 2500);
    const title = slice.match(/nmwa-exhibition-special-title[^>]*>([\s\S]*?)<\/p>/i)?.[1];
    const term = slice.match(/nmwa-exhibition-special-term[^>]*>([\s\S]*?)<\/p>/i)?.[1];
    const href = slice.match(/nmwa-exhibition-special-detail[^>]*href=["']([^"']+)["']/i)?.[1];
    if (title && href) {
      items.push({
        source: 'nmwa',
        title: stripHtml(title).replace(/\s+/g, ' ').trim(),
        period: term ? stripHtml(term).replace(/\s+/g, ' ').trim() : '',
        url: resolveUrl(href, baseUrl),
      });
    }
  }

  // Permanent / small exhibition cards carry the title inside the anchor text
  for (const m of html.matchAll(/<a[^>]+href=["']([^"']*\/exhibitions\/202\d[^"']*\.html)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = resolveUrl(m[1], baseUrl);
    const text = stripHtml(m[2]).replace(/\s+/g, ' ').trim();
    if (!text || text === '詳細へ' || text.length < 4) continue;
    items.push({
      source: 'nmwa',
      title: text,
      period: '',
      url,
    });
  }

  return dedupeItems(items);
}

export function parseTobikan(html, baseUrl = BUILTIN_SOURCES.tobikan.url) {
  const items = [];
  for (const m of html.matchAll(/<a[^>]+href=["']([^"']*202[5-8]_[^"']+\.html)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = stripHtml(m[2]).replace(/\s+/g, ' ').trim();
    if (!text || text.length < 4) continue;
    items.push({
      source: 'tobikan',
      title: text,
      period: '',
      url: resolveUrl(m[1], baseUrl),
    });
  }
  return dedupeItems(items);
}

export function parseNact(html, baseUrl = BUILTIN_SOURCES.nact.url) {
  const items = [];
  for (const m of html.matchAll(/<a[^>]+href=["']([^"']*exhibition_special\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = stripHtml(m[2]).replace(/\s+/g, ' ').trim();
    if (!text || text === 'もっとみる' || text.length < 4) continue;
    items.push({
      source: 'nact',
      title: text,
      period: '',
      url: resolveUrl(m[1], baseUrl),
    });
  }
  return dedupeItems(items);
}

export function parseBijutsuTecho(html, baseUrl = BUILTIN_SOURCES.bijutsutecho.url) {
  const items = [];
  for (const m of html.matchAll(/<a[^>]+href=["']((?:https:\/\/bijutsutecho\.com)?\/magazine\/news\/headline\/\d+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = stripHtml(m[2]).replace(/\s+/g, ' ').trim();
    if (!text || text.length < 6) continue;
    items.push({
      source: 'bijutsutecho',
      title: text,
      period: '',
      url: resolveUrl(m[1], baseUrl),
    });
  }
  return dedupeItems(items);
}

export function parseSourcePage(sourceId, html, url) {
  if (sourceId === 'nmwa') return parseNmwaCurrent(html, url);
  if (sourceId === 'tobikan') return parseTobikan(html, url);
  if (sourceId === 'nact') return parseNact(html, url);
  if (sourceId === 'bijutsutecho') return parseBijutsuTecho(html, url);
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return [
    {
      source: sourceId || 'custom',
      title: titleMatch ? stripHtml(titleMatch) : url,
      period: '',
      url,
    },
  ];
}

const NOISE_QUOTED_TITLE = /^(PDF|開催中|開催予定|作品リスト|展覧会|チケット|関連イベント|無料|詳細|English)$/i;

export function extractArtworkMentions(text) {
  const found = [];
  const seen = new Set();
  for (const m of String(text ?? '').matchAll(/《([^《》\n]{1,45})》/g)) {
    const title = m[1].replace(/\s+/g, ' ').trim();
    if (!title || NOISE_QUOTED_TITLE.test(title) || /^\d+$/.test(title)) continue;
    if (seen.has(title)) continue;
    seen.add(title);
    found.push(title);
  }
  return found;
}

/**
 * Finds known artists from names.data.json mentioned in free text.
 * Matches full Japanese/English names as well as distinctive surname tokens
 * (>= 3 chars for kana/kanji surnames like ターナー / モネ / ゴッホ / 北斎).
 */
export function extractKnownArtists(text, catalog) {
  const haystack = String(text ?? '');
  const lower = haystack.toLowerCase();
  const matched = [];
  const seen = new Set();

  for (const artist of catalog.artists) {
    const ja = artist.ja;
    const en = artist.en ?? '';
    const surnameJa = ja.includes('・') ? ja.split('・').at(-1) : ja;
    const surnameEn = en.split(/\s+/).at(-1) ?? '';

    const hit =
      haystack.includes(ja) ||
      (surnameJa && surnameJa.length >= 2 && haystack.includes(surnameJa)) ||
      (en && lower.includes(en.toLowerCase())) ||
      (surnameEn && surnameEn.length >= 5 && lower.includes(surnameEn.toLowerCase()));

    if (hit && !seen.has(ja)) {
      seen.add(ja);
      matched.push(ja);
    }
  }
  return matched;
}

/** Reads names.data.json and parses tour items from src/lib/playlists.ts without compiling TS. */
export function loadCatalog(repoRoot = process.cwd()) {
  const namesPath = path.join(repoRoot, 'src/lib/names.data.json');
  const playlistsPath = path.join(repoRoot, 'src/lib/playlists.ts');

  const names = JSON.parse(readFileSync(namesPath, 'utf8'));
  const playlistsSource = readFileSync(playlistsPath, 'utf8');
  const tours = parsePlaylistsSource(playlistsSource);

  const aliasMap = new Map(
    (names.aliases ?? []).map(({ spoken, catalogue }) => [spoken.trim(), catalogue.trim()])
  );

  const artworkByJa = new Map((names.artworks ?? []).map(row => [row.ja, row]));
  const artistByJa = new Map((names.artists ?? []).map(row => [row.ja, row]));
  const canonicalArtwork = new Map();
  for (const row of names.artworks ?? []) {
    canonicalArtwork.set(row.ja.toLowerCase(), row.ja);
    for (const key of ['en', 'fr', 'zh', 'es']) {
      if (row[key]) canonicalArtwork.set(row[key].toLowerCase(), row.ja);
    }
  }
  const canonicalArtist = new Map();
  for (const row of names.artists ?? []) {
    canonicalArtist.set(row.ja.toLowerCase(), row.ja);
    for (const key of ['en', 'fr', 'zh', 'es']) {
      if (row[key]) canonicalArtist.set(row[key].toLowerCase(), row.ja);
    }
  }

  return {
    artists: names.artists ?? [],
    artworks: names.artworks ?? [],
    aliases: names.aliases ?? [],
    tours,
    aliasMap,
    artworkByJa,
    artistByJa,
    canonicalArtwork,
    canonicalArtist,
  };
}

export function parsePlaylistsSource(source) {
  const tours = [];
  // Each playlist starts with `{ \n id: '...'` inside PLAYLISTS
  const blocks = source.split(/\n\s*\{\s*\n\s*id:\s*['"]([^'"]+)['"]/g);
  for (let i = 1; i < blocks.length; i += 2) {
    const id = blocks[i];
    const body = blocks[i + 1] ?? '';
    const title = body.match(/\btitle:\s*['"]([^'"]+)['"]/)?.[1] ?? id;
    const subtitle = body.match(/\bsubtitle:\s*['"]([^'"]+)['"]/)?.[1] ?? '';
    const itemsBlock = body.match(/items:\s*\[([\s\S]*?)\]\s*,/)?.[1] ?? '';
    const items = [];
    for (const itemMatch of itemsBlock.matchAll(
      /\{\s*title:\s*['"]([^'"]+)['"]\s*,\s*artist:\s*['"]([^'"]+)['"]/g
    )) {
      items.push({ title: itemMatch[1], artist: itemMatch[2] });
    }
    tours.push({ id, title, subtitle, items });
  }
  return tours;
}

export function matchCatalog(title, artist, catalog) {
  const trimmedTitle = String(title ?? '').trim();
  const trimmedArtist = String(artist ?? '').trim();

  const viaAlias = catalog.aliasMap.get(trimmedTitle) ?? null;
  const afterAlias = viaAlias ?? trimmedTitle;
  const canonicalTitle =
    catalog.canonicalArtwork.get(afterAlias.toLowerCase()) ?? afterAlias;
  const canonicalArtist =
    catalog.canonicalArtist.get(trimmedArtist.toLowerCase()) ?? trimmedArtist;

  const artworkRow = catalog.artworkByJa.get(canonicalTitle) ?? null;
  const artistRow = catalog.artistByJa.get(canonicalArtist) ?? null;
  const inTours = catalog.tours
    .filter(tour => tour.items.some(item => item.title === canonicalTitle))
    .map(tour => tour.id);

  return {
    inputTitle: trimmedTitle,
    inputArtist: trimmedArtist,
    canonicalTitle,
    canonicalArtist,
    viaAlias,
    inArtworks: Boolean(artworkRow),
    inArtists: Boolean(artistRow),
    enTitle: artworkRow?.en ?? null,
    enArtist: artistRow?.en ?? null,
    inTours,
  };
}

// --- Read-only Wikidata / Wikimedia Commons verification ---

function hasLatinLetters(value) {
  return /[A-Za-z]/.test(value);
}

function nameTokens(name) {
  return String(name ?? '')
    .toLowerCase()
    .split(/[\s・･,.'’\-—–()]+/)
    .map(token => token.trim())
    .filter(token => token.length >= 3);
}

function namesOverlap(candidateNames, artist) {
  const wanted = nameTokens(artist);
  if (wanted.length === 0) return false;
  const haystack = candidateNames.join(' ').toLowerCase();
  return wanted.some(token => haystack.includes(token));
}

function fileUrl(fileName, width = THUMB_WIDTH) {
  const name = fileName.replace(/^File:/i, '').trim();
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${width}`;
}

async function fetchJson(url, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(url, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function englishViaWikipedia(japanese, fetchImpl) {
  const url =
    'https://ja.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=langlinks&lllang=en' +
    `&titles=${encodeURIComponent(japanese)}`;
  const data = await fetchJson(url, fetchImpl);
  const pages = data?.query?.pages;
  if (!pages) return null;
  for (const page of Object.values(pages)) {
    const title = page?.langlinks?.[0]?.['*'];
    if (title) return title.replace(/\s*\([^)]*\)\s*$/, '').trim();
  }
  return null;
}

async function wikidataSearch(term, language, fetchImpl) {
  const url =
    'https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&origin=*&type=item&limit=10' +
    `&search=${encodeURIComponent(term)}&language=${language}&uselang=${language}`;
  const data = await fetchJson(url, fetchImpl);
  return (data?.search ?? []).map(item => item.id).filter(Boolean);
}

async function wikidataEntities(ids, fetchImpl) {
  if (!ids.length) return {};
  const url =
    'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*' +
    `&ids=${encodeURIComponent(ids.join('|'))}` +
    `&props=${encodeURIComponent('claims|labels')}` +
    `&languages=${encodeURIComponent('en|ja|fr|es|zh')}`;
  const data = await fetchJson(url, fetchImpl);
  return data?.entities ?? {};
}

function entityLabels(entity) {
  const labels = entity?.labels ?? {};
  return Object.values(labels)
    .map(l => l?.value)
    .filter(Boolean);
}

function rankCommonsMatches(files, titleEn, artistEn) {
  const artistWords = artistEn ? nameTokens(artistEn) : [];
  const titleWords = (titleEn ? nameTokens(titleEn) : []).filter(
    word => !artistWords.includes(word) && !GENERIC_WORDS.has(word)
  );
  if (titleWords.length === 0) return [];
  const titleTerms = titleWords.map(word =>
    word.length > 4 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word
  );
  const fileMetadata = new Set(['google', 'art', 'project']);
  const scored = [];
  for (const file of files) {
    if (NOT_AN_ARTWORK.test(file)) continue;
    const haystack = file.toLowerCase();
    const titleHits = titleTerms.filter(word => haystack.includes(word)).length;
    if (titleHits === 0) continue;
    scored.push({
      file,
      score: titleHits + (artistWords.some(word => haystack.includes(word)) ? 2 : 0),
      extraWords: nameTokens(file.replace(/^File:/i, '').replace(/\.[^.]+$/, '')).filter(
        word =>
          !artistWords.includes(word) &&
          !GENERIC_WORDS.has(word) &&
          !fileMetadata.has(word) &&
          !titleTerms.some(term => word.includes(term))
      ).length,
    });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.extraWords - b.extraWords)
    .map(entry => entry.file);
}

async function commonsSearch(query, fetchImpl) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search' +
    `&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url`;
  const data = await fetchJson(url, fetchImpl);
  const pages = data?.query?.pages;
  if (!pages) return [];
  return Object.values(pages)
    .map(page => page.title)
    .filter(title => typeof title === 'string' && /\.(jpe?g|png|tiff?|webp)$/i.test(title));
}

async function firstCommonsReproduction(files, fetchImpl) {
  if (!files.length) return null;
  const shortlist = files.slice(0, 5);
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=categories' +
    `&cllimit=500&titles=${encodeURIComponent(shortlist.join('|'))}`;
  const data = await fetchJson(url, fetchImpl);
  const pages = data?.query?.pages ?? {};
  const byTitle = {};
  for (const page of Object.values(pages)) {
    if (page?.title) {
      byTitle[page.title] = (page.categories ?? []).map(c => c.title).filter(Boolean);
    }
  }
  for (const file of shortlist) {
    const names = byTitle[file];
    if (!names?.length) continue;
    const joined = names.join(' | ');
    if (DEPICTION_CATEGORY.test(joined)) continue;
    if (!ARTWORK_CATEGORY.test(joined)) continue;
    return file;
  }
  return null;
}

/**
 * Checks whether an artwork resolves to a valid public-domain image on
 * Wikidata / Wikimedia Commons (or via a deployed `/api/artwork-image` endpoint).
 */
export async function checkArtworkImage(
  candidate,
  catalog,
  { viaApi = '', fetchImpl = fetch } = {}
) {
  const match = matchCatalog(candidate.title, candidate.artist ?? '', catalog);
  const title = match.canonicalTitle;
  const artist = match.canonicalArtist;
  const warnings = [];

  if (!match.inArtworks) warnings.push('names.data.json(artworks) 未登録');
  if (artist && !match.inArtists) warnings.push('names.data.json(artists) 未登録');
  if (!artist) warnings.push('作者名未指定（Wikidata照合精度低下）');

  if (viaApi) {
    try {
      const res = await fetchImpl(`${viaApi.replace(/\/$/, '')}/api/artwork-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, artist }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.url) {
        return {
          ...match,
          status: 'ok',
          source: data.source || 'api',
          fileName: decodeURIComponent(data.url.split('/').pop()?.split('?')[0] ?? ''),
          url: data.url,
          warnings,
        };
      }
      return { ...match, status: 'miss', source: null, fileName: null, url: null, warnings };
    } catch (error) {
      return {
        ...match,
        status: 'error',
        source: null,
        fileName: null,
        url: null,
        warnings: [...warnings, error.message],
      };
    }
  }

  const titleEn =
    match.enTitle ??
    candidate.enTitle ??
    (hasLatinLetters(title) ? title : await englishViaWikipedia(title, fetchImpl));
  const artistEn =
    match.enArtist ??
    candidate.enArtist ??
    (artist ? (hasLatinLetters(artist) ? artist : await englishViaWikipedia(artist, fetchImpl)) : null);

  const searchTerms = Array.from(new Set([title, titleEn].filter(Boolean)));
  const ids = [];
  for (const term of searchTerms) {
    for (const lang of ['ja', 'en']) {
      for (const id of await wikidataSearch(term, lang, fetchImpl)) {
        if (!ids.includes(id)) ids.push(id);
      }
    }
  }

  if (ids.length > 0 && artist) {
    const entities = await wikidataEntities(ids.slice(0, 12), fetchImpl);
    const candidates = [];
    for (const [id, entity] of Object.entries(entities)) {
      const claims = entity?.claims ?? {};
      const file = claims.P18?.[0]?.mainsnak?.datavalue?.value;
      const creatorId = claims.P170?.[0]?.mainsnak?.datavalue?.value?.id ?? null;
      if (typeof file !== 'string') continue;
      if (NOT_AN_ARTWORK.test(file)) {
        warnings.push(`非美術ファイル除外: ${file}`);
        continue;
      }
      candidates.push({ id, file, creatorId });
    }
    const creatorIds = Array.from(new Set(candidates.map(c => c.creatorId).filter(Boolean))).slice(0, 12);
    if (creatorIds.length > 0) {
      const creators = await wikidataEntities(creatorIds, fetchImpl);
      for (const item of candidates) {
        if (!item.creatorId) continue;
        if (namesOverlap(entityLabels(creators[item.creatorId]), artist)) {
          return {
            ...match,
            status: 'ok',
            source: 'wikidata',
            fileName: item.file,
            url: fileUrl(item.file),
            warnings,
          };
        }
      }
    }
  }

  if (artistEn && titleEn) {
    const scoped = await commonsSearch(`incategory:"Paintings by ${artistEn}" ${titleEn}`, fetchImpl);
    const matchCat = await firstCommonsReproduction(rankCommonsMatches(scoped, titleEn, artistEn), fetchImpl);
    if (matchCat) {
      return {
        ...match,
        status: 'ok',
        source: 'commons-category',
        fileName: matchCat.replace(/^File:/i, ''),
        url: fileUrl(matchCat),
        warnings,
      };
    }
  }

  const freeText = [titleEn, artistEn].filter(Boolean).join(' ').trim();
  if (freeText && titleEn) {
    const files = await commonsSearch(freeText, fetchImpl);
    const matchFree = await firstCommonsReproduction(rankCommonsMatches(files, titleEn, artistEn), fetchImpl);
    if (matchFree) {
      return {
        ...match,
        status: 'ok',
        source: 'commons-search',
        fileName: matchFree.replace(/^File:/i, ''),
        url: fileUrl(matchFree),
        warnings,
      };
    }
  }

  return { ...match, status: 'miss', source: null, fileName: null, url: null, warnings };
}

export function parseCandidateList(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return [];
  const chunks = text.includes(';')
    ? text.split(';')
    : text.split(/,(?=\s*[^,]+(?:\/|::))/);

  return chunks
    .map(chunk => chunk.trim())
    .filter(Boolean)
    .map(chunk => {
      const sep = chunk.includes('::') ? '::' : '/';
      const parts = chunk.split(sep).map(p => p.trim());
      if (parts.length === 1) return { title: parts[0], artist: '' };
      return {
        title: parts[0],
        artist: parts[1] ?? '',
        ...(parts[2] ? { enTitle: parts[2] } : {}),
      };
    });
}

export function formatDraftReport(report) {
  const lines = [];
  lines.push(`# アート話題・コンテンツ候補レポート (${report.generatedAt})`);
  lines.push('');

  if (report.sources.length > 0) {
    lines.push('## 1. 収集した展覧会・ニュース話題 (Scout)');
    lines.push('');
    for (const src of report.sources) {
      lines.push(`### ${src.label}`);
      if (src.error) {
        lines.push(`- ⚠️ 取得失敗: ${src.error}`);
        lines.push('');
        continue;
      }
      if (src.items.length === 0) {
        lines.push('- （抽出項目なし）');
      } else {
        for (const item of src.items) {
          const period = item.period ? ` (${item.period})` : '';
          lines.push(`- [${item.title}](${item.url})${period}`);
        }
      }
      lines.push('');
    }
  }

  if (report.inspectedPages.length > 0) {
    lines.push('## 2. 詳細ページからの作品・作家抽出');
    lines.push('');
    for (const page of report.inspectedPages) {
      lines.push(`### [${page.title}](${page.url})`);
      if (page.error) {
        lines.push(`- ⚠️ 取得失敗: ${page.error}`);
        lines.push('');
        continue;
      }
      lines.push(`- 検出作家: ${page.artists.length ? page.artists.join('、') : 'なし'}`);
      if (page.mentions.length === 0) {
        lines.push('- 検出作品 (`《...》`): なし');
      } else {
        lines.push('- 検出作品 (`《...》`):');
        for (const m of page.mentions) {
          const tags = [
            m.inArtworks ? '辞書登録済' : '未登録',
            m.viaAlias ? `別名解決→${m.canonicalTitle}` : null,
            m.inTours.length ? `既存ツアー: ${m.inTours.join(', ')}` : null,
          ]
            .filter(Boolean)
            .join(' / ');
          lines.push(`  - 《${m.inputTitle}》 — ${tags}`);
        }
      }
      lines.push('');
    }
  }

  if (report.candidates.length > 0) {
    lines.push('## 3. 候補作品のカタログ突合・画像検証結果 (Curator Check)');
    lines.push('');
    lines.push('| 作品名（正表記） | 作者 | 辞書 (`names.data.json`) | 既存ツアー | 画像検証 | ファイル / 備考 |');
    lines.push('|---|---|---|---|---|---|');
    for (const c of report.candidates) {
      const dict = [
        c.inArtworks ? '作品OK' : '作品未登録',
        c.inArtists ? '作者OK' : '作者未登録',
        c.viaAlias ? `alias(${c.inputTitle})` : null,
      ]
        .filter(Boolean)
        .join(', ');
      const tours = c.inTours.length ? c.inTours.join(', ') : '—';
      const img =
        c.status === 'ok'
          ? `✅ ${c.source}`
          : c.status === 'skipped'
            ? '⏭️ skipped'
            : c.status === 'error'
              ? '⚠️ error'
              : '❌ MISS';
      const noteParts = [];
      if (c.fileName) noteParts.push(`\`${c.fileName}\``);
      if (c.warnings?.length) noteParts.push(c.warnings.join('; '));
      lines.push(
        `| ${c.canonicalTitle} | ${c.canonicalArtist || '—'} | ${dict} | ${tours} | ${img} | ${noteParts.join(' / ') || '—'} |`
      );
    }
    lines.push('');

    const okTitles = report.candidates.filter(c => c.status === 'ok').map(c => c.canonicalTitle);
    if (okTitles.length > 0) {
      lines.push('## 4. 承認・マージ後の事前ウォームコマンド例 (Preparer)');
      lines.push('');
      lines.push('```bash');
      lines.push(
        `BASE_URL=https://art-free-guide.taira-sakakibara.workers.dev \\`
      );
      lines.push(
        `NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \\`
      );
      lines.push(
        `  node scripts/warm_cache.mjs --locales=ja,en --titles=${JSON.stringify(okTitles.join(','))} --concurrency=1`
      );
      lines.push('```');
      lines.push('');
    }
  }

  return lines.join('\n');
}

#!/usr/bin/env node
// Phase 2 curation scout: collects museum exhibition / art-news topics,
// cross-checks mentioned and candidate artworks against `src/lib/names.data.json`
// and `src/lib/playlists.ts`, verifies Wikidata / Wikimedia Commons image
// resolution (applying the same non-artwork safeguards as `artworkImage.ts`),
// and prints a Markdown draft report for human review.
//
// Usage:
//   node scripts/scout_art_topics.mjs
//   node scripts/scout_art_topics.mjs --sources=nmwa,tobikan --follow-links=2
//   node scripts/scout_art_topics.mjs --sources=none \
//     --url=https://www.nmwa.go.jp/jp/exhibitions/2026turner.html \
//     --candidates="戦艦テメレール/J.M.W. ターナー,雨、蒸気、速度/J.M.W. ターナー"
//   node scripts/scout_art_topics.mjs --candidates-file=candidates.json --out=report.md

import { readFileSync, writeFileSync } from 'node:fs';
import {
  BUILTIN_SOURCES,
  checkArtworkImage,
  extractArtworkMentions,
  extractKnownArtists,
  formatDraftReport,
  loadCatalog,
  matchCatalog,
  parseCandidateList,
  parseSourcePage,
  stripHtml,
} from './lib/artScout.mjs';

const USER_AGENT = 'ArtFreeGuide/1.0 (https://art-free-guide.taira-sakakibara.workers.dev)';
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`ArtFreeGuide Content Curation Scout

Options:
  --sources=LIST         Comma-separated source IDs (${Object.keys(BUILTIN_SOURCES).join(',')}) or "none"
                         (default: all built-in sources)
  --url=URL              Exhibition or news page URL to inspect (repeatable)
  --follow-links=N       Fetch up to N links per scouted source for deep inspection (default: 0)
  --candidate=PAIR       Single "title/artist" or "title/artist/enTitle" entry (repeatable)
  --candidates=PAIRS     Semicolon-separated (or comma-separated) candidate pairs
  --candidates-file=PATH JSON array ([{title, artist}]) or line-separated "title / artist" file
  --no-images            Skip Wikidata / Wikimedia Commons image verification
  --via-api=BASE_URL     Use deployed POST /api/artwork-image instead of read-only Wikimedia lookup
  --json                 Output JSON instead of Markdown
  --out=PATH             Write report to PATH instead of stdout
  --help                 Show this help`);
  process.exit(0);
}

const flag = name => args.includes(`--${name}`);
const option = (name, fallback = '') => {
  const found = args.find(arg => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const multiOption = name =>
  args
    .filter(arg => arg.startsWith(`--${name}=`))
    .flatMap(arg => arg.slice(name.length + 3).split(','))
    .map(v => v.trim())
    .filter(Boolean);

const sourceArg = option('sources', Object.keys(BUILTIN_SOURCES).join(','));
const selectedSources =
  sourceArg.toLowerCase() === 'none'
    ? []
    : sourceArg
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

const unknownSources = selectedSources.filter(id => !(id in BUILTIN_SOURCES));
if (unknownSources.length > 0) {
  console.error(
    `Unknown source(s): ${unknownSources.join(', ')}. Available: ${Object.keys(BUILTIN_SOURCES).join(', ')}`
  );
  process.exit(1);
}

const customUrls = multiOption('url');
const followLinks = Math.max(0, Number(option('follow-links', '0')) || 0);
const skipImages = flag('no-images');
const viaApi = option('via-api', '');
const asJson = flag('json');
const outPath = option('out', '');

function loadExplicitCandidates() {
  const result = [];
  for (const arg of args) {
    if (arg.startsWith('--candidate=')) {
      result.push(...parseCandidateList(arg.slice('--candidate='.length)));
    } else if (arg.startsWith('--candidates=')) {
      result.push(...parseCandidateList(arg.slice('--candidates='.length)));
    }
  }
  const filePath = option('candidates-file', '');
  if (filePath) {
    const content = readFileSync(filePath, 'utf8').trim();
    if (content.startsWith('[') || content.startsWith('{')) {
      const parsed = JSON.parse(content);
      const list = Array.isArray(parsed) ? parsed : parsed.candidates ?? [];
      for (const item of list) {
        if (item?.title) result.push(item);
      }
    } else {
      for (const line of content.split(/\r?\n/)) {
        if (!line.trim() || line.trim().startsWith('#')) continue;
        result.push(...parseCandidateList(line));
      }
    }
  }
  return result;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

const catalog = loadCatalog(process.cwd());
const sourcesReport = [];
const urlsToInspect = new Set(customUrls);

for (const id of selectedSources) {
  const def = BUILTIN_SOURCES[id];
  try {
    const html = await fetchHtml(def.url);
    const items = parseSourcePage(id, html, def.url);
    sourcesReport.push({ id, label: def.label, url: def.url, items: items.slice(0, 12) });
    for (const item of items.slice(0, followLinks)) {
      if (item.url) urlsToInspect.add(item.url);
    }
  } catch (error) {
    sourcesReport.push({ id, label: def.label, url: def.url, items: [], error: error.message });
  }
}

const inspectedPages = [];
for (const url of urlsToInspect) {
  try {
    const html = await fetchHtml(url);
    const titleRaw = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    const title = titleRaw ? stripHtml(titleRaw) : url;
    const text = stripHtml(html);
    const mentions = extractArtworkMentions(text).map(m => matchCatalog(m, '', catalog));
    const artists = extractKnownArtists(text, catalog);
    inspectedPages.push({ url, title, mentions, artists });
  } catch (error) {
    inspectedPages.push({ url, title: url, mentions: [], artists: [], error: error.message });
  }
}

let candidates = loadExplicitCandidates();
if (candidates.length === 0 && inspectedPages.length > 0) {
  // Auto-promote extracted mentions from inspected pages when no explicit list was given.
  const seen = new Set();
  for (const page of inspectedPages) {
    const inferredArtist = page.artists.length === 1 ? page.artists[0] : '';
    for (const mention of page.mentions) {
      if (seen.has(mention.canonicalTitle)) continue;
      seen.add(mention.canonicalTitle);
      candidates.push({ title: mention.canonicalTitle, artist: inferredArtist });
    }
  }
  candidates = candidates.slice(0, 12);
}

const candidateResults = [];
for (const candidate of candidates) {
  if (skipImages) {
    const matched = matchCatalog(candidate.title, candidate.artist ?? '', catalog);
    candidateResults.push({
      ...matched,
      status: 'skipped',
      source: null,
      fileName: null,
      url: null,
      warnings: [],
    });
  } else {
    candidateResults.push(await checkArtworkImage(candidate, catalog, { viaApi }));
  }
}

const report = {
  generatedAt: new Date().toISOString().slice(0, 10),
  sources: sourcesReport,
  inspectedPages,
  candidates: candidateResults,
};

const output = asJson ? JSON.stringify(report, null, 2) : formatDraftReport(report);
if (outPath) {
  writeFileSync(outPath, output, 'utf8');
  console.error(`Wrote report to ${outPath}`);
} else {
  console.log(output);
}

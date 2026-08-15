#!/usr/bin/env node
// Warms the two things a visitor otherwise waits for: the artwork picture and
// the guide text in their language.
//
// A guide is cached per language, so a catalogue that is warm in Japanese is
// still a cold LLM call in English — the first English visitor waits minutes.
// This walks the catalogue and asks the deployed app for each one up front.
//
//   BASE_URL=https://art-free-guide.taira-sakakibara.workers.dev \
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/warm_cache.mjs --locales=en,fr --limit=20
//
//   --images-only   resolve pictures, skip the guides
//   --guides-only   skip the picture pass
//   --locales=...   comma separated (default: ja,en)
//   --limit=N       only the first N catalogue rows
//   --concurrency=N parallel requests (default 3; the LLM is the bottleneck)

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const option = (name, fallback) => {
  const found = args.find(arg => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};

const SUPPORTED_LOCALES = ['ja', 'en', 'fr', 'es', 'zh'];
const LOCALES = option('locales', 'ja,en')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);
const LIMIT = Number(option('limit', '0')) || 0;
const CONCURRENCY = Math.max(1, Number(option('concurrency', '3')) || 3);
const DO_IMAGES = !flag('guides-only');
const DO_GUIDES = !flag('images-only');

const unknown = LOCALES.filter(locale => !SUPPORTED_LOCALES.includes(locale));
if (unknown.length > 0) {
  console.error(`Unknown locale(s): ${unknown.join(', ')}. Supported: ${SUPPORTED_LOCALES.join(', ')}`);
  process.exit(1);
}

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}

async function catalogue() {
  const url =
    `${SUPABASE_URL}/rest/v1/artworks` +
    '?select=title,artist,image_url&order=title.asc' +
    (LIMIT ? `&limit=${LIMIT}` : '');
  const res = await fetch(url, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });
  if (!res.ok) throw new Error(`Catalogue read failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Runs `task` over `items`, a few at a time, and never rejects. */
async function pool(items, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      try {
        await worker(item);
      } catch (error) {
        console.error('  failed:', error.message);
      }
    }
  });
  await Promise.all(runners);
}

async function askForImage(row) {
  const res = await fetch(`${BASE_URL}/api/artwork-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: row.title, artist: row.artist })
  });
  return res.json();
}

// Wikimedia throttles bursts, and a throttled lookup is indistinguishable from
// an artwork it does not hold, so a miss is asked once more before believing it.
async function warmImage(row) {
  let data = await askForImage(row);
  if (!data.url) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    data = await askForImage(row);
  }
  console.log(`image  ${data.url ? data.source : 'MISS  '}  ${row.title} / ${row.artist}`);
}

async function warmGuide(row, locale) {
  const started = Date.now();
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: row.title,
      artist: row.artist,
      locale,
      messages: [{ role: 'user', content: `${row.title} / ${row.artist}` }]
    })
  });
  const data = await res.json().catch(() => ({}));
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const state = data.cached ? 'cached' : data.text ? 'warmed' : 'FAILED';
  console.log(`guide  ${locale}  ${state}  ${seconds}s  ${row.title} / ${row.artist}`);
}

const rows = await catalogue();
console.log(`${rows.length} catalogue rows via ${BASE_URL}`);

if (DO_IMAGES) {
  const missing = rows.filter(row => !row.image_url);
  console.log(`\n-- pictures: ${missing.length} rows without one`);
  await pool(missing, warmImage);
}

if (DO_GUIDES) {
  for (const locale of LOCALES) {
    console.log(`\n-- guides: ${locale}`);
    await pool(rows, row => warmGuide(row, locale));
  }
}

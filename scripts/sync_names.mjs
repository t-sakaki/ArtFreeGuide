#!/usr/bin/env node
// Keeps src/lib/names.data.json and the Supabase name tables in step.
//
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/sync_names.mjs --push   # file -> database (seed after edits in code)
//     node scripts/sync_names.mjs --pull   # database -> file (default)
//
// The file is what ships: slugs, the sitemap and the OGP titles are built from
// it at build time. So a name edited in the database only reaches visitors
// after --pull and a deploy; that is the point of keeping the file.
//
// --check exits non zero when a pull would change the file, for CI.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DATA_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'names.data.json');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = new Set(process.argv.slice(2));
const push = args.has('--push');
const check = args.has('--check');

for (const [name, value] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY
})) {
  if (!value) {
    console.error(`${name} is not set.`);
    process.exit(1);
  }
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json'
};

/** The three tables, in the shape names.data.json stores them. */
const TABLES = [
  { key: 'artists', table: 'artist_names', columns: ['ja', 'en', 'fr', 'zh', 'es'] },
  { key: 'artworks', table: 'artwork_names', columns: ['ja', 'en', 'fr', 'zh', 'es'] },
  { key: 'aliases', table: 'title_aliases', columns: ['spoken', 'catalogue'] }
];

async function select(table, columns) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${columns.join(',')},position&order=position.asc`;
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`Reading ${table} failed (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

async function upsert(table, rows) {
  if (!rows.length) return;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows)
  });

  if (!response.ok) {
    throw new Error(`Writing ${table} failed (${response.status}): ${await response.text()}`);
  }
}

function serialise(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

const current = JSON.parse(readFileSync(DATA_PATH, 'utf8'));

if (push) {
  for (const { key, table, columns } of TABLES) {
    const rows = current[key].map((row, position) => ({
      ...Object.fromEntries(columns.map(column => [column, row[column]])),
      position,
      updated_at: new Date().toISOString()
    }));

    await upsert(table, rows);
    console.log(`${table}: ${rows.length} rows written`);
  }

  process.exit(0);
}

const pulled = {};

for (const { key, table, columns } of TABLES) {
  const rows = await select(table, columns);
  pulled[key] = rows.map(row => Object.fromEntries(columns.map(column => [column, row[column]])));
  console.log(`${table}: ${rows.length} rows read`);
}

const next = serialise(pulled);

if (next === serialise(current)) {
  console.log('names.data.json is already up to date.');
  process.exit(0);
}

if (check) {
  console.error('names.data.json differs from the database. Run: node scripts/sync_names.mjs');
  process.exit(1);
}

for (const { key } of TABLES) {
  if (!pulled[key].length) {
    console.error(`Refusing to write: ${key} came back empty. Seed the tables with --push first.`);
    process.exit(1);
  }
}

writeFileSync(DATA_PATH, next);
console.log('names.data.json updated. Commit it and deploy to publish the change.');

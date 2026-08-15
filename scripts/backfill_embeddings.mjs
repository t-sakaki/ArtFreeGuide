#!/usr/bin/env node
// Fills the NVIDIA embedding column for every catalogue row that is missing one.
// The NIM endpoint is a plain HTTP call, so unlike the Workers AI path this can
// run locally instead of going through /api/embeddings/backfill on the Worker.
//
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... NVIDIA_API_KEY=... \
//     node scripts/backfill_embeddings.mjs [--all]
//
// --all re-embeds rows that already have a vector (use after changing model).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const MODEL = process.env.NVIDIA_EMBEDDING_MODEL || 'nvidia/llama-nemotron-embed-1b-v2';
const BASE_URL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const COLUMN = process.env.EMBEDDING_COLUMN || 'embedding_nv';
const DIMENSIONS = 1024;
const BATCH_SIZE = 32;

for (const [name, value] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  NVIDIA_API_KEY
})) {
  if (!value) {
    console.error(`${name} is not set.`);
    process.exit(1);
  }
}

const supabaseHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json'
};

function embeddingText({ title, artist, description, tags }) {
  const tagText = tags?.length ? `。タグ: ${tags.join('、')}` : '';
  return `${title} / ${artist}${description ? `。${description}` : ''}${tagText}`;
}

async function embed(texts) {
  const response = await fetch(`${BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NVIDIA_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      input: texts,
      input_type: 'passage',
      truncate: 'END',
      dimensions: DIMENSIONS
    })
  });

  if (!response.ok) {
    throw new Error(`NVIDIA embedding call failed (${response.status}): ${await response.text()}`);
  }

  const payload = await response.json();
  return payload.data.sort((a, b) => a.index - b.index).map(entry => entry.embedding);
}

async function main() {
  const all = process.argv.includes('--all');
  const filter = all ? '' : `&${COLUMN}=is.null`;
  const listUrl = `${SUPABASE_URL}/rest/v1/artworks?select=id,title,artist,description,tags${filter}&limit=1000`;

  const listResponse = await fetch(listUrl, { headers: supabaseHeaders });
  if (!listResponse.ok) {
    throw new Error(`Failed to list artworks (${listResponse.status}): ${await listResponse.text()}`);
  }
  const artworks = await listResponse.json();

  console.log(`${artworks.length} artwork(s) to embed with ${MODEL} into ${COLUMN}`);

  let updated = 0;
  for (let start = 0; start < artworks.length; start += BATCH_SIZE) {
    const batch = artworks.slice(start, start + BATCH_SIZE);
    const vectors = await embed(batch.map(embeddingText));

    for (const [index, artwork] of batch.entries()) {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/artworks?id=eq.${artwork.id}`, {
        method: 'PATCH',
        headers: supabaseHeaders,
        body: JSON.stringify({ [COLUMN]: vectors[index] })
      });

      if (!response.ok) {
        console.error(`Failed to store ${artwork.title}: ${await response.text()}`);
        continue;
      }
      updated++;
    }

    console.log(`  ${Math.min(start + BATCH_SIZE, artworks.length)}/${artworks.length}`);
  }

  console.log(`Done: ${updated} row(s) updated.`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});

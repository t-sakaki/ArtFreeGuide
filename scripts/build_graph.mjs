#!/usr/bin/env node
/**
 * Builds and seeds the ArtFreeGuide Neo4j Knowledge Graph using the
 * HTTP Query API v2 (compatible with Neo4j AuraDB & Cloudflare Workers).
 *
 * Usage:
 *   node scripts/build_graph.mjs --cypher         # Dry-run: print Cypher schema & stats
 *   NEO4J_URI=neo4j+s://... NEO4J_PASSWORD=... \
 *     node scripts/build_graph.mjs --seed-local   # Seed Neo4j from src/lib/graph/artGraph.data.json
 *   NEO4J_URI=... NEO4J_PASSWORD=... \
 *     node scripts/build_graph.mjs --heartbeat    # Ping AuraDB so free-tier does not pause
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... NVIDIA_API_KEY=... \
 *     node scripts/build_graph.mjs --enrich       # Extract extra relations via LLM -> artGraph.data.json (+ Neo4j if set)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const GRAPH_PATH = join(ROOT_DIR, 'src', 'lib', 'graph', 'artGraph.data.json');

const args = new Set(process.argv.slice(2));
const seedLocal = args.has('--seed-local');
const enrich = args.has('--enrich');
const heartbeat = args.has('--heartbeat');
const printCypher = args.has('--cypher');

const VALID_REL_TYPES = new Set([
  'INFLUENCED_BY',
  'SHARES_MOTIF',
  'SAME_MOVEMENT',
  'CONTEMPORARY_OF',
  'BY_ARTIST',
]);

function resolveNeo4jConfig() {
  const explicitUrl = process.env.NEO4J_QUERY_URL?.trim();
  const uri = process.env.NEO4J_URI?.trim();
  const user = (process.env.NEO4J_USER || process.env.NEO4J_USERNAME || 'neo4j').trim();
  const password = process.env.NEO4J_PASSWORD?.trim();
  const database = (process.env.NEO4J_DATABASE || 'neo4j').trim();

  if (!password || (!explicitUrl && !uri)) return null;

  let queryUrl = explicitUrl || '';
  if (!queryUrl && uri) {
    let normalized = uri
      .replace(/^(neo4j|bolt)\+s:\/\//i, 'https://')
      .replace(/^(neo4j|bolt):\/\//i, 'http://')
      .replace(/\/+$/, '')
      .replace(/:7687$/, '');
    queryUrl = `${normalized}/db/${encodeURIComponent(database)}/query/v2`;
  }

  const authHeader = `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`;
  return { queryUrl, authHeader };
}

async function runCypher(config, statement, parameters = {}) {
  const res = await fetch(config.queryUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: config.authHeader,
    },
    body: JSON.stringify({ statement, parameters }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Neo4j HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  if (Array.isArray(json.errors) && json.errors.length > 0) {
    throw new Error(`Neo4j Cypher error: ${json.errors.map(e => e.message).join('; ')}`);
  }
  return json.data ?? { fields: [], values: [] };
}

function loadDataset() {
  return JSON.parse(readFileSync(GRAPH_PATH, 'utf8'));
}

async function seedNeo4j(config, dataset) {
  console.log(`Seeding ${dataset.artworks.length} artworks and ${dataset.relations.length} relations into Neo4j...`);

  const constraints = [
    'CREATE CONSTRAINT artwork_key IF NOT EXISTS FOR (a:Artwork) REQUIRE a.key IS UNIQUE',
    'CREATE CONSTRAINT artist_name IF NOT EXISTS FOR (p:Artist) REQUIRE p.name IS UNIQUE',
    'CREATE CONSTRAINT movement_name IF NOT EXISTS FOR (m:Movement) REQUIRE m.name IS UNIQUE',
    'CREATE CONSTRAINT motif_name IF NOT EXISTS FOR (mo:Motif) REQUIRE mo.name IS UNIQUE',
    'CREATE CONSTRAINT technique_name IF NOT EXISTS FOR (t:Technique) REQUIRE t.name IS UNIQUE',
  ];

  for (const stmt of constraints) {
    await runCypher(config, stmt);
  }

  await runCypher(
    config,
    `UNWIND $artworks AS item
     MERGE (a:Artwork {key: item.key})
     SET a.title = item.title,
         a.artist = item.artist,
         a.year = item.year,
         a.movement = item.movement,
         a.museum = item.museum,
         a.summary = item.summary
     WITH a, item
     FOREACH (_ IN CASE WHEN item.artist <> '' THEN [1] ELSE [] END |
       MERGE (ar:Artist {name: item.artist})
       MERGE (a)-[:CREATED_BY]->(ar)
     )
     FOREACH (_ IN CASE WHEN item.movement <> '' THEN [1] ELSE [] END |
       MERGE (mv:Movement {name: item.movement})
       MERGE (a)-[:BELONGS_TO_MOVEMENT]->(mv)
     )
     FOREACH (motifName IN item.motifs |
       MERGE (mo:Motif {name: motifName})
       MERGE (a)-[:DEPICTS_MOTIF]->(mo)
     )
     FOREACH (techName IN item.techniques |
       MERGE (te:Technique {name: techName})
       MERGE (a)-[:USES_TECHNIQUE]->(te)
     )`,
    {
      artworks: dataset.artworks.map(a => ({
        key: a.key,
        title: a.title,
        artist: a.artist || '',
        year: a.year || null,
        movement: a.movement || '',
        museum: a.museum || null,
        summary: a.summary || null,
        motifs: Array.isArray(a.motifs) ? a.motifs : [],
        techniques: Array.isArray(a.techniques) ? a.techniques : [],
      })),
    }
  );

  // Group by relationship type because Cypher relationship types are static identifiers
  for (const relType of VALID_REL_TYPES) {
    const batch = dataset.relations.filter(r => r.type === relType);
    if (batch.length === 0) continue;

    await runCypher(
      config,
      `UNWIND $rels AS rel
       MATCH (from:Artwork {key: rel.fromKey})
       MATCH (to:Artwork {key: rel.toKey})
       MERGE (from)-[r:${relType}]->(to)
       SET r.reason = rel.reason,
           r.strength = rel.strength`,
      {
        rels: batch.map(r => ({
          fromKey: r.fromKey,
          toKey: r.toKey,
          reason: r.reason,
          strength: typeof r.strength === 'number' ? r.strength : 0.85,
        })),
      }
    );
  }

  console.log('Neo4j Knowledge Graph seed completed.');
}

async function enrichFromSupabase(dataset) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const nvidiaBase = (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '');
  const model = process.env.NVIDIA_MODEL || 'nvidia/nemotron-3-nano-30b-a3b';

  if (!supabaseUrl || !serviceKey || !nvidiaKey) {
    console.error('--enrich requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and NVIDIA_API_KEY.');
    process.exit(1);
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/artworks?select=title,artist,year,description&limit=100`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase fetch failed (${res.status}): ${await res.text()}`);
  }
  const rows = await res.json();
  const existingKeys = new Set(dataset.artworks.map(a => a.key));
  const missing = rows.filter(r => r.title && r.artist && !existingKeys.has(`${r.title}::${r.artist}`));

  console.log(`Found ${missing.length} catalogue artworks not yet in artGraph.data.json.`);
  if (missing.length === 0) return dataset;

  const knownTitles = dataset.artworks.map(a => `${a.title}::${a.artist}`).slice(0, 40);

  for (const row of missing.slice(0, 15)) {
    const prompt = `作品「${row.title}」（画家: ${row.artist}、制作年: ${row.year || '不明'}）の美術史知識グラフ用メタデータをJSONのみ出力してください。
概要: ${row.description || 'なし'}
既存ノード例: ${knownTitles.join(', ')}

出力フォーマット:
{
  "movement": "流派や時代（日本語）",
  "museum": "所蔵美術館（日本語、不明なら空文字）",
  "motifs": ["モチーフ1", "モチーフ2"],
  "techniques": ["技法1", "技法2"],
  "summary": "一文の要約（日本語）",
  "relations": [
    { "targetKey": "既存ノード例のキー", "type": "INFLUENCED_BY|SHARES_MOTIF|SAME_MOVEMENT|CONTEMPORARY_OF|BY_ARTIST", "reason": "つながりの理由（日本語一文）", "strength": 0.85 }
  ]
}`;

    const llmRes = await fetch(`${nvidiaBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${nvidiaKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
      }),
    });

    if (!llmRes.ok) {
      console.warn(`LLM failed for ${row.title}: HTTP ${llmRes.status}`);
      continue;
    }

    const llmJson = await llmRes.json();
    const content = llmJson?.choices?.[0]?.message?.content || '';
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) continue;

    try {
      const parsed = JSON.parse(match[0]);
      const key = `${row.title}::${row.artist}`;
      dataset.artworks.push({
        key,
        title: row.title,
        artist: row.artist,
        year: row.year || undefined,
        movement: parsed.movement || undefined,
        museum: parsed.museum || undefined,
        motifs: Array.isArray(parsed.motifs) ? parsed.motifs.slice(0, 4) : [],
        techniques: Array.isArray(parsed.techniques) ? parsed.techniques.slice(0, 3) : [],
        summary: parsed.summary || row.description || undefined,
      });
      existingKeys.add(key);

      for (const rel of parsed.relations || []) {
        if (!rel?.targetKey || !existingKeys.has(rel.targetKey)) continue;
        if (!VALID_REL_TYPES.has(rel.type)) continue;
        dataset.relations.push({
          fromKey: key,
          toKey: rel.targetKey,
          type: rel.type,
          reason: rel.reason || '',
          strength: typeof rel.strength === 'number' ? rel.strength : 0.85,
        });
      }
      console.log(`+ Added ${key}`);
    } catch {
      console.warn(`Could not parse JSON for ${row.title}`);
    }
  }

  writeFileSync(GRAPH_PATH, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
  console.log(`Updated ${GRAPH_PATH} (${dataset.artworks.length} artworks, ${dataset.relations.length} relations).`);
  return dataset;
}

async function main() {
  let dataset = loadDataset();

  if (printCypher || (!seedLocal && !enrich && !heartbeat)) {
    console.log(`ArtFreeGuide Knowledge Graph snapshot: ${dataset.artworks.length} artworks, ${dataset.relations.length} relations.`);
    console.log('\n// Sample Cypher constraints & shortestPath query:');
    console.log('CREATE CONSTRAINT artwork_key IF NOT EXISTS FOR (a:Artwork) REQUIRE a.key IS UNIQUE;');
    console.log("MATCH p = shortestPath((a:Artwork {title: '富嶽三十六景 神奈川沖浪裏'})-[*1..6]-(b:Artwork {title: '睡蓮'})) RETURN p;");
    if (!seedLocal && !enrich && !heartbeat) return;
  }

  if (enrich) {
    dataset = await enrichFromSupabase(dataset);
  }

  const config = resolveNeo4jConfig();
  if (heartbeat) {
    if (!config) {
      console.error('NEO4J_URI and NEO4J_PASSWORD are required for --heartbeat.');
      process.exit(1);
    }
    await runCypher(config, 'RETURN 1 AS ok, timestamp() AS ts');
    console.log('Neo4j heartbeat OK.');
    return;
  }

  if (seedLocal || (enrich && config)) {
    if (!config) {
      console.error('NEO4J_URI (or NEO4J_QUERY_URL) and NEO4J_PASSWORD are required to seed Neo4j.');
      process.exit(1);
    }
    await seedNeo4j(config, dataset);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

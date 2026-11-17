import type { Locale } from '../i18n';
import { canonicalName, catalogueTitle, localizeName } from '../names';
import { isNeo4jConfigured, runCypher } from './client';
import rawDataset from './artGraph.data.json';
import { formatRelationLabel, getGraphUIText } from './i18n';
import type {
  ArtGraphArtwork,
  ArtGraphDataset,
  ArtGraphRelation,
  DynamicTourResult,
  DynamicTourStep,
  GraphConnectionHint,
  GraphRecommendation,
  GraphRelationType,
  GraphSubgraph,
  GraphVisualEdge,
  GraphVisualNode,
} from './types';

const DATASET = rawDataset as ArtGraphDataset;

const VALID_REL_TYPES: ReadonlySet<GraphRelationType> = new Set([
  'INFLUENCED_BY',
  'SHARES_MOTIF',
  'SAME_MOVEMENT',
  'CONTEMPORARY_OF',
  'BY_ARTIST',
]);

function normalizeRelationType(value: unknown): GraphRelationType {
  if (typeof value === 'string' && VALID_REL_TYPES.has(value as GraphRelationType)) {
    return value as GraphRelationType;
  }
  return 'SHARES_MOTIF';
}

export function buildArtworkKey(title: string, artist?: string): string {
  const cTitle = catalogueTitle(canonicalName(title)).trim();
  const cArtist = artist ? canonicalName(artist).trim() : '';
  return cArtist ? `${cTitle}::${cArtist}` : cTitle;
}

const ARTWORK_BY_KEY = new Map<string, ArtGraphArtwork>();
const ARTWORKS_BY_TITLE = new Map<string, ArtGraphArtwork[]>();

for (const artwork of DATASET.artworks) {
  ARTWORK_BY_KEY.set(artwork.key, artwork);
  const titleKey = artwork.title.trim().toLowerCase();
  const list = ARTWORKS_BY_TITLE.get(titleKey) ?? [];
  list.push(artwork);
  ARTWORKS_BY_TITLE.set(titleKey, list);
}

/**
 * Resolves an incoming title/artist (in any supported language or alias)
 * to a known node in the bundled graph snapshot.
 */
export function resolveSnapshotArtwork(title: string, artist?: string): ArtGraphArtwork | null {
  const cleanTitle = catalogueTitle(canonicalName(title)).trim();
  if (!cleanTitle) return null;
  const cleanArtist = artist ? canonicalName(artist).trim() : '';

  if (cleanArtist) {
    const exact = ARTWORK_BY_KEY.get(`${cleanTitle}::${cleanArtist}`);
    if (exact) return exact;
  }

  const byTitle = ARTWORKS_BY_TITLE.get(cleanTitle.toLowerCase());
  if (byTitle && byTitle.length > 0) {
    if (cleanArtist) {
      const match = byTitle.find(
        item => item.artist.includes(cleanArtist) || cleanArtist.includes(item.artist)
      );
      if (match) return match;
    }
    return byTitle[0];
  }

  // Fallback substring match for partial titles like "神奈川沖浪裏"
  const lower = cleanTitle.toLowerCase();
  return (
    DATASET.artworks.find(
      item =>
        item.title.toLowerCase().includes(lower) ||
        lower.includes(item.title.toLowerCase())
    ) ?? null
  );
}

export function listGraphArtworks(): { key: string; title: string; artist: string; year?: string; movement?: string }[] {
  return DATASET.artworks.map(a => ({
    key: a.key,
    title: a.title,
    artist: a.artist,
    year: a.year,
    movement: a.movement,
  }));
}

interface NeighborEdge {
  target: ArtGraphArtwork;
  type: GraphRelationType;
  reason: string;
  strength: number;
}

const ADJACENCY = new Map<string, NeighborEdge[]>();
for (const art of DATASET.artworks) {
  ADJACENCY.set(art.key, []);
}

for (const rel of DATASET.relations) {
  const fromArt = ARTWORK_BY_KEY.get(rel.fromKey);
  const toArt = ARTWORK_BY_KEY.get(rel.toKey);
  if (!fromArt || !toArt) continue;
  const strength = rel.strength ?? 0.85;
  ADJACENCY.get(rel.fromKey)?.push({
    target: toArt,
    type: rel.type,
    reason: rel.reason,
    strength,
  });
  ADJACENCY.get(rel.toKey)?.push({
    target: fromArt,
    type: rel.type,
    reason: rel.reason,
    strength,
  });
}

function relationPriorityBonus(type: GraphRelationType): number {
  switch (type) {
    case 'INFLUENCED_BY':
      return 0.08;
    case 'SHARES_MOTIF':
      return 0.05;
    case 'CONTEMPORARY_OF':
      return 0.04;
    case 'SAME_MOVEMENT':
      return 0.03;
    case 'BY_ARTIST':
      return 0.02;
  }
}

/**
 * Finds related artworks via Neo4j Knowledge Graph (Cypher) with automatic
 * fallback to the bundled art-history graph snapshot.
 */
export async function getGraphRecommendations(
  title: string,
  artist?: string,
  limit = 6,
  locale: Locale = 'ja'
): Promise<{ recommendations: GraphRecommendation[]; source: 'neo4j' | 'snapshot' }> {
  const cTitle = catalogueTitle(canonicalName(title)).trim();
  const cArtist = artist ? canonicalName(artist).trim() : '';
  if (!cTitle) return { recommendations: [], source: 'snapshot' };

  if (isNeo4jConfigured()) {
    const rows = await runCypher<{
      key: string;
      title: string;
      artist: string;
      year: string | null;
      summary: string | null;
      relType: string;
      reason: string | null;
      strength: number | null;
    }>(
      `MATCH (a:Artwork)
       WHERE a.title = $title AND ($artist = '' OR a.artist = $artist)
       WITH a LIMIT 1
       MATCH (a)-[r:INFLUENCED_BY|SHARES_MOTIF|CONTEMPORARY_OF|SAME_MOVEMENT|BY_ARTIST]-(b:Artwork)
       WHERE b.key <> a.key
       RETURN b.key AS key,
              b.title AS title,
              b.artist AS artist,
              b.year AS year,
              b.summary AS summary,
              type(r) AS relType,
              r.reason AS reason,
              coalesce(r.strength, 0.85) AS strength
       ORDER BY strength DESC
       LIMIT $limit`,
      { title: cTitle, artist: cArtist, limit }
    );

    if (rows && rows.length > 0) {
      const seen = new Set<string>();
      const recommendations: GraphRecommendation[] = [];
      for (const row of rows) {
        if (!row.key || seen.has(row.key)) continue;
        seen.add(row.key);
        const relationType = normalizeRelationType(row.relType);
        const strength = typeof row.strength === 'number' ? row.strength : 0.85;
        recommendations.push({
          key: row.key,
          title: row.title,
          artist: row.artist,
          year: row.year ?? null,
          description: row.summary ?? null,
          relationType,
          relationLabel: formatRelationLabel(relationType, locale),
          reason: row.reason || formatRelationLabel(relationType, locale),
          score: Math.min(0.99, strength + relationPriorityBonus(relationType) * 0.5),
          source: 'neo4j',
        });
      }
      return { recommendations, source: 'neo4j' };
    }
  }

  // Snapshot fallback
  const center = resolveSnapshotArtwork(cTitle, cArtist);
  if (!center) return { recommendations: [], source: 'snapshot' };

  const direct = ADJACENCY.get(center.key) ?? [];
  const ranked = new Map<string, GraphRecommendation>();

  for (const edge of direct) {
    const score = Math.min(0.99, edge.strength + relationPriorityBonus(edge.type) * 0.5);
    const existing = ranked.get(edge.target.key);
    if (!existing || existing.score < score) {
      ranked.set(edge.target.key, {
        key: edge.target.key,
        title: edge.target.title,
        artist: edge.target.artist,
        year: edge.target.year ?? null,
        description: edge.target.summary ?? null,
        relationType: edge.type,
        relationLabel: formatRelationLabel(edge.type, locale),
        reason: edge.reason,
        score,
        source: 'snapshot',
      });
    }
  }

  // Also infer shared-motif / shared-movement connections if fewer than `limit`
  if (ranked.size < limit) {
    for (const candidate of DATASET.artworks) {
      if (candidate.key === center.key || ranked.has(candidate.key)) continue;
      const sharedMotifs = candidate.motifs.filter(m => center.motifs.includes(m));
      const sharedTechs = candidate.techniques.filter(t => center.techniques.includes(t));
      const sameMovement = Boolean(center.movement && candidate.movement === center.movement);

      if (sharedMotifs.length > 0 || sharedTechs.length > 0 || sameMovement) {
        const relationType: GraphRelationType =
          sharedMotifs.length > 0
            ? 'SHARES_MOTIF'
            : sameMovement
              ? 'SAME_MOVEMENT'
              : 'CONTEMPORARY_OF';
        const motifNote = sharedMotifs[0] || sharedTechs[0] || center.movement || '';
        const reason =
          sharedMotifs.length > 0
            ? `共通モチーフ「${sharedMotifs.join('・')}」でつながる作品`
            : sharedTechs.length > 0
              ? `共通の技法「${sharedTechs[0]}」を用いた表現`
              : `同じ流派「${motifNote}」に属する代表作`;
        ranked.set(candidate.key, {
          key: candidate.key,
          title: candidate.title,
          artist: candidate.artist,
          year: candidate.year ?? null,
          description: candidate.summary ?? null,
          relationType,
          relationLabel: formatRelationLabel(relationType, locale),
          reason,
          score: 0.72 + Math.min(0.15, (sharedMotifs.length + sharedTechs.length) * 0.05),
          source: 'snapshot',
        });
      }
    }
  }

  return {
    recommendations: Array.from(ranked.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit),
    source: 'snapshot',
  };
}

/**
 * Returns a 1-hop neighborhood subgraph centered on an artwork for the
 * interactive Knowledge Graph Explorer (`ArtGraphMap`).
 */
export async function getArtworkNeighborhood(
  title: string,
  artist?: string,
  locale: Locale = 'ja'
): Promise<GraphSubgraph | null> {
  const cTitle = catalogueTitle(canonicalName(title)).trim();
  const cArtist = artist ? canonicalName(artist).trim() : '';
  if (!cTitle) return null;

  const ui = getGraphUIText(locale);

  if (isNeo4jConfigured()) {
    const rows = await runCypher<{
      centerKey: string;
      centerTitle: string;
      centerArtist: string;
      centerMovement: string | null;
      motifs: string[];
      techniques: string[];
      neighbors: Array<{
        key: string;
        title: string;
        artist: string;
        year: string | null;
        relType: string;
        reason: string | null;
      }>;
    }>(
      `MATCH (a:Artwork)
       WHERE a.title = $title AND ($artist = '' OR a.artist = $artist)
       WITH a LIMIT 1
       OPTIONAL MATCH (a)-[:DEPICTS_MOTIF]->(m:Motif)
       WITH a, collect(DISTINCT m.name)[0..3] AS motifs
       OPTIONAL MATCH (a)-[:USES_TECHNIQUE]->(t:Technique)
       WITH a, motifs, collect(DISTINCT t.name)[0..2] AS techniques
       OPTIONAL MATCH (a)-[r:INFLUENCED_BY|SHARES_MOTIF|CONTEMPORARY_OF|SAME_MOVEMENT|BY_ARTIST]-(b:Artwork)
       WHERE b.key <> a.key
       WITH a, motifs, techniques, r, b
       ORDER BY coalesce(r.strength, 0.85) DESC
       WITH a, motifs, techniques, collect({
         key: b.key,
         title: b.title,
         artist: b.artist,
         year: b.year,
         relType: type(r),
         reason: r.reason
       })[0..5] AS neighbors
       RETURN a.key AS centerKey,
              a.title AS centerTitle,
              a.artist AS centerArtist,
              a.movement AS centerMovement,
              motifs,
              techniques,
              neighbors`,
      { title: cTitle, artist: cArtist }
    );

    if (rows && rows.length > 0 && rows[0].centerKey) {
      const row = rows[0];
      const nodes: GraphVisualNode[] = [];
      const edges: GraphVisualEdge[] = [];
      const centerId = `art:${row.centerKey}`;

      nodes.push({
        id: centerId,
        kind: 'artwork',
        label: localizeName(row.centerTitle, locale),
        sublabel: localizeName(row.centerArtist, locale),
        title: row.centerTitle,
        artist: row.centerArtist,
        isCenter: true,
      });

      if (row.centerArtist) {
        const artistId = `artist:${row.centerArtist}`;
        nodes.push({ id: artistId, kind: 'artist', label: localizeName(row.centerArtist, locale) });
        edges.push({ from: centerId, to: artistId, type: 'BY_ARTIST', label: ui.nodeKinds.artist });
      }

      if (row.centerMovement) {
        const movId = `movement:${row.centerMovement}`;
        nodes.push({ id: movId, kind: 'movement', label: row.centerMovement });
        edges.push({ from: centerId, to: movId, type: 'BELONGS_TO_MOVEMENT', label: ui.nodeKinds.movement });
      }

      for (const motif of row.motifs ?? []) {
        if (!motif) continue;
        const mId = `motif:${motif}`;
        nodes.push({ id: mId, kind: 'motif', label: motif });
        edges.push({ from: centerId, to: mId, type: 'DEPICTS_MOTIF', label: ui.nodeKinds.motif });
      }

      for (const tech of row.techniques ?? []) {
        if (!tech) continue;
        const tId = `tech:${tech}`;
        nodes.push({ id: tId, kind: 'technique', label: tech });
        edges.push({ from: centerId, to: tId, type: 'USES_TECHNIQUE', label: ui.nodeKinds.technique });
      }

      for (const n of row.neighbors ?? []) {
        if (!n?.key) continue;
        const nId = `art:${n.key}`;
        const relType = normalizeRelationType(n.relType);
        nodes.push({
          id: nId,
          kind: 'artwork',
          label: localizeName(n.title, locale),
          sublabel: localizeName(n.artist, locale),
          title: n.title,
          artist: n.artist,
        });
        edges.push({
          from: centerId,
          to: nId,
          type: relType,
          label: formatRelationLabel(relType, locale),
          reason: n.reason ?? undefined,
        });
      }

      return {
        centerKey: row.centerKey,
        centerTitle: row.centerTitle,
        centerArtist: row.centerArtist,
        source: 'neo4j',
        nodes,
        edges,
      };
    }
  }

  // Snapshot fallback
  const center = resolveSnapshotArtwork(cTitle, cArtist);
  if (!center) return null;

  const nodes: GraphVisualNode[] = [];
  const edges: GraphVisualEdge[] = [];
  const centerId = `art:${center.key}`;

  nodes.push({
    id: centerId,
    kind: 'artwork',
    label: localizeName(center.title, locale),
    sublabel: localizeName(center.artist, locale),
    title: center.title,
    artist: center.artist,
    isCenter: true,
  });

  if (center.artist) {
    const artistId = `artist:${center.artist}`;
    nodes.push({ id: artistId, kind: 'artist', label: localizeName(center.artist, locale) });
    edges.push({ from: centerId, to: artistId, type: 'BY_ARTIST', label: ui.nodeKinds.artist });
  }

  if (center.movement) {
    const movId = `movement:${center.movement}`;
    nodes.push({ id: movId, kind: 'movement', label: center.movement });
    edges.push({ from: centerId, to: movId, type: 'BELONGS_TO_MOVEMENT', label: ui.nodeKinds.movement });
  }

  for (const motif of center.motifs.slice(0, 3)) {
    const mId = `motif:${motif}`;
    nodes.push({ id: mId, kind: 'motif', label: motif });
    edges.push({ from: centerId, to: mId, type: 'DEPICTS_MOTIF', label: ui.nodeKinds.motif });
  }

  for (const tech of center.techniques.slice(0, 2)) {
    const tId = `tech:${tech}`;
    nodes.push({ id: tId, kind: 'technique', label: tech });
    edges.push({ from: centerId, to: tId, type: 'USES_TECHNIQUE', label: ui.nodeKinds.technique });
  }

  const neighborEdges = [...(ADJACENCY.get(center.key) ?? [])]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 5);

  const seenNeighbors = new Set<string>();
  for (const edge of neighborEdges) {
    if (seenNeighbors.has(edge.target.key)) continue;
    seenNeighbors.add(edge.target.key);
    const nId = `art:${edge.target.key}`;
    nodes.push({
      id: nId,
      kind: 'artwork',
      label: localizeName(edge.target.title, locale),
      sublabel: localizeName(edge.target.artist, locale),
      title: edge.target.title,
      artist: edge.target.artist,
    });
    edges.push({
      from: centerId,
      to: nId,
      type: edge.type,
      label: formatRelationLabel(edge.type, locale),
      reason: edge.reason,
    });
  }

  return {
    centerKey: center.key,
    centerTitle: center.title,
    centerArtist: center.artist,
    source: 'snapshot',
    nodes,
    edges,
  };
}

/**
 * Finds the shortest path between two artworks to construct a dynamic
 * curated audio tour (`shortestPath` in Neo4j / BFS over snapshot).
 */
export async function findArtworkPathTour(
  fromTitle: string,
  toTitle: string,
  locale: Locale = 'ja'
): Promise<DynamicTourResult | null> {
  const startCanonical = catalogueTitle(canonicalName(fromTitle)).trim();
  const endCanonical = catalogueTitle(canonicalName(toTitle)).trim();
  if (!startCanonical || !endCanonical || startCanonical === endCanonical) return null;

  if (isNeo4jConfigured()) {
    const rows = await runCypher<{
      nodes: Array<{ title: string; artist: string }>;
      rels: Array<{ type: string; reason: string | null }>;
    }>(
      `MATCH (start:Artwork {title: $fromTitle}), (end:Artwork {title: $toTitle})
       WITH start, end LIMIT 1
       MATCH p = shortestPath((start)-[:INFLUENCED_BY|SHARES_MOTIF|CONTEMPORARY_OF|SAME_MOVEMENT|BY_ARTIST*1..6]-(end))
       RETURN [n IN nodes(p) | { title: n.title, artist: n.artist }] AS nodes,
              [r IN relationships(p) | { type: type(r), reason: r.reason }] AS rels`,
      { fromTitle: startCanonical, toTitle: endCanonical }
    );

    if (rows && rows.length > 0 && Array.isArray(rows[0].nodes) && rows[0].nodes.length >= 2) {
      const pathNodes = rows[0].nodes;
      const pathRels = rows[0].rels ?? [];
      const steps: DynamicTourStep[] = pathNodes.map((node, index) => {
        if (index === 0) {
          return {
            title: node.title,
            artist: node.artist,
            cue:
              locale === 'ja'
                ? `「${node.title}」から旅を始めます`
                : `Beginning our journey with ${localizeName(node.title, locale)}`,
          };
        }
        const rel = pathRels[index - 1];
        const relType = normalizeRelationType(rel?.type);
        const relLabel = formatRelationLabel(relType, locale);
        return {
          title: node.title,
          artist: node.artist,
          relationLabel: relLabel,
          cue: rel?.reason || `${relLabel}: ${localizeName(node.title, locale)}`,
        };
      });

      return {
        source: 'neo4j',
        fromTitle: pathNodes[0].title,
        toTitle: pathNodes[pathNodes.length - 1].title,
        steps,
      };
    }
  }

  // Snapshot BFS shortest path
  const startNode = resolveSnapshotArtwork(startCanonical);
  const endNode = resolveSnapshotArtwork(endCanonical);
  if (!startNode || !endNode || startNode.key === endNode.key) return null;

  const queue: string[] = [startNode.key];
  const parent = new Map<string, { prevKey: string; edge: NeighborEdge }>();
  const visited = new Set<string>([startNode.key]);

  while (queue.length > 0) {
    const currentKey = queue.shift()!;
    if (currentKey === endNode.key) break;

    const edges = [...(ADJACENCY.get(currentKey) ?? [])].sort((a, b) => b.strength - a.strength);
    for (const edge of edges) {
      if (visited.has(edge.target.key)) continue;
      visited.add(edge.target.key);
      parent.set(edge.target.key, { prevKey: currentKey, edge });
      queue.push(edge.target.key);
    }
  }

  if (!visited.has(endNode.key)) return null;

  const reversedSteps: DynamicTourStep[] = [];
  let cursor: string = endNode.key;
  while (cursor !== startNode.key) {
    const info = parent.get(cursor);
    if (!info) break;
    const art = ARTWORK_BY_KEY.get(cursor)!;
    const relLabel = formatRelationLabel(info.edge.type, locale);
    reversedSteps.push({
      title: art.title,
      artist: art.artist,
      relationLabel: relLabel,
      cue: info.edge.reason,
    });
    cursor = info.prevKey;
  }

  reversedSteps.push({
    title: startNode.title,
    artist: startNode.artist,
    cue:
      locale === 'ja'
        ? `「${startNode.title}」から旅を始めます`
        : `Beginning our journey with ${localizeName(startNode.title, locale)}`,
  });

  return {
    source: 'snapshot',
    fromTitle: startNode.title,
    toTitle: endNode.title,
    steps: reversedSteps.reverse(),
  };
}

/**
 * Finds 1–2 hop graph connections between the artwork currently being viewed
 * and artworks the visitor recently viewed (for GraphRAG context injection).
 */
export async function findHistoryGraphConnections(
  currentTitle: string,
  currentArtist: string | undefined,
  historyItems: { title: string; artist?: string }[],
  locale: Locale = 'ja',
  limit = 3
): Promise<GraphConnectionHint[]> {
  const cTitle = catalogueTitle(canonicalName(currentTitle)).trim();
  if (!cTitle || historyItems.length === 0) return [];

  const recentTitles = Array.from(
    new Set(
      historyItems
        .map(h => catalogueTitle(canonicalName(h.title)).trim())
        .filter(t => t && t.toLowerCase() !== cTitle.toLowerCase())
    )
  ).slice(-10);

  if (recentTitles.length === 0) return [];

  if (isNeo4jConfigured()) {
    const rows = await runCypher<{
      relatedTitle: string;
      relatedArtist: string;
      relType: string;
      reason: string | null;
      hops: number;
    }>(
      `MATCH (curr:Artwork {title: $currentTitle})
       WITH curr LIMIT 1
       MATCH (hist:Artwork)
       WHERE hist.title IN $recentTitles
       MATCH p = shortestPath((curr)-[r:INFLUENCED_BY|SHARES_MOTIF|CONTEMPORARY_OF|SAME_MOVEMENT|BY_ARTIST*1..2]-(hist))
       WITH hist, relationships(p) AS rels, length(p) AS hops
       RETURN hist.title AS relatedTitle,
              hist.artist AS relatedArtist,
              type(rels[0]) AS relType,
              rels[0].reason AS reason,
              hops
       ORDER BY hops ASC
       LIMIT $limit`,
      { currentTitle: cTitle, recentTitles, limit }
    );

    if (rows && rows.length > 0) {
      return rows.map(row => {
        const relType = normalizeRelationType(row.relType);
        return {
          relatedTitle: row.relatedTitle,
          relatedArtist: row.relatedArtist,
          relationType: relType,
          relationLabel: formatRelationLabel(relType, locale),
          reason: row.reason || formatRelationLabel(relType, locale),
          hops: typeof row.hops === 'number' ? row.hops : 1,
        };
      });
    }
  }

  // Snapshot fallback (1-hop then 2-hop)
  const curr = resolveSnapshotArtwork(cTitle, currentArtist);
  if (!curr) return [];

  const hints: GraphConnectionHint[] = [];
  const used = new Set<string>();

  for (const histTitle of [...recentTitles].reverse()) {
    if (hints.length >= limit) break;
    const histNode = resolveSnapshotArtwork(histTitle);
    if (!histNode || histNode.key === curr.key || used.has(histNode.key)) continue;

    // 1-hop direct relation
    const direct = (ADJACENCY.get(curr.key) ?? []).find(e => e.target.key === histNode.key);
    if (direct) {
      used.add(histNode.key);
      hints.push({
        relatedTitle: histNode.title,
        relatedArtist: histNode.artist,
        relationType: direct.type,
        relationLabel: formatRelationLabel(direct.type, locale),
        reason: direct.reason,
        hops: 1,
      });
      continue;
    }

    // 2-hop via shared bridge artwork
    const currNeighbors = ADJACENCY.get(curr.key) ?? [];
    for (const firstHop of currNeighbors) {
      const secondHop = (ADJACENCY.get(firstHop.target.key) ?? []).find(
        e => e.target.key === histNode.key
      );
      if (secondHop) {
        used.add(histNode.key);
        hints.push({
          relatedTitle: histNode.title,
          relatedArtist: histNode.artist,
          relationType: firstHop.type,
          relationLabel: formatRelationLabel(firstHop.type, locale),
          reason: `『${firstHop.target.title}』を介してつながっています（${firstHop.reason}）`,
          hops: 2,
        });
        break;
      }
    }
  }

  return hints;
}

/**
 * Searches artworks by graph concepts (movement, motif, technique, museum, or
 * relation keywords like ジャポニスム / キアロスクーロ / 青 / 浮世絵 / 印象派)
 * to power exploratory autocomplete in `/api/suggest`.
 */
export async function searchArtworksByGraphConcept(
  query: string,
  limit = 5
): Promise<{ title: string; artist: string }[]> {
  const term = query.trim().toLowerCase();
  if (!term || term.length < 2) return [];

  if (isNeo4jConfigured()) {
    const rows = await runCypher<{ title: string; artist: string }>(
      `MATCH (a:Artwork)
       OPTIONAL MATCH (a)-[:DEPICTS_MOTIF]->(m:Motif)
       OPTIONAL MATCH (a)-[:USES_TECHNIQUE]->(t:Technique)
       WITH a, collect(DISTINCT m.name) AS motifs, collect(DISTINCT t.name) AS techs
       WHERE toLower(a.title) CONTAINS $term
          OR toLower(a.artist) CONTAINS $term
          OR toLower(coalesce(a.movement, '')) CONTAINS $term
          OR toLower(coalesce(a.museum, '')) CONTAINS $term
          OR toLower(coalesce(a.summary, '')) CONTAINS $term
          OR any(m IN motifs WHERE toLower(m) CONTAINS $term)
          OR any(t IN techs WHERE toLower(t) CONTAINS $term)
       RETURN DISTINCT a.title AS title, a.artist AS artist
       LIMIT $limit`,
      { term, limit }
    );
    if (rows && rows.length > 0) {
      return rows.filter(r => typeof r.title === 'string' && typeof r.artist === 'string');
    }
  }

  // Snapshot concept search (also matches Japanese/English art movement aliases)
  const synonymMap: Record<string, string[]> = {
    japonisme: ['浮世絵', '日本風', '北斎', '広重', '琳派'],
    ジャポニスム: ['浮世絵', '日本風', '北斎', '広重', '琳派'],
    ukiyoe: ['浮世絵'],
    impressionism: ['印象派'],
    renaissance: ['ルネサンス'],
    baroque: ['バロック'],
    surrealism: ['シュルレアリスム'],
    cubism: ['キュビスム'],
    blue: ['青', '群青', 'ラピスラズリ', 'プルシアンブルー'],
    light: ['光', '明暗', 'キアロスクーロ'],
    night: ['夜', '星'],
    wave: ['波', '海'],
  };

  const terms = [term, ...(synonymMap[term] ?? []).map(s => s.toLowerCase())];
  const matches: { title: string; artist: string; score: number }[] = [];

  for (const art of DATASET.artworks) {
    const haystack = [
      art.title,
      art.artist,
      art.movement ?? '',
      art.museum ?? '',
      art.summary ?? '',
      ...art.motifs,
      ...art.techniques,
    ]
      .join(' ')
      .toLowerCase();

    let score = 0;
    for (const t of terms) {
      if (haystack.includes(t)) score += 1;
    }
    // Also check relation reasons connected to this artwork
    for (const rel of DATASET.relations) {
      if ((rel.fromKey === art.key || rel.toKey === art.key) && terms.some(t => rel.reason.toLowerCase().includes(t))) {
        score += 0.5;
      }
    }

    if (score > 0) {
      matches.push({ title: art.title, artist: art.artist, score });
    }
  }

  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ title, artist }) => ({ title, artist }));
}

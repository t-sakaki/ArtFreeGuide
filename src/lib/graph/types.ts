export type GraphRelationType =
  | 'INFLUENCED_BY'
  | 'SHARES_MOTIF'
  | 'SAME_MOVEMENT'
  | 'CONTEMPORARY_OF'
  | 'BY_ARTIST';

export type GraphNodeKind =
  | 'artwork'
  | 'artist'
  | 'movement'
  | 'motif'
  | 'technique';

export interface ArtGraphArtwork {
  key: string;
  title: string;
  artist: string;
  year?: string;
  movement?: string;
  museum?: string;
  motifs: string[];
  techniques: string[];
  summary?: string;
}

export interface ArtGraphRelation {
  fromKey: string;
  toKey: string;
  type: GraphRelationType;
  reason: string;
  /** Higher weight means stronger curatorial relevance (0.5 - 1.0). */
  strength?: number;
}

export interface ArtGraphDataset {
  version: number;
  artworks: ArtGraphArtwork[];
  relations: ArtGraphRelation[];
}

export interface GraphRecommendation {
  key: string;
  title: string;
  artist: string;
  year: string | null;
  description: string | null;
  relationType: GraphRelationType;
  relationLabel: string;
  reason: string;
  score: number;
  source: 'neo4j' | 'snapshot';
}

export interface GraphVisualNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  sublabel?: string;
  title?: string;
  artist?: string;
  isCenter?: boolean;
}

export interface GraphVisualEdge {
  from: string;
  to: string;
  type: string;
  label: string;
  reason?: string;
}

export interface GraphSubgraph {
  centerKey: string;
  centerTitle: string;
  centerArtist: string;
  source: 'neo4j' | 'snapshot';
  nodes: GraphVisualNode[];
  edges: GraphVisualEdge[];
}

export interface DynamicTourStep {
  title: string;
  artist: string;
  cue: string;
  relationLabel?: string;
}

export interface DynamicTourResult {
  source: 'neo4j' | 'snapshot';
  fromTitle: string;
  toTitle: string;
  steps: DynamicTourStep[];
}

export interface GraphConnectionHint {
  relatedTitle: string;
  relatedArtist: string;
  relationType: GraphRelationType;
  relationLabel: string;
  reason: string;
  hops: number;
}

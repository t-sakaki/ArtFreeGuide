import { getCloudflareContext } from '@opennextjs/cloudflare';

// Multilingual model: works for the Japanese titles/descriptions in the catalogue.
export const WORKERS_AI_EMBEDDING_MODEL = '@cf/baai/bge-m3';
export const NVIDIA_EMBEDDING_MODEL =
  process.env.NVIDIA_EMBEDDING_MODEL || 'nvidia/llama-nemotron-embed-1b-v2';
export const EMBEDDING_DIMENSIONS = 1024;

const NVIDIA_BASE_URL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const NVIDIA_BATCH_SIZE = 32;

export type EmbeddingProvider = 'workers-ai' | 'nvidia';

/**
 * Asymmetric models embed a stored document and a search query differently;
 * catalogue rows are passages, free-text lookups are queries.
 */
export type EmbeddingKind = 'passage' | 'query';

export const EMBEDDING_PROVIDER: EmbeddingProvider =
  (process.env.EMBEDDING_PROVIDER || '').toLowerCase() === 'nvidia' ? 'nvidia' : 'workers-ai';

const usingNvidia = EMBEDDING_PROVIDER === 'nvidia';

/** The two embedding spaces live in separate columns so either can be used. */
export const ARTWORK_EMBEDDING_COLUMN = usingNvidia ? 'embedding_nv' : 'embedding';
export const PROFILE_EMBEDDING_COLUMN = usingNvidia
  ? 'preference_embedding_nv'
  : 'preference_embedding';
export const MATCH_FUNCTION = usingNvidia ? 'match_artworks_nv' : 'match_artworks';

// Cosine scores from the NVIDIA model sit lower than bge-m3's, so the cut-off
// has to move with the provider.
export const MATCH_THRESHOLD = Number(
  process.env.EMBEDDING_MATCH_THRESHOLD ?? (usingNvidia ? 0.25 : 0.5)
);

export interface EmbeddableArtwork {
  title: string;
  artist: string;
  description?: string | null;
  tags?: string[] | null;
}

interface AiBinding {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

export function buildArtworkEmbeddingText(artwork: EmbeddableArtwork): string {
  const tags = artwork.tags?.length ? `。タグ: ${artwork.tags.join('、')}` : '';
  const description = artwork.description ? `。${artwork.description}` : '';
  return `${artwork.title} / ${artwork.artist}${description}${tags}`;
}

function assertShape(vectors: unknown, expected: number, model: string): number[][] {
  if (!Array.isArray(vectors) || vectors.length !== expected) {
    throw new Error(`Unexpected embedding response from ${model}`);
  }

  const wrongSize = (vectors as number[][]).find(
    vector => vector.length !== EMBEDDING_DIMENSIONS
  );
  if (wrongSize) {
    throw new Error(`Expected ${EMBEDDING_DIMENSIONS}-dimension embeddings, got ${wrongSize.length}`);
  }

  return vectors as number[][];
}

async function embedWithWorkersAi(texts: string[]): Promise<number[][]> {
  const { env } = await getCloudflareContext({ async: true });
  const ai = (env as unknown as { AI?: AiBinding }).AI;

  if (!ai) {
    throw new Error('Workers AI binding "AI" is not available. Run on Cloudflare or via `npm run preview`.');
  }

  const result = await ai.run(WORKERS_AI_EMBEDDING_MODEL, { text: texts });
  return assertShape(
    (result as { data?: number[][] }).data,
    texts.length,
    WORKERS_AI_EMBEDDING_MODEL
  );
}

async function embedBatchWithNvidia(texts: string[], kind: EmbeddingKind): Promise<number[][]> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error('NVIDIA_API_KEY environment variable is not set.');
  }

  const response = await fetch(`${NVIDIA_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: NVIDIA_EMBEDDING_MODEL,
      input: texts,
      input_type: kind,
      truncate: 'END',
      dimensions: EMBEDDING_DIMENSIONS
    })
  });

  if (!response.ok) {
    throw new Error(
      `NVIDIA embedding call failed (${response.status}): ${(await response.text()).slice(0, 200)}`
    );
  }

  const payload = (await response.json()) as { data?: { index: number; embedding: number[] }[] };
  const ordered = [...(payload.data ?? [])]
    .sort((a, b) => a.index - b.index)
    .map(entry => entry.embedding);

  return assertShape(ordered, texts.length, NVIDIA_EMBEDDING_MODEL);
}

async function embedWithNvidia(texts: string[], kind: EmbeddingKind): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += NVIDIA_BATCH_SIZE) {
    vectors.push(...(await embedBatchWithNvidia(texts.slice(start, start + NVIDIA_BATCH_SIZE), kind)));
  }
  return vectors;
}

/**
 * Embeds texts with the configured provider. Workers AI only works where the
 * `AI` binding exists (deployed Worker, `wrangler dev`, `npm run preview`);
 * NVIDIA NIM is a plain HTTP call and also works from a local script.
 */
export async function embedTexts(
  texts: string[],
  kind: EmbeddingKind = 'passage'
): Promise<number[][]> {
  if (texts.length === 0) return [];
  return usingNvidia ? embedWithNvidia(texts, kind) : embedWithWorkersAi(texts);
}

export async function embedText(text: string, kind: EmbeddingKind = 'passage'): Promise<number[]> {
  const [vector] = await embedTexts([text], kind);
  return vector;
}

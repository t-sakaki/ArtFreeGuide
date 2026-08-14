import { getCloudflareContext } from '@opennextjs/cloudflare';

// Multilingual model: works for the Japanese titles/descriptions in the catalogue.
export const EMBEDDING_MODEL = '@cf/baai/bge-m3';
export const EMBEDDING_DIMENSIONS = 1024;

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

/**
 * Embeds texts with Workers AI. Only works where the `AI` binding exists
 * (deployed Worker, `wrangler dev`, `npm run preview`).
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const { env } = await getCloudflareContext({ async: true });
  const ai = (env as unknown as { AI?: AiBinding }).AI;

  if (!ai) {
    throw new Error('Workers AI binding "AI" is not available. Run on Cloudflare or via `npm run preview`.');
  }

  const result = await ai.run(EMBEDDING_MODEL, { text: texts });
  const vectors = (result as { data?: number[][] }).data;

  if (!Array.isArray(vectors) || vectors.length !== texts.length) {
    throw new Error(`Unexpected embedding response from ${EMBEDDING_MODEL}`);
  }

  const wrongSize = vectors.find(vector => vector.length !== EMBEDDING_DIMENSIONS);
  if (wrongSize) {
    throw new Error(`Expected ${EMBEDDING_DIMENSIONS}-dimension embeddings, got ${wrongSize.length}`);
  }

  return vectors;
}

export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  return vector;
}

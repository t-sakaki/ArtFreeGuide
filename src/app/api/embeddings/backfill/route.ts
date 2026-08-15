import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import {
  ARTWORK_EMBEDDING_COLUMN,
  buildArtworkEmbeddingText,
  embedTexts
} from '@/lib/embeddings';

const BATCH_SIZE = 20;

/**
 * Generates embeddings for catalogue rows that don't have one in the active
 * embedding column yet. Admin only: with the Workers AI provider this has to
 * run on the Worker, where the `AI` binding exists.
 */
export async function POST(req: Request) {
  try {
    const adminToken = process.env.ADMIN_TASK_TOKEN;
    if (!adminToken) {
      return NextResponse.json({ error: 'ADMIN_TASK_TOKEN is not configured' }, { status: 503 });
    }
    if (req.headers.get('authorization') !== `Bearer ${adminToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { data: artworks, error } = await supabase
      .from('artworks')
      .select('id, title, artist, description, tags')
      .is(ARTWORK_EMBEDDING_COLUMN, null)
      .limit(BATCH_SIZE);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!artworks || artworks.length === 0) {
      return NextResponse.json({ updated: 0, remaining: 0 });
    }

    const embeddings = await embedTexts(artworks.map(buildArtworkEmbeddingText));

    let updated = 0;
    for (const [index, artwork] of artworks.entries()) {
      const { error: updateError } = await supabase
        .from('artworks')
        .update({ [ARTWORK_EMBEDDING_COLUMN]: embeddings[index] })
        .eq('id', artwork.id);

      if (updateError) {
        console.error(`Failed to store embedding for ${artwork.title}:`, updateError.message);
        continue;
      }
      updated++;
    }

    const { count } = await supabase
      .from('artworks')
      .select('id', { count: 'exact', head: true })
      .is(ARTWORK_EMBEDDING_COLUMN, null);

    return NextResponse.json({ updated, remaining: count ?? 0 });
  } catch (error: any) {
    console.error('Embedding backfill error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

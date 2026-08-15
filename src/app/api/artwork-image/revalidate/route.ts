import { NextResponse } from 'next/server';
import { resolveArtworkImage } from '@/lib/artworkImage';
import { createServiceClient } from '@/lib/supabase';

/**
 * Re-checks cached artwork images against the current resolver.
 *
 * The cache is only as good as the rules in force when it was written: an
 * earlier version accepted any Commons file naming the artist, so some rows
 * hold his self-portrait instead of the work. Admin only, and batched, so it
 * can be run repeatedly until `remaining` reaches zero.
 */

const BATCH_SIZE = 10;
/** Rows written by the resolver; hand-curated URLs are left alone. */
const RESOLVER_URL = '%Special:FilePath%';

interface Row {
  id: string;
  title: string;
  artist: string;
  image_url: string | null;
}

export async function POST(req: Request) {
  try {
    const adminToken = process.env.ADMIN_TASK_TOKEN;
    if (!adminToken) {
      return NextResponse.json({ error: 'ADMIN_TASK_TOKEN is not configured' }, { status: 503 });
    }
    if (req.headers.get('authorization') !== `Bearer ${adminToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { offset } = (await req.json().catch(() => ({}))) as { offset?: number };
    const from = typeof offset === 'number' && offset > 0 ? offset : 0;

    const supabase = createServiceClient();
    const { data, error, count } = await supabase
      .from('artworks')
      .select('id, title, artist, image_url', { count: 'exact' })
      .like('image_url', RESOLVER_URL)
      .order('id')
      .range(from, from + BATCH_SIZE - 1);

    if (error) {
      // Offset past the last row: the caller has already walked the table.
      if (error.code === 'PGRST103') {
        return NextResponse.json({ checked: 0, changed: [], nextOffset: from, remaining: 0 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as Row[];
    const changed: { title: string; before: string | null; after: string | null }[] = [];

    for (const row of rows) {
      const resolved = await resolveArtworkImage({ title: row.title, artist: row.artist });
      const after = resolved?.url ?? null;
      if (after === row.image_url) continue;

      await supabase.from('artworks').update({ image_url: after }).eq('id', row.id);
      changed.push({ title: row.title, before: row.image_url, after });
    }

    const nextOffset = from + rows.length;
    return NextResponse.json({
      checked: rows.length,
      changed,
      nextOffset,
      remaining: Math.max((count ?? 0) - nextOffset, 0)
    });
  } catch (error) {
    console.error('Artwork image revalidation error:', error);
    return NextResponse.json({ error: 'Revalidation failed' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { resolveArtworkImage } from '@/lib/artworkImage';
import { createServiceClient } from '@/lib/supabase';

/**
 * The picture for one artwork, resolved once and then remembered.
 *
 * Running this on the server rather than in the browser is what makes the
 * lookup chain possible: several APIs are consulted per artwork, and the
 * answer is written back to the catalogue so the next visitor — and the demo —
 * gets the image without any of the searching.
 */

interface CachedImage {
  url: string | null;
  found: boolean;
}

async function readCatalogImage(title: string, artist: string): Promise<CachedImage | null> {
  try {
    const supabase = createServiceClient();
    let query = supabase.from('artworks').select('image_url').eq('title', title).limit(1);
    if (artist) query = query.eq('artist', artist);

    const { data } = await query;
    const row = data?.[0] as { image_url?: string | null } | undefined;
    if (!row) return null;
    return { url: row.image_url ?? null, found: Boolean(row.image_url) };
  } catch (error) {
    console.error('Catalogue image lookup failed:', error);
    return null;
  }
}

/**
 * Remembers the picture. An artwork the visitor actually opened is worth a
 * catalogue row of its own; its embedding is left to the backfill endpoint, so
 * that an exhausted Workers AI quota cannot cost us the image as well.
 */
async function writeCatalogImage(
  title: string,
  artist: string,
  url: string,
  exists: boolean
): Promise<void> {
  try {
    const supabase = createServiceClient();
    if (exists) {
      let query = supabase.from('artworks').update({ image_url: url }).eq('title', title);
      if (artist) query = query.eq('artist', artist);
      await query;
      return;
    }
    if (artist) {
      await supabase.from('artworks').upsert(
        {
          title,
          artist,
          image_url: url,
          search_query: `${title} ${artist}`.trim()
        },
        { onConflict: 'title,artist' }
      );
    }
  } catch (error) {
    console.error('Caching the artwork image failed:', error);
  }
}

export async function POST(req: Request) {
  try {
    const { title: rawTitle, artist: rawArtist, searchQuery, create, width } = await req.json();
    const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
    const artist = typeof rawArtist === 'string' ? rawArtist.trim() : '';

    if (!title) {
      return NextResponse.json({ url: null, source: null });
    }

    const cached = await readCatalogImage(title, artist);
    if (cached?.found && cached.url) {
      return NextResponse.json({ url: cached.url, source: 'catalog' });
    }

    const resolved = await resolveArtworkImage({
      title,
      artist,
      searchQuery: typeof searchQuery === 'string' ? searchQuery : null,
      width: typeof width === 'number' ? width : undefined
    });

    // A card asked for a small thumbnail; caching that would shrink the image
    // the stage later reuses, so only full-size lookups are written back.
    if (resolved && create !== false) {
      await writeCatalogImage(title, artist, resolved.url, cached !== null);
    }

    return NextResponse.json({ url: resolved?.url ?? null, source: resolved?.source ?? null });
  } catch (error) {
    console.error('Artwork image API Route Error:', error);
    return NextResponse.json({ url: null, source: null });
  }
}

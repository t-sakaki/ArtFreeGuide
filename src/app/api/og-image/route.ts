import { resolveArtworkImage } from '@/lib/artworkImage';
import { createServiceClient } from '@/lib/supabase';

/**
 * The picture a shared link shows in a chat or a timeline.
 *
 * Social crawlers do not run JavaScript and several of them refuse to follow a
 * redirect to another origin, so the bytes are proxied from here rather than
 * linked. The catalogue is consulted first: an artwork someone shared has
 * almost always been opened, and its image URL is already recorded.
 */

const DEFAULT_IMAGE = '/og-default.png';
const WIDTH = 1200;
/** Crawlers refetch often, and an artwork's picture does not change. */
const CACHE = 'public, max-age=86400, s-maxage=604800';

async function catalogImage(title: string, artist: string): Promise<string | null> {
  try {
    const supabase = createServiceClient();
    let query = supabase.from('artworks').select('image_url').eq('title', title).limit(1);
    if (artist) query = query.eq('artist', artist);
    const { data } = await query;
    return (data?.[0] as { image_url?: string | null } | undefined)?.image_url ?? null;
  } catch (error) {
    console.error('Share image catalogue lookup failed:', error);
    return null;
  }
}

/** Commons thumbnails are asked for at the shared card's width. */
function atShareWidth(url: string): string {
  return url.includes('Special:FilePath') ? url.replace(/([?&])width=\d+/, `$1width=${WIDTH}`) : url;
}

function fallback(req: Request): Response {
  return Response.redirect(new URL(DEFAULT_IMAGE, req.url).toString(), 302);
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const title = (params.get('artwork') ?? '').trim();
  const artist = (params.get('artist') ?? '').trim();
  if (!title) return fallback(req);

  try {
    const cached = await catalogImage(title, artist);
    const resolved =
      cached ?? (await resolveArtworkImage({ title, artist, width: WIDTH }))?.url ?? null;
    if (!resolved) return fallback(req);

    const image = await fetch(atShareWidth(resolved), {
      headers: { 'user-agent': 'ArtFreeGuide/1.0 (share card)' }
    });
    const type = image.headers.get('content-type') ?? '';
    if (!image.ok || !type.startsWith('image/')) return fallback(req);

    return new Response(image.body, {
      headers: { 'content-type': type, 'cache-control': CACHE }
    });
  } catch (error) {
    console.error('Share image failed:', error);
    return fallback(req);
  }
}

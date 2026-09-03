/**
 * Same-origin passthrough for artwork images, so the MP4 exporter can draw them
 * to a canvas without tainting it. Restricted to the handful of hosts the
 * catalogue actually stores pictures from.
 */

const ALLOWED_HOSTS = [
  'upload.wikimedia.org',
  'commons.wikimedia.org',
  'www.wikidata.org',
  'wikidata.org',
];

const CACHE = 'public, max-age=86400, s-maxage=604800';

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('url') ?? '';
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response('bad url', { status: 400 });
  }
  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.includes(target.hostname)) {
    return new Response('host not allowed', { status: 403 });
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: { 'user-agent': 'ArtFreeGuide/1.0 (video export)' },
    });
    const type = upstream.headers.get('content-type') ?? '';
    if (!upstream.ok || !type.startsWith('image/')) {
      return new Response('upstream error', { status: 502 });
    }
    return new Response(upstream.body, {
      headers: {
        'content-type': type,
        'cache-control': CACHE,
        'access-control-allow-origin': '*',
      },
    });
  } catch {
    return new Response('fetch failed', { status: 502 });
  }
}

import { isCommonsImageFile } from '../../../../lib/commonsImageFallback';

/** Only a Commons filename is accepted, never an arbitrary upstream URL. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const file = params.get('file') || '';
  if (!isCommonsImageFile(file)) return new Response('Invalid image file', { status: 400 });
  const requested = Number(params.get('width') || '960');
  const width = Number.isFinite(requested) ? Math.max(200, Math.min(1920, Math.round(requested))) : 960;
  const upstreamUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`;
  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { 'User-Agent': 'ArtFreeGuide/1.0 (https://art-free-guide.taira-sakakibara.workers.dev)' },
      signal: AbortSignal.timeout(15000),
    });
    const contentType = upstream.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
    if (!upstream.ok || !upstream.body || !contentType || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(contentType)) {
      await upstream.body?.cancel();
      return new Response('Image unavailable', { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }
    return new Response(upstream.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Image unavailable', { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
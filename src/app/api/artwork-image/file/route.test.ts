import { afterEach, describe, expect, it, vi } from 'vitest';
import { commonsImageFallback } from '../../../../lib/commonsImageFallback';
import { GET } from './route';

afterEach(() => vi.unstubAllGlobals());
const request = (file: string, width = '900') => new Request(`https://example.com/api/artwork-image/file?${new URLSearchParams({ file, width })}`);

describe('Commons image recovery', () => {
  it('recovers the same file from both Commons redirects and thumbnail URLs', () => {
    const special = 'https://commons.wikimedia.org/wiki/Special:FilePath/Monet%20-%20Impression%2C%20Sunrise.jpg?width=900';
    const fallback = commonsImageFallback(special)!;
    expect(new URL(fallback, 'https://example.com').searchParams.get('file')).toBe('Monet - Impression, Sunrise.jpg');
    expect(commonsImageFallback('https://thumb.wikimedia.org/wikipedia/commons/thumb/5/59/Monet_-_Impression%2C_Sunrise.jpg/960px-Monet_-_Impression%2C_Sunrise.jpg')).toContain('file=Monet_-_Impression%2C_Sunrise.jpg');
  });

  it('does not proxy arbitrary hosts, malformed filenames, or executable image types', async () => {
    expect(commonsImageFallback('https://example.com/Monet.jpg')).toBeNull();
    expect(commonsImageFallback('https://commons.wikimedia.org.evil.test/wiki/Special:FilePath/Monet.jpg')).toBeNull();
    expect(commonsImageFallback('https://commons.wikimedia.org/wiki/Special:FilePath/%zz.jpg')).toBeNull();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    for (const file of ['', 'https://localhost/private.jpg', '../private.jpg', 'script.svg', 'bad\nimage.jpg']) {
      expect((await GET(request(file))).status).toBe(400);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('streams a real image response and bounds requested thumbnail size', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { 'Content-Type': 'image/jpeg' } }));
    vi.stubGlobal('fetch', fetchSpy);
    const response = await GET(request('Monet.jpg', '99999'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(new URL(fetchSpy.mock.calls[0][0]).searchParams.get('width')).toBe('1920');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([0xff, 0xd8, 0xff]);
  });

  it('rejects successful HTML error pages instead of caching them as images', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>blocked</html>', { headers: { 'Content-Type': 'text/html' } })));
    const response = await GET(request('Monet.jpg'));
    expect(response.status).toBe(502);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns an explicit failure when upstream image loading fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect((await GET(request('Monet.jpg'))).status).toBe(502);
  });
});
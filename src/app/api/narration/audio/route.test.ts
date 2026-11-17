import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetCloudflareContext } = vi.hoisted(() => ({
  mockGetCloudflareContext: vi.fn(),
}));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mockGetCloudflareContext,
}));

import { GET, HEAD } from './route';

function makeStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

const VALID_QS =
  'artworkId=the-starry-night&locale=ja&mode=standard&contentHash=0123456789abcdef&voiceConfigHash=fedcba9876543210';

describe('/api/narration/audio', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('rejects path traversal or invalid hashes with 400', async () => {
    const req = new NextRequest(
      'http://localhost/api/narration/audio?artworkId=../secret&locale=ja&mode=standard&contentHash=0123456789abcdef&voiceConfigHash=fedcba9876543210',
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('supports full 200, Range 206, 416, and 304 ETag responses', async () => {
    const payload = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const head = vi.fn().mockResolvedValue({
      size: payload.length,
      httpEtag: '"etag-123"',
      httpMetadata: { contentType: 'audio/ogg; codecs=opus' },
    });
    const get = vi.fn(async (_key: string, opts?: { range?: { offset: number; length: number } }) => {
      if (opts?.range) {
        const slice = payload.slice(opts.range.offset, opts.range.offset + opts.range.length);
        return {
          size: slice.length,
          httpEtag: '"etag-123"',
          httpMetadata: { contentType: 'audio/ogg; codecs=opus' },
          body: makeStream(slice),
        };
      }
      return {
        size: payload.length,
        httpEtag: '"etag-123"',
        httpMetadata: { contentType: 'audio/ogg; codecs=opus' },
        body: makeStream(payload),
      };
    });

    mockGetCloudflareContext.mockResolvedValue({
      env: { AUDIO: { head, get }, NARRATION_ENV: 'staging' },
    });

    // 200 full
    const res200 = await GET(new NextRequest(`http://localhost/api/narration/audio?${VALID_QS}`));
    expect(res200.status).toBe(200);
    expect(res200.headers.get('accept-ranges')).toBe('bytes');
    expect(res200.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(new Uint8Array(await res200.arrayBuffer())).toEqual(payload);

    // HEAD 200 without reading body
    const resHead = await HEAD(new NextRequest(`http://localhost/api/narration/audio?${VALID_QS}`));
    expect(resHead.status).toBe(200);
    expect(resHead.headers.get('content-length')).toBe('10');

    // 206 Partial Content
    const res206 = await GET(
      new NextRequest(`http://localhost/api/narration/audio?${VALID_QS}`, {
        headers: { range: 'bytes=2-5' },
      }),
    );
    expect(res206.status).toBe(206);
    expect(res206.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(res206.headers.get('content-length')).toBe('4');
    expect(new Uint8Array(await res206.arrayBuffer())).toEqual(new Uint8Array([2, 3, 4, 5]));

    // 416 Range Not Satisfiable
    const res416 = await GET(
      new NextRequest(`http://localhost/api/narration/audio?${VALID_QS}`, {
        headers: { range: 'bytes=99-120' },
      }),
    );
    expect(res416.status).toBe(416);
    expect(res416.headers.get('content-range')).toBe('bytes */10');

    // 304 Not Modified
    const res304 = await GET(
      new NextRequest(`http://localhost/api/narration/audio?${VALID_QS}`, {
        headers: { 'if-none-match': '"etag-123"' },
      }),
    );
    expect(res304.status).toBe(304);
  });
});

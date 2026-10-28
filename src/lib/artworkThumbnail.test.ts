import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchArtworkImage } from './artworkThumbnail';

/**
 * Unit tests for the suggestion-thumbnail image resolver.
 *
 * `fetchArtworkImage` is the pure-ish function behind every suggestion
 * thumbnail (and DailyArtworkCard): it POSTs to /api/artwork-image and returns
 * the `url` field. We mock `global.fetch` so the test never touches the network
 * and asserts the parsing / error contract directly.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchArtworkImage', () => {
  it('returns the url when the API responds with one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ url: 'https://example.com/mona-lisa.jpg' }),
      })
    );

    const url = await fetchArtworkImage('モナ・リザ', 'レオナルド・ダ・ヴィンチ');
    expect(url).toBe('https://example.com/mona-lisa.jpg');
  });

  it('returns null when the response has no url', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ url: null }),
      })
    );

    const url = await fetchArtworkImage('未知の作品', '');
    expect(url).toBeNull();
  });

  it('returns null when the response is not the expected shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ somethingElse: 1 }),
      })
    );

    const url = await fetchArtworkImage('タイトル', '作家');
    expect(url).toBeNull();
  });

  it('returns null when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down'))
    );

    const url = await fetchArtworkImage('タイトル', '');
    expect(url).toBeNull();
  });

  it('returns null for an empty title without calling the API', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const url = await fetchArtworkImage('   ', '');
    expect(url).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts the title and artist to the artwork-image endpoint', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      json: async () => ({ url: 'https://example.com/x.jpg' }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    await fetchArtworkImage('ひまわり', 'フィンセント・ファン・ゴッホ');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe('/api/artwork-image');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.title).toBe('ひまわり');
    expect(body.artist).toBe('フィンセント・ファン・ゴッホ');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveArtworkImage } from './artworkImage';

const cottage = "File:Vincent van Gogh - A Weaver's Cottage - Google Art Project.jpg";
const weaver = 'File:Vincent van Gogh - Weaver - Google Art Project.jpg';

function mockCommons(files: string[], categories = ['Category:Google Art Project paintings']) {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.hostname === 'commons.wikimedia.org') {
      const pages = Object.fromEntries(files.map((title, index) => [index, {
        title,
        categories: categories.map(title => ({ title })),
      }]));
      return Response.json({ query: { pages } });
    }
    return Response.json({ search: [], entities: {} });
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe('Commons artwork title matching', () => {
  it('resolves The Weavers to Weaver, preferring the work over a cottage with a related name', async () => {
    mockCommons([cottage, weaver]);
    const image = await resolveArtworkImage({ title: 'The Weavers', artist: 'Vincent van Gogh' });
    expect(image?.url).toContain(encodeURIComponent(weaver.replace('File:', '')));
  });

  it('keeps singular title matching', async () => {
    mockCommons([weaver]);
    expect(await resolveArtworkImage({ title: 'Weaver', artist: 'Vincent van Gogh' })).not.toBeNull();
  });

  it('does not accept another painting just because the artist matches', async () => {
    mockCommons(['File:Vincent van Gogh - The Starry Night.jpg']);
    expect(await resolveArtworkImage({ title: 'The Weavers', artist: 'Vincent van Gogh' })).toBeNull();
  });

  it('still rejects photographs depicting the work', async () => {
    mockCommons([weaver], ['Category:Photographs of paintings']);
    expect(await resolveArtworkImage({ title: 'The Weavers', artist: 'Vincent van Gogh' })).toBeNull();
  });

  it('rejects geograph and non-artwork P18 files returned by Wikidata', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.hostname === 'www.wikidata.org') {
        const action = url.searchParams.get('action');
        if (action === 'wbsearchentities') {
          return Response.json({
            search: [{ id: 'Q1766454' }, { id: 'Q123856106' }],
          });
        }
        if (action === 'wbgetentities') {
          const ids = url.searchParams.get('ids') ?? '';
          if (ids.includes('Q1766454')) {
            return Response.json({
              entities: {
                Q1766454: {
                  claims: {
                    P18: [{ mainsnak: { datavalue: { value: 'The Thimes - geograph.org.uk - 2011287.jpg' } } }],
                    P170: [{ mainsnak: { datavalue: { value: { id: 'Q44007' } } } }],
                  },
                },
                Q123856106: {
                  claims: {
                    P18: [{ mainsnak: { datavalue: { value: 'Gustave Caillebotte-Floor-scrapers (1876).jpg' } } }],
                    P170: [{ mainsnak: { datavalue: { value: { id: 'Q44007' } } } }],
                  },
                },
              },
            });
          }
          return Response.json({
            entities: {
              Q44007: {
                labels: {
                  en: { value: 'Gustave Caillebotte' },
                  ja: { value: 'ギュスターヴ・カイユボット' },
                },
              },
            },
          });
        }
      }
      return Response.json({ query: { pages: {} } });
    }));

    const image = await resolveArtworkImage({ title: '床削り', artist: 'ギュスターヴ・カイユボット' });
    expect(image?.source).toBe('wikidata');
    expect(image?.url).toContain(encodeURIComponent('Gustave Caillebotte-Floor-scrapers (1876).jpg'));
    expect(image?.url).not.toContain('geograph.org.uk');
  });
});

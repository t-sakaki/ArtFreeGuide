import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkArtworkImage,
  extractArtworkMentions,
  extractKnownArtists,
  formatDraftReport,
  loadCatalog,
  matchCatalog,
  parseBijutsuTecho,
  parseCandidateList,
  parseNact,
  parseNmwaCurrent,
  parseTobikan,
} from './artScout.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

describe('artScout HTML parsers', () => {
  it('parses NMWA special exhibition cards including title, term, and detail link', () => {
    const html = `
      <div class="nmwa-exhibition-special-body">
        <p class="nmwa-ui-card-title nmwa-exhibition-special-title">テート美術館　ターナー展&#8212;崇高の絵画</p>
        <p class="nmwa-ui-card-term nmwa-exhibition-special-term">2026年10月24日[土]－2027年2月21日[日]</p>
        <a class="nmwa-ui-button nmwa-exhibition-special-detail" href="/jp/exhibitions/2026turner.html">詳細へ</a>
      </div>
      <a href="/jp/exhibitions/2026theater.html">開催中 小企画展 劇場をめぐるイメージ</a>
    `;
    const items = parseNmwaCurrent(html, 'https://www.nmwa.go.jp/jp/exhibitions/current.html');
    expect(items).toEqual([
      {
        source: 'nmwa',
        title: 'テート美術館 ターナー展—崇高の絵画',
        period: '2026年10月24日[土]－2027年2月21日[日]',
        url: 'https://www.nmwa.go.jp/jp/exhibitions/2026turner.html',
      },
      {
        source: 'nmwa',
        title: '開催中 小企画展 劇場をめぐるイメージ',
        period: '',
        url: 'https://www.nmwa.go.jp/jp/exhibitions/2026theater.html',
      },
    ]);
  });

  it('parses Tobikan, NACT, and Bijutsu Techo exhibition/news links', () => {
    const tobikan = parseTobikan('<a href="2026_orsay.html">特別展 オルセー美術館所蔵 いまを生きる歓び</a>');
    expect(tobikan[0]?.url).toBe('https://www.tobikan.jp/exhibition/2026_orsay.html');

    const nact = parseNact('<a href="../exhibition_special/2026/louvre2026/">企画展 ルーヴル美術館展 ルネサンス</a>');
    expect(nact[0]?.url).toBe('https://www.nact.jp/exhibition_special/2026/louvre2026/');

    const bt = parseBijutsuTecho('<a href="/magazine/news/headline/33331">北斎《神奈川沖浪裏》と《見返り美人図》</a>');
    expect(bt[0]?.url).toBe('https://bijutsutecho.com/magazine/news/headline/33331');
  });
});

describe('artScout catalog cross-checking', () => {
  it('extracts quoted artwork titles and filters UI noise', () => {
    const mentions = extractArtworkMentions(
      '今回は《床削り》や《星月夜（ローヌ川）》、《PDF》そして《床削り》を紹介します。'
    );
    expect(mentions).toEqual(['床削り', '星月夜（ローヌ川）']);
  });

  it('loads real names.data.json + playlists.ts and resolves aliases and existing tours', () => {
    const catalog = loadCatalog(REPO_ROOT);
    expect(catalog.artworks.length).toBeGreaterThan(20);
    expect(catalog.tours.some(t => t.id === 'orsay-joy-of-living')).toBe(true);

    const montorgueilAlias = matchCatalog('モントルグイユ通り', 'クロード・モネ', catalog);
    expect(montorgueilAlias.viaAlias).toBe('パリ、モントルグイユ通り、1878年6月30日の祝祭');
    expect(montorgueilAlias.canonicalTitle).toBe('パリ、モントルグイユ通り、1878年6月30日の祝祭');
    expect(montorgueilAlias.inArtworks).toBe(true);
    expect(montorgueilAlias.inArtists).toBe(true);
    expect(montorgueilAlias.inTours).toContain('orsay-joy-of-living');

    const unknownTurner = matchCatalog('戦艦テメレール', 'J.M.W. ターナー', catalog);
    expect(unknownTurner.inArtworks).toBe(false);
    expect(unknownTurner.inTours).toEqual([]);
  });

  it('detects known artists in Japanese text', () => {
    const catalog = loadCatalog(REPO_ROOT);
    const artists = extractKnownArtists('モネやカイユボット、そしてゴッホの名画が並ぶ。', catalog);
    expect(artists).toContain('クロード・モネ');
    expect(artists).toContain('ギュスターヴ・カイユボット');
    expect(artists).toContain('フィンセント・ファン・ゴッホ');
  });
});

describe('artScout image check & report formatting', () => {
  it('rejects geograph.org.uk Wikidata P18 files and selects the valid artwork file', async () => {
    const catalog = loadCatalog(REPO_ROOT);
    const mockFetch = async input => {
      const url = new URL(input);
      if (url.hostname === 'www.wikidata.org') {
        const action = url.searchParams.get('action');
        if (action === 'wbsearchentities') {
          return Response.json({ search: [{ id: 'Q1766454' }, { id: 'Q123856106' }] });
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
              Q44007: { labels: { en: { value: 'Gustave Caillebotte' }, ja: { value: 'ギュスターヴ・カイユボット' } } },
            },
          });
        }
      }
      return Response.json({});
    };

    const result = await checkArtworkImage(
      { title: '床削り', artist: 'ギュスターヴ・カイユボット' },
      catalog,
      { fetchImpl: mockFetch }
    );
    expect(result.status).toBe('ok');
    expect(result.source).toBe('wikidata');
    expect(result.fileName).toBe('Gustave Caillebotte-Floor-scrapers (1876).jpg');
    expect(result.warnings.some(w => w.includes('geograph.org.uk'))).toBe(true);
  });

  it('parses candidate lists without splitting English titles containing commas', () => {
    expect(
      parseCandidateList(
        'ノラム城、日の出/J.M.W. ターナー/Norham Castle, Sunrise,奴隷船/J.M.W. ターナー'
      )
    ).toEqual([
      {
        title: 'ノラム城、日の出',
        artist: 'J.M.W. ターナー',
        enTitle: 'Norham Castle, Sunrise',
      },
      { title: '奴隷船', artist: 'J.M.W. ターナー' },
    ]);
  });

  it('formats Markdown draft report with warm_cache command', () => {
    const md = formatDraftReport({
      generatedAt: '2026-11-18',
      sources: [
        {
          id: 'nmwa',
          label: '国立西洋美術館 (NMWA)',
          items: [{ title: 'ターナー展', period: '2026-10-24〜', url: 'https://www.nmwa.go.jp/jp/exhibitions/2026turner.html' }],
        },
      ],
      inspectedPages: [],
      candidates: [
        {
          inputTitle: '戦艦テメレール',
          canonicalTitle: '戦艦テメレール',
          canonicalArtist: 'J.M.W. ターナー',
          inArtworks: false,
          inArtists: false,
          viaAlias: null,
          inTours: [],
          status: 'ok',
          source: 'wikidata',
          fileName: 'The_Fighting_Temeraire.jpg',
          url: 'https://commons.wikimedia.org/wiki/Special:FilePath/The_Fighting_Temeraire.jpg?width=900',
          warnings: ['names.data.json(artworks) 未登録'],
        },
      ],
    });
    expect(md).toContain('# アート話題・コンテンツ候補レポート (2026-11-18)');
    expect(md).toContain('戦艦テメレール');
    expect(md).toContain('node scripts/warm_cache.mjs');
  });
});

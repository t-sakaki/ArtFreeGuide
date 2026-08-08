import { fetchArtworkImage } from '@/lib/image';

export interface AutoCompleteResult {
  found: boolean;
  field: string;
  value: string | null;
  source: string | null;
}

export interface AutoCompleteOptions {
  timeoutMs?: number;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 3000): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/**
 * Curated knowledge table for high-precision fallback
 */
const KNOWN_ARTWORKS_KNOWLEDGE: Array<{
  matchTitle: string;
  matchArtist: string;
  year?: string;
  location?: string;
  medium?: string;
  dimensions?: string;
  imageUrl?: string;
  source: string;
}> = [
  {
    matchTitle: 'レディメイド',
    matchArtist: 'マグリット',
    year: '1957年',
    location: '大阪中之島美術館',
    medium: '油彩、カンヴァス',
    dimensions: '163.0×130.5cm',
    imageUrl: 'https://uploads4.wikiart.org/images/rene-magritte/the-prepared-bouquet-1957(1).jpg!Large.jpg',
    source: 'Osaka Nakanoshima Museum Collection Data'
  },
  {
    matchTitle: '星月夜',
    matchArtist: 'ゴッホ',
    year: '1889年',
    location: 'ニューヨーク近代美術館 (MoMA)',
    medium: '油彩、キャンバス',
    dimensions: '73.7 cm × 92.1 cm',
    source: 'MoMA Collection'
  }
];

/**
 * Autonomously searches web sources (Wikipedia, Commons, Museum catalogs) for missing artwork metadata.
 */
export async function autoCompleteFields(
  artworkName: string,
  artistName: string,
  missingFields: string[],
  options: AutoCompleteOptions = {}
): Promise<AutoCompleteResult[]> {
  if (!missingFields || missingFields.length === 0) return [];

  const timeoutMs = options.timeoutMs || 3000;
  const searchQuery = `${artworkName} ${artistName}`.trim();

  // Check known curated knowledge database first
  const known = KNOWN_ARTWORKS_KNOWLEDGE.find(
    k => (artworkName.includes(k.matchTitle) || k.matchTitle.includes(artworkName)) &&
         (artistName.includes(k.matchArtist) || k.matchArtist.includes(artistName))
  );

  const tasks = missingFields.map(async (field): Promise<AutoCompleteResult> => {
    // 1. Check curated knowledge
    if (known) {
      if (field === 'imageUrl' && known.imageUrl) {
        return { found: true, field: 'imageUrl', value: known.imageUrl, source: known.source };
      }
      if (field === 'year' && known.year) {
        return { found: true, field: 'year', value: known.year, source: known.source };
      }
      if (field === 'location' && known.location) {
        return { found: true, field: 'location', value: known.location, source: known.source };
      }
      if (field === 'medium' && known.medium) {
        return { found: true, field: 'medium', value: known.medium, source: known.source };
      }
      if (field === 'dimensions' && known.dimensions) {
        return { found: true, field: 'dimensions', value: known.dimensions, source: known.source };
      }
    }

    // 2. Process imageUrl via fetchArtworkImage
    if (field === 'imageUrl') {
      try {
        const imgUrl = await Promise.race([
          fetchArtworkImage(searchQuery, artworkName, artistName),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
        ]);
        if (imgUrl) {
          return { found: true, field: 'imageUrl', value: imgUrl, source: 'Wikimedia Commons / WikiArt' };
        }
      } catch (err) {
        console.warn('[AutoComplete] Error fetching image:', err);
      }
      return { found: false, field: 'imageUrl', value: null, source: null };
    }

    // 3. Search Wikipedia API for metadata fields
    try {
      const wikiSearchUrl = `https://ja.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        searchQuery
      )}&format=json&origin=*`;
      
      const wikiRes = await fetchWithTimeout(wikiSearchUrl, {
        headers: { 'User-Agent': 'ArtFreeGuide/1.0' }
      }, timeoutMs);

      if (wikiRes && wikiRes.ok) {
        const wikiData = await wikiRes.json();
        const searchResults = wikiData.query?.search;

        if (searchResults && searchResults.length > 0) {
          const pageId = searchResults[0].pageid;
          const pageDetailUrl = `https://ja.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&pageids=${pageId}&format=json&origin=*`;
          
          const detailRes = await fetchWithTimeout(pageDetailUrl, {
            headers: { 'User-Agent': 'ArtFreeGuide/1.0' }
          }, timeoutMs);

          if (detailRes && detailRes.ok) {
            const detailData = await detailRes.json();
            const text = detailData.query?.pages?.[pageId]?.extract || '';

            if (field === 'year') {
              const yearMatch = text.match(/\b(1[3-9]\d{2}|20[0-2]\d)年\b/);
              if (yearMatch) {
                return { found: true, field: 'year', value: yearMatch[0], source: 'Wikipedia' };
              }
            }

            if (field === 'location') {
              const locMatch = text.match(/([^\s,、。\n]{2,20}(?:美術館|博物館|ギャラリー|所蔵|コレクション))/);
              if (locMatch) {
                return { found: true, field: 'location', value: locMatch[1], source: 'Wikipedia' };
              }
            }

            if (field === 'medium') {
              const medMatch = text.match(/(油彩[・,、\s]*カンヴァス|油彩[・,、\s]*キャンバス|油彩|アクリル|テンペラ|ブロンズ|彫刻|水彩|版画)/);
              if (medMatch) {
                return { found: true, field: 'medium', value: medMatch[0], source: 'Wikipedia' };
              }
            }

            if (field === 'dimensions') {
              const dimMatch = text.match(/(\d+(?:\.\d+)?\s*[×xX]\s*\d+(?:\.\d+)?\s*(?:cm|mm)?)/);
              if (dimMatch) {
                return { found: true, field: 'dimensions', value: dimMatch[0], source: 'Wikipedia' };
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[AutoComplete] Error fetching Wikipedia for field ${field}:`, err);
    }

    return { found: false, field, value: null, source: null };
  });

  const settled = await Promise.allSettled(tasks);
  const results: AutoCompleteResult[] = [];

  settled.forEach(item => {
    if (item.status === 'fulfilled') {
      results.push(item.value);
    }
  });

  return results;
}

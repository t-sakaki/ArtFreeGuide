import { NextResponse } from 'next/server';
import { searchArtworks } from '@/lib/artworks';
import { getGuideStore } from '@/lib/guideStore';
import { getLLMProvider, Message } from '@/lib/llm';
import { createServiceClient } from '@/lib/supabase';

const LIMIT = 5;
/** Below this many real matches, invented titles are better than a short list. */
const ENOUGH_REAL_MATCHES = 2;

/** Where a suggestion came from, in descending order of trust. */
type Source = 'guide' | 'catalog' | 'ai';

interface Suggestion {
  title: string;
  artist: string;
  source: Source;
}

function addUnique(into: Map<string, Suggestion>, items: Suggestion[]): void {
  for (const item of items) {
    const title = item.title?.trim();
    if (!title) continue;
    const key = title.toLowerCase();
    if (into.has(key)) continue;
    // 「神奈川沖浪裏」は「富嶽三十六景 神奈川沖浪裏」の重複: keep the known row.
    const overlaps = Array.from(into.keys()).some(
      existing => existing.includes(key) || key.includes(existing)
    );
    if (item.source === 'ai' && overlaps) continue;
    into.set(key, { ...item, title });
  }
}

/** Titles an LLM invents ("ひまわりの丘") are only used to top up real matches. */
async function inventedTitles(artworkQuery: string, artistName: string): Promise<Suggestion[]> {
  const scope = artistName.trim()
    ? `アーティスト「${artistName}」の作品の中で、キーワード「${artworkQuery}」に関連する有名な作品`
    : `世界的に有名な美術作品の中で、キーワード「${artworkQuery}」に関連する代表的な作品`;

  const prompt = `${scope}を3〜5件提案してください。
実在する作品名だけを挙げてください。存在しない作品を創作してはいけません。
意味的な関連性も考慮してください（例：「春」というクエリに対して「ノルマンディーの春」を提案するなど）。
必ず、以下のJSON配列の形式のみを返してください。余計なマークダウンのバッククォート、解説、挨拶は一切含めず、純粋なパース可能なJSONオブジェクトとして出力してください。

[
  "正式な作品名1",
  "正式な作品名2",
  "正式な作品名3"
]`;

  const messages: Message[] = [{ role: 'user', content: prompt }];
  const provider = getLLMProvider('suggest');
  const text = await provider.generateResponse(messages, { json: true });

  // Bulletproof JSON parser
  let cleanText = text.trim();
  const firstBrack = cleanText.indexOf('[');
  const lastBrack = cleanText.lastIndexOf(']');
  if (firstBrack !== -1 && lastBrack !== -1 && lastBrack > firstBrack) {
    cleanText = cleanText.substring(firstBrack, lastBrack + 1);
  }

  const parsed = JSON.parse(cleanText);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((title): title is string => typeof title === 'string')
    .map(title => ({ title, artist: artistName.trim(), source: 'ai' as const }));
}

export async function POST(req: Request) {
  try {
    const { artworkQuery, artistName } = await req.json();
    const query = typeof artworkQuery === 'string' ? artworkQuery.trim() : '';
    const artist = typeof artistName === 'string' ? artistName.trim() : '';

    if (!query) {
      return NextResponse.json({ suggestions: [] });
    }

    const suggestions = new Map<string, Suggestion>();

    // 1. Guides we already hold: these start playing with no generation wait.
    try {
      const archived = await getGuideStore().search(query, LIMIT);
      addUnique(
        suggestions,
        archived
          .filter(row => !artist || row.artist.includes(artist) || artist.includes(row.artist))
          .map(row => ({ title: row.title, artist: row.artist, source: 'guide' as const }))
      );
    } catch (error) {
      console.error('Guide archive search failed:', error);
    }

    // 2. The Supabase catalogue: real artworks, guide generated on demand.
    if (suggestions.size < LIMIT) {
      try {
        const rows = await searchArtworks(createServiceClient(), query, LIMIT, artist);
        addUnique(
          suggestions,
          rows.map(row => ({ title: row.title, artist: row.artist ?? '', source: 'catalog' as const }))
        );
      } catch (error) {
        console.error('Catalogue search failed:', error);
      }
    }

    // 3. Only then ask the LLM, to cover artworks we simply do not know yet.
    if (suggestions.size < ENOUGH_REAL_MATCHES) {
      try {
        addUnique(suggestions, await inventedTitles(query, artist));
      } catch (error) {
        console.error('LLM suggestion failed:', error);
      }
    }

    return NextResponse.json({ suggestions: Array.from(suggestions.values()).slice(0, LIMIT) });
  } catch (error) {
    console.error('Suggest API Route Error:', error);
    // Return empty array instead of failing, to make autocomplete fail-safe
    return NextResponse.json({ suggestions: [] });
  }
}

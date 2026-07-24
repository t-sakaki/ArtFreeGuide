import { NextResponse } from 'next/server';
import { getLLMProvider, Message } from '@/lib/llm';

export async function POST(req: Request) {
  try {
    const { artworkQuery, artistName } = await req.json();

    if (!artworkQuery || !artworkQuery.trim()) {
      return NextResponse.json({ suggestions: [] });
    }

    let prompt = '';
    if (artistName && artistName.trim()) {
      prompt = `アーティスト「${artistName}」の作品の中で、キーワード「${artworkQuery}」に関連する有名な作品を3〜5件提案してください。`;
    } else {
      prompt = `世界的に有名な美術作品の中で、キーワード「${artworkQuery}」に関連する代表的な作品を3〜5件提案してください。`;
    }

    prompt += `
意味的な関連性も考慮してください（例：「春」というクエリに対して「ノルマンディーの春」を提案するなど）。
必ず、以下のJSON配列の形式のみを返してください。余計なマークダウンのバッククォート、解説、挨拶は一切含めず、純粋なパース可能なJSONオブジェクトとして出力してください。

[
  "正式な作品名1",
  "正式な作品名2",
  "正式な作品名3"
]`;

    const messages: Message[] = [
      {
        role: 'user',
        content: prompt
      }
    ];

    const provider = await getLLMProvider();
    const text = await provider.generateResponse(messages, { json: true });

    // Bulletproof JSON parser
    let cleanText = text.trim();
    const firstBrack = cleanText.indexOf('[');
    const lastBrack = cleanText.lastIndexOf(']');
    if (firstBrack !== -1 && lastBrack !== -1 && lastBrack > firstBrack) {
      cleanText = cleanText.substring(firstBrack, lastBrack + 1);
    }

    const suggestions = JSON.parse(cleanText);
    if (Array.isArray(suggestions)) {
      return NextResponse.json({ suggestions });
    }

    return NextResponse.json({ suggestions: [] });
  } catch (error: any) {
    console.error('Suggest API Route Error:', error);
    // Return empty array instead of failing, to make autocomplete fail-safe
    return NextResponse.json({ suggestions: [] });
  }
}

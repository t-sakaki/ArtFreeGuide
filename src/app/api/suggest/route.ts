import { NextResponse } from 'next/server';
import { getLLMProvider, Message } from '@/lib/llm';

export async function POST(req: Request) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch (reqErr) {
      console.warn('[suggest/route.ts] Request body JSON parse failed:', reqErr);
      return NextResponse.json({ suggestions: [] });
    }

    const { artworkQuery, artistName, mode, segments } = body;

    // === Mode: improve (解説改善サジェスト生成) ===
    if (mode === 'improve' && segments) {
      const prompt = `以下の美術解説テキストを分析し、改善点や追加で深掘りできる質問・提案を最大3つ作成してください。

【分析対象テキスト】
${segments.slice(0, 2000)}

【検出・提案する項目】
1. フォーマット崩れ（\\n 改行記号が文字として直に出てしまっている、**太字などのマークダウン崩れ）
2. 文の切れや不自然な表現
3. 解説の深掘り・補足の質問案（例: 時代背景、技法の詳細、作者の意図、関連作品との比較など）

【注意事項】
テキストに明確な表記エラーがない場合でも、鑑賞をより深めるための質問や探求テーマ（icon: 💡, 📜, ❓）を必ず1〜3件提案してください。

【出力形式】
JSONオブジェクトのみ返してください。余分なマークダウンバッククォート、解説、挨拶は一切含めない。

{
  "suggestions": [
    {
      "type": "fix_format" | "content_gap" | "unclear" | "other",
      "icon": "🔧" | "📜" | "❓" | "💡",
      "message": "提案や質問を日本語で簡潔に1文で（例: この作品が描かれた時代背景について詳しく知りたい）",
      "action": "fix_format" | "expand_content" | "rephrase"
    }
  ]
}`;

      const messages: Message[] = [{ role: 'user', content: prompt }];
      console.log('[suggest/route.ts] Getting LLM provider...');
      const provider = await getLLMProvider();
      console.log('[suggest/route.ts] Provider retrieved, calling generateResponse...');
      const text = await provider.generateResponse(messages, { json: true });
      console.log('[suggest/route.ts] LLM Response text:', text);

      console.log('[suggest/route.ts] LLM raw output for improve mode:', text);

      let cleanText = text.trim();
      cleanText = cleanText.replace(/```json/gi, '').replace(/```/g, '').trim();

      let suggestions: any[] = [];
      try {
        const parsed = JSON.parse(cleanText);
        if (Array.isArray(parsed)) {
          suggestions = parsed;
        } else if (parsed && Array.isArray(parsed.suggestions)) {
          suggestions = parsed.suggestions;
        }
      } catch (_) {
        const firstBrace = cleanText.indexOf('{');
        const lastBrace = cleanText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          try {
            const obj = JSON.parse(cleanText.substring(firstBrace, lastBrace + 1));
            if (obj && Array.isArray(obj.suggestions)) {
              suggestions = obj.suggestions;
            }
          } catch (e) {}
        }

        if (suggestions.length === 0) {
          const firstBrack = cleanText.indexOf('[');
          const lastBrack = cleanText.lastIndexOf(']');
          if (firstBrack !== -1 && lastBrack > firstBrack) {
            try {
              const arr = JSON.parse(cleanText.substring(firstBrack, lastBrack + 1));
              if (Array.isArray(arr)) {
                suggestions = arr;
              }
            } catch (e) {}
          }
        }
      }

      if (Array.isArray(suggestions)) {
        return NextResponse.json({ suggestions: suggestions.slice(0, 3) });
      }
      return NextResponse.json({ suggestions: [] });
    }

    // === Default: アートワーク検索サジェスト ===

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

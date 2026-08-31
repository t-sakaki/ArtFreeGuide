import { NextResponse } from 'next/server';
import { getLLMProvider } from '@/lib/llm';
import { DEFAULT_LOCALE, Locale, isLocale } from '@/lib/i18n';

export async function POST(req: Request) {
  try {
    const { title, artist, guideText, locale: rawLocale } = await req.json();
    const locale: Locale =
      typeof rawLocale === 'string' && isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

    if (!guideText || typeof guideText !== 'string' || !guideText.trim()) {
      return NextResponse.json({ questions: [] });
    }

    const scope = artist?.trim()
      ? `美術作品「${title}」（${artist}）`
      : `美術作品「${title}」`;

    const prompt = `${scope}の解説を読んだ鑑賞者から、さらに深く知りたくなるような質問を3〜5個生成してください。

【条件】
- 解説の内容に基づいた、具体的で深い質問にしてください
- 「どこで見られますか」「どんな技法ですか」といった表面的な質問は避けてください
- 作品の背景、作者の意図、時代の文脈、隠された意味、 Comparative analysis に焦点を当ててください
- 短く1行で完結する質問にしてください

【解説テキスト】
${guideText.trim().slice(0, 4000)}

出力は必ず以下のJSON配列形式のみを返してください。余計なマークダウン、解説、挨拶は含めないでください。

["質問1", "質問2", "質問3"]`;

    const provider = getLLMProvider('ask');
    const text = await provider.generateResponse(
      [{ role: 'user', content: prompt }],
      { json: true }
    );

    // Bulletproof JSON parser
    let cleanText = text.trim();
    const firstBrack = cleanText.indexOf('[');
    const lastBrack = cleanText.lastIndexOf(']');
    if (firstBrack !== -1 && lastBrack !== -1 && lastBrack > firstBrack) {
      cleanText = cleanText.substring(firstBrack, lastBrack + 1);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleanText);
    } catch {
      return NextResponse.json({ questions: [] });
    }

    if (!Array.isArray(parsed)) return NextResponse.json({ questions: [] });

    const questions = parsed
      .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
      .slice(0, 5);

    return NextResponse.json({ questions });
  } catch (error) {
    console.error('Questions API Route Error:', error);
    return NextResponse.json({ questions: [] });
  }
}

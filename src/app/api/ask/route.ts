import { NextResponse } from 'next/server';
import { DEFAULT_LOCALE, Locale, OUTPUT_LANGUAGE_INSTRUCTION, isLocale } from '@/lib/i18n';
import { getLLMProvider, Message } from '@/lib/llm';

export async function POST(req: Request) {
  try {
    const { title, artist, question, context, locale: rawLocale } = await req.json();
    const locale: Locale =
      typeof rawLocale === 'string' && isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

    if (typeof question !== 'string' || !question.trim()) {
      return NextResponse.json({ error: '質問が空です' }, { status: 400 });
    }
    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: '作品が指定されていません' }, { status: 400 });
    }

    // The answer is spoken aloud straight after the guide, so it must sound like
    // the same curator: plain prose, no markdown, no JSON wrapper.
    const excerpt = typeof context === 'string' ? context.slice(0, 1200) : '';
    const prompt = `あなたは美術館の音声ガイドを務めるキュレーターです。
鑑賞者から作品「${title}」${artist ? `（${artist}）` : ''}について質問を受けました。

質問: ${question.trim()}
${excerpt ? `\nこれまでの解説（参考）:\n${excerpt}\n` : ''}
【回答の条件】
- 丁寧語の話し言葉で、3〜5文程度にまとめてください。
- 見出し・箇条書き・マークダウン記号・絵文字は使わないでください。
- 確実でないことは断定せず、「〜と考えられています」のように述べてください。
- 質問が作品と無関係な場合は、作品鑑賞に話を戻してください。
- 説明文そのものだけを出力してください。前置きや後書きは不要です。
- ${OUTPUT_LANGUAGE_INSTRUCTION[locale]}`;

    const messages: Message[] = [{ role: 'user', content: prompt }];
    const provider = getLLMProvider('ask');
    const answer = await provider.generateResponse(messages);

    return NextResponse.json({ answer: answer.trim() });
  } catch (error: any) {
    console.error('Ask API Route Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

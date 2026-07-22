import { NextRequest, NextResponse } from 'next/server';
import { validateSignature } from '@line/bot-sdk';
import { lineConfig, replyTextMessage, replyMultipleMessages } from '@/lib/line';
import { getLLMProvider, Message } from '@/lib/llm';

// LINE用システムプロンプト: LINEの吹き出し形式に最適化
const LINE_SYSTEM_PROMPT = `あなたは美術館の情熱的な音声ガイド・キュレーターです。
LINEユーザーに対し、入力された美術作品について、親しみやすく、かつ知的なトーンで解説を提供してください。

【LINE向け構成ルール】
1. 簡潔さとインパクトを重視し、1つのメッセージを長くしすぎないこと。
2. 絵文字を適度に使用し、チャットらしい親しみやすさを出すこと。
3. 以下の構成で回答を生成してください：
   - [概要]: 作品名、作者、そして一言で表すこの作品の「正体」
   - [見どころ]: 視覚的にどこに注目すべきか、情熱的に解説
   - [背景]: 作者の想いや、知られざる物語を短く凝縮
   - [結び]: ユーザーの心に響く、深い鑑賞への誘い

【出力フォーマット】
- JSONではなく、そのまま送信可能な「美しい日本語のテキスト」として出力してください。
- 重要なキーワードは **太字** で強調してください。
`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const signature = req.headers.get('x-line-signature') || '';

    // 1. 署名検証 (セキュリティ)
    if (!validateSignature(body, signature, lineConfig.channelSecret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const events = body.events;
    if (!events || events.length === 0) {
      return NextResponse.json({ message: 'No events' });
    }

    // イベントを並列処理
    await Promise.all(events.map(async (event: any) => {
      if (event.type !== 'message' || event.message.type !== 'text') return;

      const replyToken = event.replyToken;
      const userMessage = event.message.text;

      try {
        // 2. AIによる回答生成
        const provider = getLLMProvider();
        const messages: Message[] = [
          { role: 'user', content: `${LINE_SYSTEM_PROMPT}\n\n対象の美術作品：\n${userMessage}` }
        ];
        
        const aiResponse = await provider.generateResponse(messages, { json: false });

        // 3. LINEへ返信
        await replyTextMessage(replyToken, aiResponse);
      } catch (aiError) {
        console.error('AI Response Error:', aiError);
        await replyTextMessage(replyToken, 'すみません、うまく解説を生成できませんでした。もう一度作品名を教えていただけますか？🎨');
      }
    }));

    return NextResponse.json({ message: 'OK' });
  } catch (error: any) {
    console.error('LINE Webhook Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

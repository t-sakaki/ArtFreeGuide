import { NextRequest, NextResponse } from 'next/server';
import {
  lineConfig,
  verifyLineSignature,
  replyTextMessage,
  replyMultipleMessages,
  createAudioGuideFlex,
} from '@/lib/line';
import { getLLMProvider, Message } from '@/lib/llm';
import { fetchArtworkImage } from '@/lib/artworkThumbnail';
import { verifyMp3Buffer } from '@/lib/audioVerify';

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
    // 1. Get raw text body for Web Crypto signature verification
    const rawBody = await req.text();
    const signature = req.headers.get('x-line-signature') || '';

    if (!signature) {
      console.error('[LINE Webhook] Missing x-line-signature header');
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }

    // 2. Signature verification using Web Crypto API
    const isValid = await verifyLineSignature(rawBody, signature, lineConfig.channelSecret);
    if (!isValid) {
      console.error('[LINE Webhook] Invalid LINE signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // 3. Parse JSON payload
    const body = JSON.parse(rawBody);
    const events = body.events;
    if (!events || events.length === 0) {
      return NextResponse.json({ message: 'No events' });
    }

    // 4. Process incoming webhook events
    await Promise.all(
      events.map(async (event: any) => {
        if (event.type !== 'message' || event.message.type !== 'text') return;

        const replyToken = event.replyToken;
        const userMessage = event.message.text?.trim();
        if (!userMessage) return;

        try {
          // Parallel execution: LLM response + Artwork Image Search
          const [aiResponse, imageUrl] = await Promise.all([
            (async () => {
              const provider = getLLMProvider();
              const messages: Message[] = [
                {
                  role: 'user',
                  content: `${LINE_SYSTEM_PROMPT}\n\n対象の美術作品：\n${userMessage}`,
                },
              ];
              return await provider.generateResponse(messages, { json: false });
            })(),
            fetchArtworkImage(userMessage, '').catch(() => null),
          ]);

          const messagesToReply: any[] = [];

          // Add image message if found
          if (imageUrl) {
            messagesToReply.push({
              type: 'image',
              originalContentUrl: imageUrl,
              previewImageUrl: imageUrl,
            });
          }

          // Add AI Curator explanation text
          messagesToReply.push({
            type: 'text',
            text: aiResponse,
          });

          // Safe Audio Generation & Pre-flight Quality Verification
          const audioUrl = `${lineConfig.appBaseUrl}/api/tts?text=${encodeURIComponent(userMessage.slice(0, 100))}`;
          let isAudioSafe = false;
          let durationMs = 5000;

          try {
            // Pre-flight check: Verify audio endpoint response quality before sending audio message to LINE
            const ttsVerifyRes = await fetch(audioUrl, { method: 'GET' });
            if (ttsVerifyRes.ok) {
              const audioBuf = await ttsVerifyRes.arrayBuffer();
              const verification = verifyMp3Buffer(audioBuf);
              if (verification.valid && verification.format === 'mp3') {
                isAudioSafe = true;
                durationMs = verification.durationMs || 5000;
              } else {
                console.warn('[LINE Webhook] Audio verification failed:', verification.error);
              }
            }
          } catch (audioCheckErr) {
            console.warn('[LINE Webhook] Audio pre-flight check failed, falling back to text:', audioCheckErr);
          }

          // SAFE RESTORATION: Only attach LINE audio message if audio quality verification succeeds
          if (isAudioSafe) {
            messagesToReply.push({
              type: 'audio',
              originalContentUrl: audioUrl,
              duration: Math.max(1000, durationMs),
            });
          } else {
            console.log('[LINE Webhook] Audio verification unconfirmed. Gracefully falling back to Text + Flex link.');
          }

          // Add Web App Audio Guide Flex Message
          messagesToReply.push(createAudioGuideFlex(userMessage));

          // Reply to LINE Messaging API
          await replyMultipleMessages(replyToken, messagesToReply);
        } catch (aiError) {
          console.error('[LINE Webhook] Response generation error:', aiError);
          await replyTextMessage(
            replyToken,
            'すみません、うまく解説を生成できませんでした。もう一度作品名を教えていただけますか？🎨'
          );
        }
      })
    );

    return NextResponse.json({ message: 'OK' });
  } catch (error: any) {
    console.error('[LINE Webhook] Critical Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}

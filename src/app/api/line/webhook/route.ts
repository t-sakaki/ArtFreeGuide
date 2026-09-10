import { NextRequest, NextResponse } from 'next/server';
import {
  lineConfig,
  verifyLineSignature,
  replyTextMessage,
  replyMultipleMessages,
  createAudioGuideFlex,
} from '@/lib/line';
import { getLLMProvider, Message } from '@/lib/llm';
import { resolveArtworkImage } from '@/lib/artworkImage';
import { verifyMp3Buffer } from '@/lib/audioVerify';

const LINE_SYSTEM_PROMPT = `あなたは美術館の情熱的な音声ガイド・キュレーターです。
LINEユーザーに対し、入力された美術作品について、親しみやすく、かつ知的なトーンで解説を提供してください。

【重要：LINE専用フォーマットルール】
1. マークダウン記法を【完全禁止】します。特に **（太字）などの記号は絶対に使用しないでください。
2. LINEの画面で読みやすいよう、以下の視覚的な構造を用いてください。
   - 項目の見出しには 【 】（隅付き括弧）を使用してください。
   - 箇条書きや強調したい点には ■ や ・ などの記号を使用してください。
   - 適宜、空行を挿入して、スマホ画面での可読性を高めてください。
3. 絵文字を効果的に使い、チャットらしい親しみやすさと情熱を表現してください。

【回答の構成フロー】
以下の順序で構成してください：
- [導入]: ユーザーへの温かい歓迎と、作品への期待感を煽る一文。
- 【概要】: 作品名、作者、そしてこの作品を象徴するキャッチコピー。
- 【見どころ】: 視覚的にどこに注目すべきか。情熱的に、具体的に解説。
- 【背景】: 作者の想いや、知られざる物語を短く凝縮して伝える。
- [結び]: ユーザーの心に響く、深い鑑賞への誘い。

【トーン＆マナー】
- 科学的な根拠に基づきつつ、心に突き刺さるエモーショナルな表現を用いる。
- 「AIが生成した文章」ではなく、「情熱的な人間が書いたメッセージ」に見えるように。
`;

export async function POST(req: NextRequest) {
  try {
    // 1. Raw body for Web Crypto signature verification
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
            resolveArtworkImage({ title: userMessage, artist: '' }).catch(() => null),
          ]);

          const messagesToReply: any[] = [];

          // Add image message if found
          if (imageUrl) {
            messagesToReply.push({
              type: 'image',
              originalContentUrl: imageUrl.url,
              previewImageUrl: imageUrl.url,
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

          // Only attach LINE audio message if audio quality verification succeeds
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

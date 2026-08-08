import { NextResponse } from 'next/server';
import { getLLMProvider, Message } from '@/lib/llm';
import { findArtwork, saveArtwork, getArtworkImages } from '@/lib/db';
import { fetchArtworkImage } from '@/lib/image';

const CURATOR_SYSTEM_PROMPT = `あなたは美術館の情熱的で知識豊富な音声ガイド・キュレーターです。
ユーザーから入力された美術作品（およびその作者）に対して、親しみやすくかつ知的なトーンで、以下の要件を満たす素晴らしい音声ガイドを提供してください。

【ガイドの構成案】
1. **作品への歓迎と導入**: 作品を目の前にした時のような臨場感のある語りかけから始めます。（例：「こんにちは。今、私たちの目の前にあるのは…」）
2. **基本情報**: 作品名、作者、制作年代、使用された技法や素材など。
3. **視覚的な解説（描写）**: 何が描かれているのか、色彩の使い方、光と影のコントラスト、構図など、ユーザーが作品を見る際の視覚的ポイントを案内します。
4. **画家の想いや背景**: 画家がこの作品を制作した時の状況、心情、歴史的背景、芸術的意図など。
5. **鑑賞のヒント**: 最後に「この部分を少し近くで見てみてください…」や「この絵の前に立ち、少し目を閉じて感じてみてください…」といった、深い鑑賞体験へ誘う言葉で締めくくります。

【トーン＆マナー】
- 丁寧語（「です」「ます」調）で、穏やかでありながら美術への情熱が伝わる語り口にします。
- 音声ガイドとして耳で聞いて心地よい、リズム感のある平易で美しい日本語を使用してください。
- 専門用語を使う場合は、必ず簡単な補足説明を添えてください。

【出力フォーマットの厳格化】
必ず指定のJSON構造のみを返してください。会話形式の挨拶、マークダウン記法、余計な前文・後文は一切含めず、純粋なJSONオブジェクト単体としてパース可能なテキストのみを出力してください。

【出力スキーマ】
{
  "short": "（作品名、作者、制作年などの基本情報を交えた、100〜150文字程度の極めて簡潔な概要解説テキスト。マークダウン記号は含めないでください）",
  "standard": "（作品の魅力や構図、色彩、画家の想いを美しく解説した、中程度の長さの標準的な解説テキスト。見出しや太字を交えてマークダウンで装飾してください）",
  "deep": "（技法、歴史的背景、知られざるエピソードや詳細な裏話を交えた、長文の詳細な解説テキスト。見出しや太字を交えてマークダウンで装飾してください）",
  "searchQuery": "（Wikimedia Commonsでこの作品の画像を検索するための英語のキーワード。例：'Vincent van Gogh Sunflowers'、'Mona Lisa'）",
  "recommendations": [
    {
      "title": "（関連する作品名。3〜5件）",
      "artist": "（その関連作品の作者名）",
      "reason": "（この作品との関連性や推薦理由を一言で解説）"
    }
  ]
}
`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages, message, artworkId, artworkTitle, artistName, history } = body;

    // Phase 1 Chat API: 新形式 (handleMainAction から呼ばれる)
    if (message !== undefined) {
      const chatHistory = history || [];

      // Check if this is an improvement suggestion (starts with 💡🔧📜❓💬)
      const improvementIcons = ['💡', '🔧', '📜', '❓', '💬'];
      const isImprovement = improvementIcons.some(icon => message.startsWith(icon));

      const systemHint = isImprovement
        ? `\n【重要な指示】このメッセージは解説の改善 요청입니다。\n- まず謝罪や共感を示す\n- 該当する解説問題を修正した新しいテキストを提示\n- 修正内容を簡潔説明\n- 返答は自然な会話文で（JSON不要）`
        : '';

      const chatMessages: Message[] = [
        ...chatHistory.map((m: { role: string; content: string }) => ({
          role: m.role as 'user' | 'model',
          content: m.content
        })),
        { role: 'user' as const, content: message + systemHint }
      ];

      const provider = await getLLMProvider();
      const text = await provider.generateResponse(chatMessages, { json: false });

      // 返答から reply フィールドを抽出を試みる
      let reply = text.trim();
      try {
        const parsed = JSON.parse(reply);
        reply = parsed.reply || parsed.text || parsed.content || reply;
      } catch (_) {}

      return NextResponse.json({ reply });
    }

    // 既存形式: messages 配列
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages are required' }, { status: 400 });
    }

    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const inputContent = lastUserMsg ? lastUserMsg.content : '';

    // Check DB first if input looks like an artwork request
    if (inputContent) {
      const existing = await findArtwork(inputContent);
      if (existing) {
        console.log(`[/api/chat] DB Hit for query: "${inputContent}"`);
        let recs = [];
        if (existing.recommendations) {
          try { recs = JSON.parse(existing.recommendations); } catch (_) {}
        }
        const cachedPayload = {
          id: existing.id,
          title: existing.title,
          artist: existing.artist,
          short: existing.guide_short,
          standard: existing.guide_standard,
          deep: existing.guide_deep,
          searchQuery: existing.search_query,
          recommendations: recs,
          from_cache: true
        };

        return NextResponse.json({ text: JSON.stringify(cachedPayload) });
      }
    }

    // Modify the first user message to prepend the curator system prompt
    const modifiedMessages: Message[] = messages.map((msg, index) => {
      const isFirstUserMessage = index === 0 || (index > 0 && !messages.slice(0, index).some(m => m.role === 'user'));
      if (isFirstUserMessage && msg.role === 'user') {
        return {
          role: 'user',
          content: `${CURATOR_SYSTEM_PROMPT}\n\n対象の美術作品情報：\n${msg.content}`
        };
      }
      return {
        role: msg.role === 'user' ? 'user' : 'model',
        content: msg.content
      };
    });

    const provider = await getLLMProvider();
    const text = await provider.generateResponse(modifiedMessages, { json: true });

    // Bulletproof JSON block extractor
    let cleanText = text.trim();
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleanText = cleanText.substring(firstBrace, lastBrace + 1);
    }

    // Save to DB asynchronously / in background context if valid JSON
    try {
      const parsed = JSON.parse(cleanText);
      const title = inputContent || 'Unknown Artwork';
      const searchQuery = parsed.searchQuery || title;

      // Fetch primary image asynchronously for storage
      fetchArtworkImage(searchQuery).then(imgUrl => {
        saveArtwork({
          title,
          artist: '',
          guide_short: parsed.short || '',
          guide_standard: parsed.standard || '',
          guide_deep: parsed.deep || '',
          search_query: searchQuery,
          recommendations: parsed.recommendations || [],
          imageUrl: imgUrl
        });
      }).catch(e => console.warn('Background save error:', e));

    } catch (parseErr) {
      console.warn('Could not parse generated text to JSON for DB caching:', parseErr);
    }

    return NextResponse.json({ text: cleanText });
  } catch (error: any) {
    console.error('API Route Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

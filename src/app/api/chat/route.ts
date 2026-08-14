import { NextResponse } from 'next/server';
import { getGuideStore } from '@/lib/guideStore';
import { getLLMProvider, Message } from '@/lib/llm';

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
  "music": {
    "tonic": "（主音。C, C#, D, D#, E, F, F#, G, G#, A, A#, B のいずれか）",
    "scale": "（旋法。ionian（長調）/ aeolian（短調）/ dorian / lydian / phrygian / mixolydian / pentatonic / whole_tone / hirajoshi（平調子・和）/ insen（陰旋法・和）のいずれか。日本美術には和の旋法が合います）",
    "tempoBpm": "（40〜100 の数値。画面の運動量に対応させる。静止した風景は遅く、荒れた海や群像は速く）",
    "texture": "（音色。strings / choir / bell / pluck / glass / breath のいずれか。素材や時代感に合わせる）",
    "brightness": "（0〜1 の数値。画面の明るさ・光の量）",
    "warmth": "（0〜1 の数値。色調の温かさ。暖色や油彩は高く、冷たい色や版画は低く）",
    "density": "（0〜1 の数値。描き込みの密度・情報量）",
    "tension": "（0〜1 の数値。主題の緊張度。穏やかな静物は低く、戦争や審判は高く）",
    "space": "（0〜1 の数値。描かれた空間の広がりと残響。大聖堂や大海原は高く、室内の肖像は低く）"
  },
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
    const { messages, title, artist } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages are required' }, { status: 400 });
    }

    // Only first-turn requests name an artwork; follow-up turns are not cacheable.
    const store = typeof title === 'string' && title.trim() ? getGuideStore() : null;
    const artistName = typeof artist === 'string' ? artist : '';

    if (store) {
      try {
        const cached = await store.get(title, artistName);
        if (cached) {
          return NextResponse.json({ text: cached.payload, cached: true, store: store.name });
        }
      } catch (error) {
        // A cold or misconfigured cache must never block the guide itself.
        console.warn('Guide cache read failed:', error);
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

    const provider = getLLMProvider();
    const text = await provider.generateResponse(modifiedMessages, { json: true });

    // Bulletproof JSON block extractor
    let cleanText = text.trim();
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleanText = cleanText.substring(firstBrace, lastBrace + 1);
    }

    if (store) {
      try {
        await store.put(title, artistName, cleanText);
      } catch (error) {
        console.warn('Guide cache write failed:', error);
      }
    }

    return NextResponse.json({ text: cleanText, cached: false, store: store?.name ?? null });
  } catch (error: any) {
    console.error('API Route Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

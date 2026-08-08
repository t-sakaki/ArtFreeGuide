import { NextResponse } from 'next/server';
import { findArtwork, getArtworkImages, saveArtwork, incrementArtworkViewCount } from '@/lib/db';
import { getLLMProvider, Message } from '@/lib/llm';
import { fetchArtworkImage } from '@/lib/image';
import { detectGaps } from '@/lib/gaps';
import { triggerAutoCompleteAsync } from '@/lib/autoCompleteAsync';
import { GuideResponse, RecommendationItem, ImageItem } from '@/types/knowledgeBase';

const CURATOR_SYSTEM_PROMPT = `あなたは美術館の情熱的で知識豊富な音声ガイド・キュレーターです。
ユーザーから入力された美術作品（およびその作者）に対して、親しみやすくかつ知的なトーンで、以下の要件を満たす素晴らしい音声ガイドを提供してください。

【ガイドの構成案】
1. **作品への歓迎と導入**: 作品を目の前にした時のような臨場感のある語りかけから始めます。（例：「こんにちは。今、私たちの目の前にあるのは…」）
2. **基本情報**: 作品名、作者、制作年代、所蔵場所、使用された技法や素材など。
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
  "location": "（作品が現在展示・所蔵されている美術館や場所。例：'オルセー美術館'、'ルーヴル美術館'）",
  "year": "（作品の制作年・制作年代。例：'1889年'、'1503年〜1519年'）",
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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const work = searchParams.get('work') || searchParams.get('title') || '';
    const artist = searchParams.get('artist') || '';
    const autoFillEnabled = searchParams.get('autoFill') !== 'false';
    const forceRefresh = searchParams.get('forceRefresh') === 'true';

    if (!work && !artist) {
      return NextResponse.json({ error: 'work or artist parameter is required' }, { status: 400 });
    }

    // 1. Fast DB Search
    const existingArtwork = await findArtwork(work, artist);

    if (existingArtwork && !forceRefresh) {
      console.log(`[GuideAPI] Cache HIT for work="${work}" artist="${artist}" (ID: ${existingArtwork.id})`);
      
      incrementArtworkViewCount(existingArtwork.id).catch(err => {
        console.warn('[GuideAPI] Non-blocking view_count increment error:', err);
      });

      const imagesRecords = await getArtworkImages(existingArtwork.id, true);
      const primaryImgUrl = (existingArtwork as any).imageUrl || (imagesRecords.length > 0 ? imagesRecords[0].url : null);
      const currentYear = existingArtwork.year;
      const currentLocation = existingArtwork.location;
      const currentMedium = (existingArtwork as any).medium || null;
      const currentDimensions = (existingArtwork as any).dimensions || null;
      let autoFilledFields: string[] = [];

      if (existingArtwork.autoFilled) {
        try {
          autoFilledFields = typeof existingArtwork.autoFilled === 'string'
            ? JSON.parse(existingArtwork.autoFilled)
            : existingArtwork.autoFilled;
        } catch {}
      }

      // Check for missing gaps
      const gaps = detectGaps({
        title: existingArtwork.title,
        artist: existingArtwork.artist,
        year: currentYear,
        location: currentLocation,
        medium: currentMedium,
        dimensions: currentDimensions,
        imageUrl: primaryImgUrl,
      });

      let pendingCompletion = false;
      // Trigger non-blocking background completion if gaps are detected
      if (gaps.fields.length > 0 && autoFillEnabled) {
        pendingCompletion = true;
        console.log(`[GuideAPI] Non-blocking background completion triggered for artwork ID ${existingArtwork.id}:`, gaps.fields);
        triggerAutoCompleteAsync(existingArtwork.id, existingArtwork.title, existingArtwork.artist, gaps.fields);
      }

      let parsedRecs: RecommendationItem[] = [];
      if (existingArtwork.recommendations) {
        try {
          parsedRecs = JSON.parse(existingArtwork.recommendations);
        } catch (e) {}
      }

      const images: ImageItem[] = imagesRecords.map(img => ({
        id: img.id,
        url: img.url,
        is_primary: Boolean(img.is_primary),
        is_valid: Boolean(img.is_valid)
      }));

      const responseData: GuideResponse = {
        id: existingArtwork.id,
        title: existingArtwork.title,
        artist: existingArtwork.artist,
        location: currentLocation,
        year: currentYear,
        medium: currentMedium,
        dimensions: currentDimensions,
        imageUrl: primaryImgUrl,
        autoFilled: autoFilledFields.length > 0 ? autoFilledFields : undefined,
        updated_by: (existingArtwork as any).updated_by || (autoFilledFields.length > 0 ? 'auto_completion' : undefined),
        pendingCompletion,
        short: existingArtwork.guide_short,
        standard: pendingCompletion
          ? `${existingArtwork.guide_standard}\n\n*※現在作品の詳細情報をバックグラウンドで補完中です。*`
          : existingArtwork.guide_standard,
        deep: existingArtwork.guide_deep,
        searchQuery: existingArtwork.search_query,
        images,
        recommendations: parsedRecs,
        gaps,
        artist_slug: existingArtwork.artist_slug,
        artwork_slug: existingArtwork.artwork_slug,
        view_count: (existingArtwork.view_count || 0) + 1,
        from_cache: true
      };

      return NextResponse.json(responseData);
    }

    // 2. Cache MISS / forceRefresh -> Fast AI Generation
    console.log(`[GuideAPI] Cache MISS/Refresh for work="${work}" artist="${artist}". Generating via LLM...`);
    const promptInput = artist ? `作品名: ${work}\n作者: ${artist}` : `作品名: ${work}`;

    const messages: Message[] = [
      {
        role: 'user',
        content: `${CURATOR_SYSTEM_PROMPT}\n\n対象の美術作品情報：\n${promptInput}`
      }
    ];

    const provider = await getLLMProvider();
    const text = await provider.generateResponse(messages, { json: true });

    let cleanText = text.trim();
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleanText = cleanText.substring(firstBrace, lastBrace + 1);
    }

    const aiData = JSON.parse(cleanText);
    const searchQuery = aiData.searchQuery || `${work} ${artist}`.trim();

    // Fast primary image fetch (2000ms max timeout)
    const fetchedImageUrl = await Promise.race([
      fetchArtworkImage(searchQuery, work, artist),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000))
    ]).catch(() => null);

    const year = aiData.year || null;
    const location = aiData.location || null;
    const medium = aiData.medium || null;
    const dimensions = aiData.dimensions || null;

    // Save to DB
    const saved = await saveArtwork({
      title: work || aiData.title || 'Unknown Artwork',
      artist: artist || aiData.artist || 'Unknown Artist',
      location,
      year,
      guide_short: aiData.short || '',
      guide_standard: aiData.standard || '',
      guide_deep: aiData.deep || '',
      search_query: searchQuery,
      recommendations: aiData.recommendations || [],
      imageUrl: fetchedImageUrl
    });

    const responseImages: ImageItem[] = [];
    if (saved.imageId && fetchedImageUrl) {
      responseImages.push({
        id: saved.imageId,
        url: fetchedImageUrl,
        is_primary: true,
        is_valid: true
      });
    }

    const gaps = detectGaps({
      title: work || aiData.title,
      artist: artist || aiData.artist,
      year,
      location,
      medium,
      dimensions,
      imageUrl: fetchedImageUrl,
    });

    let pendingCompletion = false;
    if (gaps.fields.length > 0 && autoFillEnabled && saved.artworkId) {
      pendingCompletion = true;
      console.log(`[GuideAPI] Non-blocking background completion triggered for new artwork ID ${saved.artworkId}:`, gaps.fields);
      triggerAutoCompleteAsync(saved.artworkId, work || aiData.title, artist || aiData.artist, gaps.fields);
    }

    const responseData: GuideResponse = {
      id: saved.artworkId,
      title: work,
      artist: artist,
      location,
      year,
      medium,
      dimensions,
      imageUrl: fetchedImageUrl,
      pendingCompletion,
      short: aiData.short,
      standard: pendingCompletion
        ? `${aiData.standard}\n\n*※現在作品の詳細情報をバックグラウンドで補完中です。*`
        : aiData.standard,
      deep: aiData.deep,
      searchQuery: searchQuery,
      images: responseImages,
      recommendations: aiData.recommendations || [],
      gaps,
      from_cache: false
    };

    return NextResponse.json(responseData);
  } catch (error: any) {
    console.error('[GuideAPI] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

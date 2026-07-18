import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'edge';

// Fallback models if primary fails
const FALLBACK_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite'
];

export async function POST(req: Request) {
  let artwork = '';
  let artist = '';

  try {
    const body = await req.json();
    artwork = body.artwork || '';
    artist = body.artist || '';

    if (!artwork) {
      return NextResponse.json({ error: 'Artwork name is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not set' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    let lastError: any = null;

    for (const modelName of FALLBACK_MODELS) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          // Cast config to any to bypass strict type checking of SDK version differences
          const model = genAI.getGenerativeModel({
            model: modelName,
            tools: [{ googleSearch: {} }]
          } as any);

          const prompt = `あなたは美術品展示 of 調査スペシャリストです。以下の作品について、現在（2026年7月現在）または2026年中・2027年以降に公表されている展示情報（特別展、常設展での展示）をWeb検索機能を用いて正確に調査してください。

【調査対象作品】
作品名: ${artwork}
作者: ${artist || '不明'}

【調査の手順と要件】
1. **英語検索クエリの併用**:
   日本語での検索だけでなく、必ず英語での検索クエリ（例: "${artist} ${artwork} exhibition current permanent display 2026" など）を作成し、グローバルな美術データベースや所蔵美術館の情報を探索してください。
2. **常設展示の許容**:
   特別展だけでなく、「所蔵美術館での常設展示（常設展）」として一般公開されている情報も、展示あり（exhibitionExists: true）と判定してください。
3. **曖昧な日程の抽出**:
   「具体的な日付（〇月〇日）」が定まっていない場合でも、「常設展示中」「2026年秋開催予定」「展示中」といった曖昧な記述から展示情報を積極的に抽出してください。
4. **根拠の提示**:
   もし展示情報が見つからなかった、または確定的な情報がない場合は、単に「ない」とするのではなく、どの情報源（URLや美術館サイト）を確認し、何が原因で確定できなかったのかを fallbackMessage に記述してください（例: 「クレラー・ミュラー美術館の公式サイトを確認しましたが、本作品は現在修復中、または特別展への貸出準備中のため、常設展示リストに含まれていませんでした」など）。

【出力フォーマット】
必ず以下のJSON構造のみを返してください。他の前書きや後ろ書き、マークダウンの \`\`\`json などのタグは一切含めないでください。

{
  "exhibitionExists": boolean (展示中または展示予定がある場合はtrue、ない場合はfalse),
  "museum": "美術館・博物館名（日本語。例：'クレラー・ミュラー美術館'）",
  "exhibitionName": "展示会名・コレクション名（日本語。例：'常設コレクション展示'）",
  "dates": "会期・展示期間（日本語。例：'常設展示中'、'2026年10月〜12月'。日付が曖昧でも構いません）",
  "location": "開催地（日本語。例：'オランダ・オッテルロー'）",
  "link": "詳細情報の公式リンクURL（美術館や展示会の公式ページ）",
  "searchQueryUsed": "実際にWeb検索に使用したクエリ",
  "sourcesUsed": ["調査で確認・参照した情報源URL of 配列（複数可）"],
  "extractionLogic": "情報を見つけた方法、または判定した根拠の説明（日本語）",
  "fallbackMessage": "情報が見つからなかった場合の経緯や探索した情報源に関する説明テキスト（日本語）"
}`;

          // Cast generateContent parameter to any to bypass strict type check for responseMimeType
          const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
          } as any);

          const response = await result.response;
          const text = response.text();

          if (!text) {
            throw new Error('Empty response from model');
          }

          let cleanText = text.trim();
          if (cleanText.startsWith('```')) {
            cleanText = cleanText.replace(/^```json\s*/, '').replace(/```$/, '').trim();
          }

          const data = JSON.parse(cleanText);

          // Console Logging for Visibility
          console.log(`\n--- [Exhibition Search Log] ---`);
          console.log(`Artwork: ${artwork} by ${artist}`);
          console.log(`Query Used: ${data.searchQueryUsed}`);
          console.log(`Sources: ${JSON.stringify(data.sourcesUsed)}`);
          console.log(`Logic: ${data.extractionLogic}`);
          console.log(`Result: ${data.exhibitionExists ? 'EXISTS' : 'NOT FOUND'}`);
          if (!data.exhibitionExists) {
            console.log(`Fallback: ${data.fallbackMessage}`);
          }
          console.log(`---------------------------------\n`);

          return NextResponse.json(data);
        } catch (error) {
          const err = error as any;
          lastError = err;
          console.warn(`Exhibition lookup failed with ${modelName} on attempt ${attempt}/3:`, err.message || err);

          if (err.status === 404) {
            break; // Skip to next model in fallback list
          }

          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
          }
        }
      }
    }

    throw lastError || new Error('Failed to retrieve exhibition info');
  } catch (error) {
    const err = error as any;
    console.error('Exhibition API Route Error:', err);
    // Graceful fallback response if all attempts/queries fail
    return NextResponse.json({
      exhibitionExists: false,
      museum: null,
      exhibitionName: null,
      dates: null,
      location: null,
      link: null,
      searchQueryUsed: artwork && artist ? (artwork + ' ' + artist + ' exhibition') : 'unknown artwork exhibition',
      sourcesUsed: [],
      extractionLogic: 'API Route crashed or model search failed.',
      fallbackMessage: 'システムエラー（' + (err.message || '不明なエラー') + '）が発生したため、展示情報を取得できませんでした。',
      error: err.message || 'Exhibition info unavailable'
    });
  }
}

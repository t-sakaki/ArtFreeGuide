import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fetchArtworkImage } from '../src/lib/image';

interface MetObject {
  objectID: number;
  title: string;
  artistDisplayName: string;
  repository: string;
  objectDate: string;
  primaryImage: string;
  primaryImageSmall: string;
  culture: string;
}

interface AIResponse {
  location?: string;
  year?: string;
  short: string;
  standard: string;
  deep: string;
  searchQuery?: string;
  recommendations?: Array<{ title: string; artist: string; reason: string }>;
}

interface CheckpointData {
  processedObjectIds: number[];
  processedArtworks: string[];
  lastUpdated: string;
}

const CHECKPOINT_FILE = path.join(process.cwd(), 'scripts', 'checkpoint.json');
const DEFAULT_NVIDIA_KEY = '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';
const NVIDIA_BASE_URL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';

// Preset Masterpieces for target artists & genres
const PRESET_WORKS: Array<{ title: string; artist: string; location?: string; year?: string }> = [
  // Rococo
  { title: 'ブランコ', artist: 'ジャン・オノレ・フラゴナール', location: 'ウォレス・コレクション', year: '1767年' },
  { title: '読書する少女', artist: 'ジャン・オノレ・フラゴナール', location: 'ワシントン・ナショナル・ギャラリー', year: '1770年' },
  { title: 'シテール島への巡礼', artist: 'アントワーヌ・ヴァトー', location: 'ルーヴル美術館', year: '1717年' },
  { title: 'ポンパドゥール夫人の肖像', artist: 'フランソワ・ブーシェ', location: 'アルテ・ピナコテーク', year: '1756年' },
  { title: 'ヴィーナスの化粧', artist: 'フランソワ・ブーシェ', location: 'メトロポリタン美術館', year: '1751年' },

  // Impressionism
  { title: '印象・日の出', artist: 'クロード・モネ', location: 'マルモッタン・モネ美術館', year: '1872年' },
  { title: '睡蓮', artist: 'クロード・モネ', location: 'オランジュリー美術館', year: '1914年-1926年' },
  { title: '散歩、日傘をさす女性', artist: 'クロード・モネ', location: 'ワシントン・ナショナル・ギャラリー', year: '1875年' },
  { title: 'ムーラン・ド・ラ・ギャレットの舞踏会', artist: 'ピエール＝オーギュスト・ルノワール', location: 'オルセー美術館', year: '1876年' },
  { title: '舟遊びの人々の昼食', artist: 'ピエール＝オーギュスト・ルノワール', location: 'フィリップス・コレクション', year: '1881年' },
  { title: 'エトワール（舞台の踊り子）', artist: 'エドガー・ドガ', location: 'オルセー美術館', year: '1878年' },

  // Surrealism
  { title: '記憶の固執', artist: 'サルバドール・ダリ', location: 'ニューヨーク近代美術館 (MoMA)', year: '1931年' },
  { title: 'イメージの裏切り（これはパイプではない）', artist: 'ルネ・マグリット', location: 'ロサンゼルス・カウンティ美術館', year: '1929年' },
  { title: '人の子', artist: 'ルネ・マグリット', location: '個人蔵', year: '1964年' },
  { title: '光の帝国', artist: 'ルネ・マグリット', location: 'ベルギー王立美術館', year: '1954年' }
];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const escapeSql = (str: string | null | undefined): string => {
  if (!str) return "''";
  return "'" + str.replace(/'/g, "''").replace(/\n/g, '\\n') + "'";
};

function loadCheckpoint(): CheckpointData {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      const raw = fs.readFileSync(CHECKPOINT_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[Collector] Failed to read checkpoint file, starting fresh:', e);
  }
  return { processedObjectIds: [], processedArtworks: [], lastUpdated: new Date().toISOString() };
}

function saveCheckpoint(data: CheckpointData) {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function existsInD1(title: string, artist: string): boolean {
  try {
    const checkSql = `SELECT id FROM artworks WHERE LOWER(title) LIKE ${escapeSql(`%${title.toLowerCase()}%`)} LIMIT 1;`;
    const cmd = `npx wrangler d1 execute artfreeguide_db_trial --remote --command="${checkSql.replace(/"/g, '\\"')}"`;
    const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    return output.includes('"id":');
  } catch (e) {
    return false;
  }
}

function slugify(text: string): string {
  if (!text) return 'artwork';
  const cleaned = text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (cleaned && cleaned !== 'artist' && cleaned !== 'artwork') {
    return cleaned;
  }
  return 'artwork';
}

function saveToD1(data: {
  title: string;
  artist: string;
  location?: string | null;
  year?: string | null;
  short: string;
  standard: string;
  deep: string;
  searchQuery?: string | null;
  recommendations?: any[];
  imageUrl?: string | null;
  artistSlug?: string | null;
  artworkSlug?: string | null;
}): boolean {
  try {
    const recsJson = data.recommendations ? JSON.stringify(data.recommendations) : null;
    const artistSlugVal = data.artistSlug || slugify(data.artist);
    const artworkSlugVal = data.artworkSlug || `${slugify(data.title)}-${Date.now().toString(36)}`;
    
    const insertArtworkSql = `INSERT INTO artworks (title, artist, location, year, guide_short, guide_standard, guide_deep, search_query, recommendations, artist_slug, artwork_slug, view_count) VALUES (${escapeSql(data.title)}, ${escapeSql(data.artist)}, ${escapeSql(data.location)}, ${escapeSql(data.year)}, ${escapeSql(data.short)}, ${escapeSql(data.standard)}, ${escapeSql(data.deep)}, ${escapeSql(data.searchQuery)}, ${escapeSql(recsJson)}, ${escapeSql(artistSlugVal)}, ${escapeSql(artworkSlugVal)}, 1);`;

    const cmdArtwork = `npx wrangler d1 execute artfreeguide_db_trial --remote --command="${insertArtworkSql.replace(/"/g, '\\"')}"`;
    execSync(cmdArtwork, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });

    const getIdSql = `SELECT id FROM artworks WHERE LOWER(title) = ${escapeSql(data.title.toLowerCase())} ORDER BY id DESC LIMIT 1;`;
    const cmdGetId = `npx wrangler d1 execute artfreeguide_db_trial --remote --command="${getIdSql.replace(/"/g, '\\"')}"`;
    const idOutput = execSync(cmdGetId, { encoding: 'utf-8' });
    
    const match = idOutput.match(/"id":\s*(\d+)/);
    const artworkId = match ? parseInt(match[1], 10) : null;

    if (artworkId && data.imageUrl) {
      const insertImgSql = `INSERT INTO artwork_images (artwork_id, url, is_primary, is_valid) VALUES (${artworkId}, ${escapeSql(data.imageUrl)}, 1, 1);`;
      const cmdImg = `npx wrangler d1 execute artfreeguide_db_trial --remote --command="${insertImgSql.replace(/"/g, '\\"')}"`;
      execSync(cmdImg, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    }

    return true;
  } catch (error) {
    console.error(`[D1] Failed to save record "${data.title}":`, error);
    return false;
  }
}

async function generateAIGuide(title: string, artist: string): Promise<AIResponse | null> {
  const apiKey = process.env.NVIDIA_API_KEY || DEFAULT_NVIDIA_KEY;
  const promptInput = artist ? `作品名: ${title}\n作者: ${artist}` : `作品名: ${title}`;

  const systemPrompt = `あなたは美術館の情熱的で知識豊富な音声ガイド・キュレーターです。
対象の美術作品について、必ず指定のJSONオブジェクト単体のみを返してください。

【出力スキーマ】
{
  "location": "（作品の展示・所蔵場所）",
  "year": "（制作年）",
  "short": "（概要解説テキスト 100-150字）",
  "standard": "（マークダウン標準解説）",
  "deep": "（マークダウン詳細解説）",
  "searchQuery": "（Wikimedia Commons検索用の英語キーワード。例：'Claude Monet Water Lilies'）",
  "recommendations": [
    {
      "title": "（関連する作品名）",
      "artist": "（作者名）",
      "reason": "（推薦理由）"
    }
  ]
}`;

  try {
    const res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'google/gemma-4-31b-it',
        messages: [
          { role: 'user', content: `${systemPrompt}\n\n対象美術作品：\n${promptInput}` }
        ],
        temperature: 0.7,
        max_tokens: 1800
      })
    });

    if (!res.ok) return null;

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';

    let cleanText = content.trim();
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleanText = cleanText.substring(firstBrace, lastBrace + 1);
    }

    return JSON.parse(cleanText) as AIResponse;
  } catch (error) {
    console.error(`[LLM] Guide generation failed for "${title}":`, error);
    return null;
  }
}

async function main() {
  console.log(`==================================================`);
  console.log(`🖼️ ArtFreeGuide Genre Bulk Collector`);
  console.log(`==================================================`);

  const checkpoint = loadCheckpoint();
  let totalSaved = 0;
  let totalSkipped = 0;

  for (const work of PRESET_WORKS) {
    const artworkKey = `${work.title.toLowerCase()}::${work.artist.toLowerCase()}`;
    if (checkpoint.processedArtworks.includes(artworkKey) || existsInD1(work.title, work.artist)) {
      console.log(`  └─ [Skip] "${work.title}" by ${work.artist} already exists.`);
      if (!checkpoint.processedArtworks.includes(artworkKey)) {
        checkpoint.processedArtworks.push(artworkKey);
        saveCheckpoint(checkpoint);
      }
      totalSkipped++;
      continue;
    }

    console.log(`\n[Processing Work] "${work.title}" by ${work.artist}...`);
    
    // Precision Image Search
    console.log(`  └─ Precision search on Wikimedia Commons...`);
    const imgUrl = await fetchArtworkImage(`${work.title} ${work.artist}`, work.title, work.artist);

    // AI Guide Generation
    console.log(`  └─ Generating AI Curator Audio Guide via NVIDIA Gemma 4...`);
    const aiGuide = await generateAIGuide(work.title, work.artist);

    if (!aiGuide || !aiGuide.short) {
      console.warn(`  └─ AI guide generation failed for "${work.title}". Skipping.`);
      continue;
    }

    const success = saveToD1({
      title: work.title,
      artist: work.artist,
      location: work.location || aiGuide.location || '美術館',
      year: work.year || aiGuide.year || '',
      short: aiGuide.short,
      standard: aiGuide.standard || '',
      deep: aiGuide.deep || '',
      searchQuery: aiGuide.searchQuery || `${work.title} ${work.artist}`,
      recommendations: aiGuide.recommendations || [],
      imageUrl: imgUrl
    });

    if (success) {
      console.log(`  └─ ✅ Successfully saved to Cloudflare D1!`);
      totalSaved++;
      checkpoint.processedArtworks.push(artworkKey);
      saveCheckpoint(checkpoint);
    }

    await sleep(2000);
  }

  console.log(`\n==================================================`);
  console.log(`🎉 Genre Bulk Collection Finished`);
  console.log(`Total Saved: ${totalSaved}, Skipped: ${totalSkipped}`);
  console.log(`==================================================\n`);
}

main().catch(err => console.error(err));

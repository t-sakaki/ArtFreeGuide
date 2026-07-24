import { execSync } from 'child_process';

const DEFAULT_NVIDIA_KEY = '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';
const NVIDIA_BASE_URL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function slugify(text: string): string {
  if (!text) return 'unknown';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'artwork';
}

const escapeSql = (str: string | null | undefined): string => {
  if (!str) return "''";
  return "'" + str.replace(/'/g, "''").replace(/\n/g, '\\n') + "'";
};

async function generateSlugsViaLLM(title: string, artist: string): Promise<{ artistSlug: string; artworkSlug: string }> {
  const apiKey = process.env.NVIDIA_API_KEY || DEFAULT_NVIDIA_KEY;
  const prompt = `Convert the following artwork title and artist into URL-friendly lowercase English slugs (hyphen-separated).

Title: ${title}
Artist: ${artist}

Return strictly a JSON object:
{
  "artistSlug": "e.g. vincent-van-gogh",
  "artworkSlug": "e.g. the-starry-night"
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
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 200
      })
    });

    if (res.ok) {
      const data = await res.json();
      let text = data.choices?.[0]?.message?.content || '';
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        text = text.substring(firstBrace, lastBrace + 1);
        const parsed = JSON.parse(text);
        if (parsed.artistSlug && parsed.artworkSlug) {
          return {
            artistSlug: slugify(parsed.artistSlug),
            artworkSlug: slugify(parsed.artworkSlug)
          };
        }
      }
    }
  } catch (e) {
    console.warn(`[LLM Slug] Error for ${title}:`, e);
  }

  return {
    artistSlug: slugify(artist) || 'artist',
    artworkSlug: slugify(title) || 'artwork'
  };
}

async function main() {
  console.log(`[SlugPopulator] Fetching artworks from remote D1 (artfreeguide_db_trial)...`);
  const cmd = `npx wrangler d1 execute artfreeguide_db_trial --remote --command="SELECT id, title, artist, artist_slug, artwork_slug FROM artworks;"`;
  const output = execSync(cmd, { encoding: 'utf-8' });

  let items: Array<{ id: number; title: string; artist: string; artist_slug: string | null; artwork_slug: string | null }> = [];
  try {
    const jsonStart = output.indexOf('[');
    const jsonEnd = output.lastIndexOf(']');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const jsonStr = output.substring(jsonStart, jsonEnd + 1);
      const parsedArray = JSON.parse(jsonStr);
      if (parsedArray && parsedArray[0] && parsedArray[0].results) {
        items = parsedArray[0].results;
      }
    }
  } catch (e) {
    console.error('Failed to parse D1 output:', e);
    return;
  }

  console.log(`[SlugPopulator] Found ${items.length} artwork records.`);
  let updatedCount = 0;

  for (const item of items) {
    if (item.artist_slug && item.artwork_slug) {
      console.log(`[Skip] ID ${item.id} already has slugs: ${item.artist_slug}/${item.artwork_slug}`);
      continue;
    }

    console.log(`[${item.id}] Generating slugs for "${item.title}" by "${item.artist}"...`);
    const slugs = await generateSlugsViaLLM(item.title, item.artist || 'Unknown Artist');
    
    const finalArtworkSlug = `${slugs.artworkSlug}-${item.id}`;
    
    console.log(`  └─ Slugs: /art/${slugs.artistSlug}/${finalArtworkSlug}`);

    const updateSql = `UPDATE artworks SET artist_slug = ${escapeSql(slugs.artistSlug)}, artwork_slug = ${escapeSql(finalArtworkSlug)} WHERE id = ${item.id};`;
    const updateCmd = `npx wrangler d1 execute artfreeguide_db_trial --remote --command="${updateSql.replace(/"/g, '\\"')}"`;
    execSync(updateCmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });

    updatedCount++;
    await sleep(1500);
  }

  console.log(`\n✅ Finished populating slugs for ${updatedCount} records!`);
}

main().catch(err => console.error(err));

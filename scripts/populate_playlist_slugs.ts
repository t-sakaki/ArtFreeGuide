import { execSync } from 'child_process';

const escapeSql = (str: string | null | undefined): string => {
  if (!str) return "''";
  return "'" + str.replace(/'/g, "''").replace(/\n/g, '\\n') + "'";
};

function slugify(text: string): string {
  if (!text) return 'playlist';
  const cleaned = text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return cleaned || 'playlist';
}

function main() {
  console.log(`==================================================`);
  console.log(`🏷️ Populating Playlist Slugs in D1 Database`);
  console.log(`==================================================`);

  const cmdQuery = `npx wrangler d1 execute artfreeguide_db_trial --remote --command="SELECT id, name, playlist_slug FROM playlists;"`;
  const output = execSync(cmdQuery, { encoding: 'utf-8' });

  const jsonStart = output.indexOf('[');
  const jsonEnd = output.lastIndexOf(']');
  if (jsonStart === -1 || jsonEnd === -1) {
    console.error('Failed to parse D1 playlists JSON output.');
    return;
  }

  const playlists = JSON.parse(output.substring(jsonStart, jsonEnd + 1))[0]?.results || [];
  console.log(`Found ${playlists.length} playlists in D1.`);

  const SLUG_MAP: Record<number, string> = {
    1: 'van-gogh-passion-tour',
    2: 'vermeer-gold-tour',
    3: 'louvre-renaissance-tour',
    4: 'rococo-tour',
    5: 'impressionism-tour',
    6: 'surrealism-tour'
  };

  for (const p of playlists) {
    let slug = p.playlist_slug;
    if (!slug) {
      slug = SLUG_MAP[p.id] || slugify(p.name);
      console.log(`  └─ Setting Playlist #${p.id} ("${p.name}") ➔ slug: "${slug}"`);

      const updateSql = `UPDATE playlists SET playlist_slug = ${escapeSql(slug)} WHERE id = ${p.id};`;
      const cmdUpdate = `npx wrangler d1 execute artfreeguide_db_trial --remote --command="${updateSql.replace(/"/g, '\\"')}"`;
      execSync(cmdUpdate, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    } else {
      console.log(`  └─ Playlist #${p.id} ("${p.name}") already has slug: "${slug}"`);
    }
  }

  console.log(`✅ All playlist slugs successfully populated in Cloudflare D1!`);
}

main();

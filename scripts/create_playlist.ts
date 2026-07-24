import { execSync } from 'child_process';

const escapeSql = (str: string | null | undefined): string => {
  if (!str) return "''";
  return "'" + str.replace(/'/g, "''").replace(/\n/g, '\\n') + "'";
};

interface ArtworkRow {
  id: number;
  title: string;
  artist: string;
}

function queryArtworks(): ArtworkRow[] {
  const cmd = `npx wrangler d1 execute artfreeguide_db_trial --remote --command="SELECT id, title, artist FROM artworks;"`;
  const output = execSync(cmd, { encoding: 'utf-8' });

  const jsonStart = output.indexOf('[');
  const jsonEnd = output.lastIndexOf(']');
  if (jsonStart !== -1 && jsonEnd !== -1) {
    const parsed = JSON.parse(output.substring(jsonStart, jsonEnd + 1));
    return parsed[0]?.results || [];
  }
  return [];
}

function createPlaylist(name: string, description: string, slug: string, artworkTitles: string[]): number | null {
  console.log(`\n🏛️ Creating/Updating Playlist: "${name}" (slug: "${slug}")...`);
  const allArtworks = queryArtworks();

  const queryCheck = `npx wrangler d1 execute artfreeguide_db_trial --remote --command="SELECT id FROM playlists WHERE playlist_slug = ${escapeSql(slug)} LIMIT 1;"`;
  const checkOutput = execSync(queryCheck, { encoding: 'utf-8' });
  let playlistId: number | null = null;
  const jsonStart = checkOutput.indexOf('[');
  const jsonEnd = checkOutput.lastIndexOf(']');
  if (jsonStart !== -1 && jsonEnd !== -1) {
    const parsed = JSON.parse(checkOutput.substring(jsonStart, jsonEnd + 1));
    playlistId = parsed[0]?.results?.[0]?.id || null;
  }

  if (!playlistId) {
    const insertPlaylistSql = `INSERT INTO playlists (name, description, playlist_slug) VALUES (${escapeSql(name)}, ${escapeSql(description)}, ${escapeSql(slug)});`;
    const cmdPlaylist = `npx wrangler d1 execute artfreeguide_db_trial --remote --command="${insertPlaylistSql.replace(/"/g, '\\"')}"`;
    execSync(cmdPlaylist, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });

    const queryIdCmd = `npx wrangler d1 execute artfreeguide_db_trial --remote --command="SELECT id FROM playlists WHERE playlist_slug = ${escapeSql(slug)} LIMIT 1;"`;
    const idOutput = execSync(queryIdCmd, { encoding: 'utf-8' });
    const matchStart = idOutput.indexOf('[');
    const matchEnd = idOutput.lastIndexOf(']');
    if (matchStart !== -1 && matchEnd !== -1) {
      const parsed = JSON.parse(idOutput.substring(matchStart, matchEnd + 1));
      playlistId = parsed[0]?.results?.[0]?.id || null;
    }
  } else {
    const updateSql = `UPDATE playlists SET name = ${escapeSql(name)}, description = ${escapeSql(description)} WHERE id = ${playlistId};`;
    const cmdUpdate = `npx wrangler d1 execute artfreeguide_db_trial --remote --command="${updateSql.replace(/"/g, '\\"')}"`;
    execSync(cmdUpdate, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  }

  if (!playlistId) {
    console.error(`Failed to retrieve ID for playlist "${name}"`);
    return null;
  }

  console.log(`  └─ Playlist ID #${playlistId} active. Clearing previous items...`);
  const clearSql = `DELETE FROM playlist_items WHERE playlist_id = ${playlistId};`;
  const cmdClear = `npx wrangler d1 execute artfreeguide_db_trial --remote --command="${clearSql.replace(/"/g, '\\"')}"`;
  execSync(cmdClear, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });

  let position = 1;
  for (const targetTitle of artworkTitles) {
    const match = allArtworks.find(a =>
      a.title.toLowerCase().includes(targetTitle.toLowerCase()) ||
      targetTitle.toLowerCase().includes(a.title.toLowerCase())
    );

    if (match) {
      console.log(`  └─ [Pos ${position}] Added "${match.title}" (ID: ${match.id})`);
      const itemSql = `INSERT INTO playlist_items (playlist_id, artwork_id, position) VALUES (${playlistId}, ${match.id}, ${position});`;
      const cmdItem = `npx wrangler d1 execute artfreeguide_db_trial --remote --command="${itemSql.replace(/"/g, '\\"')}"`;
      execSync(cmdItem, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      position++;
    } else {
      console.warn(`  └─ ⚠️ Artwork matching "${targetTitle}" not found in D1. Skipping.`);
    }
  }

  console.log(`✅ Tour Playlist #${playlistId} ready! Link: /playlist/${slug}`);
  return playlistId;
}

async function main() {
  console.log(`==================================================`);
  console.log(`🎧 ArtFreeGuide Playlist (Tour) Creator Tool`);
  console.log(`==================================================`);

  // Tour 1: ゴッホと情熱の色彩ツアー
  createPlaylist(
    'ゴッホと情熱の色彩ツアー',
    '星月夜、ひまわり、夜のカフェテラスなど、ゴッホの代表作を巡る感動の音声ガイドツアー。',
    'van-gogh-passion-tour',
    ['星月夜', 'ひまわり', '夜のカフェテラス', 'ファン・ゴッホの寝室', 'カラスのいる麦畑']
  );

  // Tour 2: フェルメールと光のオランダ黄金時代ツアー
  createPlaylist(
    'フェルメールと光のオランダ黄金時代ツアー',
    '「真珠の耳飾りの少女」をはじめ、光の魔術師フェルメールの静謐で美しい世界を巡るツアー。',
    'vermeer-gold-tour',
    ['真珠の耳飾りの少女', '牛乳を注ぐ女', 'デルフトの眺望', '天文学者']
  );

  // Tour 3: ルーヴル＆ルネサンス巨匠ツアー
  createPlaylist(
    'ルネサンスとルーヴル巨匠ツアー',
    'モナ・リザやダ・ヴィンチの傑作をじっくり鑑賞する贅沢なミュージアムツアー。',
    'louvre-renaissance-tour',
    ['モナリザ', '聖アンナと聖母子', '岩窟の聖母']
  );

  // Tour 4: ロココ美術の可憐なる宮廷世界ツアー
  createPlaylist(
    'ロココ美術の可憐なる宮廷世界ツアー',
    'フラゴナールやヴァトーが描いた、18世紀フランス貴族社会の優美で繊細な芸術世界。',
    'rococo-tour',
    ['ブランコ', '読書する少女', 'シテール島への巡礼', 'ポンパドゥール夫人の肖像', 'ヴィーナスの化粧']
  );

  // Tour 5: 印象派・光と彩りの革命ツアー
  createPlaylist(
    '印象派・光と彩りの革命ツアー',
    'モネやルノワールが描いた自然の光と色彩の瞬間。近代絵画の扉を開いた革新の旅。',
    'impressionism-tour',
    ['印象・日の出', '睡蓮', '散歩、日傘をさす女性', 'ムーラン・ド・ラ・ギャレットの舞踏会', '舟遊びの人々の昼食', 'エトワール']
  );

  // Tour 6: シュルレアリスム・夢と無意識の探求ツアー
  createPlaylist(
    'シュルレアリスム・夢と無意識の探求ツアー',
    'ダリやマグリットが創り出した不思議な夢の世界。常識を揺さぶる超現実主義の旅。',
    'surrealism-tour',
    ['記憶の固執', 'イメージの裏切り', 'レディメイド']
  );
}

main().catch(err => console.error(err));

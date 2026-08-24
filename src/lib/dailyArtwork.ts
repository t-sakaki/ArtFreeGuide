/**
 * "本日の一枚" — a single daily artwork, chosen from the works that have earned
 * the most listener hearts (guide_feedback kind='good') and that already have a
 * generated, polished guide (artwork_guides row).
 *
 * The pick is deterministic per calendar day: the same date always yields the
 * same artwork for every visitor, but it rotates day to day. The "theme" of the
 * day is rotated the same way from the existing playlists, so the daily work
 * reads as part of a curated frame rather than a raw popularity dump.
 *
 * Designed to degrade gracefully:
 *  - In a non-Cloudflare local build, or when D1 is unreachable, it falls back
 *    to a small curated list so the home screen still renders.
 *  - If feedback is empty, the curated list carries the feature.
 */

import { getCloudflareContext } from '@opennextjs/cloudflare';
import { PLAYLISTS } from './playlists';

interface D1Binding {
  prepare(query: string): D1Statement;
}

interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  all<T>(): Promise<{ results?: T[] }>;
}

/** A work that actually has a generated guide in the archive. */
export interface RankedArtwork {
  title: string;
  artist: string;
  /** Number of "good" (heart) feedback entries. */
  hearts: number;
}

/** Display metadata not stored in names.data.json. */
interface ArtworkMeta {
  year?: string;
  museum?: string;
  medium?: string;
  /** Theme tags used to frame the daily pick. */
  themes?: string[];
}

/**
 * Curated fallback: well-known works with the plaque metadata we would otherwise
 * not have. Kept small and high-quality; the live ranking augments/replaces it.
 */
const CURATED: Record<string, ArtworkMeta> = {
  '睡蓮': { year: '1906', museum: 'シカゴ美術館', medium: '油彩・カンヴァス', themes: ['impressionism'] },
  '星月夜': { year: '1889', museum: 'ニューヨーク近代美術館 (MoMA)', medium: '油彩・カンヴァス', themes: ['impressionism', 'anxiety'] },
  '神奈川沖浪裏': { year: '1831', museum: '浮世絵（多館所蔵）', medium: '木版多色摺', themes: ['hokusai'] },
  'モナ・リザ': { year: '1503', museum: 'ルーヴル美術館', medium: '油彩・カンヴァス（板上）', themes: ['renaissance'] },
  '叫び': { year: '1893', museum: 'ノルウェー国立美術館', medium: 'テンペラ・カルトン', themes: ['anxiety'] },
  'ひまわり': { year: '1888', museum: 'アムステルダム・ファン・ゴッホ美術館', medium: '油彩・カンヴァス', themes: ['vangogh', 'passion-colors'] },
  '真珠の耳飾りの少女': { year: '1665', museum: 'デン・ハーグ王立絵画館', medium: '油彩・カンヴァス', themes: ['light-and-shadow'] },
  '最後の晩餐': { year: '1495', museum: 'サンタ・マリア・デッレ・グラツィエ修道院', medium: '乾壁画', themes: ['renaissance'] },
  '印象・日の出': { year: '1872', museum: 'マルモッタン・モネ美術館', medium: '油彩・カンヴァス', themes: ['impressionism'] },
  'ゲルニカ': { year: '1937', museum: 'ソフィア王妃芸術センター', medium: '油彩・カンヴァス', themes: ['anxiety', 'passion-colors'] },
  '記憶の固執': { year: '1931', museum: 'ニューヨーク近代美術館 (MoMA)', medium: '油彩・カンヴァス', themes: ['anxiety', 'light-and-shadow'] },
  '風神雷神図屏風': { year: '1630', museum: '東京国立博物館', medium: '金地著色・六曲一双', themes: ['hokusai'] },
  '富嶽三十六景 神奈川沖浪裏': { year: '1831', museum: '浮世絵（多館所蔵）', medium: '木版多色摺', themes: ['hokusai'] },
  'ヴィーナスの誕生': { year: '1485', museum: 'ウフィツィ美術館', medium: 'テンペラ・カンヴァス', themes: ['renaissance', 'renaissance-ideal'] },
  'ダビデ像': { year: '1504', museum: 'アカデミア美術館 (フィレンツェ)', medium: '大理石彫刻', themes: ['renaissance', 'renaissance-ideal'] },
  '夜警': { year: '1642', museum: 'アムステルダム国立美術館', medium: '油彩・カンヴァス', themes: ['light-and-shadow'] },
  '接吻': { year: '1908', museum: 'ベルヴェデーレ宮殿 (ウィーン)', medium: '油彩・金箔・カンヴァス', themes: ['passion-colors'] },
  'アテナイの学堂': { year: '1509', museum: 'バチカン宮殿・署名の間', medium: 'フレスコ画', themes: ['renaissance-ideal'] },
  'アビニヨンの娘たち': { year: '1907', museum: 'ニューヨーク近代美術館 (MoMA)', medium: '油彩・カンヴァス', themes: ['renaissance-ideal'] },
};

const CURATED_TITLES = Object.keys(CURATED);

/** A stable per-day seed from YYYY-MM-DD, used to deterministically rotate. */
function daySeed(dateStr: string): number {
  let h = 2166136261;
  for (let i = 0; i < dateStr.length; i += 1) {
    h ^= dateStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Pull the day's top works from D1: works that have a generated guide AND at
 * least one "good" heart, ranked by heart count. Returns [] when D1 is
 * unavailable or no feedback exists yet.
 */
async function fetchRankedFromD1(): Promise<RankedArtwork[]> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const db = (env as unknown as { DB?: D1Binding }).DB;
    if (!db) return [];

    const { results } = await db
      .prepare(
        `SELECT g.title AS title, g.artist AS artist, COUNT(f.id) AS hearts
         FROM artwork_guides g
         LEFT JOIN guide_feedback f
           ON f.title = g.title AND f.artist = g.artist AND f.kind = 'good'
         GROUP BY g.title, g.artist
         HAVING COUNT(f.id) > 0
         ORDER BY hearts DESC, g.updated_at DESC
         LIMIT 50`
      )
      .all<{ title: string; artist: string; hearts: number }>();

    return (results ?? []).map(r => ({
      title: r.title,
      artist: r.artist ?? '',
      hearts: Number(r.hearts) || 0,
    }));
  } catch {
    return [];
  }
}

export interface DailyArtwork {
  /** Canonical Japanese title — display names are localized on the client from this. */
  canonicalTitle: string;
  canonicalArtist: string;
  year?: string;
  museum?: string;
  medium?: string;
  /** Theme id of the day, drawn from PLAYLISTS. Client localizes via localizePlaylist. */
  themeId: string;
  /** True when chosen from live feedback; false when from the curated fallback. */
  fromFeedback: boolean;
  date: string;
}

/** A short set of themes we rotate through, so the daily frame varies. */
function dailyTheme(dateStr: string): { id: string; title: string; subtitle: string } {
  const seed = daySeed(dateStr);
  const pool = PLAYLISTS.filter(p => p.items.length >= 1);
  const chosen = pool.length ? pool[seed % pool.length] : PLAYLISTS[0];
  return { id: chosen.id, title: chosen.title, subtitle: chosen.subtitle };
}

/**
 * Decide today's artwork. Always returns a pick (curated fallback guarantees it).
 * Returns canonical Japanese title/artist and the theme id; the client localizes
 * display names via localizeName / localizePlaylist so it follows the UI language.
 */
export async function getDailyArtwork(): Promise<DailyArtwork> {
  const date = todayStr();
  const seed = daySeed(date);
  const theme = dailyTheme(date);

  const ranked = await fetchRankedFromD1();

  // Build a candidate pool: live-feedback works first (by hearts), then curated.
  const pool: RankedArtwork[] = [...ranked];
  for (const title of CURATED_TITLES) {
    if (!pool.some(p => p.title === title)) {
      pool.push({ title, artist: '', hearts: 0 });
    }
  }

  // Deterministic pick from the pool using the day seed.
  const pick = pool[seed % pool.length];
  const meta = CURATED[pick.title] ?? {};
  const fromFeedback = ranked.some(r => r.title === pick.title && r.hearts > 0);

  return {
    canonicalTitle: pick.title,
    canonicalArtist: pick.artist,
    year: meta.year,
    museum: meta.museum,
    medium: meta.medium,
    themeId: theme.id,
    fromFeedback,
    date,
  };
}

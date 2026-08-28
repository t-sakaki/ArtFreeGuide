import { Locale } from './i18n';

/**
 * MiniMax Week hackathon feature: per-artwork theme-song generation.
 *
 * Pipeline:
 *   1. MiniMax M3 (OpenRouter, free) reasons about the artwork's emotion /
 *      era / style and writes Japanese lyrics + an English style prompt.
 *      Falls back to a local heuristic if no OpenRouter key is configured.
 *   2. MiniMax Music 3.0 (GMI Cloud, requestqueue) composes and sings it.
 *
 * Campaign-limited experimental feature.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GMI_BASE = 'https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey';
const MUSIC_MODEL = 'minimax-music-3.0';

function openRouterKey(): string | null {
  return process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY_X13 || null;
}

function gmiKey(): string | null {
  return process.env.GMI_API_KEY || process.env.GMI_CLOUD_API_KEY || null;
}

interface LyricPlan {
  lyrics: string;
  style_prompt: string;
}

/**
 * Local heuristic fallback when no OpenRouter key is available: derive a
 * simple emotional song plan from the artwork title / artist.
 */
function localLyricPlan(guideText: string, title: string, artist: string): LyricPlan {
  const hints: Record<string, { mood: string; style: string }> = {
    'ゴッホ': { mood: '激情と孤独', style: 'raw energetic rock with distorted guitar, fast tempo, urgent vocals' },
    'モネ': { mood: '光と穏やかさ', style: 'soft impressionist ballad, gentle piano and strings, slow tempo' },
    'フェルメール': { mood: '静寂と神秘', style: 'intimate chamber pop, warm acoustic, breathy vocal' },
    'ムンク': { mood: '不安と叫び', style: 'dark ambient post-rock, tense strings, haunting echo' },
    'ピカソ': { mood: '破壊と再生', style: 'fragmented jazz fusion, brass stabs, shifting meter' },
    '北斎': { mood: '大自然の力', style: 'epic taiko-driven orchestral, massive dynamics' },
    'ダリ': { mood: '夢と幻想', style: 'surreal dream-pop, reverby synths, lazy swing' },
  };
  let picked = hints['ゴッホ'];
  for (const k of Object.keys(hints)) {
    if (artist.includes(k) || title.includes(k)) { picked = hints[k]; break; }
  }
  const lyrics =
    `[Verse]\n${title}よ、いつの世の旅\n${artist}が描いたまなざし\n\n` +
    `[Chorus]\n${picked.mood}を抱いて\n色と光が歌いだす\n${title}、君の物語`;
  return { lyrics, style_prompt: picked.style };
}

/**
 * Ask MiniMax M3 to translate an artwork's guide text into a song plan.
 * Returns a local heuristic plan if no key or the model fails.
 */
export async function planThemeSong(
  guideText: string,
  locale: Locale,
  title = '',
  artist = ''
): Promise<LyricPlan | null> {
  const key = openRouterKey();
  if (!key) {
    console.warn('[theme-song] no OpenRouter key; using local lyric heuristic');
    return localLyricPlan(guideText, title, artist);
  }

  const sys =
    'あなたは美術作品の解説をもとに、その作品だけのオリジナル楽曲を作るソングライターです。' +
    '作品の感情・時代・画風を読み取り、日本語の歌詞と、作曲用の英語スタイル指示を出力してください。';
  const userPrompt =
    `以下はある美術作品の音声ガイド解説です。この作品の世界観を1曲の歌にしてください。\n\n` +
    `【解説】\n${guideText.slice(0, 4000)}\n\n` +
    `【出力形式】JSONのみ出力してください（マークダウンや前文・後文は禁止）。\n` +
    `{\n` +
    `  "lyrics": "日本語歌詞。[Verse] [Chorus] [Bridge] のタグで構成。1〜3500字。",\n` +
    `  "style_prompt": "Music 3.0用の英語スタイル指示。ジャンル・楽器・テンポ・ボーカルの雰囲気。0〜2000字。"\n` +
    `}`;

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://artfreeguide.app',
        'X-Title': 'ArtFreeGuide ThemeSong',
      },
      body: JSON.stringify({
        model: 'minimax/minimax-m3:free',
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.9,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      console.warn(`[theme-song] M3 failed: ${res.status}`);
      return localLyricPlan(guideText, title, artist);
    }
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? '';
    const cleaned = content.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleaned) as Partial<LyricPlan>;
    if (!parsed.lyrics || !parsed.style_prompt) return localLyricPlan(guideText, title, artist);
    return { lyrics: parsed.lyrics, style_prompt: parsed.style_prompt };
  } catch (e) {
    console.warn('[theme-song] M3 parse/fetch error:', e);
    return localLyricPlan(guideText, title, artist);
  }
}

async function submitMusic(lyrics: string, stylePrompt: string): Promise<string | null> {
  const key = gmiKey();
  if (!key) return null;
  const res = await fetch(`${GMI_BASE}/requests`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MUSIC_MODEL,
      payload: {
        lyrics,
        prompt: stylePrompt,
        sample_rate: 44100,
        bitrate: 256000,
        format: 'mp3',
      },
    }),
  });
  if (!res.ok) {
    console.warn(`[theme-song] music submit failed: ${res.status}`);
    return null;
  }
  const data = await res.json();
  return data.request_id || data.id || null;
}

/**
 * Submit a theme-song generation: reason lyrics (M3 or local heuristic), then
 * submit the Music 3.0 job. Returns { requestId, lyrics, stylePrompt } quickly
 * WITHOUT blocking on the ~1-2 min music generation. The caller polls
 * pollThemeSong(requestId) until it resolves the audio URL.
 */
export async function submitThemeSong(
  guideText: string,
  locale: Locale,
  title = '',
  artist = ''
): Promise<{ requestId: string; lyrics: string; stylePrompt: string } | null> {
  if (!gmiKey()) {
    console.warn('[theme-song] no GMI key; cannot compose');
    return null;
  }
  const plan = await planThemeSong(guideText, locale, title, artist);
  if (!plan) return null;

  const requestId = await submitMusic(plan.lyrics, plan.style_prompt);
  if (!requestId) return null;

  return { requestId, lyrics: plan.lyrics, stylePrompt: plan.style_prompt };
}

/**
 * Poll a submitted Music 3.0 job. Returns { status, audioUrl? }.
 */
export async function pollThemeSong(
  requestId: string
): Promise<{ status: string; audioUrl?: string }> {
  const key = gmiKey();
  if (!key) return { status: 'error' };
  const res = await fetch(`${GMI_BASE}/requests/${requestId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return { status: 'pending' };
  const st = await res.json();
  const status = st.status;
  if (status === 'success') {
    const outcome = st.outcome || {};
    const audioUrl = outcome.audio_url || (outcome.media_urls || [{}])[0]?.url || null;
    return { status, audioUrl: audioUrl ?? undefined };
  }
  if (status === 'failed' || status === 'error') return { status };
  return { status };
}

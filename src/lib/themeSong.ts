import { Locale } from './i18n';

/**
 * MiniMax Week hackathon feature: per-artwork theme-song generation.
 *
 * Pipeline:
 *   1. MiniMax M3 (OpenRouter, free) reasons about the artwork's emotion /
 *      era / style and writes Japanese lyrics + an English style prompt.
 *   2. MiniMax Music 3.0 (GMI Cloud, requestqueue) composes and sings it.
 *
 * The music job takes ~1-2 min, which is far longer than a Cloudflare Worker
 * request may run. So this module only exposes the individual steps; the API
 * route submits the job, stores the request id, and the client polls until a
 * later request sees the job finish and copies the audio into R2.
 *
 * Campaign-limited experimental feature.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GMI_BASE = 'https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey';
const MUSIC_MODEL = 'minimax-music-3.0';

export interface LyricPlan {
  lyrics: string;
  stylePrompt: string;
}

export type MusicPollResult =
  | { status: 'pending' }
  | { status: 'success'; audioUrl: string }
  | { status: 'failed'; error: string };

export function openRouterKey(): string | null {
  return process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY_X13 || null;
}

export function gmiKey(): string | null {
  return process.env.GMI_API_KEY || process.env.GMI_CLOUD_API_KEY || null;
}

/**
 * Ask MiniMax M3 to translate an artwork's guide text into a song plan.
 * Returns null if no key or the model fails.
 */
export async function planThemeSong(guideText: string, locale: Locale): Promise<LyricPlan | null> {
  const key = openRouterKey();
  if (!key) {
    console.warn('[theme-song] no OpenRouter key; skipping lyric plan');
    return null;
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
      return null;
    }
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? '';
    const parsed = parseLyricJson(content);
    if (!parsed) return null;
    return parsed;
  } catch (e) {
    console.warn('[theme-song] M3 parse/fetch error:', e);
    return null;
  }
}

/** The model sometimes wraps the JSON in prose or code fences. */
function parseLyricJson(content: string): LyricPlan | null {
  const first = content.indexOf('{');
  const last = content.lastIndexOf('}');
  if (first === -1 || last <= first) return null;
  try {
    const obj = JSON.parse(content.slice(first, last + 1)) as {
      lyrics?: unknown;
      style_prompt?: unknown;
    };
    if (typeof obj.lyrics !== 'string' || !obj.lyrics.trim()) return null;
    const stylePrompt =
      typeof obj.style_prompt === 'string' && obj.style_prompt.trim()
        ? obj.style_prompt.trim()
        : 'gentle cinematic art-song, warm strings and piano, mid tempo, intimate vocal';
    return { lyrics: obj.lyrics.trim(), stylePrompt };
  } catch {
    return null;
  }
}

/**
 * Submit the composition job to MiniMax Music 3.0. Returns the request id to
 * poll, or null on failure.
 */
export async function submitMusicJob(plan: LyricPlan): Promise<string | null> {
  const key = gmiKey();
  if (!key) return null;
  try {
    const res = await fetch(`${GMI_BASE}/requests`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MUSIC_MODEL,
        payload: {
          lyrics: plan.lyrics,
          prompt: plan.stylePrompt,
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
  } catch (e) {
    console.warn('[theme-song] music submit error:', e);
    return null;
  }
}

/** Check a submitted MiniMax Music job once (no waiting). */
export async function pollMusicJob(requestId: string): Promise<MusicPollResult> {
  const key = gmiKey();
  if (!key) return { status: 'failed', error: 'missing_gmi_key' };
  try {
    const res = await fetch(`${GMI_BASE}/requests/${requestId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      // A transient read error is not fatal; let the client poll again.
      return { status: 'pending' };
    }
    const st = await res.json();
    if (st.status === 'success') {
      const outcome = st.outcome || {};
      const audioUrl: string | null =
        outcome.audio_url || (outcome.media_urls || [{}])[0]?.url || null;
      if (!audioUrl) return { status: 'failed', error: 'no_audio_url_in_outcome' };
      return { status: 'success', audioUrl };
    }
    if (st.status === 'failed' || st.status === 'error') {
      return { status: 'failed', error: `music_job_${st.status}` };
    }
    return { status: 'pending' };
  } catch (e) {
    console.warn('[theme-song] music poll error:', e);
    return { status: 'pending' };
  }
}

/** Fetch the finished MP3 so the caller can persist it (e.g. to R2). */
export async function downloadAudio(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[theme-song] audio download failed: ${res.status}`);
      return null;
    }
    return await res.arrayBuffer();
  } catch (e) {
    console.warn('[theme-song] audio download error:', e);
    return null;
  }
}

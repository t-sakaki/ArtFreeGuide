import { Locale } from './i18n';

/**
 * MiniMax Week hackathon feature: per-artwork theme-song generation.
 *
 * Pipeline:
 *   1. MiniMax M3 (OpenRouter, free) reasons about the artwork's emotion /
 *      era / style and writes Japanese lyrics + an English style prompt.
 *   2. MiniMax Music 3.0 (GMI Cloud, requestqueue) composes and sings it.
 *
 * Campaign-limited experimental feature.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GMI_BASE = 'https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey';
const MUSIC_MODEL = 'minimax-music-3.0';
const MAX_POLLS = 20;
const POLL_INTERVAL_MS = 15000;

export interface ThemeSongResult {
  audioUrl: string;
  lyrics: string;
  stylePrompt: string;
}

export function openRouterKey(): string | null {
  return process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY_X13 || null;
}

export function gmiKey(): string | null {
  return process.env.GMI_API_KEY || process.env.GMI_CLOUD_API_KEY || null;
}

interface LyricPlan {
  lyrics: string;
  style_prompt: string;
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
    // Strip code fences if the model wrapped the JSON.
    const cleaned = content.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleaned) as Partial<LyricPlan>;
    if (!parsed.lyrics || !parsed.style_prompt) return null;
    return { lyrics: parsed.lyrics, style_prompt: parsed.style_prompt };
  } catch (e) {
    console.warn('[theme-song] M3 parse/fetch error:', e);
    return null;
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

async function pollMusic(requestId: string): Promise<string | null> {
  const key = gmiKey()!;
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(`${GMI_BASE}/requests/${requestId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) continue;
    const st = await res.json();
    if (st.status === 'success') {
      const outcome = st.outcome || {};
      return outcome.audio_url || (outcome.media_urls || [{}])[0]?.url || null;
    }
    if (st.status === 'failed' || st.status === 'error') {
      console.warn(`[theme-song] music job ${requestId} ${st.status}`);
      return null;
    }
  }
  return null;
}

/**
 * Generate a theme song for the given guide text. Returns null on any failure
 * (missing keys, model errors) so the caller can show a graceful message.
 */
export async function generateThemeSong(guideText: string, locale: Locale): Promise<ThemeSongResult | null> {
  if (!gmiKey()) {
    console.warn('[theme-song] no GMI key; cannot compose');
    return null;
  }
  const plan = await planThemeSong(guideText, locale);
  if (!plan) return null;

  const requestId = await submitMusic(plan.lyrics, plan.style_prompt);
  if (!requestId) return null;

  const audioUrl = await pollMusic(requestId);
  if (!audioUrl) return null;

  return { audioUrl, lyrics: plan.lyrics, stylePrompt: plan.style_prompt };
}

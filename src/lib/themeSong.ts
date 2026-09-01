import { Locale } from './i18n';
import { getLLMProvider, Message } from './llm';

/**
 * MiniMax Week hackathon feature: per-artwork theme-song generation.
 *
 * Pipeline:
 *   1. Lyrics + an English style prompt, written from the guide text. MiniMax M3
 *      (OpenRouter) is tried first; if it is slow or down we fall back to the
 *      app's own fast LLM so the request never stalls.
 *   2. MiniMax Music 3.0 (GMI Cloud, requestqueue) composes and sings it.
 *
 * GMI's submit call blocks ~1-2 min, but the job keeps running if the client
 * disconnects, so we abort the connection after a few seconds and recover the
 * request id from the queue listing. Every step then fits in one short request:
 * no ctx.waitUntil, no multi-minute handler. The API route drives it by polling.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GMI_BASE = 'https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey';
const MUSIC_MODEL = process.env.GMI_MUSIC_MODEL || 'minimax-music-3.0';
/** How long to wait on the M3 lyric call before falling back to the fast LLM. */
const M3_TIMEOUT_MS = 55_000;
/** How long to hold the (blocking) GMI submit connection before abandoning it. */
const SUBMIT_ABORT_MS = 6_000;

/** fetch() with a hard timeout so a stuck upstream never pins the worker. */
async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
}

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

const LYRIC_SYS =
  'あなたは美術作品の解説をもとに、その作品だけのオリジナル楽曲を作るソングライターです。' +
  '作品の感情・時代・画風を読み取り、日本語の歌詞と、作曲用の英語スタイル指示を出力してください。';

function lyricUserPrompt(guideText: string): string {
  return (
    `以下はある美術作品の音声ガイド解説です。この作品の世界観を1曲の歌にしてください。\n\n` +
    `【解説】\n${guideText.slice(0, 4000)}\n\n` +
    `【出力形式】JSONのみ出力してください（マークダウンや前文・後文は禁止）。\n` +
    `{\n` +
    `  "lyrics": "日本語歌詞。[Verse] [Chorus] [Bridge] のタグで構成。1〜3500字。",\n` +
    `  "style_prompt": "Music 3.0用の英語スタイル指示。ジャンル・楽器・テンポ・ボーカルの雰囲気。0〜2000字。"\n` +
    `}`
  );
}

/**
 * Write lyrics + an English style prompt from the guide text. Tries MiniMax M3
 * (OpenRouter) first, then falls back to the app's own fast LLM so a slow or
 * missing OpenRouter never stalls the request. Returns null only if both fail.
 */
export async function planThemeSong(guideText: string, _locale: Locale): Promise<LyricPlan | null> {
  const viaM3 = await lyricsViaOpenRouter(guideText);
  if (viaM3) return viaM3;
  return lyricsViaAppLlm(guideText);
}

async function lyricsViaOpenRouter(guideText: string): Promise<LyricPlan | null> {
  const key = openRouterKey();
  if (!key) return null;
  try {
    const res = await fetchWithTimeout(
      OPENROUTER_URL,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://artfreeguide.app',
          'X-Title': 'ArtFreeGuide ThemeSong',
        },
        body: JSON.stringify({
          model: process.env.THEME_SONG_LYRIC_MODEL || 'minimax/minimax-m3:free',
          messages: [
            { role: 'system', content: LYRIC_SYS },
            { role: 'user', content: lyricUserPrompt(guideText) },
          ],
          temperature: 0.9,
          response_format: { type: 'json_object' },
        }),
      },
      M3_TIMEOUT_MS,
    );
    if (!res.ok) {
      console.warn(`[theme-song] M3 failed: ${res.status}`);
      return null;
    }
    const data = await res.json();
    return parseLyricJson(data?.choices?.[0]?.message?.content ?? '');
  } catch (e) {
    console.warn('[theme-song] M3 error, falling back:', e);
    return null;
  }
}

async function lyricsViaAppLlm(guideText: string): Promise<LyricPlan | null> {
  try {
    const messages: Message[] = [
      { role: 'user', content: `${LYRIC_SYS}\n\n${lyricUserPrompt(guideText)}` },
    ];
    const text = await getLLMProvider('ask').generateResponse(messages, { json: true });
    return parseLyricJson(text);
  } catch (e) {
    console.warn('[theme-song] fallback lyric LLM failed:', e);
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

/** Pull the finished MP3 URL out of a GMI request/outcome object. */
function extractAudioUrl(outcome: Record<string, unknown> | undefined | null): string | null {
  if (!outcome) return null;
  const direct = outcome.audio_url;
  if (typeof direct === 'string' && direct) return direct;
  const list = outcome.media_urls;
  if (Array.isArray(list) && list[0] && typeof list[0].url === 'string') return list[0].url;
  return null;
}

export type SubmitResult = { requestId: string; audioUrl: string | null } | { error: string };

/**
 * Submit the composition job to MiniMax Music.
 *
 * GMI's requestqueue endpoint blocks for ~1-2 min, but the job keeps running
 * after the client disconnects. So we hold the connection only briefly: if it
 * answers in time we read the request id (and maybe the finished URL) straight
 * off the response; otherwise we abandon it and recover the id from the queue
 * listing by matching our lyrics. Either way this returns in a few seconds.
 */
export async function submitMusicJob(plan: LyricPlan): Promise<SubmitResult> {
  const key = gmiKey();
  if (!key) return { error: 'missing_gmi_key' };
  // MiniMax Music caps lyrics length; keep well under it.
  const lyrics = plan.lyrics.slice(0, 3000);
  const requestBody = JSON.stringify({
    model: MUSIC_MODEL,
    payload: {
      lyrics,
      prompt: plan.stylePrompt.slice(0, 2000),
      sample_rate: 44100,
      bitrate: 256000,
      format: 'mp3',
    },
  });

  try {
    const res = await fetchWithTimeout(
      `${GMI_BASE}/requests`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: requestBody,
      },
      SUBMIT_ABORT_MS,
    );
    const body = await res.text();
    if (!res.ok) {
      console.warn(`[theme-song] music submit failed: ${res.status} ${body.slice(0, 300)}`);
      return { error: `submit_${res.status}: ${body.slice(0, 120)}` };
    }
    const data = JSON.parse(body);
    const requestId = data.request_id || data.id || null;
    if (requestId) return { requestId, audioUrl: extractAudioUrl(data.outcome) };
    return { error: `submit_no_request_id: ${body.slice(0, 120)}` };
  } catch (e) {
    if (!(e instanceof Error) || (e.name !== 'TimeoutError' && e.name !== 'AbortError')) {
      console.warn('[theme-song] music submit error:', e);
      return { error: `submit_exception: ${e instanceof Error ? e.message : String(e)}` };
    }
    // Connection abandoned on purpose: the job is running, find it in the queue.
    return recoverSubmittedJob(key, lyrics);
  }
}

/** Find the job we just submitted (connection dropped) by matching its lyrics. */
async function recoverSubmittedJob(key: string, lyrics: string): Promise<SubmitResult> {
  const needle = lyrics.slice(0, 60);
  for (let attempt = 0; attempt < 3; attempt++) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const res = await fetchWithTimeout(
        `${GMI_BASE}/requests?limit=20`,
        { headers: { Authorization: `Bearer ${key}` } },
        15_000,
      );
      if (!res.ok) continue;
      const rows: Array<{ request_id?: string; created_at?: number; payload?: { lyrics?: string }; outcome?: Record<string, unknown> }> =
        (await res.json()).requests || [];
      const mine = rows
        .filter(r => r.request_id && (r.payload?.lyrics ?? '').slice(0, 60) === needle)
        .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))[0];
      if (mine?.request_id) {
        return { requestId: mine.request_id, audioUrl: extractAudioUrl(mine.outcome) };
      }
    } catch {
      /* retry */
    }
  }
  return { error: 'submit_id_not_found' };
}

/** Check a submitted MiniMax Music job once (no waiting). */
export async function pollMusicJob(requestId: string): Promise<MusicPollResult> {
  const key = gmiKey();
  if (!key) return { status: 'failed', error: 'missing_gmi_key' };
  try {
    const res = await fetchWithTimeout(
      `${GMI_BASE}/requests/${requestId}`,
      { headers: { Authorization: `Bearer ${key}` } },
      20_000,
    );
    if (!res.ok) {
      // A transient read error is not fatal; let the client poll again.
      return { status: 'pending' };
    }
    const st = await res.json();
    if (st.status === 'success') {
      const audioUrl = extractAudioUrl(st.outcome);
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
    const res = await fetchWithTimeout(url, {}, 60_000);
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

export interface AiBinding {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

/**
 * Transcribe the finished track (Whisper, word-level timestamps) so the
 * written lyrics can be aligned to the actual performance. Returns null on
 * any failure — the caller falls back to an estimate.
 */
export async function transcribeVocals(
  bytes: ArrayBuffer,
  ai: AiBinding,
): Promise<{ word: string; start: number; end: number }[] | null> {
  try {
    const audio = Array.from(new Uint8Array(bytes));
    const result = (await ai.run('@cf/openai/whisper-large-v3-turbo', { audio })) as {
      words?: { word: string; start: number; end: number }[];
    };
    return Array.isArray(result?.words) && result.words.length ? result.words : null;
  } catch (e) {
    console.warn('[theme-song] whisper transcription failed:', e);
    return null;
  }
}

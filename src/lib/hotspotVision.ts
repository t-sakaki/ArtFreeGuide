import { GuideHotspot, PlacedHotspot } from './hotspots';

export type { PlacedHotspot };

/**
 * Phase 2 of the "見どころ" feature: give the marker-less points from
 * {@link GuideHotspot} an approximate place on the canvas, so a work no one has
 * hand-measured can still show marks on the image.
 *
 * A small vision model cannot be trusted to the pixel, so the coordinates it
 * returns are treated as rough: the mark is a soft circle and the zoom is
 * capped low. Anything it cannot place is simply left off — the caller still
 * has the text list to fall back on.
 */

const BASE_URL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';

/** Vision models on NIM, in fallback order. Shares VISION_MODEL with vision.ts. */
const DEFAULT_MODELS = ['nvidia/nemotron-nano-12b-v2-vl', 'meta/llama-3.2-11b-vision-instruct'];

/** One JSON object with a short array; the model has no room to ramble. */
const MAX_TOKENS = 700;

/** Commons is asked for width=1024, which comfortably fits under this. */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

/** Rough placement, so the focus never punches in as hard as a curated point. */
const MAX_ZOOM = 2.2;

interface ChatCompletion {
  choices?: { message?: { content?: string } }[];
}

function clamp01(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return n;
}

/** Vision models like to wrap JSON in a fence or a sentence of preamble. */
function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Downloads the artwork and turns it into a data URL the model accepts. */
async function fetchImageAsDataUrl(imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!ACCEPTED_MIME.includes(type)) return null;
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) return null;
    const base64 = Buffer.from(buffer).toString('base64');
    return `data:${type};base64,${base64}`;
  } catch (error) {
    console.warn('Hotspot image fetch failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

function locatePrompt(points: GuideHotspot[]): string {
  const list = points.map((p, i) => `${i + 1}. ${p.label} — ${p.detail}`).join('\n');
  return [
    'You are shown one artwork. Below is a numbered list of details in it.',
    'For each numbered detail that is actually visible, give the centre of that',
    'detail as fractions of the image: x from 0 (left) to 1 (right), y from 0',
    '(top) to 1 (bottom). Omit any detail you cannot locate with confidence.',
    'Do not translate or rewrite the labels; answer with their numbers.',
    '',
    list,
    '',
    'Answer with one JSON object and nothing else:',
    '{"points": [{"n": number, "x": number, "y": number}]}'
  ].join('\n');
}

async function askVision(dataUrl: string, prompt: string, apiKey: string): Promise<unknown> {
  const configured = (process.env.VISION_MODEL || '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
  const chain = configured.length ? configured : DEFAULT_MODELS;

  let lastError: unknown = null;
  for (const model of chain) {
    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: dataUrl } }
              ]
            }
          ],
          max_tokens: MAX_TOKENS,
          temperature: 0
        }),
        signal: AbortSignal.timeout(25_000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = (await res.json()) as ChatCompletion;
      const parsed = extractJson(data.choices?.[0]?.message?.content ?? '');
      if (!parsed) throw new Error('Vision model returned no JSON object');
      return parsed;
    } catch (error) {
      lastError = error;
      console.warn(
        `Hotspot vision model ${model} failed:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }
  throw new Error(
    `Hotspot vision call failed: ${lastError instanceof Error ? lastError.message : 'unavailable'}`
  );
}

/**
 * Places as many of `points` as the model can find on `imageUrl`.
 * Returns points in their original order, each carrying coordinates; a point
 * the model could not place is dropped. Never throws — an empty array means
 * "keep showing the list".
 */
export async function locateHotspots(
  imageUrl: string,
  points: GuideHotspot[]
): Promise<PlacedHotspot[]> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey || points.length === 0) return [];

  const dataUrl = await fetchImageAsDataUrl(imageUrl);
  if (!dataUrl) return [];

  let parsed: unknown;
  try {
    parsed = await askVision(dataUrl, locatePrompt(points), apiKey);
  } catch (error) {
    console.warn('locateHotspots gave up:', error instanceof Error ? error.message : error);
    return [];
  }

  return placePoints(points, (parsed as { points?: unknown })?.points);
}

/**
 * Folds the model's `{n, x, y}` rows back onto the point list: keeps original
 * order, drops anything unplaced or out of range, ignores a repeated number.
 * Exported for testing; `locateHotspots` is the real entry point.
 */
export function placePoints(points: GuideHotspot[], rows: unknown): PlacedHotspot[] {
  if (!Array.isArray(rows)) return [];

  const placed = new Map<number, { x: number; y: number }>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const n = Number((row as any).n);
    const x = clamp01((row as any).x);
    const y = clamp01((row as any).y);
    if (!Number.isInteger(n) || n < 1 || n > points.length || x === null || y === null) continue;
    if (!placed.has(n)) placed.set(n, { x, y });
  }

  return points
    .map((point, index) => {
      const at = placed.get(index + 1);
      return at ? { ...point, x: at.x, y: at.y, zoom: MAX_ZOOM } : null;
    })
    .filter((p): p is PlacedHotspot => p !== null);
}

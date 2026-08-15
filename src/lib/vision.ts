import { Locale, OUTPUT_LANGUAGE_INSTRUCTION } from './i18n';

/**
 * Reading an artwork out of a photo, so a visitor standing in front of a
 * painting does not have to type its name.
 *
 * Two passes, in order of how much they can be trusted:
 *
 *   1. `caption` — the wall label next to the work. Transcription, so it is
 *      right even for works no model has ever seen.
 *   2. `artwork` — the painting itself. Only famous works come back correct,
 *      so this runs when there is no readable label and its answer is always
 *      shown to the visitor for confirmation before anything is generated.
 */
export type IdentifySource = 'caption' | 'artwork';

export interface Identification {
  title: string | null;
  artist: string | null;
  /** The model's own 0-1 estimate, clamped. Low values keep the visitor in the loop. */
  confidence: number;
  source: IdentifySource;
}

const BASE_URL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';

/** Vision models on NIM, in fallback order. Overridable with VISION_MODEL. */
const DEFAULT_MODELS = ['nvidia/nemotron-nano-12b-v2-vl', 'meta/llama-3.2-11b-vision-instruct'];

/** Long enough for a JSON object, short enough that the model cannot ramble. */
const MAX_TOKENS = 256;

/** Guide titles are short; anything longer is the model narrating, not naming. */
const MAX_FIELD_LENGTH = 120;

const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

/** Roughly 4 MB of base64, i.e. ~3 MB of image. The client sends far less. */
const MAX_DATA_URL_LENGTH = 4 * 1024 * 1024;

interface ChatCompletion {
  choices?: { message?: { content?: string } }[];
}

/**
 * Checks a `data:` URL without ever logging or storing it.
 * @returns the URL itself, or null when it is not a supported image.
 */
export function validateImageDataUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length > MAX_DATA_URL_LENGTH) return null;
  const match = /^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) return null;
  if (!ACCEPTED_MIME.includes(match[1])) return null;
  return value;
}

function captionPrompt(locale: Locale): string {
  return [
    'This photo may show a museum wall label (caption plate) beside an artwork.',
    'Set label_visible to true only when printed or written text is legible in the photo.',
    'Transcribe the artwork title and the artist name from that text alone.',
    'Never infer them from the picture itself: with no legible text, answer with nulls.',
    OUTPUT_LANGUAGE_INSTRUCTION[locale],
    'Answer with one JSON object and nothing else:',
    '{"label_visible": boolean, "title": string|null, "artist": string|null, "confidence": number between 0 and 1}'
  ].join('\n');
}

function artworkPrompt(locale: Locale): string {
  return [
    'This photo shows an artwork, most likely a painting.',
    'Name the work and its artist if you recognise it.',
    'If you are not sure which work this is, answer with nulls rather than a plausible guess.',
    'Set confidence to how certain you are that this exact work is the one you named.',
    OUTPUT_LANGUAGE_INSTRUCTION[locale],
    'Answer with one JSON object and nothing else:',
    '{"title": string|null, "artist": string|null, "confidence": number between 0 and 1}'
  ].join('\n');
}

/** Vision models like to wrap JSON in a fenced block or a sentence of preamble. */
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

function cleanField(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_FIELD_LENGTH) return null;
  // Models write these instead of leaving the field out.
  if (/^(null|none|unknown|n\/a|不明|未詳)$/i.test(trimmed)) return null;
  return trimmed;
}

function cleanConfidence(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(1, Math.max(0, numeric));
}

async function askVision(dataUrl: string, prompt: string, apiKey: string): Promise<unknown> {
  const models = (process.env.VISION_MODEL || '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
  const chain = models.length ? models : DEFAULT_MODELS;

  let lastError: unknown = null;

  for (const model of chain) {
    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
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
          temperature: 0.1
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }

      const data = (await res.json()) as ChatCompletion;
      const text = data.choices?.[0]?.message?.content ?? '';
      const parsed = extractJson(text);
      if (!parsed) throw new Error('Vision model returned no JSON object');
      return parsed;
    } catch (error) {
      lastError = error;
      console.warn(
        `Vision model ${model} failed:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  throw new Error(
    `Vision call failed: ${lastError instanceof Error ? lastError.message : 'unavailable'}`
  );
}

function toIdentification(parsed: unknown, source: IdentifySource): Identification {
  const record = (parsed ?? {}) as Record<string, unknown>;
  const title = cleanField(record.title);
  return {
    title,
    artist: cleanField(record.artist),
    confidence: title ? cleanConfidence(record.confidence) : 0,
    source
  };
}

/**
 * Wall label first, the painting itself as the fallback.
 * @param dataUrl a validated `data:image/...;base64,` URL.
 * @returns the best reading; `title` is null when neither pass recognised anything.
 */
export async function identifyArtwork(dataUrl: string, locale: Locale): Promise<Identification> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error('NVIDIA_API_KEY environment variable is not set.');

  const parsed = (await askVision(dataUrl, captionPrompt(locale), apiKey)) as Record<string, unknown>;
  // Vision models happily "read" a label that is not in the photo, so a title is
  // only trusted as a transcription when the model also says it saw text.
  if (parsed?.label_visible !== false) {
    const caption = toIdentification(parsed, 'caption');
    if (caption.title) return caption;
  }

  return toIdentification(await askVision(dataUrl, artworkPrompt(locale), apiKey), 'artwork');
}

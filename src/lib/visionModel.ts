import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * One vision call, one JSON object back — shared by the two features that read
 * an image with a model: {@link import('./vision').identifyArtwork} and
 * {@link import('./hotspotVision').locateHotspots}.
 *
 * Workers AI runs first. It is keyless, it runs on Cloudflare next to the
 * Worker, and — unlike the NVIDIA NIM catalogue, whose free tier is meant for
 * evaluation — it is the provider this app is entitled to lean on in
 * production. NVIDIA NIM stays as the fallback and as the only option for
 * local scripts, where the `AI` binding does not exist.
 */

/** The Workers AI vision model. Overridable, but there is only really one choice today. */
const WORKERS_AI_VISION_MODEL =
  process.env.WORKERS_AI_VISION_MODEL || '@cf/meta/llama-3.2-11b-vision-instruct';

const NVIDIA_BASE_URL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';

/**
 * NVIDIA NIM vision models, in fallback order. `gemma-4` leads because it both
 * reads labels well and answers with the JSON object we ask for; the llama
 * vision model tends to return prose that `extractJson` then has to salvage.
 */
const NVIDIA_VISION_MODELS = ['google/gemma-4-31b-it', 'meta/llama-3.2-11b-vision-instruct'];

interface AiBinding {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

interface ChatCompletion {
  choices?: { message?: { content?: string } }[];
}

/** Vision models like to wrap JSON in a fenced block or a sentence of preamble. */
export function extractJson(text: string): unknown {
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

/** `data:image/...;base64,xxxx` -> the raw bytes Workers AI wants as `image`. */
function dataUrlToBytes(dataUrl: string): number[] {
  const comma = dataUrl.indexOf(',');
  const binary = atob(comma === -1 ? dataUrl : dataUrl.slice(comma + 1));
  const bytes = new Array<number>(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** Whatever text a Workers AI vision model handed back, however it wrapped it. */
function workersAiText(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>;
    const value = record.response ?? record.description ?? record.text;
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') return JSON.stringify(value);
  }
  return '';
}

async function askWorkersAi(dataUrl: string, prompt: string, maxTokens: number): Promise<unknown> {
  const { env } = await getCloudflareContext({ async: true });
  const ai = (env as unknown as { AI?: AiBinding }).AI;
  if (!ai) throw new Error('Workers AI binding "AI" is not available (not running on Cloudflare).');

  const result = await ai.run(WORKERS_AI_VISION_MODEL, {
    prompt,
    image: dataUrlToBytes(dataUrl),
    max_tokens: maxTokens,
    temperature: 0.1
  });

  const parsed = extractJson(workersAiText(result));
  if (!parsed) throw new Error('Workers AI vision returned no JSON object');
  return parsed;
}

async function askNvidia(dataUrl: string, prompt: string, maxTokens: number): Promise<unknown> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error('NVIDIA_API_KEY is not set; no vision fallback available.');

  const configured = (process.env.VISION_MODEL || '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
  const chain = configured.length ? configured : NVIDIA_VISION_MODELS;

  let lastError: unknown = null;
  for (const model of chain) {
    try {
      const res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
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
          max_tokens: maxTokens,
          temperature: 0.1,
          response_format: { type: 'json_object' }
        }),
        signal: AbortSignal.timeout(25_000)
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }

      const data = (await res.json()) as ChatCompletion;
      const parsed = extractJson(data.choices?.[0]?.message?.content ?? '');
      if (!parsed) throw new Error('Vision model returned no JSON object');
      return parsed;
    } catch (error) {
      lastError = error;
      console.warn(
        `NVIDIA vision model ${model} failed:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  throw new Error(
    `NVIDIA vision call failed: ${lastError instanceof Error ? lastError.message : 'unavailable'}`
  );
}

/**
 * Sends one image and one prompt to a vision model and returns the parsed JSON
 * object it answered with. Workers AI first, NVIDIA NIM as the fallback.
 *
 * @param dataUrl a `data:image/...;base64,` URL, already validated by the caller.
 * @throws when every provider in the chain failed.
 */
export async function askVisionJson(
  dataUrl: string,
  prompt: string,
  options: { maxTokens: number }
): Promise<unknown> {
  try {
    return await askWorkersAi(dataUrl, prompt, options.maxTokens);
  } catch (error) {
    console.warn(
      'Workers AI vision unavailable, falling back to NVIDIA:',
      error instanceof Error ? error.message : String(error)
    );
    return askNvidia(dataUrl, prompt, options.maxTokens);
  }
}

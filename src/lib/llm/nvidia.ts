import { LLMProvider, Message } from './provider';
import { parseModelList } from './models';

const BASE_URL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';

// Measured against the curator prompt: nemotron-3-super gives the best mix of
// natural Japanese, JSON compliance and latency (~46s). gemma-4 is accurate but
// slow (~110s), llama-3.1-70b is the last resort.
const DEFAULT_MODELS = [
  'nvidia/nemotron-3-super-120b-a12b',
  'google/gemma-4-31b-it',
  'meta/llama-3.1-70b-instruct'
];

const MAX_TOKENS = 4096;

interface ChatCompletion {
  choices?: { message?: { content?: string } }[];
}

/**
 * NVIDIA NIM (OpenAI-compatible). Used when the Workers AI daily allocation is
 * spent: flip `LLM_PROVIDER=nvidia` and the guide endpoint keeps working.
 */
export class NvidiaProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly models: string[];

  constructor(models: string[] = []) {
    const configured = models.length ? models : parseModelList(process.env.NVIDIA_MODEL);
    this.models = configured.length ? configured : DEFAULT_MODELS;

    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      throw new Error('NVIDIA_API_KEY environment variable is not set.');
    }
    this.apiKey = apiKey;
  }

  async generateResponse(messages: Message[], options?: { json?: boolean }): Promise<string> {
    const chatMessages = messages.map(msg => ({
      role: msg.role === 'model' ? 'assistant' : 'user',
      content: msg.content
    }));

    let lastError: unknown = null;

    for (const modelName of this.models) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(`${BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
              model: modelName,
              messages: chatMessages,
              max_tokens: MAX_TOKENS,
              temperature: 0.7,
              ...(options?.json ? { response_format: { type: 'json_object' } } : {})
            })
          });

          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
          }

          const data = (await res.json()) as ChatCompletion;
          const text = data.choices?.[0]?.message?.content ?? '';
          if (!text) {
            throw new Error('Empty response from NVIDIA NIM');
          }

          return text;
        } catch (error) {
          lastError = error;
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`Model ${modelName} failed on attempt ${attempt}/3:`, message);

          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
          }
        }
      }
    }

    const message = lastError instanceof Error ? lastError.message : 'Service Unavailable';
    console.error('All NVIDIA models in the fallback chain failed.', lastError);
    throw new Error(`NVIDIA API call failed: ${message}`);
  }
}

import { getCloudflareContext } from '@opennextjs/cloudflare';
import { LLMProvider, Message } from './provider';
import { parseModelList } from './models';

// Fallback models in case the primary one is overloaded or unavailable
const DEFAULT_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-3.1-8b-instruct-fast',
  '@cf/qwen/qwen2.5-coder-32b-instruct'
];

const MAX_TOKENS = 4096;

interface AiBinding {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

export class WorkersAiProvider implements LLMProvider {
  private readonly models: string[];

  constructor(models: string[] = []) {
    const configured = models.length ? models : parseModelList(process.env.WORKERS_AI_MODEL);
    this.models = configured.length ? configured : DEFAULT_MODELS;
  }

  async generateResponse(messages: Message[], options?: { json?: boolean }): Promise<string> {
    const { env } = await getCloudflareContext({ async: true });
    const ai = (env as unknown as { AI?: AiBinding }).AI;

    if (!ai) {
      throw new Error(
        'Workers AI binding "AI" is not available. Deploy on Cloudflare, or run `wrangler dev` / `npm run preview` so the binding is provided.'
      );
    }

    const chatMessages = messages.map(msg => ({
      role: msg.role === 'model' ? 'assistant' : 'user',
      content: msg.content
    }));

    let lastError: unknown = null;

    for (const modelName of this.models) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const result = await ai.run(modelName, {
            messages: chatMessages,
            max_tokens: MAX_TOKENS,
            ...(options?.json ? { response_format: { type: 'json_object' } } : {})
          });

          const text = extractText(result);
          if (!text) {
            throw new Error('Empty response from Workers AI');
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
    console.error('All Workers AI models in the fallback chain failed.', lastError);
    throw new Error(`Workers AI call failed: ${message}`);
  }
}

// Workers AI returns `{ response: string }` for text generation, but JSON mode
// may hand back an already-parsed object.
function extractText(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }

  if (result && typeof result === 'object' && 'response' in result) {
    const response = (result as { response: unknown }).response;
    if (typeof response === 'string') {
      return response;
    }
    if (response && typeof response === 'object') {
      return JSON.stringify(response);
    }
  }

  return '';
}

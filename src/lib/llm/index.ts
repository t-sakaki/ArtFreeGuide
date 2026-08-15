import { LLMProvider } from './provider';
import { GeminiProvider } from './gemini';
import { WorkersAiProvider } from './workers-ai';
import { NvidiaProvider } from './nvidia';
import { parseModelList } from './models';

export type { LLMProvider, Message } from './provider';

/**
 * What the model is being asked to do. A guide is long, JSON-shaped and may take
 * a minute; answers and search suggestions are short and must feel instant, so
 * each task picks its own provider and model chain:
 *
 *   LLM_<TASK>_PROVIDER / LLM_<TASK>_MODEL  ->  LLM_PROVIDER  ->  workers-ai
 *
 * `LLM_ASK_MODEL` takes a comma separated priority list, e.g.
 * `nvidia/nemotron-3-nano-30b-a3b,meta/llama-3.1-70b-instruct`.
 */
export type LLMTask = 'guide' | 'ask' | 'suggest';

const TASK_ENV_PREFIX: Record<LLMTask, string> = {
  guide: 'LLM_GUIDE',
  ask: 'LLM_ASK',
  suggest: 'LLM_SUGGEST'
};

export { parseModelList } from './models';

export function getLLMProvider(task: LLMTask = 'guide'): LLMProvider {
  const prefix = TASK_ENV_PREFIX[task];
  const providerType =
    process.env[`${prefix}_PROVIDER`] || process.env.LLM_PROVIDER || 'workers-ai';
  const models = parseModelList(process.env[`${prefix}_MODEL`]);

  switch (providerType.toLowerCase()) {
    case 'workers-ai':
    case 'workersai':
    case 'cloudflare':
      return new WorkersAiProvider(models);
    case 'gemini':
      return new GeminiProvider(models);
    case 'nvidia':
    case 'nim':
      return new NvidiaProvider(models);
    default:
      throw new Error(`Unsupported LLM provider: ${providerType}`);
  }
}

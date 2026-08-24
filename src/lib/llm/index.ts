import { LLMProvider } from './provider';
import { GeminiProvider } from './gemini';
import { WorkersAiProvider } from './workers-ai';
import { NvidiaProvider } from './nvidia';
import { parseModelList, parseProviderList } from './models';
import { FallbackProvider } from './fallback';

export type { LLMProvider, Message } from './provider';

/**
 * What the model is being asked to do. A guide is long, JSON-shaped and may take
 * a minute; answers and search suggestions are short and must feel instant, so
 * each task picks its own provider and model chain:
 *
 *   LLM_<TASK>_PROVIDER / LLM_<TASK>_MODEL  ->  LLM_PROVIDER  ->  workers-ai
 *
 * `LLM_PROVIDER` (and `LLM_<TASK>_PROVIDER`) is a comma separated provider
 * priority list for cross-provider fallback, e.g. `workers-ai,nvidia` tries
 * Workers AI first and falls back to NVIDIA NIM when it fails (e.g. daily
 * allocation spent).
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
  const providerList = parseProviderList(
    process.env[`${prefix}_PROVIDER`] || process.env.LLM_PROVIDER || 'workers-ai'
  );

  const providers = providerList.map(name => createProvider(name, task));
  return new FallbackProvider(providers);
}

/**
 * Builds a single provider. Model lists are filtered per provider so a
 * NVIDIA-only model name (e.g. `nvidia/nemotron-...`) is never handed to
 * Workers AI, and vice versa. Each provider falls back to its own dedicated
 * env (`WORKERS_AI_MODEL` / `NVIDIA_MODEL` / `GEMINI_MODEL`) or built-in
 * defaults when no applicable model is configured.
 */
function createProvider(name: string, task: LLMTask): LLMProvider {
  const prefix = TASK_ENV_PREFIX[task];
  const commonModels = parseModelList(process.env[`${prefix}_MODEL`]);

  switch (name) {
    case 'workers-ai':
    case 'workersai':
    case 'cloudflare': {
      const dedicated = parseModelList(process.env.WORKERS_AI_MODEL);
      const filtered = commonModels.filter(m => !m.includes('/'));
      return new WorkersAiProvider(dedicated.length ? dedicated : filtered);
    }
    case 'gemini': {
      const dedicated = parseModelList(process.env.GEMINI_MODEL);
      const filtered = commonModels.filter(m => m.includes('gemini'));
      return new GeminiProvider(dedicated.length ? dedicated : filtered);
    }
    case 'nvidia':
    case 'nim': {
      const dedicated = parseModelList(process.env.NVIDIA_MODEL);
      return new NvidiaProvider(dedicated.length ? dedicated : commonModels);
    }
    default:
      throw new Error(`Unsupported LLM provider: ${name}`);
  }
}

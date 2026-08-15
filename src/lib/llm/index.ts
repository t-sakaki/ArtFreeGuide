import { LLMProvider } from './provider';
import { GeminiProvider } from './gemini';
import { WorkersAiProvider } from './workers-ai';
import { NvidiaProvider } from './nvidia';

export type { LLMProvider, Message } from './provider';

export function getLLMProvider(): LLMProvider {
  const providerType = process.env.LLM_PROVIDER || 'workers-ai';

  switch (providerType.toLowerCase()) {
    case 'workers-ai':
    case 'workersai':
    case 'cloudflare':
      return new WorkersAiProvider();
    case 'gemini':
      return new GeminiProvider();
    case 'nvidia':
    case 'nim':
      return new NvidiaProvider();
    default:
      throw new Error(`Unsupported LLM provider: ${providerType}`);
  }
}

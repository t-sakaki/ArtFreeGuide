import { LLMProvider } from './provider';
import { GeminiProvider } from './gemini';

export type { LLMProvider, Message } from './provider';

export function getLLMProvider(): LLMProvider {
  const providerType = process.env.LLM_PROVIDER || 'gemini';

  switch (providerType.toLowerCase()) {
    case 'gemini':
      return new GeminiProvider();
    default:
      throw new Error(`Unsupported LLM provider: ${providerType}`);
  }
}

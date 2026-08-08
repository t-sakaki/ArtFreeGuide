import { getCloudflareContext } from '@opennextjs/cloudflare';
import { LLMProvider, Message, LLMOptions } from './provider';
import { GeminiProvider } from './gemini';
import { NVIDIAProvider } from './nvidia';

export type { LLMProvider, Message, LLMOptions } from './provider';

/**
 * Resilient LLM Orchestrator Wrapper
 */
export class ResilientLLMOrchestrator implements LLMProvider {
  private primary: LLMProvider;
  private fallback?: LLMProvider;

  constructor(primary: LLMProvider, fallback?: LLMProvider) {
    this.primary = primary;
    this.fallback = fallback;
  }

  async generateResponse(messages: Message[], options?: LLMOptions): Promise<string> {
    try {
      return await this.primary.generateResponse(messages, options);
    } catch (primaryError: any) {
      console.warn('[LLMOrchestrator] Primary LLM Provider failed:', primaryError.message || primaryError);

      if (this.fallback) {
        console.log('[LLMOrchestrator] Attempting fallback LLM Provider...');
        try {
          return await this.fallback.generateResponse(messages, options);
        } catch (fallbackError: any) {
          console.error('[LLMOrchestrator] Fallback LLM Provider also failed:', fallbackError.message || fallbackError);
          throw new Error(`All LLM Providers failed. Primary: ${primaryError.message}. Fallback: ${fallbackError.message}`);
        }
      }

      throw primaryError;
    }
  }
}

/**
 * Factory function to retrieve the configured LLM Provider.
 */
export async function getLLMProvider(overrideEnv?: Record<string, any>): Promise<LLMProvider> {
  let cfEnv: Record<string, any> = {};

  try {
    const cfContext = await getCloudflareContext();
    if (cfContext && cfContext.env) {
      cfEnv = cfContext.env;
    }
  } catch (_) {
    // Not running inside Cloudflare context
  }

  const mergedEnv = { ...process.env, ...cfEnv, ...overrideEnv };
  const providerType = (mergedEnv.LLM_PROVIDER || 'nvidia').toLowerCase();
  const modelName = mergedEnv.LLM_MODEL || 'meta/llama-3.1-70b-instruct';

  console.log(`[LLMOrchestrator] Selected Provider: ${providerType}, Model: ${modelName}`);

  const nvidiaConfig = {
    apiKey: mergedEnv.NVIDIA_API_KEY,
    baseUrl: mergedEnv.NVIDIA_BASE_URL,
    defaultModel: modelName
  };

  const geminiConfig = {
    apiKey: mergedEnv.GEMINI_API_KEY,
    defaultModel: modelName
  };

  if (providerType === 'gemini') {
    const primary = new GeminiProvider(geminiConfig);
    const fallback = mergedEnv.NVIDIA_API_KEY ? new NVIDIAProvider(nvidiaConfig) : undefined;
    return new ResilientLLMOrchestrator(primary, fallback);
  }

  // Default: NVIDIA
  const primary = new NVIDIAProvider(nvidiaConfig);
  const fallback = mergedEnv.GEMINI_API_KEY ? new GeminiProvider(geminiConfig) : undefined;
  return new ResilientLLMOrchestrator(primary, fallback);
}

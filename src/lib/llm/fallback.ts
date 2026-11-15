import { LLMProvider, Message } from './provider';
import { logLlmCall, LlmProviderType } from './logger';

/**
 * Tries providers in order. If a provider throws, the next one is attempted.
 * This enables cross-provider fallback — e.g. `LLM_PROVIDER=workers-ai,nvidia`
 * uses Workers AI first and falls back to NVIDIA NIM when its daily allocation
 * is spent (or any other failure occurs).
 */
export class FallbackProvider implements LLMProvider {
  private readonly providers: LLMProvider[];
  private readonly providerType: LlmProviderType = 'workers-ai';

  constructor(providers: LLMProvider[]) {
    if (providers.length === 0) {
      throw new Error('FallbackProvider requires at least one provider');
    }
    this.providers = providers;
  }

  async generateResponse(messages: Message[], options?: { json?: boolean }): Promise<string> {
    let lastError: unknown = null;

    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i];
      try {
        const text = await provider.generateResponse(messages, options);
        if (i > 0) {
          // A fallback provider succeeded after the primary failed.
          logLlmCall({
            provider: this.providerType,
            modelName: `fallback-to-provider[${i}]`,
            attempt: i + 1,
            totalAttemptsInModel: this.providers.length,
            success: true,
            durationMs: 0,
            kind: 'success',
          });
        }
        return text;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`LLM provider[${i}] failed, trying next fallback:`, message);
      }
    }

    const message = lastError instanceof Error ? lastError.message : 'Service Unavailable';
    logLlmCall({
      provider: this.providerType,
      modelName: 'all-providers-exhausted',
      attempt: this.providers.length,
      totalAttemptsInModel: this.providers.length,
      success: false,
      durationMs: 0,
      kind: 'model_exhausted',
      error: message.slice(0, 1000),
    });
    throw new Error(`All LLM providers in the fallback chain failed: ${message}`);
  }
}

import { GoogleGenerativeAI } from '@google/generative-ai';
import { LLMProvider, Message } from './provider';
import { parseModelList } from './models';
import { logLlmCall, LlmProviderType } from './logger';

// Fallback models in case the primary one is overloaded (503) or unavailable
const DEFAULT_MODELS = [
  'gemini-4-hydrogen',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite'
];

export class GeminiProvider implements LLMProvider {
  private genAI: GoogleGenerativeAI;
  private readonly models: string[];
  private readonly providerType: LlmProviderType = 'gemini';

  constructor(models: string[] = []) {
    const configured = models.length ? models : parseModelList(process.env.GEMINI_MODEL);
    this.models = configured.length ? configured : DEFAULT_MODELS;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set. Please check your .env.local configuration.');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async generateResponse(messages: Message[], options?: { json?: boolean }): Promise<string> {
    const contents = messages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    let lastError: any = null;
    let lastModelName = '';

    for (const modelName of this.models) {
      lastModelName = modelName;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const startedAt = performance.now();
        try {
          const model = this.genAI.getGenerativeModel({
            model: modelName,
            generationConfig: options?.json ? { responseMimeType: 'application/json' } : undefined
          });

          const result = await model.generateContent({ contents });
          const response = await result.response;
          const text = response.text();

          if (!text) {
            throw new Error('Empty response from Gemini API');
          }

          logLlmCall({
            provider: this.providerType,
            modelName,
            attempt,
            totalAttemptsInModel: 3,
            success: true,
            durationMs: Math.round(performance.now() - startedAt),
            kind: 'success',
          });

          return text;
        } catch (error: any) {
          lastError = error;
          const message = error?.message || String(error);
          const errorCode = typeof error?.status === 'number' ? error.status : undefined;
          logLlmCall({
            provider: this.providerType,
            modelName,
            attempt,
            totalAttemptsInModel: 3,
            success: false,
            durationMs: Math.round(performance.now() - startedAt),
            kind: 'attempt_failure',
            error: message.slice(0, 1000),
            errorCode,
          });

          console.warn(`Model ${modelName} failed on attempt ${attempt}/3:`, error.message || error);

          // If the model is not found (404), switch to the next fallback model immediately without retrying
          if (error.status === 404) {
            break;
          }

          // Exponential backoff for 503 Service Unavailable or 429 Rate Limit
          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
          }
        }
      }
    }

    console.error('All Gemini models in the fallback chain failed.', lastError);
    logLlmCall({
      provider: this.providerType,
      modelName: lastModelName,
      attempt: 3,
      totalAttemptsInModel: 3,
      success: false,
      durationMs: 0,
      kind: 'model_exhausted',
      error: lastError?.message ? String(lastError.message).slice(0, 1000) : 'Service Unavailable',
    });
    throw new Error(`Gemini API call failed: ${lastError?.message || 'Service Unavailable'}`);
  }
}

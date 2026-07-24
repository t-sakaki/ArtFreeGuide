import { GoogleGenerativeAI } from '@google/generative-ai';
import { LLMProvider, Message, LLMOptions } from './provider';

const DEFAULT_FALLBACK_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite'
];

export interface GeminiProviderConfig {
  apiKey?: string;
  defaultModel?: string;
}

export class GeminiProvider implements LLMProvider {
  private genAI: GoogleGenerativeAI;
  private fallbackModels: string[];

  constructor(config: GeminiProviderConfig = {}) {
    const apiKey = config.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[GeminiProvider] GEMINI_API_KEY environment variable is not set.');
    }
    this.genAI = new GoogleGenerativeAI(apiKey || 'dummy');

    const primaryModel = config.defaultModel || process.env.LLM_MODEL;
    if (primaryModel && primaryModel.startsWith('gemini')) {
      this.fallbackModels = Array.from(new Set([primaryModel, ...DEFAULT_FALLBACK_MODELS]));
    } else {
      this.fallbackModels = DEFAULT_FALLBACK_MODELS;
    }
  }

  async generateResponse(messages: Message[], options?: LLMOptions): Promise<string> {
    const contents = messages.map(msg => ({
      role: msg.role === 'user' || msg.role === 'system' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    let lastError: any = null;
    const modelChain = options?.model ? [options.model, ...this.fallbackModels] : this.fallbackModels;

    for (const modelName of modelChain) {
      for (let attempt = 1; attempt <= 3; attempt++) {
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

          return text;
        } catch (error: any) {
          lastError = error;
          console.warn(`Model ${modelName} failed on attempt ${attempt}/3:`, error.message || error);

          if (error.status === 404) {
            break;
          }

          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
          }
        }
      }
    }

    console.error('All Gemini models in the fallback chain failed.', lastError);
    throw new Error(`Gemini API call failed: ${lastError?.message || 'Service Unavailable'}`);
  }
}

import { LLMProvider, Message, LLMOptions } from './provider';

export interface NVIDIAProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

export class NVIDIAProvider implements LLMProvider {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(config: NVIDIAProviderConfig = {}) {
    this.apiKey = config.apiKey || process.env.NVIDIA_API_KEY || '';
    this.baseUrl = (config.baseUrl || process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/+$/, '');
    this.defaultModel = config.defaultModel || process.env.LLM_MODEL || 'google/gemma-4-31b-it';
  }

  async generateResponse(messages: Message[], options?: LLMOptions): Promise<string> {
    if (!this.apiKey) {
      console.warn('[NVIDIAProvider] NVIDIA_API_KEY is not set.');
    }

    const targetModel = options?.model || this.defaultModel;
    const endpoint = `${this.baseUrl}/chat/completions`;

    // Map messages to OpenAI standard format
    const formattedMessages = messages.map(msg => ({
      role: msg.role === 'model' ? 'assistant' : msg.role,
      content: msg.content
    }));

    const payload: Record<string, any> = {
      model: targetModel,
      messages: formattedMessages,
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.maxTokens ?? 4096
    };

    if (options?.json) {
      payload.response_format = { type: 'json_object' };
    }

    let lastError: any = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[NVIDIAProvider] Calling ${endpoint} (model: ${targetModel}, attempt: ${attempt}/3)`);

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status} ${response.statusText}: ${errorText}`);
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;

        if (!content) {
          throw new Error('Empty or invalid response structure from NVIDIA API');
        }

        return content;
      } catch (error: any) {
        lastError = error;
        console.warn(`[NVIDIAProvider] Attempt ${attempt}/3 failed:`, error.message || error);

        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        }
      }
    }

    console.error('[NVIDIAProvider] All retry attempts failed:', lastError);
    throw new Error(`NVIDIA LLM Provider Error: ${lastError?.message || 'Unknown failure'}`);
  }
}

export interface Message {
  role: 'user' | 'model' | 'system' | 'assistant';
  content: string;
}

export interface LLMOptions {
  json?: boolean;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMProvider {
  generateResponse(messages: Message[], options?: LLMOptions): Promise<string>;
}

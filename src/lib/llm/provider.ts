export interface Message {
  role: 'user' | 'model';
  content: string;
}

export interface LLMProvider {
  generateResponse(messages: Message[], options?: { json?: boolean }): Promise<string>;
}

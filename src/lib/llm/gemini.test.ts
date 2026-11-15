import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getGenerativeModel, generateContent } = vi.hoisted(() => ({
  getGenerativeModel: vi.fn(), generateContent: vi.fn(),
}));
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel = getGenerativeModel;
  },
}));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));
import { GeminiProvider } from './gemini';
import { getLLMProvider } from './index';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('GEMINI_API_KEY', 'test-key');
  vi.stubEnv('GEMINI_MODEL', '');
  getGenerativeModel.mockReturnValue({ generateContent });
  generateContent.mockResolvedValue({ response: { text: () => '{"status":"ok"}' } });
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

const messages = [{ role: 'user' as const, content: '星月夜' }];

describe('Gemini Hydrogen', () => {
  it('uses Hydrogen by default with JSON output for guides', async () => {
    expect(await new GeminiProvider().generateResponse(messages, { json: true })).toBe('{"status":"ok"}');
    expect(getGenerativeModel).toHaveBeenCalledExactlyOnceWith({
      model: 'gemini-4-hydrogen', generationConfig: { responseMimeType: 'application/json' },
    });
  });

  it('preserves environment model overrides', async () => {
    vi.stubEnv('GEMINI_MODEL', 'custom-primary,custom-fallback');
    await new GeminiProvider().generateResponse(messages);
    expect(getGenerativeModel).toHaveBeenCalledWith({ model: 'custom-primary', generationConfig: undefined });
  });

  it('preserves an explicit model chain and model conversation roles', async () => {
    await new GeminiProvider(['explicit-model']).generateResponse([
      ...messages, { role: 'model', content: '解説' },
    ]);
    expect(getGenerativeModel).toHaveBeenCalledWith({ model: 'explicit-model', generationConfig: undefined });
    expect(generateContent).toHaveBeenCalledWith({ contents: [
      { role: 'user', parts: [{ text: '星月夜' }] },
      { role: 'model', parts: [{ text: '解説' }] },
    ] });
  });

  it('retains the previous fallback when Hydrogen is unavailable', async () => {
    generateContent.mockRejectedValueOnce(Object.assign(new Error('model unavailable'), { status: 404 }));
    await new GeminiProvider().generateResponse(messages);
    expect(getGenerativeModel.mock.calls.map(([config]) => config.model)).toEqual([
      'gemini-4-hydrogen', 'gemini-2.5-flash',
    ]);
  });

  it.each(['guide', 'ask', 'suggest'] as const)('resolves %s to Hydrogen through the factory', async task => {
    vi.stubEnv('LLM_PROVIDER', 'gemini');
    vi.stubEnv(`LLM_${task.toUpperCase()}_PROVIDER`, '');
    vi.stubEnv(`LLM_${task.toUpperCase()}_MODEL`, 'gemini-4-hydrogen');
    await getLLMProvider(task).generateResponse(messages);
    expect(getGenerativeModel).toHaveBeenCalledExactlyOnceWith({ model: 'gemini-4-hydrogen', generationConfig: undefined });
  });
});

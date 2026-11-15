import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { generateResponse, recordPastQuestion, createServiceClient } = vi.hoisted(() => ({
  generateResponse: vi.fn(), recordPastQuestion: vi.fn(), createServiceClient: vi.fn()
}));
vi.mock('@/lib/llm', () => ({ getLLMProvider: () => ({ generateResponse }) }));
vi.mock('@/lib/pastQuestions', () => ({ recordPastQuestion }));
vi.mock('@/lib/supabase', () => ({ createServiceClient }));
vi.mock('@/lib/i18n', () => ({ DEFAULT_LOCALE: 'ja', isLocale: () => true, outputLanguageInstruction: () => '日本語' }));
import { POST } from './route';

function request(overrides: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/ask', {
    method: 'POST', body: JSON.stringify({ title: '星月夜', artist: 'ゴッホ', question: 'なぜ青い？', ...overrides })
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  generateResponse.mockResolvedValue(' 回答です。 ');
  createServiceClient.mockReturnValue('service-client');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('ask question memory', () => {
  it('records an answered visitor question and keeps the response shape', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ answer: '回答です。' });
    expect(recordPastQuestion).toHaveBeenCalledWith('service-client', '星月夜', 'ゴッホ', 'なぜ青い？');
  });

  it('does not record automated deep dives or empty answers', async () => {
    await POST(request({ mode: 'deep_dive' }));
    generateResponse.mockResolvedValue(' ');
    await POST(request());
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(recordPastQuestion).not.toHaveBeenCalled();
  });

  it('does not record invalid requests or failed generation', async () => {
    expect((await POST(request({ question: '' }))).status).toBe(400);
    expect((await POST(request({ title: '' }))).status).toBe(400);
    generateResponse.mockRejectedValue(new Error('unavailable'));
    expect((await POST(request())).status).toBe(500);
    expect(recordPastQuestion).not.toHaveBeenCalled();
  });

  it('still returns an answer when storage or service configuration fails', async () => {
    recordPastQuestion.mockRejectedValueOnce(new Error('offline'));
    expect((await POST(request())).status).toBe(200);
    createServiceClient.mockImplementationOnce(() => { throw new Error('missing env'); });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ answer: '回答です。' });
  });
});

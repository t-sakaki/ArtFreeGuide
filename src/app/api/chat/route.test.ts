import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { generateResponse, put, get, logChatRequest } = vi.hoisted(() => ({
  generateResponse: vi.fn(), put: vi.fn(), get: vi.fn(), logChatRequest: vi.fn(),
}));
vi.mock('@/lib/appSettings', () => ({ getCachedSetting: vi.fn(), SETTINGS_KEYS: {} }));
vi.mock('@/lib/guideStore', () => ({ getGuideStore: () => ({ name: 'test', get, put }) }));
vi.mock('@/lib/llm', () => ({ getLLMProvider: () => ({ generateResponse }) }));
vi.mock('@/lib/llm/logger', () => ({ logChatRequest }));
vi.mock('@/lib/i18n', () => ({ DEFAULT_LOCALE: 'ja', isLocale: () => true }));
import { POST } from './route';

const guide = JSON.stringify({ short: '概要', standard: '文'.repeat(300), deep: '文'.repeat(400) });
const request = () => new Request('http://localhost/api/chat', {
  method: 'POST', body: JSON.stringify({ title: '星月夜', messages: [{ role: 'user', content: '星月夜' }] }),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('guide JSON regeneration', () => {
  it('retries malformed JSON and archives only the successful result', async () => {
    generateResponse.mockResolvedValueOnce('{broken}').mockResolvedValueOnce(guide);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).text).toBe(guide);
    expect(generateResponse).toHaveBeenCalledTimes(2);
    expect(generateResponse.mock.calls[1]).toEqual(generateResponse.mock.calls[0]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('JSON parse failure (retry 1/2)'));
    expect(put).toHaveBeenCalledExactlyOnceWith('星月夜', '', guide, 'ja');
  });

  it('allows a second retry', async () => {
    generateResponse.mockResolvedValueOnce('{broken}').mockResolvedValueOnce('').mockResolvedValueOnce(guide);
    expect((await POST(request())).status).toBe(200);
    expect(generateResponse).toHaveBeenCalledTimes(3);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('retry 2/2'));
  });

  it('returns an error after three malformed responses without archiving', async () => {
    generateResponse.mockResolvedValue('{broken}');
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect((await response.json()).error).toBeTruthy();
    expect(generateResponse).toHaveBeenCalledTimes(3);
    expect(put).not.toHaveBeenCalled();
    expect(logChatRequest).toHaveBeenCalledWith(expect.objectContaining({ llmAttempts: 3, success: false }));
  });

  it('does not regenerate a valid full-length guide', async () => {
    generateResponse.mockResolvedValue(guide);
    expect((await POST(request())).status).toBe(200);
    expect(generateResponse).toHaveBeenCalledTimes(1);
  });

  it('does not call the model on a cache hit', async () => {
    get.mockResolvedValue({ payload: guide });
    expect((await POST(request())).status).toBe(200);
    expect(generateResponse).not.toHaveBeenCalled();
  });

  it('does not add JSON retries to provider failures', async () => {
    generateResponse.mockRejectedValue(new Error('provider unavailable'));
    expect((await POST(request())).status).toBe(500);
    expect(generateResponse).toHaveBeenCalledTimes(1);
  });
});

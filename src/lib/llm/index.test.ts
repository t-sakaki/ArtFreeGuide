import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLLMProvider } from './index';

const { getCloudflareContext } = vi.hoisted(() => ({ getCloudflareContext: vi.fn() }));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext }));
vi.mock('@/lib/appSettings', () => ({ getCachedSetting: vi.fn(), SETTINGS_KEYS: {} }));
vi.mock('@/lib/guideStore', () => ({ getGuideStore: vi.fn() }));
vi.mock('@/lib/llm', () => import('./index'));
vi.mock('@/lib/llm/logger', () => ({ logChatRequest: vi.fn() }));
vi.mock('@/lib/i18n', () => ({ DEFAULT_LOCALE: 'ja', isLocale: () => true }));
import { POST } from '../../app/api/chat/route';

const payload = JSON.stringify({ short: '概要', standard: '文'.repeat(300), deep: '文'.repeat(400) });

beforeEach(() => {
  vi.stubEnv('LLM_PROVIDER', 'nvidia');
  vi.stubEnv('LLM_GUIDE_PROVIDER', '');
  vi.stubEnv('LLM_GUIDE_MODEL', '');
  vi.stubEnv('NVIDIA_MODEL', '');
  vi.stubEnv('NVIDIA_BASE_URL', '');
  vi.stubEnv('NVIDIA_API_KEY', 'test-key');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    choices: [{ message: { content: payload } }],
  }), { headers: { 'Content-Type': 'application/json' } })));
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  getCloudflareContext.mockReset();
});

describe('local LLM provider resolution (issue #42)', () => {
  it('uses NVIDIA from process.env without requiring a Cloudflare AI binding', async () => {
    const provider = getLLMProvider('guide');
    expect(await provider.generateResponse([{ role: 'user', content: '星月夜' }], { json: true })).toBe(payload);
    expect(getCloudflareContext).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledExactlyOnceWith('https://integrate.api.nvidia.com/v1/chat/completions', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
    }));
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('honours the local NVIDIA setting through /api/chat', async () => {
    const response = await POST(new Request('http://localhost/api/chat', {
      method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: '作品名: ひまわり / 作者: ゴッホ' }] }),
    }));
    expect(response.status).toBe(200);
    expect((await response.json()).text).toBe(payload);
    expect(getCloudflareContext).not.toHaveBeenCalled();
  });

  it('lets the per-task provider override the global provider', async () => {
    vi.stubEnv('LLM_PROVIDER', 'workers-ai');
    vi.stubEnv('LLM_GUIDE_PROVIDER', 'nvidia');
    expect(await getLLMProvider('guide').generateResponse([{ role: 'user', content: '星月夜' }])).toBe(payload);
    expect(getCloudflareContext).not.toHaveBeenCalled();
  });

  it('reports a missing NVIDIA key rather than an unsupported provider', () => {
    vi.stubEnv('NVIDIA_API_KEY', '');
    expect(() => getLLMProvider('guide')).toThrow('NVIDIA_API_KEY environment variable is not set');
  });
});

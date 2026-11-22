import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { geminiAdapter } from './gemini.mjs';

let repoRoot;
beforeEach(() => {
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'afg-gemini-test-'));
  for (const name of ['GEMINI_API_KEY', 'GOOGLE_AI_API_KEY', 'GEMINI_API_KEY_FREE']) {
    vi.stubEnv(name, '');
  }
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fs.rmSync(repoRoot, { recursive: true, force: true });
});

const job = { guideText: 'Test.', locale: 'en', voiceId: 'Puck', modelId: 'test', charCount: 5 };
const helpers = {
  buildNarrationSynthesisInput: () => ({ synthesisText: 'Test.', segments: [{ spoken: 'Test.' }] }),
};

describe('Gemini narration key isolation', () => {
  it('rejects default free mode with only a primary key before any API call', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-primary');
    expect(await geminiAdapter.checkPreflight({ repoRoot })).toMatchObject({ ok: false, missingKey: true });
    const result = await geminiAdapter.synthesize(job, { repoRoot, helpers });
    expect(result).toMatchObject({ status: 'error', fatal: true, keyTier: 'free' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not bypass free-mode protection through the primary alias', async () => {
    vi.stubEnv('GOOGLE_AI_API_KEY', 'test-alias');
    expect(await geminiAdapter.checkPreflight({ repoRoot })).toMatchObject({ ok: false });
    expect(await geminiAdapter.synthesize(job, { repoRoot, helpers, geminiKeyContext: { activeTier: 'free' } }))
      .toMatchObject({ status: 'error', fatal: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('accepts a free key from the local environment file without a primary key', async () => {
    fs.writeFileSync(path.join(repoRoot, '.env.local'), 'GEMINI_API_KEY_FREE=test-free\n');
    expect(await geminiAdapter.checkPreflight({ repoRoot })).toMatchObject({ ok: true, hasPrimary: false });
  });

  it('allows primary mode only when its key is configured', async () => {
    vi.stubEnv('GEMINI_API_KEY_FREE', 'test-free');
    expect(await geminiAdapter.checkPreflight({ repoRoot, keyTier: 'primary' })).toMatchObject({ ok: false });
    vi.stubEnv('GEMINI_API_KEY', 'test-primary');
    expect(await geminiAdapter.checkPreflight({ repoRoot, keyTier: 'primary' })).toMatchObject({ ok: true });
  });

  it('stops on free quota errors without using the paid key', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-primary');
    vi.stubEnv('GEMINI_API_KEY_FREE', 'test-free');
    fetch.mockResolvedValue({ ok: false, status: 429, text: async () => 'RESOURCE_EXHAUSTED' });
    const result = await geminiAdapter.synthesize(job, { repoRoot, helpers, geminiKeyContext: { activeTier: 'free' } });
    expect(result).toMatchObject({ status: 'error', keyTier: 'free', quotaExhausted: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain('test-free');
    expect(fetch.mock.calls[0][0]).not.toContain('test-primary');
  });

  it('allows an explicit primary run to fall back to the free key on quota errors', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-primary');
    vi.stubEnv('GEMINI_API_KEY_FREE', 'test-free');
    fetch.mockResolvedValue({ ok: false, status: 429, text: async () => 'RESOURCE_EXHAUSTED' });
    const context = { activeTier: 'primary' };
    const result = await geminiAdapter.synthesize(job, { repoRoot, helpers, geminiKeyContext: context });
    expect(result).toMatchObject({ keyTier: 'free', quotaExhausted: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(context.activeTier).toBe('free');
  });
});

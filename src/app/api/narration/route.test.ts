import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetCloudflareContext } = vi.hoisted(() => ({
  mockGetCloudflareContext: vi.fn(),
}));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mockGetCloudflareContext,
}));

import { GET } from './route';

describe('/api/narration GET', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('rejects missing or invalid parameters with 400', async () => {
    const req = new NextRequest('http://localhost/api/narration?mode=invalid&contentHash=abc');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns status=none when latest.json is missing', async () => {
    const get = vi.fn().mockResolvedValue(null);
    mockGetCloudflareContext.mockResolvedValue({
      env: { AUDIO: { get }, NARRATION_ENV: 'staging' },
    });

    const req = new NextRequest(
      'http://localhost/api/narration?artworkId=the-starry-night&locale=ja&mode=standard&contentHash=0123456789abcdef',
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'none' });
    expect(get).toHaveBeenCalledWith(
      'narration/staging/the-starry-night/ja/standard/0123456789abcdef/latest.json',
    );
  });

  it('returns ready manifest and audioUrl when present in R2', async () => {
    const manifest = {
      version: 1,
      artworkId: 'the-starry-night',
      canonicalTitle: '星月夜',
      canonicalArtist: 'フィンセント・ファン・ゴッホ',
      locale: 'ja',
      mode: 'standard',
      contentHash: '0123456789abcdef',
      voiceConfigHash: 'fedcba9876543210',
      provider: 'elevenlabs',
      modelId: 'eleven_multilingual_v2',
      voiceId: 'voice1',
      outputFormat: 'opus_48000_64',
      durationMs: 12000,
      byteLength: 96000,
      segments: [{ index: 0, startMs: 0, endMs: 12000 }],
      createdAt: '2026-11-17T00:00:00.000Z',
    };

    const get = vi.fn(async (key: string) => {
      if (key.endsWith('/latest.json')) {
        return { text: async () => JSON.stringify({ voiceConfigHash: 'fedcba9876543210' }) };
      }
      if (key.endsWith('/manifest.json')) {
        return { text: async () => JSON.stringify(manifest) };
      }
      return null;
    });

    mockGetCloudflareContext.mockResolvedValue({
      env: { AUDIO: { get }, NARRATION_ENV: 'staging' },
    });

    const req = new NextRequest(
      'http://localhost/api/narration?title=%E6%98%9F%E6%9C%88%E5%A4%9C&locale=ja&mode=standard&contentHash=0123456789abcdef',
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ready');
    expect(data.audioUrl).toContain('/api/narration/audio?');
    expect(data.audioUrl).toContain('artworkId=the-starry-night');
    expect(data.manifest.durationMs).toBe(12000);
  });
});

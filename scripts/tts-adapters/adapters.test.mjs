import { describe, it, expect } from 'vitest';
import { getTtsAdapter, listTtsProviders, resolveJobTtsConfig } from './registry.mjs';
import { isElevenLabsFatalError, splitSynthesisChunks } from './elevenlabs.mjs';

describe('TTS adapter registry and provider configuration', () => {
  it('registers elevenlabs, azure, and gemini adapters', () => {
    const providers = listTtsProviders();
    expect(providers).toContain('elevenlabs');
    expect(providers).toContain('azure');
    expect(providers).toContain('gemini');
    expect(() => getTtsAdapter('unknown-provider')).toThrow(/Unknown TTS provider/);
  });

  it('preserves default elevenlabs settings when no provider overrides are passed', () => {
    const cfg = resolveJobTtsConfig({ provider: 'elevenlabs' }, 'ja');
    expect(cfg.provider).toBe('elevenlabs');
    expect(cfg.voiceId).toBe('oRjJxMXs2RKFFbRt3qwK');
    expect(cfg.modelId).toBe('eleven_multilingual_v2');
    expect(cfg.outputFormat).toBe('opus_48000_64');
  });

  it('resolves per-locale provider, voice, and model overrides cleanly', () => {
    const opts = {
      provider: 'elevenlabs',
      providerOverrides: { ja: 'azure' },
      voiceOverrides: { ja: 'ja-JP-KeitaNeural', en: 'JBFqnCBsd6RMkjVDRZzb' },
      modelOverrides: { en: 'eleven_v4' },
    };

    const jaCfg = resolveJobTtsConfig(opts, 'ja');
    expect(jaCfg.provider).toBe('azure');
    expect(jaCfg.voiceId).toBe('ja-JP-KeitaNeural');
    expect(jaCfg.modelId).toBe('neural');
    expect(jaCfg.outputFormat).toBe('ogg-48khz-16bit-mono-opus');

    const enCfg = resolveJobTtsConfig(opts, 'en');
    expect(enCfg.provider).toBe('elevenlabs');
    expect(enCfg.voiceId).toBe('JBFqnCBsd6RMkjVDRZzb');
    expect(enCfg.modelId).toBe('eleven_v4');
  });

  it('deterministically assigns voices from a comma-separated pool per artworkId', () => {
    const opts = {
      provider: 'elevenlabs',
      voiceOverrides: { ja: 'GR4dBIFsYe57TxyrHKXz,ok4ERsdqy0XfV8XdOi3U' },
    };
    const pool = ['GR4dBIFsYe57TxyrHKXz', 'ok4ERsdqy0XfV8XdOi3U'];
    const slugs = [
      'girl-with-a-pearl-earring',
      'the-starry-night',
      'mona-lisa',
      'water-lilies',
      'the-scream',
      'sunflowers',
      'the-last-supper',
      'guernica',
    ];
    const assigned = slugs.map(slug => resolveJobTtsConfig(opts, 'ja', slug).voiceId);
    expect(assigned.every(id => pool.includes(id))).toBe(true);
    // Stable across repeated calls for the same artwork
    expect(resolveJobTtsConfig(opts, 'ja', 'mona-lisa').voiceId).toBe(assigned[2]);
    // Uses both voices across multiple works
    expect(new Set(assigned).size).toBe(2);
  });

  it('does not treat per-request text_too_long 400 errors as fatal account quota failures', () => {
    expect(
      isElevenLabsFatalError(
        400,
        '{"detail":{"type":"validation_error","code":"text_too_long","status":"max_character_limit_exceeded"}}',
      ),
    ).toBe(false);
    expect(isElevenLabsFatalError(401, '{"detail":{"status":"unauthorized"}}')).toBe(true);
    expect(isElevenLabsFatalError(402, '{"detail":{"status":"quota_exceeded"}}')).toBe(true);
    expect(isElevenLabsFatalError(429, '{"detail":{"status":"rate_limit_exceeded"}}')).toBe(true);
  });

  it('splits oversized segment lists cleanly below chunk char caps', () => {
    const segs = Array.from({ length: 10 }, (_, index) => ({
      index,
      raw: 'x',
      spoken: 'あ'.repeat(2500),
      startChar: index * 2501,
      endChar: index * 2501 + 2500,
    }));
    const chunks = splitSynthesisChunks(segs, 6000);
    expect(chunks.length).toBe(5);
    expect(chunks.flat().map(s => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  getDefaultPlaybackSpeed,
  getPlaybackSpeedStorageKey,
  getRecommendedPlaybackSpeed,
  isWebSpeechBaselineSpeed,
  parseValidPlaybackSpeed,
  resolveSpeedForTtsEngine,
} from './ttsSpeed';

describe('ttsSpeed', () => {
  it('returns locale-specific defaults for web-speech and 1.0x for neural/pre-generated TTS engines', () => {
    expect(getDefaultPlaybackSpeed('web-speech', 'ja')).toBe(1.5);
    expect(getDefaultPlaybackSpeed('web-speech', 'en')).toBe(1.2);
    expect(getDefaultPlaybackSpeed('web-speech', 'it')).toBe(1.2);

    expect(getDefaultPlaybackSpeed('elevenlabs', 'ja')).toBe(1.0);
    expect(getDefaultPlaybackSpeed('elevenlabs', 'en')).toBe(1.0);
    expect(getDefaultPlaybackSpeed('azure', 'ja')).toBe(1.0);
    expect(getDefaultPlaybackSpeed('gemini', 'ja')).toBe(1.0);
    expect(getDefaultPlaybackSpeed('edge-tts', 'ja')).toBe(1.0);
    expect(getDefaultPlaybackSpeed('nim', 'ja')).toBe(1.0);
  });

  it('returns 1.0x recommended slider target for ElevenLabs and preserves Web Speech targets', () => {
    expect(getRecommendedPlaybackSpeed('elevenlabs', 'ja')).toBe(1.0);
    expect(getRecommendedPlaybackSpeed('elevenlabs', 'en')).toBe(1.0);
    expect(getRecommendedPlaybackSpeed('web-speech', 'ja')).toBe(1.7);
    expect(getRecommendedPlaybackSpeed('web-speech', 'en')).toBe(1.2);
  });

  it('isolates localStorage keys per TTS engine while keeping the legacy key for web-speech', () => {
    expect(getPlaybackSpeedStorageKey('web-speech')).toBe('art_free_guide_playback_speed');
    expect(getPlaybackSpeedStorageKey('elevenlabs')).toBe('art_free_guide_playback_speed:elevenlabs');
    expect(getPlaybackSpeedStorageKey('azure')).toBe('art_free_guide_playback_speed:azure');
  });

  it('validates playback speed strings within [0.8, 2.5]', () => {
    expect(parseValidPlaybackSpeed('1.0')).toBe(1.0);
    expect(parseValidPlaybackSpeed('0.8')).toBe(0.8);
    expect(parseValidPlaybackSpeed('2.5')).toBe(2.5);
    expect(parseValidPlaybackSpeed('0.5')).toBeNull();
    expect(parseValidPlaybackSpeed('3.0')).toBeNull();
    expect(parseValidPlaybackSpeed('abc')).toBeNull();
    expect(parseValidPlaybackSpeed(null)).toBeNull();
  });

  it('detects Web Speech baseline speeds per locale', () => {
    expect(isWebSpeechBaselineSpeed(1.5, 'ja')).toBe(true);
    expect(isWebSpeechBaselineSpeed(1.7, 'ja')).toBe(true);
    expect(isWebSpeechBaselineSpeed(1.2, 'ja')).toBe(false);
    expect(isWebSpeechBaselineSpeed(1.2, 'en')).toBe(true);
    expect(isWebSpeechBaselineSpeed(1.7, 'en')).toBe(false);
  });

  it('resolves ElevenLabs to 1.0x even when a Web Speech baseline ?speed=1.7 is in the URL', () => {
    expect(
      resolveSpeedForTtsEngine({
        engine: 'elevenlabs',
        locale: 'ja',
        savedSpeed: null,
        urlSpeed: 1.7,
      }),
    ).toBe(1.0);

    expect(
      resolveSpeedForTtsEngine({
        engine: 'elevenlabs',
        locale: 'ja',
        savedSpeed: null,
        urlSpeed: 1.5,
      }),
    ).toBe(1.0);
  });

  it('honors explicit non-baseline ?speed= URL overrides on ElevenLabs', () => {
    expect(
      resolveSpeedForTtsEngine({
        engine: 'elevenlabs',
        locale: 'ja',
        savedSpeed: null,
        urlSpeed: 1.2,
      }),
    ).toBe(1.2);

    expect(
      resolveSpeedForTtsEngine({
        engine: 'elevenlabs',
        locale: 'ja',
        savedSpeed: null,
        urlSpeed: 2.0,
      }),
    ).toBe(2.0);
  });

  it('respects per-engine saved preference and isolates Web Speech speed from ElevenLabs', () => {
    expect(
      resolveSpeedForTtsEngine({
        engine: 'elevenlabs',
        locale: 'ja',
        savedSpeed: 1.25,
        urlSpeed: 1.7,
      }),
    ).toBe(1.25);

    expect(
      resolveSpeedForTtsEngine({
        engine: 'web-speech',
        locale: 'ja',
        savedSpeed: 1.7,
        urlSpeed: null,
      }),
    ).toBe(1.7);

    expect(
      resolveSpeedForTtsEngine({
        engine: 'web-speech',
        locale: 'ja',
        savedSpeed: null,
        urlSpeed: 1.7,
      }),
    ).toBe(1.7);
  });
});

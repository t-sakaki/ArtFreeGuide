import { DEFAULT_PLAYBACK_SPEED, Locale } from './i18n';
import type { NarrationProvider } from './narration';

export type TtsEngine = 'web-speech' | NarrationProvider;

export const PLAYBACK_SPEED_MIN = 0.8;
export const PLAYBACK_SPEED_MAX = 2.5;

const WEB_SPEECH_STORAGE_KEY = 'art_free_guide_playback_speed';

/**
 * Default playback speed per pre-generated / neural TTS engine.
 * Browser Web Speech voices read slowly in several languages (especially ja),
 * whereas pre-generated studio voices (ElevenLabs, Azure, Gemini, Edge TTS,
 * NIM) are already paced naturally at 1.0x.
 */
export const TTS_DEFAULT_PLAYBACK_SPEED: Partial<Record<TtsEngine, number>> = {
  elevenlabs: 1.0,
  azure: 1.0,
  gemini: 1.0,
  'edge-tts': 1.0,
  nim: 1.0,
};

export function getDefaultPlaybackSpeed(engine: TtsEngine, locale: Locale): number {
  if (engine === 'web-speech') {
    return DEFAULT_PLAYBACK_SPEED[locale] ?? 1.2;
  }
  return TTS_DEFAULT_PLAYBACK_SPEED[engine] ?? 1.0;
}

export function getRecommendedPlaybackSpeed(engine: TtsEngine, locale: Locale): number {
  if (engine === 'web-speech') {
    return locale === 'ja' ? 1.7 : (DEFAULT_PLAYBACK_SPEED[locale] ?? 1.2);
  }
  return TTS_DEFAULT_PLAYBACK_SPEED[engine] ?? 1.0;
}

export function getPlaybackSpeedStorageKey(engine: TtsEngine): string {
  return engine === 'web-speech'
    ? WEB_SPEECH_STORAGE_KEY
    : `${WEB_SPEECH_STORAGE_KEY}:${engine}`;
}

export function parseValidPlaybackSpeed(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < PLAYBACK_SPEED_MIN || parsed > PLAYBACK_SPEED_MAX) {
    return null;
  }
  return parsed;
}

/**
 * Speeds matching Web Speech's built-in defaults (e.g. 1.5x / 1.7x in ja,
 * 1.2x in en) are automatically written into `?speed=` by `syncUrlState()`.
 * When a pre-generated TTS engine (such as ElevenLabs) becomes active, those
 * Web Speech baseline speeds yield to the new engine's default (1.0x) unless
 * the visitor has saved an explicit preference for that engine.
 */
export function isWebSpeechBaselineSpeed(speed: number, locale: Locale): boolean {
  const candidates = [
    getDefaultPlaybackSpeed('web-speech', locale),
    getRecommendedPlaybackSpeed('web-speech', locale),
  ];
  return candidates.some(candidate => Math.abs(speed - candidate) < 0.01);
}

export function resolveSpeedForTtsEngine(options: {
  engine: TtsEngine;
  locale: Locale;
  savedSpeed: number | null;
  urlSpeed: number | null;
}): number {
  const { engine, locale, savedSpeed, urlSpeed } = options;

  if (urlSpeed !== null) {
    if (engine === 'web-speech' || !isWebSpeechBaselineSpeed(urlSpeed, locale)) {
      return urlSpeed;
    }
  }

  if (savedSpeed !== null) {
    return savedSpeed;
  }

  return getDefaultPlaybackSpeed(engine, locale);
}

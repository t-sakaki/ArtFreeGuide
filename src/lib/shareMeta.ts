import { Locale } from './i18n';

/** Copy for the card a shared link unfurls into, in the sharer's language. */
export const SHARE_META: Partial<Record<
  Locale,
  { siteName: string; tagline: string; guide: (artwork: string) => string }
>> = {
  ja: {
    siteName: 'ArtFreeGuide',
    tagline: 'AIキュレーターが贈る、あなたのための特別な音声ガイド。',
    guide: artwork => `${artwork}｜ArtFreeGuide の音声ガイド`
  },
  en: {
    siteName: 'ArtFreeGuide',
    tagline: 'An AI curator’s audio guide, made for you.',
    guide: artwork => `${artwork} | Audio guide on ArtFreeGuide`
  },
  fr: {
    siteName: 'ArtFreeGuide',
    tagline: 'Le guide audio d’un conservateur IA, rien que pour vous.',
    guide: artwork => `${artwork} | Guide audio sur ArtFreeGuide`
  },
  es: {
    siteName: 'ArtFreeGuide',
    tagline: 'La audioguía de un curador con IA, hecha para ti.',
    guide: artwork => `${artwork} | Audioguía en ArtFreeGuide`
  },
  zh: {
    siteName: 'ArtFreeGuide',
    tagline: 'AI 策展人为你打造的专属语音导览。',
    guide: artwork => `${artwork}｜ArtFreeGuide 语音导览`
  }
};

/** The opening of the guide, trimmed to what a preview card actually shows. */
export function previewText(text: string, limit = 140): string {
  const flat = text
    .replace(/\\{1,2}[rnt]/g, ' ')
    .replace(/[#*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}

import { findHotspotSet, localizeHotspot } from './hotspots';
import { Locale } from './i18n';
import { localizeName } from './names';

/**
 * Question chips are built locally rather than asked of the LLM: they must be on
 * screen the moment the guide starts, and a wrong-but-instant chip is worse than
 * no chip only if it is off-topic, which templates never are.
 */
const TEMPLATES: Record<Locale, {
  hotspot: (label: string) => string;
  artist: (artist: string) => string;
  general: string[];
}> = {
  ja: {
    hotspot: label => `「${label}」には何の意味がありますか？`,
    artist: artist => `${artist}はどんな人だったのですか？`,
    general: [
      'この作品はどこで実物を見られますか？',
      '描かれた当時、どう受け止められたのですか？',
      'どんな技法で描かれているのですか？',
    ],
  },
  en: {
    hotspot: label => `What does “${label}” mean?`,
    artist: artist => `What kind of person was ${artist}?`,
    general: [
      'Where can I see this work in person?',
      'How was it received when it was made?',
      'What technique was used to make it?',
    ],
  },
  fr: {
    hotspot: label => `Que signifie « ${label} » ?`,
    artist: artist => `Quel genre de personne était ${artist} ?`,
    general: [
      'Où peut-on voir cette œuvre en vrai ?',
      'Comment a-t-elle été reçue à l’époque ?',
      'Quelle technique a été employée ?',
    ],
  },
  es: {
    hotspot: label => `¿Qué significa «${label}»?`,
    artist: artist => `¿Qué clase de persona fue ${artist}?`,
    general: [
      '¿Dónde puedo ver esta obra en persona?',
      '¿Cómo se recibió en su época?',
      '¿Qué técnica se empleó?',
    ],
  },
  zh: {
    hotspot: label => `「${label}」有什么含义？`,
    artist: artist => `${artist}是怎样一个人？`,
    general: [
      '这件作品的真迹在哪里可以看到？',
      '在当时它是如何被看待的？',
      '它使用了什么技法？',
    ],
  },
};

export function suggestedQuestions(title: string, artist: string, locale: Locale = 'ja'): string[] {
  const template = TEMPLATES[locale];
  const questions: string[] = [];

  const set = findHotspotSet(title, artist);
  const spots = set?.hotspots ?? [];
  if (spots.length > 0) {
    questions.push(template.hotspot(localizeHotspot(spots[0], locale).label));
  }

  if (artist.trim()) {
    questions.push(template.artist(localizeName(artist.trim(), locale)));
  }

  questions.push(...template.general);

  // Three chips fit two lines on a phone; a fourth turns the row into a wall.
  return questions.slice(0, 3);
}

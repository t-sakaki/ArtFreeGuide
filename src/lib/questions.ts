import { findHotspotSet, localizeHotspot } from './hotspots';
import { Locale } from './i18n';
import { localizeName } from './names';

/**
 * Question chips are built locally rather than asked of the LLM: they must be on
 * screen the moment the guide starts, and a wrong-but-instant chip is worse than
 * no chip only if it is off-topic, which templates never are.
 */
const TEMPLATES: Partial<Record<Locale, {
  hotspot: (label: string) => string;
  artist: (artist: string) => string;
  general: string[];
}>> = {
  ja: {
    hotspot: label => `「${label}」の描写から、作者のどんな意図が読み取れますか？`,
    artist: artist => `${artist}の人生で、この作品の制作に影響した出来事は何ですか？`,
    general: [
      'この作品の背景に、作者のどんな時代の焦りや希望が投影されていますか？',
      'もしこの構図に隠されたメッセージがあるとしたら、それは何ですか？',
      '他の時代の同じテーマを扱う名作と比べて、この作品の独自性はどこにありますか？',
    ],
  },
  en: {
    hotspot: label => `What intention does the depiction of “${label}” reveal?`,
    artist: artist => `What events in ${artist}'s life influenced the making of this work?`,
    general: [
      'What anxieties or hopes of that era are projected into this work?',
      'If there is a hidden message in the composition, what might it be?',
      'Compared with other famous works on the same theme, where does this one stand apart?',
    ],
  },
  fr: {
    hotspot: label => `Que révèle la représentation de « ${label} » sur l’intention de l’artiste ?`,
    artist: artist => `Quels événements de la vie de ${artist} ont influencé la création de cette œuvre ?`,
    general: [
      `Quelles angoisses ou quels espoirs de l'époque sont projetés dans cette œuvre ?`,
      'Si la composition cache un message, quel pourrait-il être ?',
      `Comparée à d’autres œuvres célèbres sur le même thème, en quoi celle-ci se distingue-t-elle ?`,
    ],
  },
  es: {
    hotspot: label => `¿Qué intención revela la representación de «${label}»?`,
    artist: artist => `¿Qué acontecimientos de la vida de ${artist} influyeron en esta obra?`,
    general: [
      '¿Qué angustias o esperanzas de la época se proyectan en esta obra?',
      'Si la composición esconde un mensaje, ¿cuál podría ser?',
      `Comparada con otras obras famosas sobre el mismo tema, ¿en qué destaca esta?`,
    ],
  },
  zh: {
    hotspot: label => `从对「${label}」的描绘中，能看出作者怎样的意图？`,
    artist: artist => `${artist}人生中，哪些经历影响了这件作品的创作？`,
    general: [
      '这件作品里，映射了作者所处时代怎样的焦虑与希望？',
      '如果构图里藏着一个隐喻，它可能是什么？',
      '与其他同主题的名作相比，这件作品的独特性体现在哪里？',
    ],
  },
};

export function suggestedQuestions(title: string, artist: string, locale: Locale = 'ja'): string[] {
  const template = TEMPLATES[locale] ?? TEMPLATES['en']!;
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

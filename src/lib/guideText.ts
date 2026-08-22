// CommonMark only opens emphasis when the delimiter run touches text on the
// inside and whitespace or punctuation on the outside. Japanese guides break
// that rule constantly (`…した**「トロニー」**という…`), so the markers end up on
// screen verbatim. Emphasis the renderer would honour is kept; everything else
// loses its markers.
const OUTSIDE_SAFE_BEFORE = /[\s([{"'\u2018\u201c\u2014-]/;
const OUTSIDE_SAFE_AFTER = /[\s)\]}"'.,;:!?\u2019\u201d\u2014-]/;

const PLACEHOLDER = '\u0000';

function protectRenderableEmphasis(text: string, kept: string[]): string {
  return (['**', '__', '*', '_'] as const).reduce((current, marker) => {
    const escaped = marker.replace(/[*]/g, '\\*');
    const pattern = new RegExp(`${escaped}([^\\s*_][^*_\\n]*?)${escaped}`, 'g');

    return current.replace(pattern, (match, inner: string, offset: number) => {
      const before = offset === 0 ? '' : current[offset - 1];
      const after = current[offset + match.length] ?? '';
      const renders =
        (before === '' || OUTSIDE_SAFE_BEFORE.test(before)) &&
        (after === '' || OUTSIDE_SAFE_AFTER.test(after));

      if (!renders) return inner;
      kept.push(match);
      return `${PLACEHOLDER}${kept.length - 1}${PLACEHOLDER}`;
    });
  }, text);
}

// A model asked for prose sometimes answers with the guide JSON template, or
// thinks out loud in English ("Let's count characters..."). Such text must
// never reach the screen or the archive, so both the client and the archive
// endpoint refuse it.
const SCAFFOLDING_PATTERNS = [
  /"(short|standard|deep|searchQuery|hotspots|music)"\s*:/,
  /^\s*[{[]/,
  /\b(Let's|Let us|We need to|Now we need|I need to|Let me)\b/i,
  /<\/?think>/i
];

export function looksLikeModelScaffolding(text: string): boolean {
  return SCAFFOLDING_PATTERNS.some(pattern => pattern.test(text));
}

const GREETING_PATTERNS: Record<string, RegExp> = {
  ja: /^[　\s]*(こんにちは|こんばんは|ようこそ|皆様|視聴者の皆様|初めまして|はじめまして)[。、！!？?]?[　\s]*/,
  en: /^[　\s]*(hello|hi|welcome|dear listeners|greetings)[,.!?]?[　\s]*/i,
  fr: /^[　\s]*(bonjour|bonsoir|bienvenue|salut)[,.!?]?[　\s]*/i,
  zh: /^[　\s]*(你好|欢迎|您好)[，。！？]?[　\s]*/,
  es: /^[　\s]*(hola|bienvenido)[,.!?]?[　\s]*/i,
  de: /^[　\s]*(hallo|guten tag|willkommen)[,.!?]?[　\s]*/i,
  it: /^[　\s]*(ciao|buongiorno|benvenuto)[,.!?]?[　\s]*/i,
  ko: /^[　\s]*(안녕하세요|환영합니다)[,.!?]?[　\s]*/,
};

const COMBINED_GREETING_PATTERN =
  /^[　\s]*(こんにちは|こんばんは|ようこそ|皆様|視聴者の皆様|初めまして|はじめまして|hello|hi|welcome|dear listeners|greetings|bonjour|bonsoir|bienvenue|salut|你好|欢迎|您好|hola|bienvenido|hallo|guten tag|willkommen|ciao|buongiorno|benvenuto|안녕하세요|환영합니다)[。、，,.!！?？]?[　\s]*/i;

// Scaffolding section header titles from the system prompt template that models occasionally leak
const PROMPT_SECTION_TITLES =
  /^[　\s]*(?:[0-9]+[.\s]*)?(?:##\s*)?(?:\*\*)?(?:作品への歓迎と導入|作品の導入と視覚的描写|基本情報と視覚的解説|基本情報|視覚的な解説(?:（描写）)?|画家の想いや背景|鑑賞のヒント)(?:\*\*)?[：:]?[　\s]*$/gm;

export function stripLeadingGreeting(text: string, locale?: string): string {
  if (!text) return text;
  const pattern = (locale && GREETING_PATTERNS[locale]) || COMBINED_GREETING_PATTERN;
  return text.replace(pattern, '');
}

/**
 * Makes a stored guide safe to display. Models leak JSON escapes (a literal
 * `\n`, sometimes double-escaped), introductory greetings ("こんにちは"),
 * prompt scaffolding section titles, and markdown the renderer cannot honour.
 * Guides written before a prompt fix keep those artefacts forever — so the
 * repair runs on the way to the screen rather than at generation time.
 */
export function sanitizeGuideText(text: string, locale?: string): string {
  const withoutEscapes = text
    .replace(/\\{1,2}r\\{1,2}n|\\{1,2}[rn]/g, '\n')
    .replace(/\\{1,2}t/g, ' ')
    .replace(/\\{1,2}"/g, '"')
    .replace(/\\{2,}/g, '\\')
    .replace(/\\+[ \t]*$/gm, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '');

  // 1. Remove prompt scaffolding section headers if leaked into the text
  const withoutScaffolding = withoutEscapes.replace(PROMPT_SECTION_TITLES, '');

  // 2. Strip greetings at line/paragraph starts as well as text start
  const greetingPattern = (locale && GREETING_PATTERNS[locale]) || COMBINED_GREETING_PATTERN;
  const flags = new Set(greetingPattern.flags.split(''));
  flags.add('g');
  flags.add('m');
  const multilineGreeting = new RegExp(greetingPattern.source, Array.from(flags).join(''));
  const withoutGreeting = withoutScaffolding.replace(multilineGreeting, '');

  const kept: string[] = [];
  const stripped = protectRenderableEmphasis(withoutGreeting, kept)
    .split('\n')
    // Unpaired markers are left over, and they can only render as themselves.
    // A leading `* ` is a list bullet, so it stays.
    .map(line => {
      const bullet = /^([ \t]*)\*[ \t]/.exec(line);
      const body = bullet ? line.slice(bullet[0].length) : line;
      return `${bullet ? bullet[0] : ''}${body.replace(/\*+/g, '')}`;
    })
    .join('\n');

  return kept
    .reduce(
      (current, emphasis, index) =>
        current.replace(`${PLACEHOLDER}${index}${PLACEHOLDER}`, emphasis),
      stripped
    )
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/^[\s"']+|[\s"']+$/g, '')
    .trim();
}

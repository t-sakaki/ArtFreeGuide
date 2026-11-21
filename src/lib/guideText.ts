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
  ja: /^[　\s]*(こんにちは|こんばんは|ようこそ|皆様|視聴者の皆様|みなさん|皆さん|初めまして|はじめまして)(?:[。、！!？?]+[　\s]*|[　\s]+|$)/,
  en: /^[　\s]*(hello|hi|welcome(?!\s+to\b)|dear listeners|greetings)(?:[,.!?]+[　\s]*|[　\s]+|$)/i,
  fr: /^[　\s]*(bonjour|bonsoir|bienvenue(?!\s+(?:à|au|aux|dans|sur|chez)\b)|salut)(?:[,.!?]+[　\s]*|[　\s]+|$)/i,
  zh: /^[　\s]*(你好|欢迎|您好|大家好)(?:[，。！？!]+[　\s]*|[　\s]+|$)/,
  es: /^[　\s]*(hola|bienvenido)(?:[,.!?]+[　\s]*|[　\s]+|$)/i,
  de: /^[　\s]*(hallo|guten tag|willkommen)(?:[,.!?]+[　\s]*|[　\s]+|$)/i,
  it: /^[　\s]*(ciao|buongiorno|benvenuto)(?:[,.!?]+[　\s]*|[　\s]+|$)/i,
  ko: /^[　\s]*(안녕하세요|환영합니다)(?:[,.!?]+[　\s]*|[　\s]+|$)/,
};

const COMBINED_GREETING_PATTERN =
  /^[　\s]*(こんにちは|こんばんは|ようこそ|皆様|視聴者の皆様|みなさん|皆さん|初めまして|はじめまして|hello|hi|welcome(?!\s+to\b)|dear listeners|greetings|bonjour|bonsoir|bienvenue(?!\s+(?:à|au|aux|dans|sur|chez)\b)|salut|你好|欢迎|您好|大家好|hola|bienvenido|hallo|guten tag|willkommen|ciao|buongiorno|benvenuto|안녕하세요|환영합니다)(?:[。、，,.!！?？]+[　\s]*|[　\s]+|$)/i;

function stripGreetingPrefixLoop(input: string, pattern: RegExp): string {
  let current = input;
  while (true) {
    const next = current.replace(pattern, '');
    if (next === current) return current;
    current = next;
  }
}

function normalizePromptLeakedHeading(line: string): string {
  return line
    .replace(/^(\s*#{1,6}\s+)作品への歓迎と導入\s*$/, '$1導入')
    .replace(/^(\s*#{1,6}\s+)Accueil et introduction\s*$/i, '$1Introduction');
}

export function stripLeadingGreeting(text: string, locale?: string): string {
  if (!text) return text;
  const pattern = (locale && GREETING_PATTERNS[locale]) || COMBINED_GREETING_PATTERN;

  const lines = text.split('\n');
  let expectSectionStart = true;
  const cleanedLines: string[] = [];

  for (const rawLine of lines) {
    const line = normalizePromptLeakedHeading(rawLine);
    if (/^\s*$/.test(line)) {
      if (cleanedLines.length > 0) cleanedLines.push('');
      continue;
    }

    if (/^\s*#{1,6}\s+/.test(line)) {
      cleanedLines.push(line);
      expectSectionStart = true;
      continue;
    }

    if (expectSectionStart) {
      const stripped = stripGreetingPrefixLoop(line, pattern);
      if (stripped.trim().length === 0) {
        continue;
      }
      cleanedLines.push(stripped);
      expectSectionStart = false;
    } else {
      cleanedLines.push(line);
    }
  }

  return cleanedLines.join('\n').replace(/^\n+/, '');
}

/**
 * Makes a stored guide safe to display. Models leak JSON escapes (a literal
 * `\n`, sometimes double-escaped), introductory greetings ("こんにちは"), and
 * markdown the renderer cannot honour, and guides written before a prompt fix
 * keep those artefacts forever — so the repair runs on the way to the screen
 * rather than at generation time.
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

  const withoutGreeting = stripLeadingGreeting(withoutEscapes, locale);

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

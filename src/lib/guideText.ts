// CommonMark only opens emphasis when the delimiter run touches text on the
// inside and whitespace or punctuation on the outside. Japanese guides break
// that rule constantly (`…した**「トロニー」**という…`), so the markers end up on
// screen verbatim. Emphasis the renderer would honour is kept; everything else
// loses its markers.
const OUTSIDE_SAFE_BEFORE = /[\s([{"'\u2018\u201c\u2014-]/;
const OUTSIDE_SAFE_AFTER = /[\s)\]}\"'.,;:!?\u2019\u201d\u2014-]/;

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

import { sanitizeText } from './sanitizer';
import type { SanitizeRule } from './ruleManager';
import L1_RULES from '@/config/sanitizeRules.json';

/** L1 ルール配列を sanitizeText 向けに正規化して返す（パース失敗時は空配列）。 */
function defaultRules(): SanitizeRule[] {
  try {
    const parsed = JSON.parse(JSON.stringify(L1_RULES));
    if (Array.isArray(parsed.rules)) return parsed.rules as SanitizeRule[];
  } catch {
    // ファイル破損時は空配列 — アプリが落ちないようにする
  }
  return [];
}

/**
 * Makes a stored guide safe to display. Models leak JSON escapes (a literal
 * `\n`, sometimes double-escaped) and markdown the renderer cannot honour, and
 * guides written before a prompt fix keep those artefacts forever — so the
 * repair runs on the way to the screen rather than at generation time.
 *
 * 実際の除去ロジックは `sanitizer.sanitizeText` に委譲する（ハードコーディングしない）。
 */
export function sanitizeGuideText(text: string): string {
  return sanitizeText(text, defaultRules(), { tier: 'standard' });
}

/**
 * Removes leading greetings that should only appear in the short tier, so
 * standard and deep guides start directly with the heading and body.
 *
 * 実際の除去ロジックは `sanitizer.sanitizeText` の `remove_leading_greeting`
 * ハンドラに委譲し、挨拶信号語も sanitizeRules.json から動的に受け取る
 *（ハードコーディングしない）。
 */
export function stripLeadingGreeting(text: string): string {
  return sanitizeText(text, defaultRules().filter(r => r.action === 'remove_leading_greeting'), { tier: 'standard' });
}

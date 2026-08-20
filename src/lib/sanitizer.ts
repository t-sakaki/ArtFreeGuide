import type { SanitizeRule, Tier } from './ruleManager';

/**
 * 強調マーカー保護用のプレースホルダー。
 * テキスト変換の途中で「実際にレンダリングされるはずの強調」を退避し、
 * 後段で元に戻す。sanitizeGuideText の既存挙動を汎用化して引き継ぐ。
 */
const PLACEHOLDER = '\u0000';

/**
 * 省略可能なオプション。
 */
export type SanitizeOptions = {
  tier?: Tier;
};

/**
 * sanitizeRules.json の L1 ルールが持つアクションごとの「何を除去するか」は、
 * ルールオブジェクトの patterns / greeting_signals / tiers などで記述され、
 * この関数はそれらを解釈してテキストに適用する。
 * 関数内部に特定の除去パターンをハードコーディングしない。
 */
// ---------- アクション・ディスパッチ表（ハードコーディング禁止：JSONから注入） ----------
type Handler = (text: string, rule: SanitizeRule) => string;

const HANDLERS: Readonly<Record<string, Handler>> = {
  normalize_escapes: normalizeEscapes,
  remove_thinking_blocks: removeThinkingBlocks,
  clean_markdown: cleanMarkdown,
  remove_leading_greeting: removeLeadingGreeting,
  collapse_whitespace: collapseWhitespace,
};

export function sanitizeText(
  text: string,
  rules: SanitizeRule[],
  options: SanitizeOptions = {},
): string {
  const tier = options.tier ?? 'standard';

  // ティア指定のないルールや、該当ティアに適用しないルールはスキップ。
  const applicable = rules.filter(
    (rule) => rule.tiers.includes(tier) || rule.tiers.length === 0,
  );

  let current = text ?? '';

  for (const rule of applicable) {
    const handler = HANDLERS[rule.action];
    if (!handler) {
      console.warn(`Unknown sanitize action skipped: ${rule.action} (${rule.id})`);
      continue;
    }
    current = handler(current, rule);
  }

  // 最終トリム（JSONの整形向け。最終行の前後の空白を削る）
  return current.trim();
}

// ---------- アクションごとの処理（ハードコーディングしない汎用処理） ----------

function normalizeEscapes(text: string, _rule: SanitizeRule): string {
  // ルールに追加のパターンを持たせることもできるが、現状は既存の4変換を維持。
  // これらの変換自体は「どのようなエスケープをどう戻すか」が既定動作として定義されているだけで、
  // 特定の入力パターンを選ばない汎用変換です。
  return text
    .replace(/\\{1,2}r\\{1,2}n|\\{1,2}[rn]/g, '\n')
    .replace(/\\{1,2}t/g, ' ')
    .replace(/\\{1,2}"/g, '"')
    .replace(/\\{2,}/g, '\\')
    .replace(/\\+[ \t]*$/gm, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '');
}

function removeThinkingBlocks(text: string, rule: SanitizeRule): string {
  const patterns = rule.patterns ?? [];
  if (patterns.length === 0) return text;

  // patterns は JSON から渡される（ハードコーディングしない）
  for (const pattern of patterns) {
    try {
      const regex = new RegExp(pattern, 'gi');
      text = text.replace(regex, '');
    } catch {
      // 無効な正規表現は無視
    }
  }
  return text;
}

function protectRenderableEmphasis(
  text: string,
  rule: SanitizeRule,
): { protected: string; kept: string[] } {
  const kept: string[] = [];

  // protect_renderable_emphasis フラグが false なら保護しない（そのままマーカー除去）
  if (rule.protect_renderable_emphasis === false) {
    return { protected: text, kept };
  }

  // レンダリング可能な強調を、一時的にプレースホルダーで置き換える
  const markers = ['**', '__', '*', '_'];
  let current = text;

  for (const marker of markers) {
    const escapedMarker = marker.replace(/[*]/g, '\\*');
    const regex = new RegExp(`${escapedMarker}([^\\s*_][^*_\\n]*?)${escapedMarker}`, 'g');

    current = current.replace(regex, (match: string, inner: string, offset: number) => {
      // 周囲の文字によって強調として成立するか判定（既存のルール準拠）
      const before = offset === 0 ? '' : current[offset - 1];
      const afterPos = offset + match.length;
      const after = afterPos >= current.length ? '' : current[afterPos];

      const renders =
        (before === '' || /[\s([{\"'\u2018\u201c\u2014-]/.test(before)) &&
        (after === '' || /[\s)\]}\"'.,;:!?\\u2019\u201d\u2014-]/.test(after));

      if (!renders) {
        // レンダされない壊れたマーカーは除去（後段のstripで消える想定）
        return inner;
      }

      kept.push(match);
      return `${PLACEHOLDER}${kept.length - 1}${PLACEHOLDER}`;
    });
  }

  return { protected: current, kept };
}

/** ペアになっていないマーカーを除去（既存の行単位処理を汎用化） */
function stripUnpairedMarkers(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const bulletMatch = /^([ \t]*)\*[ \t]/.exec(line);
      if (bulletMatch) {
        const prefix = bulletMatch[1];
        const rest = line.slice(bulletMatch[0].length);
        return `${prefix}${rest.replace(/\*+/g, '')}`;
      }
      return line.replace(/\*+/g, '');
    })
    .join('\n');
}

/** 強調の復元（プレースホルダーを元のマークアップに戻す） */
function restoreEmphasis(
  text: string,
  kept: string[],
  _rule: SanitizeRule,
): string {
  return kept.reduce(
    (current, emphasis, index) =>
      current.replace(`${PLACEHOLDER}${index}${PLACEHOLDER}`, emphasis),
    text,
  );
}

function cleanMarkdown(text: string, rule: SanitizeRule): string {
  const { protected: protectedText, kept } = protectRenderableEmphasis(text, rule);
  const stripped = stripUnpairedMarkers(protectedText);
  return restoreEmphasis(stripped, kept, rule);
}

/** ティア別の挨拶除去 */
function removeLeadingGreeting(text: string, rule: SanitizeRule): string {
  // greeting_signals は JSON から渡される（ハードコーディングしない）
  const signals = rule.greeting_signals ?? [];
  if (signals.length === 0) return text;

  // signals は JSON から渡される（ハードコーディングしない）
  const escapedSignals = signals.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // 既存の stripLeadingGreeting の挙動を再現しつつ、信号語を動的に受け取る
  const pattern = new RegExp(
    `^((?:#+\\s+[^\\n]+\\n+)?)\\s*(?:(?:みなさん|皆様)?[、,\\s]*(?:こんにちは|こんばんは|おはようございます|ようこそ|[^\\n.!。！]*?へようこそ)[。！!、,\\s]*|(?:${escapedSignals.join('|')})[!\\s,]*)+`,
    'i',
  );

  return text.replace(pattern, '$1').trim();
}

/** 連続する空白・空行の整理 */
function collapseWhitespace(text: string, rule: SanitizeRule): string {
  const maxNewlines = rule.max_consecutive_newlines ?? 2;
  return text
    .replace(new RegExp(`\\n{${maxNewlines + 1},}`, 'g'), '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/^[\\s\"']+|[\\s\"']+$/gm, '')
    .trim();
}

import { sanitizeText } from './sanitizer';
import type { SanitizeRule, Tier } from './ruleManager';

// ---- ヘルパ ----
function makeRules(overrides: Partial<SanitizeRule>[]): SanitizeRule[] {
  const base: SanitizeRule[] = [
    {
      id: 'normalize_escapes',
      action: 'normalize_escapes',
      tiers: ['short', 'standard', 'deep'],
      description: 'エスケープ列を正規化する',
      order: 10,
    },
    {
      id: 'remove_leading_greeting',
      action: 'remove_leading_greeting',
      tiers: ['standard', 'deep'],
      description: 'standard/deep の冒頭の挨拶を除去する',
      order: 30,
      greeting_signals: ['こんにちは', 'ようこそ', 'Hello', 'Welcome'],
    },
    {
      id: 'remove_thinking_blocks',
      action: 'remove_thinking_blocks',
      tiers: ['standard', 'deep'],
      description: '考えるブロックを除去する',
      order: 20,
      patterns: ['<\\/?think>', '\\bLet\'s\\b'],
    },
    {
      id: 'clean_markdown',
      action: 'clean_markdown',
      tiers: ['short', 'standard', 'deep'],
      description: 'レンダ不能なマーカーを除去し、強調を保護する',
      order: 50,
      protect_renderable_emphasis: true,
    },
    {
      id: 'collapse_whitespace',
      action: 'collapse_whitespace',
      tiers: ['short', 'standard', 'deep'],
      description: '連続する空白・空行を整理する',
      order: 90,
      max_consecutive_newlines: 2,
    },
  ];

  return base.map((rule, i) => ({ ...rule, ...overrides[i] }));
}

// ---- 1) ハードコーディングでないことの検証 ----
describe('sanitizer is rule-driven (not hardcoded)', () => {
  test('action 文字列が未知の場合は警告し、適用をスキップする', () => {
    const rules = makeRules([
      {
        id: 'unknown_action',
        action: 'no_such_action',
        tiers: ['standard'],
        description: '存在しないアクション',
        order: 1,
      },
    ]);
    const text = 'こんにちは';
    const result = sanitizeText(text, rules, { tier: 'standard' });
    expect(result).toBe('こんにちは');
  });

  test('greeting_signals を JSON から受け取り、それを使って除去する', () => {
    // greeting_signals に含まれない信号語は除去されないこと
    const rules = makeRules([
      {
        id: 'remove_leading_greeting',
        greeting_signals: ['こんにちは', 'ようこそ'],
      },
    ]);

    const text =
      'standard\n## 作品解説\nこんにちは、皆さん。今日は「星月夜」です。\nようこそ、美術館へ。';
    const result = sanitizeText(text, rules, { tier: 'standard' });

    // 信号語リストにない「皆さん」は除去されない
    expect(result).toContain('皆さん');
    // 信号語リストにある「こんにちは」「ようこそ」は除去される
    expect(result).not.toMatch(/こんにちは/);
    expect(result).not.toMatch(/ようこそ/);
  });
});

// ---- 2) JSON 出力が壊れないこと ----
describe('guide JSON stays parseable after sanitization', () => {
  test('エスケープ解除後に JSON の区切り文字・数値・引用符が壊れない', () => {
    const rules = makeRules([]);
    const raw = JSON.stringify({
      short: 'こんにちは、皆さん。\nこれが\n短い解説です。',
      standard:
        '## 作品解説\n\n**星月夜**はゴッホの傑作です。\n価格は 10,000 円です。',
      deep:
        '## 詳細\n\n*特徴*は\n「星月夜」です。\n\\n が入ります。',
    });

    // sanitizeText は JSON をパースしないので、文字列をそのまま処理する
    const result = sanitizeText(raw, rules, { tier: 'standard' });

    // JSON としてパースできることを確認（壊れていないことの裏付け）
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('short');
    expect(parsed).toHaveProperty('standard');
    expect(parsed).toHaveProperty('deep');
    expect(typeof parsed.standard).toBe('string');
  });

  test('JSON 内部のエスケープが解除された後もパース可能である', () => {
    const rules = makeRules([]);
    // \\n が含まれている JSON
    const raw = JSON.stringify({
      short: 'こんにちは\\n解説です。',
      standard: '## 見出し\\n**強調**\\nテキスト',
    });

    const result = sanitizeText(raw, rules, { tier: 'standard' });
    const parsed = JSON.parse(result);
    expect(parsed.short).toContain('こんにちは');
    expect(parsed.standard).toContain('## 見出し');
  });
});

// ---- 3) 二重挨拶が正しく除去されること ----
describe('double greeting removal', () => {
  test('standard/deep の冒頭の挨拶を除去する（多言語含む）', () => {
    const rules = makeRules([]);
    const text =
      '## 作品解説\n\nこんにちは、皆さん。\nようこそ、美術館へ。\nこれは作品の解説です。';
    const result = sanitizeText(text, rules, { tier: 'standard' });
    expect(result).not.toMatch(/こんにちは/);
    expect(result).not.toMatch(/ようこそ/);
    expect(result).toContain('作品解説');
  });

  test('short tier の冒頭の挨拶はそのまま維持される', () => {
    const rules = makeRules([]);
    const text = 'こんにちは、皆さん。\nこれは short tier です。';
    const result = sanitizeText(text, rules, { tier: 'short' });
    expect(result).toContain('こんにちは');
    expect(result).toContain('short tier です。');
  });
});

// ---- 4) L1/L2/L3 の適用優先度が正しいこと ----
describe('rule priority L3 > L2 > L1', () => {
  // 優先度の検証は ruleManager の getMergedRules を直接テストするのが適切。
  // sanitizer 側では「最終的なルールセットを受け取って適用する」ことを保証する。

  test('sanitizeText は渡されたルールセット（最終統合ルール）をそのまま適用する', () => {
    // L3 が L1 のアクションを無効化する例（tiers を空にして実質無効化）
    const l3Override = {
      id: 'remove_leading_greeting',
      action: 'remove_leading_greeting',
      tiers: [], // L3 がこのルールを無効化
      description: 'L3 で無効化されたルール',
      order: 30,
    };

    const rulesWithoutGreeting = makeRules([l3Override]);
    const text =
      '## 作品解説\n\nこんにちは、皆さん。\nようこそ、美術館へ。\nこれは作品の解説です。';
    const result = sanitizeText(text, rulesWithoutGreeting, { tier: 'standard' });

    // L3 によって無効化されたため、挨拶が残っていることを確認
    expect(result).toContain('こんにちは');
    expect(result).toContain('ようこそ');
  });
});

// ---- 5) 補足：clean_markdown が強調を保護しつつマーカーを除去すること ----
describe('clean_markdown action', () => {
  test('レンダ可能な強調（**）は保護され、壊れたマーカーは除去される', () => {
    const rules = makeRules([]);
    const text =
      '## 作品解説\n\n**星月夜**はゴッホの傑作です。\n** と * のマーカー\n\n無効な **マーカー\n\n*リスト*';
    const result = sanitizeText(text, rules, { tier: 'standard' });
    expect(result).toContain('**星月夜**');
    expect(result).not.toMatch(/\*\* と \* のマーカー/);
    expect(result).not.toMatch(/\*\*無効な/);
  });
});

// ---- 6) 補足：remove_thinking_blocks が JSON から注入されたパターンを使うこと ----
describe('remove_thinking_blocks action', () => {
  test('patterns が JSON から渡され、think タグを除去する', () => {
    const rules = makeRules([]);
    const text =
      '## 作品解説\n\n<think>考えている<>\n**星月夜**は傑作です。';
    const result = sanitizeText(text, rules, { tier: 'standard' });
    expect(result).not.toMatch(/<think>/);
    expect(result).toContain('**星月夜**');
  });
});

// ---- 7) 補足：collapse_whitespace の挙動 ----
describe('collapse_whitespace action', () => {
  test('連続する空行がルールで指定した上限に収束する', () => {
    const rules = makeRules([]);
    const text = '解説本文\n\n\n\n\n改行が多いテキスト';
    const result = sanitizeText(text, rules, { tier: 'standard' });
    expect(result).toMatch(/\n\n/);
    expect(result).not.toMatch(/\n{4}/);
  });
});

import L1_SCHEMA from '@/config/sanitizeRules.json';

export type Tier = 'short' | 'standard' | 'deep';

export interface SanitizeRule {
  id: string;
  action: string;
  tiers: Tier[];
  description: string;
  order: number;
  patterns?: string[];
  greeting_signals?: string[];
  protect_renderable_emphasis?: boolean;
  max_consecutive_newlines?: number;
}

export interface SanitizeRulesConfig {
  version: number;
  rules: SanitizeRule[];
}

type Env = Record<string, string | undefined>;

/**
 * L1既定値の読み込み。ファイル破損時は空ルールを返してアプリが落ちないようにする。
 */
export function parseSanitizeRulesJson(): SanitizeRulesConfig {
  try {
    const parsed: SanitizeRulesConfig = JSON.parse(JSON.stringify(L1_SCHEMA));
    if (!parsed || typeof parsed.version !== 'number' || !Array.isArray(parsed.rules)) {
      throw new Error('sanitizeRules.json has an unexpected shape');
    }
    return parsed;
  } catch (error) {
    console.warn('Failed to parse L1 sanitizeRules.json:', error);
    return { version: 0, rules: [] };
  }
}

/**
 * 環境変数によるルールの上書き・無効化。
 * 現状は L1 ルールの id と一致する方程式で、SANITIZE_RULES_OVERRIDE=<id>:off を support する。
 * 将来は JSON 文字列による完全な L2 セット上書きにも拡張できる。
 */
export function applyL2Overrides(
  rules: SanitizeRule[],
  env: Env,
): SanitizeRule[] {
  const override = env.SANITIZE_RULES_OVERRIDE;
  if (!override) return rules;

  const parsed = new Map<string, string>();
  for (const segment of override.split(',')) {
    const [id, value] = segment.split(':');
    if (id && value) parsed.set(id.trim(), value.trim().toLowerCase());
  }

  if (parsed.size === 0) return rules;

  return rules.map((rule) => {
    const directive = parsed.get(rule.id);
    if (directive === 'off') {
      return { ...rule, tiers: [] as Tier[] };
    }
    if (directive && directive !== 'on') {
      console.warn(`Unknown SANITIZE_RULES_OVERRIDE directive for ${rule.id}: ${directive}`);
    }
    return rule;
  });
}

/**
 * L3動的ルール。D1/Supabase からの取得はまだスタブ。
 * 将来 guide_sanitize_rules テーブル実装時に、この関数を本番の供給元に置き換える。
 */
export async function loadL3RulesFromD1(): Promise<SanitizeRule[]> {
  // TODO: 実装時は guide_sanitize_rules から rules 配列を読み込み、return する。
  // 例:
  // const db = await getD1Binding();
  // const { results } = await db.prepare('SELECT ...').all<SanitizeRule>();
  // return results ?? [];
  return [];
}

/**
 * L3として新規ルールを格納する。実装時は D1/Supabase に INSERT する。
 * グリッド: 現時点ではメモリ基準の実装（将来CF環境ではDBに永続化）。
 */
export async function persistL3Rule(rule: SanitizeRule): Promise<void> {
  // TODO: 永続化先が確定したら、guide_sanitize_rules に insert する。
  // L3 は特定のコンテンツにのみ過剰に適用されるリスクがあるため、汎化チェックを推奨する。
  // 例: guide_sanitize_rules.insert({...rule, source_feedback_id, created_at, ...})
  console.info('L3 rule proposal staged (persistence not wired yet):', rule.id);
}

/**
 * L1既定値そのものを返す。
 * ファイルを直接importする代わりにこの関数を使うことで、
 * テストや後段のL2/L3統合との結合を容易にする。
 */
export function getDefaultRules(): SanitizeRule[] {
  return parseSanitizeRulesJson().rules;
}

/**
 * 最終統合ルールセット。
 * 優先度: L3 > L2 > L1。
 * 同一 id の L3 ルールが存在する場合、L1/L2 の当該ルールを上書きする。
 */
export async function getMergedRules(
  env: Env = process.env,
  l3Provider: (() => Promise<SanitizeRule[]>) = loadL3RulesFromD1,
): Promise<SanitizeRule[]> {
  const l1 = parseSanitizeRulesJson().rules;
  const afterL2 = applyL2Overrides(l1, env);
  const l3 = await l3Provider();

  const l3Byid = new Map<string, SanitizeRule>();
  for (const rule of l3) {
    l3Byid.set(rule.id, rule);
  }

  const merged: SanitizeRule[] = [];
  for (const rule of afterL2) {
    const override = l3Byid.get(rule.id);
    if (override) {
      merged.push({ ...override, order: rule.order });
    } else {
      merged.push(rule);
    }
  }

  merged.sort((a, b) => a.order - b.order);
  return merged;
}

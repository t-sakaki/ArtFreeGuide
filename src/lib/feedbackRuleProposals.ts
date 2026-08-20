import { getLLMProvider, Message } from '@/lib/llm';
import { createServiceClient } from '@/lib/supabase';
import { getDefaultRules, persistL3Rule, type SanitizeRule, type Tier } from '@/lib/ruleManager';
import type { Locale } from '@/lib/i18n';

/** フィードバックコメントからルール提案トリガーを検出するキーワード→actionのマッピング。
 * 現時点はコード内に最小セットを定義（L2相当のenv overrideは後段で拡張）。
 * ハードコーディング禁止の原則に従い、このマッピング自体を将来はJSON/envから注入可能にする。
 */
const TRIGGER_MAP: Readonly<Array<{ keyword: string; action: string }>> = [
  { keyword: '二重', action: 'remove_leading_greeting' },
  { keyword: '重複', action: 'remove_leading_greeting' },
  { keyword: '挨拶', action: 'remove_leading_greeting' },
  { keyword: 'JSON', action: 'normalize_escapes' },
  { keyword: '壊れ', action: 'normalize_escapes' },
  { keyword: 'パース', action: 'normalize_escapes' },
  { keyword: '思考', action: 'remove_thinking_blocks' },
  { keyword: 'thinking', action: 'remove_thinking_blocks' },
  { keyword: "let's", action: 'remove_thinking_blocks' },
  { keyword: 'マーカー', action: 'clean_markdown' },
  { keyword: '強調', action: 'clean_markdown' },
  { keyword: '太字', action: 'clean_markdown' },
];

const PROPOSAL_TABLE = 'feedback_rule_proposals';

export interface RuleProposalRequest {
  title: string;
  artist: string;
  kind: string;
  comment: string;
  excerpt: string;
  locale: Locale;
}

/** 提案された L3 ルールを保管するレコード（承認キュー用）。 */
export interface FeedbackRuleProposalRecord {
  id: string;
  title: string;
  artist: string;
  kind: string;
  comment: string;
  locale: Locale;
  suggested_rule: string; // JSON.stringify された SanitizeRule
  source_feedback_id: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

/** フィードバックコメントから sanitize ルール提案を生成し、ステージング＋キューに積む。
 * 返り値 true = 提案を生成・ステージングした（承認キューにも積んだ）。
 * 偽陽性が含まれる可能性があるため、ルールは即座に適用しない（L3 は承認後に活性化する想定）。
 */
export async function proposeSanitizeRuleFromFeedback(request: RuleProposalRequest): Promise<boolean> {
  // 1) トリガー検出
  const comment = request.comment;
  if (!comment) return false;
  const detectedActions = new Set<string>();
  for (const { keyword, action } of TRIGGER_MAP) {
    if (comment.includes(keyword)) {
      detectedActions.add(action);
    }
  }
  if (detectedActions.size === 0) return false;

  // 2) 現行 L1 ルールを取得（LLM への参照用）
  const currentRules = getDefaultRules();
  const rulesJson = JSON.stringify(currentRules, null, 2);

  // 3) LLM にルール案生成を依頼
  const provider = getLLMProvider('ask');
  const messages: Message[] = [
    {
      role: 'user',
      content: `あなたは音声ガイドのキュレーターを支援する AI です。
以下のフィードバックを受け取り、それに基づいて「解説テキストに適用する sanitize ルール」の新規案を JSON で出力してください。

【フィードバック】
作品: ${request.title}${request.artist ? `（${request.artist}）` : ''}
種類: ${request.kind}
コメント: ${comment}
抜粋: ${request.excerpt || '(未指定)'}

【現行の sanitize ルール（L1）】
${rulesJson}

【出力ルール】
- 出力は純粋な JSON オブジェクト（配列ではない）一つに限定してください。前置き・コードブロック・マークダウンは禁止です。
- JSON のスキーマは以下の通り（欠けているフィールドは埋め、余計なフィールドは追加しないでください）：
{
  "id": "提案ルールの一意なID（アルファベット・ハイフン・数字のみ、例: remove_foo_bar）",
  "action": " sanitize アクション名（以下から選択: remove_leading_greeting, normalize_escapes, remove_thinking_blocks, clean_markdown, collapse_whitespace）",
  "tiers": ["short"|"standard"|"deep"] の配列（対象ティアを列挙。フィードバックの内容に合わせて絞ること）,
  "description": "日本語で 60 文字以内の説明",
  "order": 10〜90 の整数（現行ルール間の隙間に配置すること）,
  "patterns": ["正規表現文字列"],   // action が remove_thinking_blocks の場合に使う
  "greeting_signals": ["信号語の文字列"],  // action が remove_leading_greeting の場合に使う
  "protect_renderable_emphasis": true|false,  // action が clean_markdown の場合に使う
  "max_consecutive_newlines": 2  // action が collapse_whitespace の場合に使う
}
- detectedActions に含まれる action を優先して提案してください。
- 偽陽性を防ぐため、action は上記リストから選択し、未知のアクションは生成しないでください。
- tiers はフィードバックの内容（どのティアで問題が起きたか）に合わせて絞り込んでください。
`,
    },
  ];

  const raw = await provider.generateResponse(messages, { json: true });

  // 4) 出力された JSON をパースし、最低限の検証を通す
  const parsed = parseRuleProposal(raw);
  if (!parsed) {
    console.warn('Sanitize rule proposal from feedback: LLM output was not a valid rule JSON');
    return false;
  }

  // 5) ステージング：persistL3Rule に渡す（現在は console.info のみ。本格永続化は後段）。
  await persistL3Rule(parsed);

  // 6) 承認キュー（Supabase）に提案を積む
  const supabase = createServiceClient();
  const record = {
    title: request.title.slice(0, 200),
    artist: request.artist.slice(0, 200),
    kind: request.kind.slice(0, 50),
    comment: request.comment.slice(0, 2000),
    locale: request.locale,
    suggested_rule: JSON.stringify(parsed),
    status: 'pending' as const,
    created_at: new Date().toISOString(),
  };
  const { error } = await supabase.from(PROPOSAL_TABLE).insert(record).select().single<FeedbackRuleProposalRecord>();
  if (error) {
    // キューへの格納に失敗してもステージングは済ませたので、警告だけ残して返す
    console.warn('Failed to insert sanitize rule proposal into feedback_rule_proposals:', error.message);
    return true; // ステージングは成功
  }

  return true;
}

/** LLM 出力から sanitize ルール案をパースし、最低限のバリデーションを通す。 */
function parseRuleProposal(raw: string): SanitizeRule | null {
  // 経験的に LLM がコードブロックや前置きを混ぜることがあるため、{} を探して抽出
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first === -1 || last <= first) return null;

  const candidate = raw.slice(first, last + 1);
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(candidate);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;

  const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : null;
  const action = typeof obj.action === 'string' ? obj.action : null;
  if (!id || !action) return null;

  const tiers: Tier[] = (Array.isArray(obj.tiers) && obj.tiers.every((t): t is Tier => t === 'short' || t === 'standard' || t === 'deep'))
    ? obj.tiers as Tier[]
    : [];

  const order = typeof obj.order === 'number' && Number.isFinite(obj.order) ? obj.order : 50;
  const description = typeof obj.description === 'string' ? obj.description.slice(0, 60) : '';

  const patterns = Array.isArray(obj.patterns) ? obj.patterns.map((p) => typeof p === 'string' ? p : '') : undefined;
  const greeting_signals = Array.isArray(obj.greeting_signals) ? obj.greeting_signals.map((s) => typeof s === 'string' ? s : '') : undefined;
  const protect_renderable_emphasis = obj.protect_renderable_emphasis === true ? true : undefined;
  const max_consecutive_newlines = typeof obj.max_consecutive_newlines === 'number' ? obj.max_consecutive_newlines : undefined;

  return {
    id,
    action,
    tiers,
    description,
    order,
    patterns,
    greeting_signals,
    protect_renderable_emphasis,
    max_consecutive_newlines,
  };
}

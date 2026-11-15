import { getGuideStore } from '@/lib/guideStore';
import { DEFAULT_LOCALE, Locale, OUTPUT_LANGUAGE_INSTRUCTION } from '@/lib/i18n';
import { getLLMProvider } from '@/lib/llm';
import { createServiceClient } from '@/lib/supabase';

export const GUIDE_CORRECTIONS_TABLE = 'guide_corrections';

export type GuideCorrectionStatus = 'pending' | 'approved' | 'rejected';

export interface GuideCorrectionRow {
  id: string;
  title: string;
  artist: string;
  locale: Locale;
  kind: string;
  comment: string;
  excerpt: string | null;
  /** The guide as it is archived today, so a moderator can compare. */
  original: string;
  /** The rewritten guide, same JSON shape as the archived payload. */
  proposal: string;
  /** One line from the model on what it changed. */
  note: string | null;
  status: GuideCorrectionStatus;
  created_at: string;
}

/**
 * The report only rewrites `standard` — the tier the reader was listening to.
 *
 * Rewriting all three tiers took the model over a minute, which left the
 * listener staring at a spinner; one tier answers in seconds. `short` and `deep`
 * are left as archived and can be regenerated separately.
 */
const REVISED_FIELD = 'standard' as const;

/**
 * A rewrite this much shorter than the archive is a summary, not a correction.
 *
 * The light model that answers in seconds tends to compress the passages it was
 * not asked to touch, so a shrunken rewrite is dropped rather than queued.
 */
const MIN_LENGTH_RATIO = 0.8;

function reviserPrompt(locale: Locale): string {
  const language =
    locale === DEFAULT_LOCALE
      ? '解説は日本語のままにしてください。'
      : `${OUTPUT_LANGUAGE_INSTRUCTION[locale]} 解説の言語は元の解説と同じに保ってください。`;

  return `あなたは美術館の音声ガイドの編集者です。
既存の解説と、鑑賞者から届いた指摘を渡します。指摘が妥当な場合のみ、解説を最小限の修正で直してください。

【ルール】
- 指摘に関係のない箇所は一字も変えないでください。
- 事実が不確かな場合は、断定を避けた表現に直してください。
- 修正後の解説は全文を返してください。指摘に関係のない文を削除・要約・短縮してはいけません（元と同程度の文字数を保つこと）。
- ※ や （注）のような記号での補足は使わず、読み上げても自然な話し言葉で直してください。
- マークダウンの装飾方針は変えないでください。
- 音声ガイドとして読み上げる文章です。記号の羅列や箇条書きの乱用は避けてください。
- ${language}
- 指摘が的外れで修正が不要なら、"unchanged": true を返してください。

【出力フォーマット】
純粋なJSONオブジェクトのみを返してください。前置きやマークダウンのコードブロックは禁止です。
{
  "standard": "（修正後の解説全文）",
  "note": "（何をどう直したかを日本語1文で）",
  "unchanged": false
}`;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last <= first) return null;

  try {
    const parsed = JSON.parse(text.slice(first, last + 1));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export interface ProposalRequest {
  title: string;
  artist: string;
  locale: Locale;
  kind: string;
  comment: string;
  excerpt: string;
}

/**
 * Turn a reader's complaint into a concrete edit waiting for approval.
 *
 * The archived guide is rewritten by the model, but nothing is published here:
 * the rewrite is queued in `guide_corrections`, and only an approval in the
 * admin queue writes it back over the archived guide.
 *
 * Returns the queued row, or null when there is nothing to propose (no archived
 * guide, or the model judged the report not actionable).
 */
export async function proposeGuideCorrection(
  request: ProposalRequest
): Promise<GuideCorrectionRow | null> {
  const { title, artist, locale, kind, comment, excerpt } = request;

  const archived = await getGuideStore().get(title, artist, locale);
  if (!archived) return null;

  const current = parseJsonObject(archived.payload);
  if (!current) return null;

  const revision = parseJsonObject(
    await getLLMProvider('ask').generateResponse(
      [
        {
          role: 'user',
          content: `${reviserPrompt(locale)}

【作品】${title}${artist ? `（${artist}）` : ''}
【指摘の種類】${kind === 'bug' ? '不具合の報告' : '内容が良くないという報告'}
【鑑賞者の指摘】
${comment}

【鑑賞者が見ていた箇所】
${excerpt || '(未指定)'}

【現在の解説】
${current[REVISED_FIELD]}`
        }
      ],
      { json: true }
    )
  );

  if (!revision || revision.unchanged === true) return null;

  // Keep everything the report has no business touching (searchQuery, music,
  // recommendations) exactly as archived.
  const archivedText = current[REVISED_FIELD];
  const revised = revision[REVISED_FIELD];
  if (typeof revised !== 'string' || !revised.trim() || revised === archivedText) {
    return null;
  }
  if (
    typeof archivedText === 'string' &&
    revised.length < archivedText.length * MIN_LENGTH_RATIO
  ) {
    return null;
  }

  const proposal: Record<string, unknown> = { ...current, [REVISED_FIELD]: revised };

  const { data, error } = await createServiceClient()
    .from(GUIDE_CORRECTIONS_TABLE)
    .insert({
      title,
      artist,
      locale,
      kind,
      comment: comment.slice(0, 2000),
      excerpt: excerpt.slice(0, 2000) || null,
      original: archived.payload,
      proposal: JSON.stringify(proposal),
      note: typeof revision.note === 'string' ? revision.note.slice(0, 500) : null
    })
    .select()
    .single<GuideCorrectionRow>();

  if (error) throw new Error(error.message);
  return data;
}

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Locale } from './i18n';

export interface VisitorContext {
  /** Oldest to newest. */
  history: { title: string; artist: string }[];
  favoriteTags: string[];
  pastQuestions: string[];
}

export const MAX_CONTEXT_LENGTH = 1500;
const HISTORY_LIMIT = 20;
const emptyContext = (): VisitorContext => ({ history: [], favoriteTags: [], pastQuestions: [] });

/**
 * Read-only preparation for chat integration. Returns empty context on failure.
 * Past-question retrieval is blocked: questions.ts only generates suggestions,
 * and provides no persisted visitor-question reader. Do not substitute those
 * suggestions for actual visitor questions. title/artist reserve the work scope.
 */
export async function loadVisitorContext(
  supabase: SupabaseClient,
  userId: string | null | undefined,
  title: string,
  artist: string
): Promise<VisitorContext> {
  if (!userId) return emptyContext();
  // TODO: Resolve the existing past-question source for this artwork.
  void title;
  void artist;
  try {
    const [history, profile] = await Promise.all([
      supabase.from('viewing_history')
        .select('artworks(title, artist)')
        .eq('user_id', userId)
        .order('viewed_at', { ascending: false })
        .limit(HISTORY_LIMIT),
      supabase.from('user_profiles')
        .select('favorite_tags')
        .eq('id', userId)
        .maybeSingle<{ favorite_tags: string[] | null }>()
    ]);
    if (history.error || profile.error) return emptyContext();
    type Artwork = VisitorContext['history'][number];
    const rows = (history.data ?? []) as unknown as { artworks: Artwork | Artwork[] | null }[];
    return {
      history: rows.flatMap(row => {
        const artwork = Array.isArray(row.artworks) ? row.artworks[0] : row.artworks;
        return artwork ? [{ title: artwork.title, artist: artwork.artist }] : [];
      }).reverse(),
      favoriteTags: profile.data?.favorite_tags ?? [],
      pastQuestions: []
    };
  } catch {
    return emptyContext();
  }
}

const HEADINGS = {
  ja: ['鑑賞履歴（古い順）', '好みのタグ', 'この作品への過去の質問'],
  en: ['Listening history (oldest first)', 'Favorite tags', 'Past questions about this artwork']
};

/** Pure prompt fragment; no sections for missing data, at most 1500 UTF-16 units. */
export function formatContextBlock(ctx: VisitorContext, locale: Locale = 'ja'): string {
  const headings = locale === 'ja' ? HEADINGS.ja : HEADINGS.en;
  const history = ctx.history.map(({ title, artist }) => `${title} (${artist})`);
  const tags = [...ctx.favoriteTags];
  const questions = [...ctx.pastQuestions];
  const render = () => [history, tags, questions]
    .map((items, index) => items.length ? `${headings[index]}:\n${items.map(item => `- ${item}`).join('\n')}` : '')
    .filter(Boolean).join('\n\n');

  let block = render();
  // Keep the most recent listens, removing whole entries rather than half titles.
  while (block.length > MAX_CONTEXT_LENGTH && history.length) {
    history.shift();
    block = render();
  }
  // Tags/questions alone can also exceed the budget. Remove whole trailing items.
  while (block.length > MAX_CONTEXT_LENGTH && (questions.length || tags.length)) {
    if (questions.length) questions.pop();
    else tags.pop();
    block = render();
  }
  return block;
}

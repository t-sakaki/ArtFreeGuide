import type { SupabaseClient } from '@supabase/supabase-js';
import { canonicalName, catalogueTitle } from './names';

export const PAST_QUESTIONS_TABLE = 'artwork_questions';
export const PAST_QUESTIONS_LIMIT = 5;
export const PAST_QUESTIONS_RETENTION_DAYS = 30;
const MAX_QUESTION_LENGTH = 500;

function artworkKey(title: string, artist: string) {
  return { title: catalogueTitle(canonicalName(title)), artist: canonicalName(artist) };
}

/** Avoid retaining contact details. This is a conservative guard, not anonymisation. */
function shareableQuestion(question: string): string | null {
  const text = question.trim().replace(/\s+/g, ' ');
  if (!text || text.length > MAX_QUESTION_LENGTH) return null;
  if (/@|https?:\/\/|www\.|(?:\+?\d[\d\s().-]*){7,}/i.test(text)) return null;
  return text;
}

/** Server/service-role only. No visitor identifiers, answers or guide text are stored. */
export async function recordPastQuestion(
  supabase: SupabaseClient,
  title: string,
  artist: string,
  question: string
): Promise<void> {
  const key = artworkKey(title, artist);
  const text = shareableQuestion(question);
  if (!key.title || key.title.length > 256 || key.artist.length > 128 || !text) return;
  try {
    const { error } = await supabase.from(PAST_QUESTIONS_TABLE).upsert({
      ...key, question: text, last_asked_at: new Date().toISOString()
    }, { onConflict: 'title,artist,question' });
    if (error) console.warn('Past question storage unavailable', { code: error.code || 'unknown' });
  } catch {
    // Never log the question or credentials; memory must not break an answer.
    console.warn('Past question storage unavailable');
  }
}

/** Shared artwork questions, newest first. Missing schema/permissions degrade to []. */
export async function loadPastQuestions(
  supabase: SupabaseClient,
  title: string,
  artist: string
): Promise<string[]> {
  const key = artworkKey(title, artist);
  if (!key.title) return [];
  try {
    const since = new Date(Date.now() - PAST_QUESTIONS_RETENTION_DAYS * 86400000).toISOString();
    const { data, error } = await supabase.from(PAST_QUESTIONS_TABLE)
      .select('question')
      .eq('title', key.title)
      .eq('artist', key.artist)
      .gte('last_asked_at', since)
      .order('last_asked_at', { ascending: false })
      .limit(PAST_QUESTIONS_LIMIT);
    if (error || !data) return [];
    // Defence for legacy/imported rows; never promote suggestedQuestions here.
    return data.flatMap(row => {
      const text = typeof row.question === 'string' ? shareableQuestion(row.question) : null;
      return text ? [text] : [];
    });
  } catch {
    return [];
  }
}

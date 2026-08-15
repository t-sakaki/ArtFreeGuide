import { findHotspotSet } from './hotspots';

/**
 * Question chips are built locally rather than asked of the LLM: they must be on
 * screen the moment the guide starts, and a wrong-but-instant chip is worse than
 * no chip only if it is off-topic, which templates never are.
 */
export function suggestedQuestions(title: string, artist: string): string[] {
  const questions: string[] = [];

  const spots = findHotspotSet(title, artist)?.hotspots ?? [];
  if (spots.length > 0) {
    questions.push(`「${spots[0].label}」には何の意味がありますか？`);
  }

  if (artist.trim()) {
    questions.push(`${artist.trim()}はどんな人だったのですか？`);
  }

  questions.push('この作品はどこで実物を見られますか？');
  questions.push('描かれた当時、どう受け止められたのですか？');
  questions.push('どんな技法で描かれているのですか？');

  // Three chips fit two lines on a phone; a fourth turns the row into a wall.
  return questions.slice(0, 3);
}

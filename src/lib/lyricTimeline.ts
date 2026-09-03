/**
 * One resolved [start, end] window per lyric line, shared by the on-screen
 * full-screen view and the MP4 export so the karaoke telop and the recorded
 * video scroll identically.
 *
 * `timings` (one start per sung line, from Whisper forced alignment in
 * `/api/theme-song`) is used when it lines up with the parsed lyrics; otherwise
 * we fall back to a length-weighted estimate — the same heuristic the
 * full-screen view used before this module existed.
 */

import { parseLyrics, type LyricTimeline } from '@/lib/lyricAlign';

export interface LyricSpan {
  text: string;
  section: boolean;
  /** Seconds from the top of the track. */
  start: number;
  /** Start of the next line (or the end of the track for the last line). */
  end: number;
  /**
   * Karaoke wipe clock: seconds at each *aligned* character of this line. The
   * renderer normalizes by this array's length, so it maps cleanly onto the
   * (longer, punctuation-carrying) display text. Absent when there is no
   * forced-alignment data — the renderer then wipes linearly over [start, end].
   */
  charTimes?: number[];
}

const INTRO_FRACTION = 0.06;

export function buildLyricTimeline(
  lyrics: string,
  timings: number[] | undefined,
  duration: number,
  timeline?: LyricTimeline | null,
): LyricSpan[] {
  const lines = parseLyrics(lyrics);
  if (lines.length === 0) return [];

  const tl = timeline && timeline.starts.length === lines.length ? timeline : null;
  const startSource = tl ? tl.starts : timings;
  const haveTimings = !!startSource && startSource.length === lines.length;

  let starts: number[];
  if (haveTimings) {
    starts = startSource!.slice();
  } else if (duration > 0) {
    const weights = lines.map(l => Math.max(l.text.length, l.section ? 4 : 10));
    const total = weights.reduce((a, b) => a + b, 0);
    const intro = duration * INTRO_FRACTION;
    const body = duration - intro;
    let acc = 0;
    starts = weights.map(w => {
      const at = intro + (acc / total) * body;
      acc += w;
      return at;
    });
  } else {
    starts = lines.map(() => 0);
  }

  // Force monotonic starts — a stray alignment point must never rewind the scroll.
  for (let i = 1; i < starts.length; i++) {
    if (!(starts[i] >= starts[i - 1])) starts[i] = starts[i - 1];
  }

  const tail = duration > 0 ? duration : (starts[starts.length - 1] ?? 0) + 4;

  return lines.map((line, i) => {
    // A line's window runs to the next *sung* line; skip section markers so a
    // sung line keeps its full duration for the wipe.
    let nextStart = tail;
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].section) {
        nextStart = starts[j];
        break;
      }
    }
    // With forced alignment we know when the line's own words end — use that so
    // the wipe finishes with the vocal and holds through an instrumental gap.
    const alignedEnd = tl && !line.section ? tl.ends[i] : undefined;
    const end = Math.max(
      Math.min(alignedEnd ?? nextStart, nextStart),
      starts[i] + 0.4,
    );
    const charTimes =
      tl && tl.chars[i] && tl.chars[i].length ? tl.chars[i].map(ms => ms / 1000) : undefined;
    return { text: line.text, section: line.section, start: starts[i], end, charTimes };
  });
}

/** The last line whose window has started at time `t` (‑1 before the first). */
export function activeLyricIndex(spans: LyricSpan[], t: number): number {
  let idx = -1;
  for (let i = 0; i < spans.length; i++) {
    if (spans[i].section) continue;
    if (spans[i].start <= t + 0.12) idx = i;
    else break;
  }
  return idx;
}

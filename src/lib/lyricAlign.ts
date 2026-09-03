/**
 * Spotify-style lyric sync for the theme song.
 *
 * MiniMax Music does not return per-line timestamps, and estimating them from
 * line length drifts badly (held notes, instrumental breaks, repeated
 * choruses all break the length-vs-time assumption). Instead we transcribe the
 * actual vocal track (Whisper, word-level timestamps) and align the written
 * lyrics to that transcription character-by-character with a classic
 * Needleman-Wunsch global alignment — the written lyrics are the reference,
 * the (noisy, occasionally wrong) transcription supplies the clock.
 */

export interface LyricLine {
  text: string;
  /** [Verse] / [Chorus] markers — not sung, but kept for section timing. */
  section: boolean;
}

export function parseLyrics(raw: string): LyricLine[] {
  return raw
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => ({ text: l.replace(/^\[(.+)\]$/, '$1'), section: /^\[.+\]$/.test(l) }));
}

export interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

/** Characters we align on: strip whitespace/punctuation, case-fold. */
function alignChars(s: string): string {
  return s.replace(/[\s　\p{P}]/gu, '').toLowerCase();
}

/** Every character of every Whisper word, with an interpolated timestamp. */
function expandWordChars(words: WhisperWord[]): { ch: string; t: number }[] {
  const out: { ch: string; t: number }[] = [];
  for (const w of words) {
    const chars = Array.from(alignChars(w.word));
    if (!chars.length) continue;
    const span = Math.max(w.end - w.start, 0.01);
    chars.forEach((ch, i) => out.push({ ch, t: w.start + (span * i) / chars.length }));
  }
  return out;
}

/** DP grid past this size is too slow/large for a Worker; bail to the estimate. */
const MAX_DP_CELLS = 4_000_000;

/**
 * Align `lines` (this song's written lyrics) to a Whisper transcription of the
 * actual audio. Returns one start time (seconds) per entry in `lines`, or null
 * if the transcription was unusable — the caller should fall back to an
 * estimate in that case.
 */
/**
 * The shared DP core: aligns every (whitespace/punctuation-stripped) reference
 * character to the transcription and returns an interpolated time for each, plus
 * where each line begins and how many aligned characters it has. Both
 * `alignLyricLines` and `alignLyricTimeline` build on this so the expensive
 * Needleman–Wunsch grid is only ever walked once per call.
 */
function alignReferenceCharTimes(
  lines: LyricLine[],
  words: WhisperWord[],
): { filled: number[]; lineStartRefIdx: number[]; lineCharLen: number[] } | null {
  if (words.length === 0) return null;

  const refChars: string[] = [];
  const lineStartRefIdx: number[] = new Array(lines.length).fill(-1);
  const lineCharLen: number[] = new Array(lines.length).fill(0);
  lines.forEach((line, i) => {
    if (line.section) return;
    lineStartRefIdx[i] = refChars.length;
    const chars = Array.from(alignChars(line.text));
    lineCharLen[i] = chars.length;
    refChars.push(...chars);
  });
  if (refChars.length === 0) return null;

  const hyp = expandWordChars(words);
  if (hyp.length === 0) return null;

  const n = refChars.length;
  const m = hyp.length;
  if (n * m === 0 || n * m > MAX_DP_CELLS) return null;

  const MATCH = 2;
  const MISMATCH = -1;
  const GAP = -1;
  const width = m + 1;
  const score = new Int16Array((n + 1) * width);
  for (let i = 0; i <= n; i++) score[i * width] = i * GAP;
  for (let j = 0; j <= m; j++) score[j] = j * GAP;
  for (let i = 1; i <= n; i++) {
    const ri = refChars[i - 1];
    for (let j = 1; j <= m; j++) {
      const diag = score[(i - 1) * width + (j - 1)] + (ri === hyp[j - 1].ch ? MATCH : MISMATCH);
      const up = score[(i - 1) * width + j] + GAP;
      const left = score[i * width + (j - 1)] + GAP;
      score[i * width + j] = Math.max(diag, up, left);
    }
  }

  // Traceback: for each reference character that lines up with a hypothesis
  // character, remember the hypothesis's timestamp.
  const refTime: (number | null)[] = new Array(n).fill(null);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const cur = score[i * width + j];
    const diag = score[(i - 1) * width + (j - 1)] + (refChars[i - 1] === hyp[j - 1].ch ? MATCH : MISMATCH);
    if (cur === diag) {
      refTime[i - 1] = hyp[j - 1].t;
      i--;
      j--;
    } else if (cur === score[(i - 1) * width + j] + GAP) {
      i--;
    } else {
      j--;
    }
  }

  // Fill the gaps between matched characters by linear interpolation, so
  // words the transcription missed still get a plausible time.
  const filled: number[] = new Array(n).fill(0);
  let prevIdx = -1;
  let prevT = 0;
  for (let k = 0; k <= n; k++) {
    const known = k < n ? refTime[k] : null;
    if (known === null || known === undefined) continue;
    const t = Math.max(known, prevT);
    if (prevIdx === -1) {
      for (let x = 0; x <= k; x++) filled[x] = t;
    } else {
      const span = k - prevIdx;
      for (let x = prevIdx + 1; x <= k; x++) {
        filled[x] = prevT + ((t - prevT) * (x - prevIdx)) / span;
      }
    }
    prevIdx = k;
    prevT = t;
  }
  if (prevIdx === -1) return null; // nothing aligned at all
  for (let x = prevIdx + 1; x < n; x++) filled[x] = prevT;

  return { filled, lineStartRefIdx, lineCharLen };
}

/**
 * Align `lines` (this song's written lyrics) to a Whisper transcription of the
 * actual audio. Returns one start time (seconds) per entry in `lines`, or null
 * if the transcription was unusable — the caller should fall back to an
 * estimate in that case.
 */
export function alignLyricLines(lines: LyricLine[], words: WhisperWord[]): number[] | null {
  const core = alignReferenceCharTimes(lines, words);
  if (!core) return null;
  const { filled, lineStartRefIdx } = core;

  const out = new Array(lines.length).fill(0);
  let carry = 0;
  lines.forEach((line, li) => {
    if (line.section) {
      out[li] = carry;
      return;
    }
    const refIdx = lineStartRefIdx[li];
    const t = refIdx >= 0 && refIdx < filled.length ? filled[refIdx] : carry;
    out[li] = Math.max(t, carry);
    carry = out[li];
  });
  return out;
}

/**
 * The richer form used by the MP4 export: per-line start, per-line end (when the
 * line's last sung character lands) and, for a true karaoke wipe, the time of
 * every aligned character in the line (milliseconds, monotonic).
 */
export interface LyricTimeline {
  v: 2;
  /** Seconds from the top of the track, one per line (sections carry the last start). */
  starts: number[];
  /** Seconds; when the line's final aligned character was sung. */
  ends: number[];
  /** Per line: ms-integer time at each aligned character. Empty for sections / unaligned lines. */
  chars: number[][];
}

export function alignLyricTimeline(lines: LyricLine[], words: WhisperWord[]): LyricTimeline | null {
  const core = alignReferenceCharTimes(lines, words);
  if (!core) return null;
  const { filled, lineStartRefIdx, lineCharLen } = core;

  const starts = new Array<number>(lines.length).fill(0);
  const ends = new Array<number>(lines.length).fill(0);
  const chars: number[][] = new Array(lines.length);
  let carry = 0;

  lines.forEach((line, li) => {
    if (line.section) {
      starts[li] = carry;
      ends[li] = carry;
      chars[li] = [];
      return;
    }
    const from = lineStartRefIdx[li];
    const len = lineCharLen[li];
    const slice: number[] = [];
    let last = carry;
    for (let k = 0; k < len; k++) {
      const idx = from + k;
      const t = Math.max(idx >= 0 && idx < filled.length ? filled[idx] : last, last);
      last = t;
      slice.push(Math.round(t * 1000));
    }
    starts[li] = Math.max(slice.length ? slice[0] / 1000 : carry, carry);
    ends[li] = Math.max(slice.length ? slice[slice.length - 1] / 1000 : starts[li], starts[li] + 0.3);
    chars[li] = slice;
    carry = starts[li];
  });

  return { v: 2, starts, ends, chars };
}

/** Parse whatever is stored in the `timings` column: a v2 timeline, or a legacy `number[]` of starts, or nothing. */
export function parseTimelineJSON(raw: string | null | undefined): LyricTimeline | number[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v) && v.every(n => typeof n === 'number')) return v as number[];
    if (v && typeof v === 'object' && Array.isArray((v as LyricTimeline).starts)) return v as LyricTimeline;
  } catch {
    /* fall through */
  }
  return null;
}

/** The per-line start times, whichever stored shape they came in. */
export function timelineStarts(t: LyricTimeline | number[] | null): number[] {
  if (!t) return [];
  return Array.isArray(t) ? t : t.starts;
}

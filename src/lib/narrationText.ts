import { Locale } from './i18n';
import { toSpokenText } from './pronunciation';

export type ExplanationMode = 'short' | 'standard' | 'deep';

export interface GuideParts {
  short: string;
  standard?: string;
  deep?: string;
}

export interface NarrationSpokenSegment {
  index: number;
  raw: string;
  spoken: string;
  startChar: number;
  endChar: number;
}

export interface NarrationSynthesisInput {
  speakableSegments: string[];
  segments: NarrationSpokenSegment[];
  synthesisText: string;
}

export interface CharacterAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export interface NarrationSegmentTiming {
  index: number;
  startMs: number;
  endMs: number;
}

/**
 * Splits guide text into display/playback segments using the exact same rules
 * as HomeClient.tsx so segment indices line up 1:1 with DOM elements (#seg-N)
 * and hotspot matching.
 */
export function parseGuideSegments(text: string): string[] {
  if (!text) return [];
  const splitList: string[] = [];
  let current = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    current += char;
    if (char === '。' || char === '\n') {
      if (current.trim()) {
        splitList.push(current);
      }
      current = '';
    }
  }
  if (current.trim()) {
    splitList.push(current);
  }
  return splitList;
}

/**
 * Filters parsed segments to the speakable ones, matching HomeClient.tsx.
 */
export function extractSpeakableSegments(text: string): string[] {
  return parseGuideSegments(text).filter(
    seg => seg.replace(/[#*_`~\s]/g, '').trim().length > 0,
  );
}

/**
 * Strips Markdown/HTML formatting from a single segment before TTS synthesis,
 * matching HomeClient.tsx's speakSegment cleanup.
 */
export function cleanSegmentForSpeech(rawText: string): string {
  return rawText
    .replace(/#+\s+/g, '')
    .replace(/[*_`~>]/g, '')
    .replace(/[-\d]+\.\s+/g, '')
    .replace(/\[.*?\]\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<.*?>/g, '')
    .replace(/\n+/g, ' ')
    .trim();
}

/**
 * Converts a raw speakable segment into the exact spoken text for the target locale.
 */
export function toNarrationSpokenText(rawText: string, locale: Locale): string {
  const cleaned = cleanSegmentForSpeech(rawText);
  if (!cleaned) return '';
  return locale === 'ja' ? toSpokenText(cleaned) : cleaned;
}

/**
 * Builds the displayed guide text for a given explanation mode, matching
 * HomeClient.tsx's getActiveExplanation().
 */
export function composeGuideModeText(parts: GuideParts, mode: ExplanationMode): string {
  if (!parts.short) return '';
  if (mode === 'short') return parts.short;
  if (mode === 'standard') return `${parts.short}\n\n${parts.standard ?? ''}`;
  return `${parts.short}\n\n${parts.standard ?? ''}\n\n${parts.deep ?? ''}`;
}

/**
 * Prepares a full-mode narration synthesis payload while keeping exact
 * character offsets for every speakable segment so ElevenLabs character
 * timestamps map back to HomeClient's activeSegmentIndex.
 */
export function buildNarrationSynthesisInput(
  guideText: string,
  locale: Locale,
): NarrationSynthesisInput {
  const speakableSegments = extractSpeakableSegments(guideText);
  const segments: NarrationSpokenSegment[] = [];
  let synthesisText = '';

  for (let index = 0; index < speakableSegments.length; index++) {
    const raw = speakableSegments[index];
    const spoken = toNarrationSpokenText(raw, locale);
    if (!spoken) {
      segments.push({
        index,
        raw,
        spoken: '',
        startChar: synthesisText.length,
        endChar: synthesisText.length,
      });
      continue;
    }

    if (synthesisText.length > 0) {
      synthesisText += '\n';
    }
    const startChar = synthesisText.length;
    synthesisText += spoken;
    const endChar = synthesisText.length;

    segments.push({
      index,
      raw,
      spoken,
      startChar,
      endChar,
    });
  }

  return {
    speakableSegments,
    segments,
    synthesisText,
  };
}

/**
 * Maps ElevenLabs character-level alignment timestamps back to per-segment
 * millisecond ranges. Handles both exact 1:1 character alignment and minor
 * whitespace/punctuation normalization by monotonic character cursor matching.
 */
export function mapCharacterAlignmentToSegments(
  input: NarrationSynthesisInput,
  alignment: CharacterAlignment | null | undefined,
  fallbackDurationMs = 0,
): NarrationSegmentTiming[] {
  const { segments, synthesisText } = input;
  if (segments.length === 0) return [];

  const chars = alignment?.characters ?? [];
  const starts = alignment?.character_start_times_seconds ?? [];
  const ends = alignment?.character_end_times_seconds ?? [];
  const alignedText = chars.join('');
  const hasValidAlignment =
    chars.length > 0 &&
    chars.length === starts.length &&
    chars.length === ends.length;

  if (!hasValidAlignment) {
    return buildUniformSegmentTimings(segments, fallbackDurationMs);
  }

  const totalAudioMs = Math.max(
    fallbackDurationMs,
    Math.round((ends[ends.length - 1] ?? 0) * 1000),
  );

  // Fast path: ElevenLabs returned the exact characters we sent.
  if (alignedText === synthesisText) {
    return finalizeTimings(
      segments.map(seg => {
        if (!seg.spoken || seg.endChar <= seg.startChar) {
          return { index: seg.index, startMs: -1, endMs: -1 };
        }
        const firstIdx = seg.startChar;
        const lastIdx = Math.min(seg.endChar - 1, chars.length - 1);
        const startMs = Math.max(0, Math.round((starts[firstIdx] ?? 0) * 1000));
        const endMs = Math.max(startMs, Math.round((ends[lastIdx] ?? 0) * 1000));
        return { index: seg.index, startMs, endMs };
      }),
      totalAudioMs,
    );
  }

  // Fallback alignment: advance through alignment.characters monotonically.
  let cursor = 0;
  const rawTimings: NarrationSegmentTiming[] = [];

  for (const seg of segments) {
    const cleanExpected = seg.spoken.replace(/\s+/g, '');
    if (!cleanExpected) {
      rawTimings.push({ index: seg.index, startMs: -1, endMs: -1 });
      continue;
    }

    let firstMatch = -1;
    let lastMatch = -1;
    let expIdx = 0;

    while (cursor < chars.length && expIdx < cleanExpected.length) {
      const ch = chars[cursor];
      if (!ch || /\s/.test(ch)) {
        cursor++;
        continue;
      }
      if (ch === cleanExpected[expIdx]) {
        if (firstMatch === -1) firstMatch = cursor;
        lastMatch = cursor;
        expIdx++;
        cursor++;
      } else {
        // Look slightly ahead in case ElevenLabs dropped or inserted punctuation.
        const lookAheadChar = chars.indexOf(cleanExpected[expIdx], cursor + 1);
        if (lookAheadChar !== -1 && lookAheadChar - cursor <= 4) {
          cursor = lookAheadChar;
          if (firstMatch === -1) firstMatch = cursor;
          lastMatch = cursor;
          expIdx++;
          cursor++;
        } else {
          expIdx++;
        }
      }
    }

    if (firstMatch !== -1 && lastMatch !== -1) {
      const startMs = Math.max(0, Math.round((starts[firstMatch] ?? 0) * 1000));
      const endMs = Math.max(startMs, Math.round((ends[lastMatch] ?? 0) * 1000));
      rawTimings.push({ index: seg.index, startMs, endMs });
    } else {
      rawTimings.push({ index: seg.index, startMs: -1, endMs: -1 });
    }
  }

  return finalizeTimings(rawTimings, totalAudioMs);
}

function buildUniformSegmentTimings(
  segments: NarrationSpokenSegment[],
  totalDurationMs: number,
): NarrationSegmentTiming[] {
  const weights = segments.map(s => Math.max(s.spoken.length, 1));
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
  let elapsed = 0;
  return segments.map((seg, i) => {
    const slice = Math.round((weights[i] / totalWeight) * totalDurationMs);
    const startMs = elapsed;
    const endMs = i === segments.length - 1 ? totalDurationMs : Math.min(totalDurationMs, elapsed + slice);
    elapsed = endMs;
    return { index: seg.index, startMs, endMs };
  });
}

function finalizeTimings(
  raw: NarrationSegmentTiming[],
  totalAudioMs: number,
): NarrationSegmentTiming[] {
  let prevEnd = 0;
  const resolved = raw.map(item => {
    if (item.startMs < 0 || item.endMs < 0) {
      return { index: item.index, startMs: prevEnd, endMs: prevEnd };
    }
    const startMs = Math.max(prevEnd, item.startMs);
    const endMs = Math.max(startMs, item.endMs);
    prevEnd = endMs;
    return { index: item.index, startMs, endMs };
  });

  // Ensure the final segment reaches the end of the audio when totalAudioMs is known.
  if (totalAudioMs > 0 && resolved.length > 0) {
    const last = resolved[resolved.length - 1];
    if (last.endMs < totalAudioMs) {
      last.endMs = totalAudioMs;
    }
  }
  return resolved;
}

/**
 * Given playback position in milliseconds and segment timings, returns the
 * active segment index.
 */
export function findSegmentIndexForTimeMs(
  timings: NarrationSegmentTiming[],
  timeMs: number,
): number {
  if (timings.length === 0) return -1;
  if (timeMs <= 0) return timings[0].index;

  for (let i = 0; i < timings.length; i++) {
    const cur = timings[i];
    const next = timings[i + 1];
    const upperBound = next ? next.startMs : Number.POSITIVE_INFINITY;
    if (timeMs < upperBound) {
      return cur.index;
    }
  }
  return timings[timings.length - 1].index;
}

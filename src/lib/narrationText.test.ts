import { describe, it, expect } from 'vitest';
import {
  buildNarrationSynthesisInput,
  buildSegmentTimingsFromDurations,
  cleanSegmentForSpeech,
  composeGuideModeText,
  extractSpeakableSegments,
  findSegmentIndexForTimeMs,
  mapBoundaryEventsToSegments,
  mapCharacterAlignmentToSegments,
  parseGuideSegments,
  toNarrationSpokenText,
} from './narrationText';

describe('narrationText segmentation and spoken mapping', () => {
  it('splits Japanese and Markdown guides identically to HomeClient parseSegments', () => {
    const guide = '## 作品概要\n\n葛飾北斎による浮世絵です。荒々しい波が描かれています。\n\n富士山も見えます。';
    const segs = parseGuideSegments(guide);
    expect(segs).toEqual([
      '## 作品概要\n',
      '葛飾北斎による浮世絵です。',
      '荒々しい波が描かれています。',
      '富士山も見えます。',
    ]);

    const speakables = extractSpeakableSegments(guide);
    expect(speakables).toEqual([
      '## 作品概要\n',
      '葛飾北斎による浮世絵です。',
      '荒々しい波が描かれています。',
      '富士山も見えます。',
    ]);
  });

  it('cleans markdown and applies Japanese pronunciation readings without altering display segments', () => {
    const raw = '## 技法\n';
    expect(cleanSegmentForSpeech(raw)).toBe('技法');

    const jpLine = '木版画の傑作、神奈川沖浪裏です。';
    const spoken = toNarrationSpokenText(jpLine, 'ja');
    expect(spoken).not.toBe('');
    expect(toNarrationSpokenText('Starry Night by Van Gogh.', 'en')).toBe(
      'Starry Night by Van Gogh.',
    );
  });

  it('composes guide text by mode matching HomeClient getActiveExplanation', () => {
    const parts = { short: '概要。', standard: '標準。', deep: '深掘り。' };
    expect(composeGuideModeText(parts, 'short')).toBe('概要。');
    expect(composeGuideModeText(parts, 'standard')).toBe('概要。\n\n標準。');
    expect(composeGuideModeText(parts, 'deep')).toBe('概要。\n\n標準。\n\n深掘り。');
  });

  it('maps exact ElevenLabs character alignment timestamps to each speakable segment', () => {
    const guide = '第一文です。第二文です。';
    const input = buildNarrationSynthesisInput(guide, 'ja');
    expect(input.segments).toHaveLength(2);
    expect(input.synthesisText).toBe('第一文です。\n第二文です。');

    const chars = [...input.synthesisText];
    const starts = chars.map((_, idx) => idx * 0.1);
    const ends = chars.map((_, idx) => (idx + 1) * 0.1);

    const timings = mapCharacterAlignmentToSegments(input, {
      characters: chars,
      character_start_times_seconds: starts,
      character_end_times_seconds: ends,
    });

    expect(timings).toEqual([
      { index: 0, startMs: 0, endMs: 600 },
      { index: 1, startMs: 700, endMs: 1300 },
    ]);

    expect(findSegmentIndexForTimeMs(timings, 0)).toBe(0);
    expect(findSegmentIndexForTimeMs(timings, 599)).toBe(0);
    expect(findSegmentIndexForTimeMs(timings, 650)).toBe(0);
    expect(findSegmentIndexForTimeMs(timings, 700)).toBe(1);
    expect(findSegmentIndexForTimeMs(timings, 1500)).toBe(1);
  });

  it('handles alignment normalization where ElevenLabs omits newlines', () => {
    const guide = 'First sentence.\nSecond sentence.';
    const input = buildNarrationSynthesisInput(guide, 'en');
    const aligned = 'First sentence.Second sentence.';
    const chars = [...aligned];
    const starts = chars.map((_, idx) => idx * 0.05);
    const ends = chars.map((_, idx) => (idx + 1) * 0.05);

    const timings = mapCharacterAlignmentToSegments(input, {
      characters: chars,
      character_start_times_seconds: starts,
      character_end_times_seconds: ends,
    });

    expect(timings).toHaveLength(2);
    expect(timings[0].startMs).toBe(0);
    expect(timings[0].endMs).toBe(750);
    expect(timings[1].startMs).toBe(750);
    expect(timings[1].endMs).toBe(1550);
  });

  it('builds cumulative segment timings from per-segment durations and gaps', () => {
    const input = buildNarrationSynthesisInput('第一文です。第二文です。', 'ja');
    const timings = buildSegmentTimingsFromDurations(input.segments, [1200, 1800], 150, 3200);
    expect(timings).toEqual([
      { index: 0, startMs: 0, endMs: 1200 },
      { index: 1, startMs: 1350, endMs: 3200 },
    ]);
  });

  it('maps boundary events (Azure WordBoundary style) and falls back cleanly when absent', () => {
    const input = buildNarrationSynthesisInput('一文目です。二文目です。', 'ja');
    const seg0 = input.segments[0];
    const seg1 = input.segments[1];

    const mapped = mapBoundaryEventsToSegments(
      input,
      [
        { textOffset: seg0.startChar, audioOffsetMs: 0, durationMs: 400 },
        { textOffset: seg0.endChar - 1, audioOffsetMs: 900, durationMs: 300 },
        { textOffset: seg1.startChar, audioOffsetMs: 1350, durationMs: 500 },
        { textOffset: seg1.endChar - 1, audioOffsetMs: 2400, durationMs: 400 },
      ],
      3000,
    );
    expect(mapped).toEqual([
      { index: 0, startMs: 0, endMs: 1200 },
      { index: 1, startMs: 1350, endMs: 3000 },
    ]);

    const fallback = mapBoundaryEventsToSegments(input, [], 2000);
    expect(fallback).toHaveLength(2);
    expect(fallback[0].startMs).toBe(0);
    expect(fallback[1].endMs).toBe(2000);
  });
});

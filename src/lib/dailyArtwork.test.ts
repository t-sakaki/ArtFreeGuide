import { describe, it, expect } from 'vitest';
import { getDailyArtwork } from './dailyArtwork';

/**
 * These tests run without a Cloudflare context (local), so getDailyArtwork falls
 * back to the curated list. We assert the contract: it always returns a pick,
 * never throws, and the same date is deterministic.
 */

describe('getDailyArtwork', () => {
  it('returns a pick without throwing, even with no D1 context', async () => {
    const daily = await getDailyArtwork();
    expect(daily).not.toBeNull();
    expect(daily.canonicalTitle).toBeTruthy();
    expect(daily.themeId).toBeTruthy();
    expect(daily.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('is deterministic for the same date', async () => {
    // getDailyArtwork() uses "today" internally; call twice in the same process
    // and expect identical results (no randomness mid-run).
    const a = await getDailyArtwork();
    const b = await getDailyArtwork();
    expect(a.canonicalTitle).toBe(b.canonicalTitle);
    expect(a.themeId).toBe(b.themeId);
  });

  it('always yields a known curated title as fallback', async () => {
    const daily = await getDailyArtwork();
    const curated = [
      '睡蓮', '星月夜', '神奈川沖浪裏', 'モナ・リザ', '叫び', 'ひまわり',
      '真珠の耳飾りの少女', '最後の晩餐', '印象・日の出', 'ゲルニカ', '記憶の固執',
      '風神雷神図屏風', '富嶽三十六景 神奈川沖浪裏', 'ヴィーナスの誕生', 'ダビデ像',
      '夜警', '接吻', 'アテナイの学堂', 'アビニヨンの娘たち',
    ];
    expect(curated).toContain(daily.canonicalTitle);
  });

  it('includes plaque metadata on the fallback pick', async () => {
    const daily = await getDailyArtwork();
    // At least one of year/museum/medium should be present for curated picks.
    expect(daily.year || daily.museum || daily.medium).toBeTruthy();
  });
});

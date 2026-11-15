import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPastQuestions, recordPastQuestion, PAST_QUESTIONS_TABLE } from './pastQuestions';

function mockClient() {
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    upsert: vi.fn().mockResolvedValue({ error: null })
  };
  const from = vi.fn(() => query);
  return { db: { from } as unknown as SupabaseClient, from, query };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-16T00:00:00.000Z'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('recordPastQuestion', () => {
  it('stores a canonical work and normalised question without visitor data', async () => {
    const { db, from, query } = mockClient();
    await recordPastQuestion(db, 'The Starry Night', 'Vincent van Gogh', ' Why\n  blue? ');
    expect(from).toHaveBeenCalledWith(PAST_QUESTIONS_TABLE);
    expect(query.upsert).toHaveBeenCalledWith({
      title: '星月夜', artist: 'フィンセント・ファン・ゴッホ', question: 'Why blue?',
      last_asked_at: '2026-11-16T00:00:00.000Z'
    }, { onConflict: 'title,artist,question' });
  });

  it.each(['', 'x'.repeat(501), 'email me at a@example.org', 'Call +81 90-1234-5678', 'https://example.org'])('skips empty, oversized and contact-like questions (%s)', async question => {
    const { db, from } = mockClient();
    await recordPastQuestion(db, '星月夜', 'ゴッホ', question);
    expect(from).not.toHaveBeenCalled();
  });

  it('skips missing or oversized work names', async () => {
    const { db, from } = mockClient();
    await recordPastQuestion(db, '', '', 'Why?');
    await recordPastQuestion(db, 'x'.repeat(257), '', 'Why?');
    await recordPastQuestion(db, '星月夜', 'x'.repeat(129), 'Why?');
    expect(from).not.toHaveBeenCalled();
  });

  it('absorbs returned and thrown storage failures without logging question text', async () => {
    const { db, query } = mockClient();
    query.upsert.mockResolvedValueOnce({ error: { code: '42501', message: 'secret question' } });
    await expect(recordPastQuestion(db, '星月夜', '', 'Why?')).resolves.toBeUndefined();
    query.upsert.mockRejectedValueOnce(new Error('secret question'));
    await expect(recordPastQuestion(db, '星月夜', '', 'Why?')).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenNthCalledWith(1, 'Past question storage unavailable', { code: '42501' });
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('secret question');
  });
});

describe('loadPastQuestions', () => {
  it('filters exact canonical work and last 30 days, limits to five newest actual posts', async () => {
    const { db, query } = mockClient();
    query.limit.mockResolvedValueOnce({ data: [{ question: 'Why blue?' }], error: null });
    expect(await loadPastQuestions(db, 'The Starry Night', 'Vincent van Gogh')).toEqual(['Why blue?']);
    expect(query.select).toHaveBeenCalledWith('question');
    expect(query.eq.mock.calls).toEqual([['title', '星月夜'], ['artist', 'フィンセント・ファン・ゴッホ']]);
    expect(query.gte).toHaveBeenCalledWith('last_asked_at', '2026-10-17T00:00:00.000Z');
    expect(query.order).toHaveBeenCalledWith('last_asked_at', { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(5);
  });

  it('filters unsafe legacy rows', async () => {
    const { db, query } = mockClient();
    query.limit.mockResolvedValueOnce({ data: [{ question: 'a@example.org' }, { question: null }, { question: 'Why?' }], error: null });
    expect(await loadPastQuestions(db, '星月夜', '')).toEqual(['Why?']);
  });

  it('handles missing data, query failures and missing work without throwing', async () => {
    const { db, query, from } = mockClient();
    expect(await loadPastQuestions(db, '', '')).toEqual([]);
    expect(from).not.toHaveBeenCalled();
    expect(await loadPastQuestions(db, '星月夜', '')).toEqual([]);
    query.limit.mockResolvedValueOnce({ data: null, error: { message: 'missing table' } });
    expect(await loadPastQuestions(db, '星月夜', '')).toEqual([]);
    query.limit.mockRejectedValueOnce(new Error('offline'));
    expect(await loadPastQuestions(db, '星月夜', '')).toEqual([]);
  });
});

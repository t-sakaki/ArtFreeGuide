import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { formatContextBlock, loadVisitorContext, MAX_CONTEXT_LENGTH, type VisitorContext } from './contextAssembly';

const empty = (): VisitorContext => ({ history: [], favoriteTags: [], pastQuestions: [] });

describe('formatContextBlock', () => {
  it('returns an empty string for empty context', () => {
    expect(formatContextBlock(empty(), 'ja')).toBe('');
    expect(formatContextBlock(empty(), 'en')).toBe('');
  });

  it('formats history in chronological order without empty sections', () => {
    const ctx = { ...empty(), history: [{ title: '睡蓮', artist: 'モネ' }, { title: '星月夜', artist: 'ゴッホ' }] };
    expect(formatContextBlock(ctx, 'ja')).toBe('鑑賞履歴（古い順）:\n- 睡蓮 (モネ)\n- 星月夜 (ゴッホ)');
  });

  it('formats tags and past questions', () => {
    const ctx = { ...empty(), favoriteTags: ['印象派', '風景'], pastQuestions: ['なぜ青いのですか？'] };
    expect(formatContextBlock(ctx, 'ja')).toBe('好みのタグ:\n- 印象派\n- 風景\n\nこの作品への過去の質問:\n- なぜ青いのですか？');
  });

  it('switches all headings between Japanese and English', () => {
    const ctx = { history: [{ title: '睡蓮', artist: 'モネ' }], favoriteTags: ['風景'], pastQuestions: ['なぜ？'] };
    const en = formatContextBlock(ctx, 'en');
    expect(en).toContain('Listening history (oldest first):');
    expect(en).toContain('Favorite tags:');
    expect(en).toContain('Past questions about this artwork:');
    expect(en).not.toContain('鑑賞履歴');
    expect(formatContextBlock(ctx, 'ja')).not.toContain('Listening history');
  });

  it('drops oldest history first, preserves recent works and does not mutate input', () => {
    const ctx = { history: [{ title: 'old'.repeat(600), artist: 'A' }, { title: 'recent', artist: 'B' }], favoriteTags: ['landscape'], pastQuestions: ['Why?'] };
    const original = JSON.stringify(ctx);
    const block = formatContextBlock(ctx, 'en');
    expect(block.length).toBeLessThanOrEqual(MAX_CONTEXT_LENGTH);
    expect(block).not.toContain('- old');
    expect(block).toContain('- recent (B)');
    expect(block).toContain('- landscape');
    expect(block).toContain('- Why?');
    expect(JSON.stringify(ctx)).toBe(original);
  });

  it('bounds tags and questions even when there is no history', () => {
    const ctx = { ...empty(), favoriteTags: ['x'.repeat(2000)], pastQuestions: ['y'.repeat(2000)] };
    expect(formatContextBlock(ctx, 'ja').length).toBeLessThanOrEqual(MAX_CONTEXT_LENGTH);
  });
});



describe('loadVisitorContext', () => {
  it('skips all queries for a missing user', async () => {
    const from = vi.fn();
    const result = await loadVisitorContext({ from } as unknown as SupabaseClient, null, '睡蓮', 'モネ');
    expect(result).toEqual(empty());
    expect(from).not.toHaveBeenCalled();
  });

  it('returns empty context when a query throws', async () => {
    const from = vi.fn(() => { throw new Error('offline'); });
    expect(await loadVisitorContext({ from } as unknown as SupabaseClient, 'user', '睡蓮', 'モネ')).toEqual(empty());
  });

  function client(historyResult: unknown, profileResult: unknown) {
    const history = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue(historyResult)
    };
    const profile = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue(profileResult)
    };
    const supabase = { from: vi.fn((table: string) => table === 'viewing_history' ? history : profile) };
    return { supabase: supabase as unknown as SupabaseClient, history, profile };
  }

  it('loads only the visitor history, handles both join shapes and returns chronological order', async () => {
    const { supabase, history, profile } = client({ data: [
      { artworks: { title: 'new', artist: 'B' } },
      { artworks: null },
      { artworks: [{ title: 'old', artist: 'A' }] }
    ], error: null }, { data: { favorite_tags: ['風景'] }, error: null });
    expect(await loadVisitorContext(supabase, 'visitor', '睡蓮', 'モネ')).toEqual({
      history: [{ title: 'old', artist: 'A' }, { title: 'new', artist: 'B' }],
      favoriteTags: ['風景'], pastQuestions: []
    });
    expect(history.eq).toHaveBeenCalledWith('user_id', 'visitor');
    expect(history.order).toHaveBeenCalledWith('viewed_at', { ascending: false });
    expect(history.limit).toHaveBeenCalledWith(20);
    expect(profile.eq).toHaveBeenCalledWith('id', 'visitor');
  });

  it('returns empty context for missing rows or a returned query error', async () => {
    const missing = client({ data: null, error: null }, { data: null, error: null });
    expect(await loadVisitorContext(missing.supabase, 'user', '', '')).toEqual(empty());
    const failed = client({ data: null, error: { message: 'unavailable' } }, { data: { favorite_tags: ['風景'] }, error: null });
    expect(await loadVisitorContext(failed.supabase, 'user', '', '')).toEqual(empty());
  });
});

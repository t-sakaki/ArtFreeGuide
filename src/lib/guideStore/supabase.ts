import { createServiceClient } from '@/lib/supabase';
import { Locale } from '../i18n';
import { ArchivedGuide, GuideStore, StoredGuide, guideKey } from './provider';

interface GuideRow {
  payload: string;
  updated_at: string | null;
}

export class SupabaseGuideStore implements GuideStore {
  readonly name = 'supabase';

  async get(title: string, artist: string, locale: Locale = 'ja'): Promise<StoredGuide | null> {
    const { data, error } = await createServiceClient()
      .from('artwork_guides')
      .select('payload, updated_at')
      .eq('cache_key', guideKey(title, artist, locale))
      .maybeSingle<GuideRow>();

    if (error) throw new Error(error.message);
    if (!data) return null;

    return { payload: data.payload, updatedAt: data.updated_at };
  }

  async put(title: string, artist: string, payload: string, locale: Locale = 'ja'): Promise<void> {
    const { error } = await createServiceClient()
      .from('artwork_guides')
      .upsert(
        {
          cache_key: guideKey(title, artist, locale),
          title: title.trim(),
          artist: artist.trim(),
          payload,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'cache_key' }
      );

    if (error) throw new Error(error.message);
  }

  async search(query: string, limit: number): Promise<ArchivedGuide[]> {
    const term = query.trim().replace(/[%,]/g, ' ');
    const { data, error } = await createServiceClient()
      .from('artwork_guides')
      .select('title, artist')
      .or(`title.ilike.%${term}%,artist.ilike.%${term}%`)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return (data ?? []) as ArchivedGuide[];
  }
}

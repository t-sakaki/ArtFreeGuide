import { createServiceClient } from '@/lib/supabase';
import { GuideStore, StoredGuide, guideKey } from './provider';

interface GuideRow {
  payload: string;
  updated_at: string | null;
}

export class SupabaseGuideStore implements GuideStore {
  readonly name = 'supabase';

  async get(title: string, artist: string): Promise<StoredGuide | null> {
    const { data, error } = await createServiceClient()
      .from('artwork_guides')
      .select('payload, updated_at')
      .eq('cache_key', guideKey(title, artist))
      .maybeSingle<GuideRow>();

    if (error) throw new Error(error.message);
    if (!data) return null;

    return { payload: data.payload, updatedAt: data.updated_at };
  }

  async put(title: string, artist: string, payload: string): Promise<void> {
    const { error } = await createServiceClient()
      .from('artwork_guides')
      .upsert(
        {
          cache_key: guideKey(title, artist),
          title: title.trim(),
          artist: artist.trim(),
          payload,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'cache_key' }
      );

    if (error) throw new Error(error.message);
  }
}

import { Locale } from '../i18n';
import { ArchivedGuide, GuideStore, StoredGuide, guideKey } from './provider';

/**
 * Per-isolate fallback used when no database is configured. It disappears with
 * the isolate, which is fine: the point is that the app still runs.
 */
export class MemoryGuideStore implements GuideStore {
  readonly name = 'memory';
  private static entries = new Map<string, StoredGuide>();

  async get(title: string, artist: string, locale: Locale = 'ja'): Promise<StoredGuide | null> {
    return MemoryGuideStore.entries.get(guideKey(title, artist, locale)) ?? null;
  }

  async put(title: string, artist: string, payload: string, locale: Locale = 'ja'): Promise<void> {
    MemoryGuideStore.entries.set(guideKey(title, artist, locale), {
      payload,
      updatedAt: new Date().toISOString()
    });
  }

  async search(query: string, limit: number): Promise<ArchivedGuide[]> {
    const needle = query.trim().toLowerCase();
    const matches: ArchivedGuide[] = [];

    for (const key of MemoryGuideStore.entries.keys()) {
      const [title, artist] = key.split('::');
      if (key.includes(needle)) matches.push({ title, artist: artist ?? '' });
      if (matches.length >= limit) break;
    }

    return matches;
  }
}

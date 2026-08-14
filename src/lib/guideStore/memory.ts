import { GuideStore, StoredGuide, guideKey } from './provider';

/**
 * Per-isolate fallback used when no database is configured. It disappears with
 * the isolate, which is fine: the point is that the app still runs.
 */
export class MemoryGuideStore implements GuideStore {
  readonly name = 'memory';
  private static entries = new Map<string, StoredGuide>();

  async get(title: string, artist: string): Promise<StoredGuide | null> {
    return MemoryGuideStore.entries.get(guideKey(title, artist)) ?? null;
  }

  async put(title: string, artist: string, payload: string): Promise<void> {
    MemoryGuideStore.entries.set(guideKey(title, artist), {
      payload,
      updatedAt: new Date().toISOString()
    });
  }
}

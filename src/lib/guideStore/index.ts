import { D1GuideStore } from './d1';
import { MemoryGuideStore } from './memory';
import { GuideStore } from './provider';
import { SupabaseGuideStore } from './supabase';

export type { GuideStore, StoredGuide } from './provider';
export { guideKey } from './provider';

/**
 * Backend for the generated-guide cache, selected by `GUIDE_STORE`. D1 is the
 * default: the guides live next to the worker and the store is swappable, so
 * moving the archive elsewhere is a config change rather than a code change.
 */
export function getGuideStore(): GuideStore {
  const configured = (process.env.GUIDE_STORE || 'd1').toLowerCase();

  switch (configured) {
    case 'd1':
      return new D1GuideStore();
    case 'supabase':
      return new SupabaseGuideStore();
    case 'memory':
    case 'none':
      return new MemoryGuideStore();
    default:
      throw new Error(`Unsupported GUIDE_STORE: ${configured}`);
  }
}

import { getCloudflareContext } from '@opennextjs/cloudflare';
import { GuideStore, StoredGuide, guideKey } from './provider';

interface D1Result<T> {
  results?: T[];
}

interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<D1Result<unknown>>;
}

interface D1Binding {
  prepare(query: string): D1Statement;
}

/**
 * Kept alongside the Supabase store so the cache can move back to Cloudflare by
 * flipping GUIDE_STORE, without touching the API route.
 */
export class D1GuideStore implements GuideStore {
  readonly name = 'd1';

  private async binding(): Promise<D1Binding> {
    const { env } = await getCloudflareContext({ async: true });
    const db = (env as unknown as { DB?: D1Binding }).DB;
    if (!db) {
      throw new Error('D1 binding "DB" is not available. Add d1_databases to wrangler.jsonc.');
    }
    return db;
  }

  async get(title: string, artist: string): Promise<StoredGuide | null> {
    const db = await this.binding();
    const row = await db
      .prepare('SELECT payload, updated_at FROM artwork_guides WHERE cache_key = ?')
      .bind(guideKey(title, artist))
      .first<{ payload: string; updated_at: string | null }>();

    return row ? { payload: row.payload, updatedAt: row.updated_at } : null;
  }

  async put(title: string, artist: string, payload: string): Promise<void> {
    const db = await this.binding();
    await db
      .prepare(
        `INSERT INTO artwork_guides (cache_key, title, artist, payload, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET
           title = excluded.title,
           artist = excluded.artist,
           payload = excluded.payload,
           updated_at = excluded.updated_at`
      )
      .bind(guideKey(title, artist), title.trim(), artist.trim(), payload, new Date().toISOString())
      .run();
  }
}

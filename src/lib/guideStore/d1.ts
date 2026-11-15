import { getCloudflareContext } from '@opennextjs/cloudflare';
import { Locale } from '../i18n';
import { ArchivedGuide, GuideStore, StoredGuide, escapeLike, guideKey } from './provider';

interface D1Result<T> {
  results?: T[];
}

interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
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

  async get(title: string, artist: string, locale: Locale = 'ja'): Promise<StoredGuide | null> {
    const db = await this.binding();
    const row = await db
      .prepare('SELECT payload, updated_at FROM artwork_guides WHERE cache_key = ?')
      .bind(guideKey(title, artist, locale))
      .first<{ payload: string; updated_at: string | null }>();

    return row ? { payload: row.payload, updatedAt: row.updated_at } : null;
  }

  async put(title: string, artist: string, payload: string, locale: Locale = 'ja'): Promise<void> {
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
      .bind(guideKey(title, artist, locale), title.trim(), artist.trim(), payload, new Date().toISOString())
      .run();
  }

  async search(query: string, limit: number): Promise<ArchivedGuide[]> {
    const db = await this.binding();
    const like = `%${escapeLike(query.trim())}%`;
    const { results } = await db
      .prepare(
        `SELECT title, artist FROM artwork_guides
         WHERE title LIKE ?1 ESCAPE '\\' OR artist LIKE ?1 ESCAPE '\\'
         ORDER BY updated_at DESC
         LIMIT ?2`
      )
      .bind(like, limit)
      .all<ArchivedGuide>();

    return results ?? [];
  }
}

import { getCloudflareContext } from '@opennextjs/cloudflare';

export type FeedbackKind = 'good' | 'bad' | 'bug';

export interface FeedbackEntry {
  title: string;
  artist: string;
  kind: FeedbackKind;
  comment: string;
  /** Which part of the guide the visitor was looking at, to make a report actionable. */
  excerpt: string;
  userId: string | null;
}

export interface FeedbackStore {
  readonly name: string;
  put(entry: FeedbackEntry): Promise<void>;
}

interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<unknown>;
}

interface D1Binding {
  prepare(query: string): D1Statement;
}

class D1FeedbackStore implements FeedbackStore {
  readonly name = 'd1';

  async put(entry: FeedbackEntry): Promise<void> {
    const { env } = await getCloudflareContext({ async: true });
    const db = (env as unknown as { DB?: D1Binding }).DB;
    if (!db) {
      throw new Error('D1 binding "DB" is not available. Add d1_databases to wrangler.jsonc.');
    }

    await db
      .prepare(
        `INSERT INTO guide_feedback (title, artist, kind, comment, excerpt, user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        entry.title.trim(),
        entry.artist.trim(),
        entry.kind,
        entry.comment,
        entry.excerpt,
        entry.userId,
        new Date().toISOString()
      )
      .run();
  }
}

class MemoryFeedbackStore implements FeedbackStore {
  readonly name = 'memory';
  private readonly entries: FeedbackEntry[] = [];

  async put(entry: FeedbackEntry): Promise<void> {
    this.entries.push(entry);
  }
}

/**
 * Follows the guide archive: feedback lands wherever the guides live, so the two
 * can be joined later when the reports drive prompt fixes.
 */
export function getFeedbackStore(): FeedbackStore {
  const configured = (process.env.GUIDE_STORE || 'd1').toLowerCase();
  return configured === 'd1' ? new D1FeedbackStore() : new MemoryFeedbackStore();
}

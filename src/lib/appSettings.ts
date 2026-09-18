import { getCloudflareContext } from '@opennextjs/cloudflare';

interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}

interface D1Binding {
  prepare(query: string): D1Statement;
}

/** Runtime overrides an admin can change without a deploy, e.g. via the MCP server. */
export const SETTINGS_KEYS = {
  guideSystemPrompt: 'guide_system_prompt'
} as const;

async function binding(): Promise<D1Binding> {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as { DB?: D1Binding }).DB;
  if (!db) {
    throw new Error('D1 binding "DB" is not available. Add d1_databases to wrangler.jsonc.');
  }
  return db;
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await binding();
  const row = await db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await binding();
  await db
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .bind(key, value, new Date().toISOString())
    .run();
}

export async function deleteSetting(key: string): Promise<void> {
  const db = await binding();
  await db.prepare('DELETE FROM app_settings WHERE key = ?').bind(key).run();
}

/**
 * Per-isolate cache so a hot Worker doesn't hit D1 on every request just to
 * read a value that rarely changes. A cold isolate re-reads on its next call.
 */
const cache = new Map<string, { value: string | null; expiresAt: number }>();
const TTL_MS = 60_000;

export async function getCachedSetting(key: string): Promise<string | null> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const value = await getSetting(key);
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

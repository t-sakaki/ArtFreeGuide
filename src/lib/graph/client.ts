/**
 * Lightweight Neo4j HTTP Query API v2 client compatible with Cloudflare Workers.
 * Uses only standard `fetch` (no Bolt TCP sockets / Node-only drivers).
 */

export interface Neo4jConfig {
  queryUrl: string;
  authHeader: string;
}

interface QueryApiV2Response {
  data?: {
    fields?: string[];
    values?: unknown[][];
  };
  errors?: Array<{ code?: string; message?: string }>;
}

const DEFAULT_TIMEOUT_MS = 2500;

/**
 * Resolves a Neo4j AuraDB / server Query API v2 endpoint from env vars.
 * Accepts `neo4j+s://host`, `neo4j://host`, `https://host`, or `NEO4J_QUERY_URL`.
 */
export function resolveNeo4jConfig(
  env: Record<string, string | undefined> = process.env
): Neo4jConfig | null {
  const explicitUrl = env.NEO4J_QUERY_URL?.trim();
  const uri = env.NEO4J_URI?.trim();
  const user = (env.NEO4J_USER || env.NEO4J_USERNAME || 'neo4j').trim();
  const password = env.NEO4J_PASSWORD?.trim();
  const database = (env.NEO4J_DATABASE || 'neo4j').trim();

  if (!password || (!explicitUrl && !uri)) {
    return null;
  }

  let queryUrl = explicitUrl || '';
  if (!queryUrl && uri) {
    let normalized = uri;
    if (/^neo4j\+s:\/\//i.test(normalized) || /^bolt\+s:\/\//i.test(normalized)) {
      normalized = normalized.replace(/^(neo4j|bolt)\+s:\/\//i, 'https://');
    } else if (/^neo4j:\/\//i.test(normalized) || /^bolt:\/\//i.test(normalized)) {
      normalized = normalized.replace(/^(neo4j|bolt):\/\//i, 'http://');
    }
    normalized = normalized.replace(/\/+$/, '');
    // Strip standard Bolt port if someone pasted neo4j+s://host:7687
    normalized = normalized.replace(/:7687$/, '');
    queryUrl = `${normalized}/db/${encodeURIComponent(database)}/query/v2`;
  }

  const credentials = `${user}:${password}`;
  const encoded =
    typeof btoa === 'function'
      ? btoa(credentials)
      : Buffer.from(credentials, 'utf8').toString('base64');

  return {
    queryUrl,
    authHeader: `Basic ${encoded}`,
  };
}

export function isNeo4jConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  return resolveNeo4jConfig(env) !== null;
}

/**
 * Executes a Cypher statement via Neo4j HTTP Query API v2 and returns typed row objects.
 * Returns `null` when Neo4j is unconfigured, unreachable, or times out so callers can fall back.
 */
export async function runCypher<T extends Record<string, unknown>>(
  statement: string,
  parameters: Record<string, unknown> = {},
  options?: { timeoutMs?: number; env?: Record<string, string | undefined> }
): Promise<T[] | null> {
  const config = resolveNeo4jConfig(options?.env);
  if (!config) return null;

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(config.queryUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: config.authHeader,
      },
      body: JSON.stringify({ statement, parameters }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`Neo4j query failed with HTTP ${res.status}`);
      return null;
    }

    const json = (await res.json()) as QueryApiV2Response;
    if (Array.isArray(json.errors) && json.errors.length > 0) {
      console.warn('Neo4j query error:', json.errors[0]?.message || json.errors[0]?.code);
      return null;
    }

    const fields = json.data?.fields ?? [];
    const values = json.data?.values ?? [];
    return values.map(row => {
      const record: Record<string, unknown> = {};
      for (let i = 0; i < fields.length; i++) {
        record[fields[i]] = row[i];
      }
      return record as T;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('Neo4j unavailable, falling back to snapshot:', message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

import { describe, expect, it, vi, afterEach } from 'vitest';
import { isNeo4jConfigured, resolveNeo4jConfig, runCypher } from './client';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Neo4j HTTP Query API v2 client', () => {
  it('resolves neo4j+s URI into HTTPS Query API v2 URL', () => {
    const config = resolveNeo4jConfig({
      NEO4J_URI: 'neo4j+s://abc123.databases.neo4j.io:7687',
      NEO4J_USER: 'neo4j',
      NEO4J_PASSWORD: 'secret',
      NEO4J_DATABASE: 'neo4j',
    });
    expect(config).not.toBeNull();
    expect(config?.queryUrl).toBe('https://abc123.databases.neo4j.io/db/neo4j/query/v2');
    expect(config?.authHeader).toMatch(/^Basic /);
  });

  it('returns null when URI or password is missing', () => {
    expect(resolveNeo4jConfig({})).toBeNull();
    expect(isNeo4jConfigured({ NEO4J_URI: 'neo4j+s://x.databases.neo4j.io' })).toBe(false);
  });

  it('parses Query API v2 fields and values into row objects', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            fields: ['title', 'artist'],
            values: [['睡蓮', 'クロード・モネ']],
          },
        }),
        { status: 200 }
      )
    );

    const rows = await runCypher<{ title: string; artist: string }>(
      'MATCH (a:Artwork) RETURN a.title AS title, a.artist AS artist',
      {},
      {
        env: {
          NEO4J_URI: 'neo4j+s://demo.databases.neo4j.io',
          NEO4J_PASSWORD: 'secret',
        },
      }
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(rows).toEqual([{ title: '睡蓮', artist: 'クロード・モネ' }]);
  });

  it('returns null gracefully on network error or HTTP 500', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('error', { status: 500 }));
    const rows = await runCypher('RETURN 1', {}, {
      env: { NEO4J_URI: 'https://demo.databases.neo4j.io', NEO4J_PASSWORD: 'secret' },
    });
    expect(rows).toBeNull();
  });
});

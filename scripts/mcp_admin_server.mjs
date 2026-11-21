#!/usr/bin/env node
// Admin MCP server: lets an authorized operator read/edit the guide system
// prompt and archived guide texts from outside the app, without a deploy.
//
// Runs locally over stdio (no public endpoint to secure) and talks to the
// deployed app's existing /api/admin/* routes, which already gate on
// ADMIN_TOKEN. Register it with, e.g.:
//
//   claude mcp add art-free-guide-admin \
//     -e BASE_URL=https://art-free-guide.taira-sakakibara.workers.dev \
//     -e ADMIN_TOKEN=... \
//     -- node scripts/mcp_admin_server.mjs
//
// BASE_URL defaults to http://localhost:3000 (only useful if wrangler dev is
// running with a real D1 binding — plain `npm run dev` does not have one).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

if (!ADMIN_TOKEN) {
  console.error('ADMIN_TOKEN is required (same shared secret the admin API checks).');
  process.exit(1);
}

async function adminFetch(path, { method = 'GET', body } = {}) {
  const url = new URL(path, BASE_URL);
  const init = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (method === 'GET') {
    url.searchParams.set('token', ADMIN_TOKEN);
  } else {
    init.body = JSON.stringify({ token: ADMIN_TOKEN, ...body });
  }

  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `${method} ${path} failed with ${res.status}`);
  }
  return data;
}

function textResult(value) {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

const server = new McpServer({ name: 'art-free-guide-admin', version: '1.0.0' });

server.registerTool(
  'get_guide_system_prompt',
  {
    title: 'Get guide system prompt',
    description:
      'Read the currently active curator system prompt override (D1), or null if none is set — in which case the deployed default (env var or built-in) applies.'
  },
  async () => textResult(await adminFetch('/api/admin/settings?key=guide_system_prompt'))
);

server.registerTool(
  'set_guide_system_prompt',
  {
    title: 'Set guide system prompt',
    description:
      'Override the curator system prompt at runtime, no deploy needed. Takes effect for new guide generations within about a minute (isolate cache TTL). Does not affect already-cached/archived guides.',
    inputSchema: { prompt: z.string().min(1) }
  },
  async ({ prompt }) =>
    textResult(await adminFetch('/api/admin/settings', { method: 'POST', body: { key: 'guide_system_prompt', value: prompt } }))
);

server.registerTool(
  'clear_guide_system_prompt',
  {
    title: 'Clear guide system prompt override',
    description: 'Remove the D1 override so the prompt falls back to the deployed env var / built-in default.'
  },
  async () => textResult(await adminFetch('/api/admin/settings', { method: 'POST', body: { key: 'guide_system_prompt', value: null } }))
);

server.registerTool(
  'search_guides',
  {
    title: 'Search archived guides',
    description: 'Find archived guides by a title/artist fragment.',
    inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(50).optional() }
  },
  async ({ query, limit }) =>
    textResult(await adminFetch(`/api/admin/guide?q=${encodeURIComponent(query)}&limit=${limit ?? 20}`))
);

server.registerTool(
  'get_guide',
  {
    title: 'Get an archived guide',
    description: 'Read the archived guide JSON payload for a specific title/artist/locale.',
    inputSchema: {
      title: z.string().min(1),
      artist: z.string().optional(),
      locale: z.enum(['ja', 'en', 'fr', 'es', 'zh']).optional()
    }
  },
  async ({ title, artist, locale }) =>
    textResult(
      await adminFetch(
        `/api/admin/guide?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist ?? '')}&locale=${locale ?? 'ja'}`
      )
    )
);

server.registerTool(
  'update_guide',
  {
    title: 'Update an archived guide',
    description:
      'Overwrite the archived guide for (title, artist, locale) with a new JSON payload, immediately and without review. `payload` must be the full guide JSON (short/standard/deep/searchQuery/hotspots/music/recommendations), typically fetched with get_guide, edited, and sent back.',
    inputSchema: {
      title: z.string().min(1),
      artist: z.string().optional(),
      locale: z.enum(['ja', 'en', 'fr', 'es', 'zh']).optional(),
      payload: z.string().min(1)
    }
  },
  async ({ title, artist, locale, payload }) =>
    textResult(
      await adminFetch('/api/admin/guide', {
        method: 'POST',
        body: { title, artist: artist ?? '', locale: locale ?? 'ja', payload }
      })
    )
);

server.registerTool(
  'list_featured_tours',
  {
    title: 'List dynamic featured tours',
    description: 'List D1-backed featured tours, optionally filtered by status (all | draft | published | archived).',
    inputSchema: {
      status: z.enum(['all', 'draft', 'published', 'archived']).optional()
    }
  },
  async ({ status }) =>
    textResult(await adminFetch(`/api/admin/featured-tours?status=${encodeURIComponent(status ?? 'all')}`))
);

server.registerTool(
  'upsert_featured_tour',
  {
    title: 'Create or update a dynamic featured tour',
    description:
      'Create or update a D1-backed featured tour without redeploying. Defaults to status "draft" so an operator can review before publishing. Titles and artists inside `items` must use canonical Japanese spellings.',
    inputSchema: {
      slug: z.string().min(2).max(80),
      title: z.string().min(1),
      subtitle: z.string().min(1),
      emoji: z.string().optional(),
      status: z.enum(['draft', 'published', 'archived']).optional(),
      sortOrder: z.number().int().optional(),
      sourceUrl: z.string().url().optional(),
      startsAt: z.string().optional(),
      endsAt: z.string().optional(),
      items: z
        .array(
          z.object({
            title: z.string().min(1),
            artist: z.string().default(''),
            cue: z.string().default('')
          })
        )
        .min(1)
        .max(12),
      i18n: z
        .record(
          z.string(),
          z.object({
            title: z.string().min(1),
            subtitle: z.string().min(1),
            cues: z.array(z.string())
          })
        )
        .optional()
    }
  },
  async input =>
    textResult(
      await adminFetch('/api/admin/featured-tours', {
        method: 'POST',
        body: input
      })
    )
);

server.registerTool(
  'publish_featured_tour',
  {
    title: 'Change status of a dynamic featured tour',
    description:
      'Transition an existing featured tour to published, draft, or archived. Status change is immediate (within 60s isolate cache TTL) and does not block on guide warming.',
    inputSchema: {
      slug: z.string().min(2).max(80),
      status: z.enum(['draft', 'published', 'archived']).default('published')
    }
  },
  async ({ slug, status }) =>
    textResult(
      await adminFetch('/api/admin/featured-tours', {
        method: 'POST',
        body: { action: 'set_status', slug, status }
      })
    )
);

server.registerTool(
  'delete_featured_tour',
  {
    title: 'Delete a dynamic featured tour',
    description: 'Permanently delete a D1-backed featured tour by slug.',
    inputSchema: {
      slug: z.string().min(2).max(80)
    }
  },
  async ({ slug }) =>
    textResult(
      await adminFetch('/api/admin/featured-tours', {
        method: 'DELETE',
        body: { slug }
      })
    )
);

const transport = new StdioServerTransport();
await server.connect(transport);

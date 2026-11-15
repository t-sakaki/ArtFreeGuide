#!/usr/bin/env node
// Guide MCP server: lets an external agent operate the museum audio guide
// the way a visitor does — read the archived guide for an artwork, ask the
// curator a question, fold the answer back into the guide so the next
// visitor hears it, send feedback, and get recommendations for what to
// listen to next.
//
// Runs locally over stdio and talks to the deployed app's public /api/*
// routes — the same surface the web client uses, so no admin token is
// involved. Register it with, e.g.:
//
//   claude mcp add art-free-guide \
//     -e BASE_URL=https://art-free-guide.taira-sakakibara.workers.dev \
//     -- node scripts/mcp_guide_server.mjs
//
// BASE_URL defaults to the production site; point it at
// http://localhost:3000 to work against a local dev server instead.
//
// Two tools change what future visitors hear, by design (that loop is the
// product): add_to_guide / ask_and_archive append prose to the archived
// guide's deep tier, and a non-good send_feedback can draft a proposed
// correction into the moderation queue. The guide text itself never
// changes without the usual approval flow.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE_URL = (
  process.env.BASE_URL || 'https://art-free-guide.taira-sakakibara.workers.dev'
).replace(/\/$/, '');

async function apiFetch(path, { method = 'GET', body } = {}) {
  const url = new URL(path, BASE_URL);
  const init = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
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

const localeSchema = z.enum(['ja', 'en', 'fr', 'es', 'zh']).optional();

const server = new McpServer({ name: 'art-free-guide', version: '1.0.0' });

server.registerTool(
  'fetch_guide',
  {
    title: 'Fetch the archived guide for an artwork',
    description:
      'Read-only peek at the archived guide for (title, artist, locale). Returns { cached: false } when no guide has been archived yet; never generates one.',
    inputSchema: {
      title: z.string().min(1),
      artist: z.string().optional(),
      locale: localeSchema
    }
  },
  async ({ title, artist, locale }) =>
    textResult(
      await apiFetch(
        `/api/guide?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist ?? '')}&locale=${locale ?? 'ja'}`
      )
    )
);

server.registerTool(
  'ask_about_artwork',
  {
    title: 'Ask the curator about an artwork',
    description:
      'Ask a question about an artwork and get the curator\u2019s spoken-style answer (plain prose, no markdown). Pass `context` (an excerpt of the guide the visitor just heard) so the answer continues naturally. With deep_dive, the answer is a longer behind-the-scenes episode instead. The answer is NOT archived by this call \u2014 use add_to_guide (or ask_and_archive) to fold it into the guide for future visitors.',
    inputSchema: {
      title: z.string().min(1),
      artist: z.string().optional(),
      question: z.string().min(1),
      context: z.string().optional(),
      deep_dive: z.boolean().optional(),
      locale: localeSchema
    }
  },
  async ({ title, artist, question, context, deep_dive, locale }) =>
    textResult(
      await apiFetch('/api/ask', {
        method: 'POST',
        body: {
          title,
          artist: artist ?? '',
          question,
          context: context ?? '',
          mode: deep_dive ? 'deep_dive' : 'standard',
          locale: locale ?? 'ja'
        }
      })
    )
);

server.registerTool(
  'add_to_guide',
  {
    title: 'Fold new prose into the archived guide',
    description:
      'Append a block of prose (typically an answer from ask_about_artwork, exactly as it should be read aloud) to the archived guide\u2019s deep tier, so future visitors hear it too. Returns { ok: false, reason } without changing anything when the guide is not archived yet, the block is a duplicate, or the text looks like model scaffolding rather than prose.',
    inputSchema: {
      title: z.string().min(1),
      artist: z.string().optional(),
      block: z.string().min(1),
      locale: localeSchema
    }
  },
  async ({ title, artist, block, locale }) =>
    textResult(
      await apiFetch('/api/guide/augment', {
        method: 'POST',
        body: { title, artist: artist ?? '', block, locale: locale ?? 'ja' }
      })
    )
);

server.registerTool(
  'ask_and_archive',
  {
    title: 'Ask the curator and archive the answer',
    description:
      'Ask a question (same behaviour as ask_about_artwork) and immediately fold the answer into the archived guide\u2019s deep tier, so the next visitor hears it as part of the guide. This is the \u201Cgets smarter the more you listen\u201D loop in a single call. Returns both the answer and the archive outcome.',
    inputSchema: {
      title: z.string().min(1),
      artist: z.string().optional(),
      question: z.string().min(1),
      context: z.string().optional(),
      deep_dive: z.boolean().optional(),
      locale: localeSchema
    }
  },
  async ({ title, artist, question, context, deep_dive, locale }) => {
    const loc = locale ?? 'ja';
    const { answer } = await apiFetch('/api/ask', {
      method: 'POST',
      body: {
        title,
        artist: artist ?? '',
        question,
        context: context ?? '',
        mode: deep_dive ? 'deep_dive' : 'standard',
        locale: loc
      }
    });
    let archive = null;
    if (typeof answer === 'string' && answer.trim()) {
      archive = await apiFetch('/api/guide/augment', {
        method: 'POST',
        body: { title, artist: artist ?? '', block: answer.trim(), locale: loc }
      });
    }
    return textResult({ answer, archive });
  }
);

server.registerTool(
  'send_feedback',
  {
    title: 'Send visitor feedback about a guide',
    description:
      'Record feedback on an artwork\u2019s guide. kind is good / bad / bug. A non-good report with a comment also drafts a proposed correction into the moderation queue and may return the curator\u2019s note about what would change; the guide itself never changes without approval.',
    inputSchema: {
      title: z.string().min(1),
      artist: z.string().optional(),
      kind: z.enum(['good', 'bad', 'bug']),
      comment: z.string().optional(),
      excerpt: z.string().optional(),
      locale: localeSchema
    }
  },
  async ({ title, artist, kind, comment, excerpt, locale }) =>
    textResult(
      await apiFetch('/api/feedback', {
        method: 'POST',
        body: {
          title,
          artist: artist ?? '',
          kind,
          comment: comment ?? '',
          excerpt: excerpt ?? '',
          locale: locale ?? 'ja'
        }
      })
    )
);

server.registerTool(
  'report_pronunciation',
  {
    title: 'Report a mispronounced word',
    description:
      'Report that the text-to-speech misreads a word: `original` as written in the guide, `suggested` with the correct reading. Goes to the moderation queue; once approved, the reading applies to every visitor.',
    inputSchema: {
      original: z.string().min(1),
      suggested: z.string().min(1),
      context: z.string().optional()
    }
  },
  async ({ original, suggested, context }) =>
    textResult(
      await apiFetch('/api/feedback', {
        method: 'POST',
        body: { kind: 'pronunciation', original, suggested, context: context ?? '' }
      })
    )
);

server.registerTool(
  'get_recommendations',
  {
    title: 'Recommend the next artwork to hear',
    description:
      'Vector-search recommendations for what to listen to next. Anchor on the current artwork (artworkId, or title/artist), or pass only userId for taste-only recommendations from the visitor\u2019s preference vector.',
    inputSchema: {
      artworkId: z.string().optional(),
      title: z.string().optional(),
      artist: z.string().optional(),
      userId: z.string().optional()
    }
  },
  async ({ artworkId, title, artist, userId }) =>
    textResult(
      await apiFetch('/api/recommendations', {
        method: 'POST',
        body: { artworkId, title, artist, userId }
      })
    )
);

const transport = new StdioServerTransport();
await server.connect(transport);

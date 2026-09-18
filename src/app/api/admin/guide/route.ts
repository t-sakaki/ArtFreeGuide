import { NextResponse } from 'next/server';
import { denyAdmin } from '@/lib/adminAuth';
import { getGuideStore } from '@/lib/guideStore';
import { DEFAULT_LOCALE, isLocale } from '@/lib/i18n';

/**
 * Direct read/write access to the archived guide cache, for the admin MCP
 * server. Unlike `guide-corrections`, this writes immediately — there is no
 * review queue — so it is meant for an operator fixing a specific guide, not
 * for visitor-submitted edits.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const denied = await denyAdmin(req, url.searchParams.get('token'));
    if (denied) return denied;

    const q = url.searchParams.get('q');
    const title = url.searchParams.get('title');
    const artist = url.searchParams.get('artist') ?? '';
    const rawLocale = url.searchParams.get('locale');
    const locale = rawLocale && isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

    const store = getGuideStore();

    if (q) {
      const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 50);
      const results = await store.search(q, limit);
      return NextResponse.json({ results });
    }

    if (!title) {
      return NextResponse.json({ error: 'title (or q) is required' }, { status: 400 });
    }

    const guide = await store.get(title, artist, locale);
    if (!guide) {
      return NextResponse.json({ error: 'No archived guide for this title/artist/locale' }, { status: 404 });
    }
    return NextResponse.json({ title, artist, locale, ...guide });
  } catch (error: any) {
    console.error('Admin guide API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** Overwrites the archived guide for (title, artist, locale) with `payload`. */
export async function POST(req: Request) {
  try {
    const { token, title, artist, locale: rawLocale, payload } = await req.json();

    const denied = await denyAdmin(req, token);
    if (denied) return denied;

    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }
    if (typeof payload !== 'string' || !payload.trim()) {
      return NextResponse.json({ error: 'payload is required' }, { status: 400 });
    }
    try {
      JSON.parse(payload);
    } catch {
      return NextResponse.json({ error: 'payload must be JSON matching the guide schema' }, { status: 400 });
    }

    const locale = typeof rawLocale === 'string' && isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
    const artistName = typeof artist === 'string' ? artist : '';

    await getGuideStore().put(title, artistName, payload, locale);
    return NextResponse.json({ ok: true, title, artist: artistName, locale });
  } catch (error: any) {
    console.error('Admin guide API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

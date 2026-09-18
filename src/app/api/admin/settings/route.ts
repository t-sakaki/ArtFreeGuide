import { NextResponse } from 'next/server';
import { deleteSetting, getSetting, setSetting, SETTINGS_KEYS } from '@/lib/appSettings';
import { denyAdmin } from '@/lib/adminAuth';

const ALLOWED_KEYS = new Set<string>(Object.values(SETTINGS_KEYS));

/** Reads a runtime override, or null when none is set (the code/env default applies). */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const denied = await denyAdmin(req, url.searchParams.get('token'));
    if (denied) return denied;

    const key = url.searchParams.get('key');
    if (!key || !ALLOWED_KEYS.has(key)) {
      return NextResponse.json({ error: `key must be one of: ${[...ALLOWED_KEYS].join(', ')}` }, { status: 400 });
    }

    const value = await getSetting(key);
    return NextResponse.json({ key, value });
  } catch (error: any) {
    console.error('Admin settings API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** Sets a runtime override; omit `value` (or send null) to clear it back to the default. */
export async function POST(req: Request) {
  try {
    const { token, key, value } = await req.json();

    const denied = await denyAdmin(req, token);
    if (denied) return denied;

    if (typeof key !== 'string' || !ALLOWED_KEYS.has(key)) {
      return NextResponse.json({ error: `key must be one of: ${[...ALLOWED_KEYS].join(', ')}` }, { status: 400 });
    }

    if (value === null || value === undefined) {
      await deleteSetting(key);
      return NextResponse.json({ ok: true, key, value: null });
    }

    if (typeof value !== 'string') {
      return NextResponse.json({ error: 'value must be a string or null' }, { status: 400 });
    }

    await setSetting(key, value);
    return NextResponse.json({ ok: true, key, value });
  } catch (error: any) {
    console.error('Admin settings API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

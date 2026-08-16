import { NextResponse } from 'next/server';
import { getGuideStore } from '@/lib/guideStore';
import { DEFAULT_LOCALE, Locale, isLocale } from '@/lib/i18n';
import { looksLikeModelScaffolding } from '@/lib/guideText';

/**
 * A ceiling for the archived deep tier, so a popular artwork cannot grow an
 * unbounded guide out of every visitor's questions.
 */
const MAX_DEEP_LENGTH = 12000;
const MAX_BLOCK_LENGTH = 4000;

/**
 * Folds a deep dive, or the answer to a visitor's question, back into the
 * archived guide, so the next listener hears everything earlier ones asked for.
 * The client sends the block already formatted, exactly as it reads on screen.
 */
export async function POST(req: Request) {
  try {
    const { title, artist, block, locale: rawLocale } = await req.json();
    const locale: Locale =
      typeof rawLocale === 'string' && isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const addition = typeof block === 'string' ? block.trim().slice(0, MAX_BLOCK_LENGTH) : '';
    if (!addition) {
      return NextResponse.json({ error: 'block is required' }, { status: 400 });
    }

    // An archived guide outlives the visit that produced it, so a model that
    // answered with JSON or with its own reasoning must not be written down.
    if (looksLikeModelScaffolding(addition)) {
      return NextResponse.json({ ok: false, reason: 'not_prose' });
    }

    const store = getGuideStore();
    const cached = await store.get(title, typeof artist === 'string' ? artist : '', locale);
    // Nothing to extend: the guide was never archived, and half a guide is worse
    // than none. The next full generation will archive it.
    if (!cached) {
      return NextResponse.json({ ok: false, reason: 'not_cached' });
    }

    let guide: Record<string, unknown>;
    try {
      guide = JSON.parse(cached.payload);
    } catch {
      return NextResponse.json({ ok: false, reason: 'unparsable' });
    }

    const deep = typeof guide.deep === 'string' ? guide.deep : '';
    if (!deep) {
      return NextResponse.json({ ok: false, reason: 'no_deep_tier' });
    }
    // The same question gets asked again and again; archive each answer once.
    if (deep.includes(addition)) {
      return NextResponse.json({ ok: false, reason: 'duplicate' });
    }
    if (deep.length + addition.length > MAX_DEEP_LENGTH) {
      return NextResponse.json({ ok: false, reason: 'full' });
    }

    guide.deep = `${deep}\n\n${addition}`;
    await store.put(title, typeof artist === 'string' ? artist : '', JSON.stringify(guide), locale);

    return NextResponse.json({ ok: true, store: store.name, deepLength: (guide.deep as string).length });
  } catch (error: any) {
    console.error('Guide augment error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

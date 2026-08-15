import { NextResponse } from 'next/server';
import { FeedbackKind, getFeedbackStore } from '@/lib/feedbackStore';
import { createServiceClient } from '@/lib/supabase';
import { CORRECTIONS_TABLE } from '@/lib/readingCorrections';
import { proposeGuideCorrection } from '@/lib/guideCorrections';
import { DEFAULT_LOCALE, Locale, isLocale } from '@/lib/i18n';

const KINDS: FeedbackKind[] = ['good', 'bad', 'bug'];

/**
 * A misreading report. It goes to the moderation queue instead of the guide
 * feedback store, because an approved entry changes what every visitor hears.
 */
async function putPronunciation(body: any) {
  const original = typeof body.original === 'string' ? body.original.trim() : '';
  const suggested = typeof body.suggested === 'string' ? body.suggested.trim() : '';

  if (!original || !suggested) {
    return NextResponse.json({ error: 'original and suggested are required' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from(CORRECTIONS_TABLE).insert({
    original: original.slice(0, 200),
    reading: suggested.slice(0, 200),
    context: typeof body.context === 'string' ? body.context.slice(0, 2000) : null
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, store: 'pronunciation_corrections' });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, artist, kind, comment, excerpt, userId, locale: rawLocale } = body;

    if (kind === 'pronunciation') {
      return putPronunciation(body);
    }

    if (!KINDS.includes(kind)) {
      return NextResponse.json({ error: 'Unknown feedback kind' }, { status: 400 });
    }
    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const entry = {
      title,
      artist: typeof artist === 'string' ? artist : '',
      kind,
      comment: typeof comment === 'string' ? comment.slice(0, 2000) : '',
      excerpt: typeof excerpt === 'string' ? excerpt.slice(0, 2000) : '',
      userId: typeof userId === 'string' && userId ? userId : null
    };

    const store = getFeedbackStore();
    await store.put(entry);

    // A complaint with something to act on becomes a proposed edit for the
    // moderation queue. It never changes the guide on its own, and a failure
    // here must not lose the feedback that was just stored.
    let proposed = false;
    if (kind !== 'good' && entry.comment) {
      try {
        const locale: Locale =
          typeof rawLocale === 'string' && isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
        proposed = Boolean(
          await proposeGuideCorrection({
            title,
            artist: entry.artist,
            locale,
            kind,
            comment: entry.comment,
            excerpt: entry.excerpt
          })
        );
      } catch (error) {
        console.warn('Guide correction proposal failed:', error);
      }
    }

    return NextResponse.json({ ok: true, store: store.name, proposed });
  } catch (error: any) {
    console.error('Feedback API Route Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

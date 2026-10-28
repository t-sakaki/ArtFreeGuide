import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

const KINDS = ['impression', 'click'] as const;
const BASES = ['artwork', 'blend', 'taste', 'none'] as const;
/** One card tap is one row; a shelf render is a handful. Generous but bounded. */
const MAX_ITEMS = 20;

type Kind = (typeof KINDS)[number];
type Basis = (typeof BASES)[number];

function isKind(value: unknown): value is Kind {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value);
}

function isBasis(value: unknown): value is Basis {
  return typeof value === 'string' && (BASES as readonly string[]).includes(value);
}

/**
 * Whether a recommendation shelf was ever shown, and whether it was taken —
 * the only way to tell if personalising the taste vector (`basis: 'blend'` /
 * `'taste'`) actually earns more clicks than a plain similarity match
 * (`basis: 'artwork'`), instead of assuming the extra complexity pays off.
 */
export async function POST(req: Request) {
  try {
    const { userId, kind, basis, sourceTitle, sourceArtist, items } = await req.json();

    if (!isKind(kind)) {
      return NextResponse.json({ error: 'Unknown event kind' }, { status: 400 });
    }
    if (!isBasis(basis) || basis === 'none') {
      return NextResponse.json({ error: 'Unknown or empty basis' }, { status: 400 });
    }
    if (!Array.isArray(items)) {
      return NextResponse.json({ error: 'items must be an array' }, { status: 400 });
    }

    const rows = items
      .filter((item: any) => typeof item?.title === 'string' && item.title.trim())
      .slice(0, MAX_ITEMS)
      .map((item: any) => ({
        user_id: typeof userId === 'string' && userId ? userId : null,
        kind,
        basis,
        rec_title: item.title.trim(),
        rec_artist: typeof item.artist === 'string' ? item.artist.trim() : '',
        source_title: typeof sourceTitle === 'string' ? sourceTitle.trim() : '',
        source_artist: typeof sourceArtist === 'string' ? sourceArtist.trim() : ''
      }));

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No valid items' }, { status: 400 });
    }

    const { error } = await createServiceClient().from('recommendation_events').insert(rows);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, count: rows.length });
  } catch (error: any) {
    // Analytics must never be the reason a visit breaks.
    console.error('Recommendation events API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

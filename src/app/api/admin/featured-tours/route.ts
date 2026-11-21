import { NextResponse } from 'next/server';
import { denyAdmin } from '@/lib/adminAuth';
import {
  deleteFeaturedTour,
  getFeaturedTourBySlug,
  isFeaturedTourStatus,
  listFeaturedTours,
  setFeaturedTourStatus,
  upsertFeaturedTour,
  validateFeaturedTourInput,
  type FeaturedTourStatus,
} from '@/lib/featuredTours';

/** List all dynamic featured tours (or look up one by ?slug=...). */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const denied = await denyAdmin(req, url.searchParams.get('token'));
    if (denied) return denied;

    const slug = url.searchParams.get('slug')?.trim();
    if (slug) {
      const tour = await getFeaturedTourBySlug(slug);
      if (!tour) {
        return NextResponse.json({ error: `Featured tour "${slug}" not found` }, { status: 404 });
      }
      return NextResponse.json({ tour });
    }

    const rawStatus = url.searchParams.get('status') ?? 'all';
    if (rawStatus !== 'all' && !isFeaturedTourStatus(rawStatus)) {
      return NextResponse.json(
        { error: 'status must be one of: all, draft, published, archived' },
        { status: 400 }
      );
    }

    const tours = await listFeaturedTours({ status: rawStatus as FeaturedTourStatus | 'all' });
    return NextResponse.json({ count: tours.length, tours });
  } catch (error: any) {
    console.error('Admin featured tours GET Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Create/update a featured tour, or transition its status (`action: 'set_status'`).
 * Publishing only updates D1 status and stays fast; `/api/chat` warming is run separately.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const denied = await denyAdmin(req, body?.token);
    if (denied) return denied;

    const isStatusTransition =
      body?.action === 'set_status' ||
      (typeof body?.slug === 'string' &&
        body?.status !== undefined &&
        body?.title === undefined &&
        body?.items === undefined);

    if (isStatusTransition) {
      const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : '';
      if (!slug) {
        return NextResponse.json({ error: 'slug is required' }, { status: 400 });
      }
      if (!isFeaturedTourStatus(body?.status)) {
        return NextResponse.json(
          { error: 'status must be one of: draft, published, archived' },
          { status: 400 }
        );
      }

      const tour = await setFeaturedTourStatus(slug, body.status);
      if (!tour) {
        return NextResponse.json({ error: `Featured tour "${slug}" not found` }, { status: 404 });
      }
      return NextResponse.json({ ok: true, tour });
    }

    const parsed = validateFeaturedTourInput(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const tour = await upsertFeaturedTour(parsed.value);
    return NextResponse.json({ ok: true, tour });
  } catch (error: any) {
    console.error('Admin featured tours POST Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** Delete a dynamic featured tour by slug (via JSON body or ?slug=...). */
export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }

    const token = body.token ?? url.searchParams.get('token');
    const denied = await denyAdmin(req, token);
    if (denied) return denied;

    const slug = (typeof body.slug === 'string' ? body.slug : url.searchParams.get('slug') ?? '')
      .trim()
      .toLowerCase();
    if (!slug) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400 });
    }

    const deleted = await deleteFeaturedTour(slug);
    if (!deleted) {
      return NextResponse.json({ error: `Featured tour "${slug}" not found` }, { status: 404 });
    }
    return NextResponse.json({ ok: true, slug });
  } catch (error: any) {
    console.error('Admin featured tours DELETE Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

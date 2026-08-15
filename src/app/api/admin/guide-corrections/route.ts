import { NextResponse } from 'next/server';
import { denyAdmin } from '@/lib/adminAuth';
import { GUIDE_CORRECTIONS_TABLE, GuideCorrectionRow } from '@/lib/guideCorrections';
import { getGuideStore } from '@/lib/guideStore';
import { createServiceClient } from '@/lib/supabase';

const ACTIONS = {
  approve: 'approved',
  reject: 'rejected'
} as const;

/** Guide edits proposed from feedback that are still waiting for a decision. */
export async function GET(req: Request) {
  try {
    const denied = await denyAdmin(req, new URL(req.url).searchParams.get('token'));
    if (denied) return denied;

    const { data, error } = await createServiceClient()
      .from(GUIDE_CORRECTIONS_TABLE)
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const pending = (data ?? []) as GuideCorrectionRow[];
    return NextResponse.json({ count: pending.length, pending });
  } catch (error: any) {
    console.error('Admin guide corrections API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Approving publishes the rewrite: it replaces the archived guide, so the next
 * visitor — and every cached reader after them — gets the corrected text.
 */
export async function POST(req: Request) {
  try {
    const { token, id, action } = await req.json();

    const denied = await denyAdmin(req, token);
    if (denied) return denied;

    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: row, error: readError } = await supabase
      .from(GUIDE_CORRECTIONS_TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle<GuideCorrectionRow>();

    if (readError) {
      return NextResponse.json({ error: readError.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: 'No such correction' }, { status: 404 });
    }

    // Publish before recording the decision: a failed write must leave the row
    // pending rather than claim a correction nobody can read.
    if (action === 'approve') {
      await getGuideStore().put(row.title, row.artist, row.proposal, row.locale);
    }

    const { error: updateError } = await supabase
      .from(GUIDE_CORRECTIONS_TABLE)
      .update({ status: ACTIONS[action as keyof typeof ACTIONS] })
      .eq('id', id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id, status: ACTIONS[action as keyof typeof ACTIONS] });
  } catch (error: any) {
    console.error('Admin guide corrections API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

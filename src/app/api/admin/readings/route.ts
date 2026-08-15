import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { denyAdmin } from '@/lib/adminAuth';
import { CORRECTIONS_TABLE, CorrectionRow } from '@/lib/readingCorrections';

const ACTIONS = {
  approve: 'approved',
  reject: 'rejected'
} as const;

type Action = keyof typeof ACTIONS;

/** Reported misreadings still waiting for a decision. */
export async function GET(req: Request) {
  try {
    const denied = await denyAdmin(req, new URL(req.url).searchParams.get('token'));
    if (denied) return denied;

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from(CORRECTIONS_TABLE)
      .select('id, original, reading, context, status, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const pending = (data ?? []) as CorrectionRow[];
    return NextResponse.json({ count: pending.length, pending });
  } catch (error: any) {
    console.error('Admin readings API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** Approve or reject a single report. Approved readings go live on next load. */
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
    const { data, error } = await supabase
      .from(CORRECTIONS_TABLE)
      .update({ status: ACTIONS[action as Action] })
      .eq('id', id)
      .select('id, original, reading, context, status, created_at')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'No such correction' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, correction: data as CorrectionRow });
  } catch (error: any) {
    console.error('Admin readings API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

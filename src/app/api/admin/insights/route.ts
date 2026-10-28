import { NextResponse } from 'next/server';
import { denyAdmin } from '@/lib/adminAuth';
import {
  loadCorrectionImpact,
  loadGuideQuality,
  loadRecommendationCtr,
  proposeDropoffCorrections
} from '@/lib/insights';
import { createServiceClient } from '@/lib/supabase';

/**
 * The outer loop: not just "a correction was approved" or "a recommendation
 * was personalised", but whether either actually moved a real number.
 *
 * The one write this route makes is queuing a dropoff-driven rewrite
 * proposal — nothing it does publishes anything on its own; a moderator
 * still approves it in the same queue a visitor's own report lands in.
 */
export async function GET(req: Request) {
  try {
    const denied = await denyAdmin(req, new URL(req.url).searchParams.get('token'));
    if (denied) return denied;

    const supabase = createServiceClient();
    const [guideQuality, correctionImpact, recommendationCtr] = await Promise.all([
      loadGuideQuality(supabase),
      loadCorrectionImpact(supabase),
      loadRecommendationCtr(supabase)
    ]);

    const { queued: autoQueued } = await proposeDropoffCorrections(supabase, guideQuality);

    return NextResponse.json({ guideQuality, correctionImpact, recommendationCtr, autoQueued });
  } catch (error: any) {
    console.error('Admin insights API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

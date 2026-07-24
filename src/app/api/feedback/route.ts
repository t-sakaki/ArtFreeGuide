import { NextResponse } from 'next/server';
import { saveFeedback } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { artwork_id, type, score, comment } = body;

    if (!artwork_id || !type) {
      return NextResponse.json(
        { error: 'artwork_id and type are required' },
        { status: 400 }
      );
    }

    const success = await saveFeedback({
      artwork_id: Number(artwork_id),
      type,
      score: score !== undefined ? Number(score) : null,
      comment: comment || null
    });

    if (!success) {
      return NextResponse.json({ error: 'Failed to record feedback' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Feedback recorded successfully' });
  } catch (error: any) {
    console.error('[FeedbackAPI] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { FeedbackKind, getFeedbackStore } from '@/lib/feedbackStore';

const KINDS: FeedbackKind[] = ['good', 'bad', 'bug'];

export async function POST(req: Request) {
  try {
    const { title, artist, kind, comment, excerpt, userId } = await req.json();

    if (!KINDS.includes(kind)) {
      return NextResponse.json({ error: 'Unknown feedback kind' }, { status: 400 });
    }
    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const store = getFeedbackStore();
    await store.put({
      title,
      artist: typeof artist === 'string' ? artist : '',
      kind,
      comment: typeof comment === 'string' ? comment.slice(0, 2000) : '',
      excerpt: typeof excerpt === 'string' ? excerpt.slice(0, 2000) : '',
      userId: typeof userId === 'string' && userId ? userId : null
    });

    return NextResponse.json({ ok: true, store: store.name });
  } catch (error: any) {
    console.error('Feedback API Route Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

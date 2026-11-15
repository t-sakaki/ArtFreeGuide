import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/** Who may moderate, as a comma separated list of e-mail addresses. */
function allowedEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Admin gate. A Supabase session whose e-mail is in ADMIN_EMAILS is the normal
 * path (magic link); ADMIN_TOKEN stays as a scripting fallback. With neither
 * configured the endpoint stays closed, so a missing variable cannot expose it.
 *
 * Returns an error response, or null when the caller may proceed.
 */
export async function denyAdmin(req: Request, token?: unknown): Promise<NextResponse | null> {
  const sharedSecret = process.env.ADMIN_TOKEN;
  const emails = allowedEmails();

  if (!sharedSecret && emails.length === 0) {
    return NextResponse.json(
      { error: 'Set ADMIN_EMAILS (magic link) or ADMIN_TOKEN to use this endpoint' },
      { status: 503 }
    );
  }

  if (sharedSecret && typeof token === 'string' && token === sharedSecret) {
    return null;
  }

  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (jwt && emails.length > 0) {
    const { data, error } = await createServiceClient().auth.getUser(jwt);
    const email = data.user?.email?.toLowerCase();
    if (!error && email && emails.includes(email)) {
      return null;
    }
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

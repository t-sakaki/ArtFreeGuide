'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { browserClient } from '@/lib/supabaseBrowser';

/**
 * Magic-link gate around the moderation tools. The API only accepts addresses
 * listed in ADMIN_EMAILS, so an unknown mailbox gets a link but no data.
 */
export default function AdminGate({ children }: { children: (session: Session) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const supabase = browserClient();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');

    const { error: authError } = await browserClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href }
    });

    if (authError) setError(authError.message);
    else setNotice(`${email} にログインリンクを送りました。メールのリンクを開いてください。`);
  }

  if (!ready) {
    return <p className="text-sm text-slate-400 font-sans">読み込み中…</p>;
  }

  if (!session) {
    return (
      <form onSubmit={sendMagicLink} className="space-y-3 font-sans">
        {error && (
          <p className="rounded-xl bg-rose-950/60 px-4 py-3 text-sm text-rose-200">{error}</p>
        )}
        {notice && (
          <p className="rounded-xl bg-emerald-950/60 px-4 py-3 text-sm text-emerald-200">{notice}</p>
        )}
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500" htmlFor="admin-email">
          管理者のメールアドレス
        </label>
        <input
          id="admin-email"
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-xl bg-slate-900 border border-slate-800 px-4 py-2 text-slate-100 outline-none focus:border-teal-500/60"
        />
        <button
          type="submit"
          className="rounded-xl bg-teal-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-teal-400 active:scale-95 transition-all"
        >
          ログインリンクを送る
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-4 font-sans">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="truncate">{session.user.email}</span>
        <button onClick={() => browserClient().auth.signOut()} className="hover:underline">
          ログアウト
        </button>
      </div>
      {children(session)}
    </div>
  );
}

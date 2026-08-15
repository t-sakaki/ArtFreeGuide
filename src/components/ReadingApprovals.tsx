'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase';
import type { CorrectionRow } from '@/lib/readingCorrections';

// Created on first use: the anon client reads env at call time, and the pages
// embedding this panel are prerendered where those variables are not set.
let client: SupabaseClient | null = null;
function supabaseClient(): SupabaseClient {
  if (!client) client = createClient();
  return client;
}

/**
 * Moderation queue for reported misreadings. Sign in with a magic link; the
 * API only accepts addresses listed in ADMIN_EMAILS, so an unknown mailbox
 * gets a link but no data.
 */
export default function ReadingApprovals() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<CorrectionRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = supabaseClient();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    if (!session) return;
    setError('');

    const res = await fetch('/api/admin/readings', {
      headers: { authorization: `Bearer ${session.access_token}` }
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || `読み込みに失敗しました (${res.status})`);
      setPending([]);
      return;
    }
    setPending(data.pending ?? []);
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');

    const { error: authError } = await supabaseClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href }
    });

    if (authError) setError(authError.message);
    else setNotice(`${email} にログインリンクを送りました。メールのリンクを開いてください。`);
  }

  async function decide(id: string, action: 'approve' | 'reject') {
    if (!session) return;
    setBusyId(id);
    setError('');

    const res = await fetch('/api/admin/readings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ id, action })
    });
    const data = await res.json();

    setBusyId(null);
    if (!res.ok) {
      setError(data.error || `更新に失敗しました (${res.status})`);
      return;
    }
    setPending(rows => rows.filter(row => row.id !== id));
  }

  if (!ready) {
    return <p className="text-sm text-slate-400 font-sans">読み込み中…</p>;
  }

  return (
    <div className="space-y-4 font-sans">
      {error && (
        <p className="rounded-xl bg-rose-950/60 px-4 py-3 text-sm text-rose-200">{error}</p>
      )}
      {notice && (
        <p className="rounded-xl bg-emerald-950/60 px-4 py-3 text-sm text-emerald-200">{notice}</p>
      )}

      {!session ? (
        <form onSubmit={sendMagicLink} className="space-y-3">
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
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="truncate">{session.user.email}</span>
            <div className="flex gap-3">
              <button onClick={load} className="text-teal-400 hover:underline">
                再読み込み
              </button>
              <button
                onClick={() => supabaseClient().auth.signOut()}
                className="hover:underline"
              >
                ログアウト
              </button>
            </div>
          </div>

          {pending.length === 0 ? (
            <p className="rounded-xl bg-slate-900/60 border border-slate-800 px-4 py-6 text-center text-sm text-slate-400">
              未処理の報告はありません。
            </p>
          ) : (
            <ul className="space-y-3">
              {pending.map(row => (
                <li key={row.id} className="rounded-2xl bg-slate-900/60 border border-slate-800 p-4">
                  <p className="text-base">
                    <span className="font-bold text-slate-100">{row.original}</span>
                    <span className="mx-2 text-slate-600">→</span>
                    <span className="font-bold text-teal-400">{row.reading}</span>
                  </p>
                  {row.context && <p className="mt-1 text-xs text-slate-400">{row.context}</p>}
                  <p className="mt-1 text-[10px] text-slate-600">
                    {new Date(row.created_at).toLocaleString('ja-JP')}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      disabled={busyId === row.id}
                      onClick={() => decide(row.id, 'approve')}
                      className="rounded-lg bg-teal-500 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-teal-400 active:scale-95 transition-all disabled:opacity-50"
                    >
                      承認
                    </button>
                    <button
                      disabled={busyId === row.id}
                      onClick={() => decide(row.id, 'reject')}
                      className="rounded-lg bg-slate-800 px-4 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-700 active:scale-95 transition-all disabled:opacity-50"
                    >
                      却下
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

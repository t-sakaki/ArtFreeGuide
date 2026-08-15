'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase';
import type { CorrectionRow } from '@/lib/readingCorrections';

// Created on first use: the anon client reads env at call time, and this page
// is prerendered at build where those variables are not available.
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
export default function AdminReadingsPage() {
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
    return <main className="min-h-screen bg-slate-950 p-8 text-slate-300">読み込み中…</main>;
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100 sm:p-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold">読み替え辞書の承認</h1>
          <p className="text-sm text-slate-400">
            承認した読みは、次回のページ読み込みから音声ガイドに反映されます。
          </p>
        </header>

        {error && (
          <p className="rounded-lg bg-rose-950/60 px-4 py-3 text-sm text-rose-200">{error}</p>
        )}
        {notice && (
          <p className="rounded-lg bg-emerald-950/60 px-4 py-3 text-sm text-emerald-200">{notice}</p>
        )}

        {!session ? (
          <form onSubmit={sendMagicLink} className="space-y-3 rounded-xl bg-slate-900 p-5">
            <label className="block text-sm text-slate-300" htmlFor="admin-email">
              管理者のメールアドレス
            </label>
            <input
              id="admin-email"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg bg-slate-800 px-4 py-2 text-slate-100 outline-none focus:ring-2 focus:ring-sky-500"
            />
            <button
              type="submit"
              className="rounded-lg bg-sky-600 px-4 py-2 font-medium hover:bg-sky-500"
            >
              ログインリンクを送る
            </button>
          </form>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm text-slate-400">
              <span>{session.user.email} でログイン中</span>
              <div className="flex gap-3">
                <button onClick={load} className="text-sky-400 hover:underline">
                  再読み込み
                </button>
                <button
                  onClick={() => supabaseClient().auth.signOut()}
                  className="text-slate-400 hover:underline"
                >
                  ログアウト
                </button>
              </div>
            </div>

            {pending.length === 0 ? (
              <p className="rounded-xl bg-slate-900 px-4 py-6 text-center text-slate-400">
                未処理の報告はありません。
              </p>
            ) : (
              <ul className="space-y-3">
                {pending.map(row => (
                  <li key={row.id} className="rounded-xl bg-slate-900 p-5">
                    <p className="text-lg">
                      <span className="font-semibold">{row.original}</span>
                      <span className="mx-2 text-slate-500">→</span>
                      <span className="font-semibold text-sky-300">{row.reading}</span>
                    </p>
                    {row.context && (
                      <p className="mt-1 text-sm text-slate-400">{row.context}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      {new Date(row.created_at).toLocaleString('ja-JP')}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        disabled={busyId === row.id}
                        onClick={() => decide(row.id, 'approve')}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
                      >
                        承認
                      </button>
                      <button
                        disabled={busyId === row.id}
                        onClick={() => decide(row.id, 'reject')}
                        className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-600 disabled:opacity-50"
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
    </main>
  );
}

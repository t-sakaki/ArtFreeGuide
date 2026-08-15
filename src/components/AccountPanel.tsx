'use client';

import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { browserClient } from '@/lib/supabaseBrowser';
import {
  clearStoredUserId,
  ensureAnonymousUser,
  getStoredUserId,
  setStoredUserId
} from '@/lib/user';

interface Props {
  /** Told which profile to use once sign-in resolves it. */
  onUserId: (userId: string | null) => void;
}

/**
 * Optional sign-in. Guides heard anonymously are not lost: the browser's
 * profile is claimed by the account (or folded into it), so history and taste
 * follow the visitor to their next device.
 */
export default function AccountPanel({ onUserId }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const linkedFor = useRef<string | null>(null);

  useEffect(() => {
    let unsubscribe = () => {};

    browserClient()
      .then(async supabase => {
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
        setReady(true);

        const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
          setSession(next);
        });
        unsubscribe = () => listener.subscription.unsubscribe();
      })
      .catch(err => {
        setError(err.message || 'ログイン機能を初期化できませんでした');
        setReady(true);
      });

    return () => unsubscribe();
  }, []);

  // Resolve the profile once per signed-in user, not on every token refresh.
  useEffect(() => {
    if (!session || linkedFor.current === session.user.id) return;
    linkedFor.current = session.user.id;

    (async () => {
      setBusy(true);
      try {
        const res = await fetch('/api/auth/link', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ anonymousUserId: getStoredUserId() })
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || `ログインの反映に失敗しました (${res.status})`);
          return;
        }

        setStoredUserId(data.userId);
        onUserId(data.userId);
        setNotice(
          data.merged
            ? 'この端末の視聴履歴をアカウントに引き継ぎました。'
            : 'ログインしました。履歴と好みはこのアカウントに保存されます。'
        );
      } catch (err: any) {
        setError(err.message || 'ログインの反映に失敗しました');
      } finally {
        setBusy(false);
      }
    })();
  }, [session, onUserId]);

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');

    try {
      const supabase = await browserClient();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.href }
      });

      if (authError) setError(authError.message);
      else setNotice(`${email} にログインリンクを送りました。メールのリンクを開いてください。`);
    } catch (err: any) {
      setError(err.message || 'ログインリンクを送れませんでした');
    }
  }

  async function signOut() {
    setBusy(true);
    const supabase = await browserClient();
    await supabase.auth.signOut();
    linkedFor.current = null;
    clearStoredUserId();
    onUserId(await ensureAnonymousUser());
    setNotice('ログアウトしました。この端末は匿名の利用に戻ります。');
    setBusy(false);
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
          <p className="text-sm text-slate-400">
            メールアドレスにログインリンクを送ります。パスワードは不要です。ログインすると、いま聴いた履歴と好みが引き継がれ、別の端末でも同じおすすめが出ます。
          </p>
          <input
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
        <div className="space-y-3">
          <p className="text-sm text-slate-300">
            <span className="text-slate-500">ログイン中: </span>
            {session.user.email}
          </p>
          <button
            onClick={signOut}
            disabled={busy}
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-slate-300 hover:bg-slate-700 active:scale-95 transition-all disabled:opacity-50"
          >
            ログアウト
          </button>
        </div>
      )}
    </div>
  );
}

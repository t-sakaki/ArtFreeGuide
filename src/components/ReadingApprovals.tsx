'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import AdminGate from '@/components/AdminGate';
import type { CorrectionRow } from '@/lib/readingCorrections';

/** Moderation queue for reported misreadings. Approved entries go live on reload. */
function Queue({ session }: { session: Session }) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState<CorrectionRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
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

  async function decide(id: string, action: 'approve' | 'reject') {
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

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-xl bg-rose-950/60 px-4 py-3 text-sm text-rose-200">{error}</p>
      )}

      <div className="text-right">
        <button onClick={load} className="text-xs text-teal-400 hover:underline">
          再読み込み
        </button>
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
    </div>
  );
}

export default function ReadingApprovals() {
  return <AdminGate>{session => <Queue session={session} />}</AdminGate>;
}

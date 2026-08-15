'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import AdminGate from '@/components/AdminGate';
import type { GuideCorrectionRow } from '@/lib/guideCorrections';

const FIELD_LABELS: Record<string, string> = {
  short: '概要',
  standard: '標準',
  deep: '詳細'
};

interface FieldChange {
  field: string;
  before: string;
  after: string;
}

function parse(payload: string): Record<string, unknown> {
  try {
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

/** Only the parts of the guide the proposal actually rewrites. */
function changes(row: GuideCorrectionRow): FieldChange[] {
  const before = parse(row.original);
  const after = parse(row.proposal);

  return Object.keys(FIELD_LABELS)
    .filter(field => before[field] !== after[field])
    .map(field => ({
      field,
      before: String(before[field] ?? ''),
      after: String(after[field] ?? '')
    }));
}

function Diff({ row }: { row: GuideCorrectionRow }) {
  const fields = useMemo(() => changes(row), [row]);

  return (
    <div className="mt-3 space-y-3">
      {fields.map(({ field, before, after }) => (
        <div key={field} className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {FIELD_LABELS[field]}
          </p>
          <p className="whitespace-pre-wrap rounded-lg bg-rose-950/30 px-3 py-2 text-xs text-rose-200/80">
            {before}
          </p>
          <p className="whitespace-pre-wrap rounded-lg bg-emerald-950/30 px-3 py-2 text-xs text-emerald-100">
            {after}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * Guide edits the model drafted from visitor feedback. Approving one replaces
 * the archived guide, so the next visitor reads the corrected text.
 */
function Queue({ session }: { session: Session }) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState<GuideCorrectionRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');

    const res = await fetch('/api/admin/guide-corrections', {
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

    const res = await fetch('/api/admin/guide-corrections', {
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
          未処理の修正案はありません。
        </p>
      ) : (
        <ul className="space-y-3">
          {pending.map(row => (
            <li key={row.id} className="rounded-2xl bg-slate-900/60 border border-slate-800 p-4">
              <p className="text-sm font-bold text-slate-100">
                {row.title}
                {row.artist && <span className="ml-2 text-xs text-slate-400">{row.artist}</span>}
                {row.locale !== 'ja' && (
                  <span className="ml-2 text-[10px] uppercase text-slate-500">{row.locale}</span>
                )}
              </p>
              <p className="mt-1 text-xs text-slate-400">💬 {row.comment}</p>
              {row.note && <p className="mt-1 text-xs text-teal-300">✏️ {row.note}</p>}
              <p className="mt-1 text-[10px] text-slate-600">
                {new Date(row.created_at).toLocaleString('ja-JP')}
              </p>

              <button
                onClick={() => setOpenId(openId === row.id ? null : row.id)}
                className="mt-2 text-xs text-teal-400 hover:underline"
              >
                {openId === row.id ? '差分を隠す' : '差分を見る'}
              </button>
              {openId === row.id && <Diff row={row} />}

              <div className="mt-3 flex gap-2">
                <button
                  disabled={busyId === row.id}
                  onClick={() => decide(row.id, 'approve')}
                  className="rounded-lg bg-teal-500 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-teal-400 active:scale-95 transition-all disabled:opacity-50"
                >
                  承認して反映
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

export default function GuideCorrections() {
  return <AdminGate>{session => <Queue session={session} />}</AdminGate>;
}

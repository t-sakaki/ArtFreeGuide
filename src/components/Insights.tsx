'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import AdminGate from '@/components/AdminGate';
import type {
  CorrectionImpactRow,
  GuideQualityRow,
  RecommendationCtrRow
} from '@/lib/insights';

interface InsightsResponse {
  guideQuality: GuideQualityRow[];
  correctionImpact: CorrectionImpactRow[];
  recommendationCtr: RecommendationCtrRow[];
  autoQueued: number;
}

const BASIS_LABELS: Record<string, string> = {
  artwork: '類似のみ',
  blend: '好み + 類似',
  taste: '好みのみ'
};

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/**
 * The outer loop, made visible: whether a correction actually raised
 * completion, and whether personalising recommendations (`blend`/`taste`)
 * actually earns more clicks than plain similarity (`artwork`). Loading this
 * report is also what drives the worst guide-quality rows into a rewrite
 * proposal (see `autoQueued` below) — nothing here publishes anything on its
 * own, a moderator still approves the proposal in the "解説" tab.
 */
function Report({ session }: { session: Session }) {
  const [error, setError] = useState('');
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/insights', {
        headers: { authorization: `Bearer ${session.access_token}` }
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || `読み込みに失敗しました (${res.status})`);
        return;
      }
      setData(body);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      {error && <p className="rounded-xl bg-rose-950/60 px-4 py-3 text-sm text-rose-200">{error}</p>}

      <div className="text-right">
        <button onClick={load} className="text-xs text-teal-400 hover:underline">
          再読み込み
        </button>
      </div>

      {loading && !data ? (
        <p className="text-center text-sm text-slate-400">読み込み中…</p>
      ) : (
        <>
          {data && data.autoQueued > 0 && (
            <p className="rounded-xl bg-teal-950/40 border border-teal-900/60 px-4 py-3 text-xs text-teal-200">
              🤖 離脱の多いガイド {data.autoQueued}件を、自動で「解説」タブの修正キューに追加しました。内容を確認して承認/却下してください。
            </p>
          )}

          <section className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              離脱の多いガイド(通報なしで検知)
            </h4>
            {!data || data.guideQuality.length === 0 ? (
              <p className="rounded-xl bg-slate-900/60 border border-slate-800 px-4 py-4 text-center text-xs text-slate-400">
                サンプルがまだ足りません。
              </p>
            ) : (
              <ul className="space-y-2">
                {data.guideQuality.map(row => (
                  <li
                    key={`${row.title}::${row.artist}`}
                    className="rounded-xl bg-slate-900/60 border border-slate-800 px-4 py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-100 truncate">{row.title}</p>
                      <p className="text-[10px] text-slate-500 truncate">{row.artist}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-rose-300">{pct(row.avgCompletion)}</p>
                      <p className="text-[10px] text-slate-600">n={row.samples}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              修正の効果(承認前 → 承認後の完聴率)
            </h4>
            {!data || data.correctionImpact.length === 0 ? (
              <p className="rounded-xl bg-slate-900/60 border border-slate-800 px-4 py-4 text-center text-xs text-slate-400">
                比較できる修正がまだありません(前後とも十分な視聴データが必要です)。
              </p>
            ) : (
              <ul className="space-y-2">
                {data.correctionImpact.map(row => {
                  const improved = row.after.avgCompletion >= row.before.avgCompletion;
                  return (
                    <li
                      key={`${row.title}::${row.artist}::${row.resolvedAt}`}
                      className="rounded-xl bg-slate-900/60 border border-slate-800 px-4 py-2.5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-100 truncate">{row.title}</p>
                        <p className="text-[10px] text-slate-500 truncate">{row.artist}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-bold ${improved ? 'text-teal-300' : 'text-rose-300'}`}>
                          {pct(row.before.avgCompletion)} → {pct(row.after.avgCompletion)}
                        </p>
                        <p className="text-[10px] text-slate-600">
                          n={row.before.samples}→{row.after.samples}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              おすすめのクリック率(basis別)
            </h4>
            {!data || data.recommendationCtr.length === 0 ? (
              <p className="rounded-xl bg-slate-900/60 border border-slate-800 px-4 py-4 text-center text-xs text-slate-400">
                まだイベントがありません。
              </p>
            ) : (
              <ul className="space-y-2">
                {data.recommendationCtr.map(row => (
                  <li
                    key={row.basis}
                    className="rounded-xl bg-slate-900/60 border border-slate-800 px-4 py-2.5 flex items-center justify-between gap-3"
                  >
                    <p className="text-sm font-bold text-slate-100">
                      {BASIS_LABELS[row.basis] ?? row.basis}
                    </p>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-teal-300">{pct(row.ctr)}</p>
                      <p className="text-[10px] text-slate-600">
                        {row.clicks}/{row.impressions}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function Insights() {
  return <AdminGate>{session => <Report session={session} />}</AdminGate>;
}

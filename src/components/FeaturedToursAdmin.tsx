'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import AdminGate from '@/components/AdminGate';
import type { FeaturedTourRecord, FeaturedTourStatus } from '@/lib/featuredTours';
import type { PlaylistItem } from '@/lib/playlists';

const STATUS_BADGE: Record<FeaturedTourStatus, string> = {
  draft: 'bg-amber-950/70 text-amber-300 border-amber-800/70',
  published: 'bg-emerald-950/70 text-emerald-300 border-emerald-800/70',
  archived: 'bg-slate-800/80 text-slate-400 border-slate-700',
};

const STATUS_LABEL: Record<FeaturedTourStatus, string> = {
  draft: '下書き',
  published: '公開中',
  archived: 'アーカイブ',
};

function emptyItem(): PlaylistItem {
  return { title: '', artist: '', cue: '' };
}

function ToursPanel({ session }: { session: Session }) {
  const [tours, setTours] = useState<FeaturedTourRecord[]>([]);
  const [filter, setFilter] = useState<'all' | FeaturedTourStatus>('all');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Form state
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [slug, setSlug] = useState('');
  const [emoji, setEmoji] = useState('✨');
  const [status, setStatus] = useState<FeaturedTourStatus>('draft');
  const [sortOrder, setSortOrder] = useState('0');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [items, setItems] = useState<PlaylistItem[]>([emptyItem()]);
  const [i18nJson, setI18nJson] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/featured-tours?status=${filter}`, {
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `読み込みに失敗しました (${res.status})`);
        setTours([]);
        return;
      }
      setTours(data.tours ?? []);
    } catch (err: any) {
      setError(err?.message || '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [filter, session.access_token]);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setEditingSlug(null);
    setSlug('');
    setEmoji('✨');
    setStatus('draft');
    setSortOrder('0');
    setTitle('');
    setSubtitle('');
    setSourceUrl('');
    setStartsAt('');
    setEndsAt('');
    setItems([emptyItem()]);
    setI18nJson('');
  }

  function startEdit(tour: FeaturedTourRecord) {
    setEditingSlug(tour.slug);
    setSlug(tour.slug);
    setEmoji(tour.emoji);
    setStatus(tour.status);
    setSortOrder(String(tour.sortOrder));
    setTitle(tour.title);
    setSubtitle(tour.subtitle);
    setSourceUrl(tour.sourceUrl ?? '');
    setStartsAt(tour.startsAt ?? '');
    setEndsAt(tour.endsAt ?? '');
    setItems(tour.items.length > 0 ? tour.items : [emptyItem()]);
    setI18nJson(Object.keys(tour.i18n ?? {}).length > 0 ? JSON.stringify(tour.i18n, null, 2) : '');
    setNotice('');
    setError('');
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');

    let parsedI18n: unknown = {};
    if (i18nJson.trim()) {
      try {
        parsedI18n = JSON.parse(i18nJson);
      } catch {
        setError('i18n JSON の構文が正しくありません。');
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/featured-tours', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          slug: slug.trim().toLowerCase(),
          emoji: emoji.trim() || '✨',
          status,
          sortOrder: Number(sortOrder || 0),
          title: title.trim(),
          subtitle: subtitle.trim(),
          sourceUrl: sourceUrl.trim() || null,
          startsAt: startsAt.trim() || null,
          endsAt: endsAt.trim() || null,
          items: items.map(item => ({
            title: item.title.trim(),
            artist: item.artist.trim(),
            cue: item.cue.trim(),
          })),
          i18n: parsedI18n,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `保存に失敗しました (${res.status})`);
        return;
      }

      setNotice(`「${data.tour.title}」(${data.tour.slug}) を保存しました。`);
      resetForm();
      await load();
    } catch (err: any) {
      setError(err?.message || '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(targetSlug: string, nextStatus: FeaturedTourStatus) {
    setBusySlug(targetSlug);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/admin/featured-tours', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: 'set_status', slug: targetSlug, status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `ステータス更新に失敗しました (${res.status})`);
        return;
      }
      setNotice(`${targetSlug} を「${STATUS_LABEL[nextStatus]}」に変更しました。`);
      await load();
    } finally {
      setBusySlug(null);
    }
  }

  async function removeTour(targetSlug: string) {
    if (!window.confirm(`特集ツアー "${targetSlug}" を完全に削除しますか？`)) return;
    setBusySlug(targetSlug);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/admin/featured-tours?slug=${encodeURIComponent(targetSlug)}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `削除に失敗しました (${res.status})`);
        return;
      }
      if (editingSlug === targetSlug) resetForm();
      setNotice(`${targetSlug} を削除しました。`);
      await load();
    } finally {
      setBusySlug(null);
    }
  }

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-xl bg-rose-950/60 border border-rose-800/60 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-xl bg-emerald-950/60 border border-emerald-800/60 px-4 py-3 text-sm text-emerald-200">
          {notice}
        </p>
      )}

      {/* List & Moderation Controls */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {(['all', 'draft', 'published', 'archived'] as const).map(key => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  filter === key
                    ? 'bg-teal-500 text-slate-950'
                    : 'bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                {key === 'all' ? 'すべて' : STATUS_LABEL[key]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="text-xs text-teal-400 hover:underline disabled:opacity-50"
          >
            {loading ? '読み込み中…' : '再読み込み'}
          </button>
        </div>

        {tours.length === 0 ? (
          <p className="rounded-xl bg-slate-900/60 border border-slate-800 px-4 py-6 text-center text-sm text-slate-400">
            該当する動的特集ツアーはありません。
          </p>
        ) : (
          <ul className="space-y-3">
            {tours.map(tour => (
              <li key={tour.slug} className="rounded-2xl bg-slate-900/60 border border-slate-800 p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xl">{tour.emoji}</span>
                      <span className="text-sm font-bold text-slate-100">{tour.title}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[tour.status]}`}
                      >
                        {STATUS_LABEL[tour.status]}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{tour.subtitle}</p>
                    <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
                      <span className="font-mono">/{tour.slug}</span>
                      <span>{tour.items.length}作品</span>
                      <span>並び順: {tour.sortOrder}</span>
                      {(tour.startsAt || tour.endsAt) && (
                        <span>
                          期間: {tour.startsAt || '—'} 〜 {tour.endsAt || '—'}
                        </span>
                      )}
                    </div>
                    {tour.sourceUrl && (
                      <p className="text-[11px] text-teal-400/90 truncate">
                        出典:{' '}
                        <a href={tour.sourceUrl} target="_blank" rel="noreferrer" className="underline">
                          {tour.sourceUrl}
                        </a>
                      </p>
                    )}
                  </div>

                  {tour.status === 'published' && (
                    <a
                      href={`/${tour.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-teal-800/70 bg-teal-950/40 px-3 py-1 text-xs text-teal-300 hover:bg-teal-900/50"
                    >
                      公開ページを開く ↗
                    </a>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {tour.status !== 'published' && (
                    <button
                      type="button"
                      disabled={busySlug === tour.slug}
                      onClick={() => changeStatus(tour.slug, 'published')}
                      className="rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-teal-400 disabled:opacity-50"
                    >
                      公開する
                    </button>
                  )}
                  {tour.status !== 'draft' && (
                    <button
                      type="button"
                      disabled={busySlug === tour.slug}
                      onClick={() => changeStatus(tour.slug, 'draft')}
                      className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                    >
                      下書きに戻す
                    </button>
                  )}
                  {tour.status !== 'archived' && (
                    <button
                      type="button"
                      disabled={busySlug === tour.slug}
                      onClick={() => changeStatus(tour.slug, 'archived')}
                      className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                    >
                      アーカイブ
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => startEdit(tour)}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800"
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    disabled={busySlug === tour.slug}
                    onClick={() => removeTour(tour.slug)}
                    className="rounded-lg border border-rose-900/60 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-950/60 disabled:opacity-50"
                  >
                    削除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Upsert Form */}
      <section className="rounded-2xl bg-slate-900/50 border border-slate-800 p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-100">
            {editingSlug ? `特集ツアーを編集: ${editingSlug}` : '新しい特集ツアーを登録'}
          </h2>
          {editingSlug && (
            <button type="button" onClick={resetForm} className="text-xs text-slate-400 hover:underline">
              新規作成に切り替え
            </button>
          )}
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <label className="sm:col-span-2 block space-y-1">
              <span className="text-xs font-bold text-slate-400">スラッグ (URL: /{slug || 'slug'})</span>
              <input
                type="text"
                required
                disabled={Boolean(editingSlug)}
                value={slug}
                onChange={e => setSlug(e.target.value)}
                placeholder="autumn-exhibition-2026"
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500/60 disabled:opacity-60"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-bold text-slate-400">絵文字</span>
              <input
                type="text"
                value={emoji}
                onChange={e => setEmoji(e.target.value)}
                placeholder="✨"
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500/60"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-bold text-slate-400">ステータス</span>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as FeaturedTourStatus)}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500/60"
              >
                <option value="draft">下書き (draft)</option>
                <option value="published">公開中 (published)</option>
                <option value="archived">アーカイブ (archived)</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-bold text-slate-400">タイトル（日本語正表記）</span>
              <input
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="秋の特別展を歩く5作品"
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500/60"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-bold text-slate-400">サブタイトル（展覧会・時事背景）</span>
              <input
                type="text"
                required
                value={subtitle}
                onChange={e => setSubtitle(e.target.value)}
                placeholder="企画展の見どころを予習するミニツアー"
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500/60"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <label className="sm:col-span-2 block space-y-1">
              <span className="text-xs font-bold text-slate-400">出典 URL（任意）</span>
              <input
                type="url"
                value={sourceUrl}
                onChange={e => setSourceUrl(e.target.value)}
                placeholder="https://www.nmwa.go.jp/..."
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500/60"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-bold text-slate-400">公開開始 (ISO, 任意)</span>
              <input
                type="text"
                value={startsAt}
                onChange={e => setStartsAt(e.target.value)}
                placeholder="2026-11-21T00:00:00Z"
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-100 outline-none focus:border-teal-500/60"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-bold text-slate-400">公開終了 (ISO, 任意)</span>
              <input
                type="text"
                value={endsAt}
                onChange={e => setEndsAt(e.target.value)}
                placeholder="2027-02-21T23:59:59Z"
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-100 outline-none focus:border-teal-500/60"
              />
            </label>
          </div>

          <label className="block max-w-[140px] space-y-1">
            <span className="text-xs font-bold text-slate-400">並び順（小さい順）</span>
            <input
              type="number"
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value)}
              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500/60"
            />
          </label>

          {/* Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">収録作品（1〜12点、日本語正表記）</span>
              {items.length < 12 && (
                <button
                  type="button"
                  onClick={() => setItems(prev => [...prev, emptyItem()])}
                  className="text-xs text-teal-400 hover:underline"
                >
                  ＋ 作品を追加
                </button>
              )}
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 rounded-xl bg-slate-950/80 border border-slate-800/80 p-3">
                  <input
                    type="text"
                    required
                    value={item.title}
                    onChange={e =>
                      setItems(prev => prev.map((row, i) => (i === idx ? { ...row, title: e.target.value } : row)))
                    }
                    placeholder={`作品名 #${idx + 1}`}
                    className="sm:col-span-4 rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-teal-500/60"
                  />
                  <input
                    type="text"
                    value={item.artist}
                    onChange={e =>
                      setItems(prev => prev.map((row, i) => (i === idx ? { ...row, artist: e.target.value } : row)))
                    }
                    placeholder="作家名"
                    className="sm:col-span-3 rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-teal-500/60"
                  />
                  <input
                    type="text"
                    value={item.cue}
                    onChange={e =>
                      setItems(prev => prev.map((row, i) => (i === idx ? { ...row, cue: e.target.value } : row)))
                    }
                    placeholder="案内キュー（1文）"
                    className="sm:col-span-4 rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-teal-500/60"
                  />
                  <div className="sm:col-span-1 flex items-center justify-end">
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                        className="text-xs text-rose-400 hover:underline"
                      >
                        削除
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-bold text-slate-400">
              多言語 i18n JSON（任意: en / fr / zh / es などの title, subtitle, cues）
            </span>
            <textarea
              rows={5}
              value={i18nJson}
              onChange={e => setI18nJson(e.target.value)}
              placeholder='{"en":{"title":"...","subtitle":"...","cues":["..."]}}'
              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-teal-500/60"
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-teal-400 active:scale-95 transition-all disabled:opacity-50"
          >
            {saving ? '保存中…' : editingSlug ? '変更を保存' : '特集ツアーを登録'}
          </button>
        </form>
      </section>
    </div>
  );
}

export default function FeaturedToursAdmin() {
  return <AdminGate>{session => <ToursPanel session={session} />}</AdminGate>;
}

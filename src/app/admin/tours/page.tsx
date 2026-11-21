import Link from 'next/link';
import FeaturedToursAdmin from '@/components/FeaturedToursAdmin';

/** Manage D1-backed featured tours without redeploying the app. */
export default function AdminToursPage() {
  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100 sm:p-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="space-y-2 font-sans">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl font-bold">特集ツアー管理（動的配信）</h1>
            <div className="flex gap-4 text-xs text-teal-400">
              <Link href="/admin/guides" className="hover:underline">
                解説修正キュー
              </Link>
              <Link href="/admin/readings" className="hover:underline">
                読み替え辞書
              </Link>
              <Link href="/" className="hover:underline">
                トップへ戻る
              </Link>
            </div>
          </div>
          <p className="text-sm text-slate-400">
            D1 上の特集ツアーを下書き登録・公開・アーカイブできます。再デプロイなしでトップ画面と
            <code className="mx-1 rounded bg-slate-900 px-1.5 py-0.5 text-xs text-slate-300">/&lt;slug&gt;</code>
            に反映されます。
          </p>
        </header>
        <FeaturedToursAdmin />
      </div>
    </main>
  );
}

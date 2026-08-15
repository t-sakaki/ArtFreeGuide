import ReadingApprovals from '@/components/ReadingApprovals';

/** Standalone view of the queue that also lives in the in-app menu. */
export default function AdminReadingsPage() {
  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100 sm:p-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-1 font-sans">
          <h1 className="text-2xl font-bold">読み替え辞書の承認</h1>
          <p className="text-sm text-slate-400">
            承認した読みは、次回のページ読み込みから音声ガイドに反映されます。
          </p>
        </header>
        <ReadingApprovals />
      </div>
    </main>
  );
}

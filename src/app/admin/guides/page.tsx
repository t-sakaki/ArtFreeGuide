import GuideCorrections from '@/components/GuideCorrections';

/** Standalone view of the queue that also lives in the in-app menu. */
export default function AdminGuidesPage() {
  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100 sm:p-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-1 font-sans">
          <h1 className="text-2xl font-bold">解説の修正案の承認</h1>
          <p className="text-sm text-slate-400">
            鑑賞者の指摘をもとにモデルが作った修正案です。承認すると保存済みの解説が置き換わります。
          </p>
        </header>
        <GuideCorrections />
      </div>
    </main>
  );
}

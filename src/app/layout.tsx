import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ArtFreeGuide | 無料の美術館専属音声ガイド',
  description: '専属キュレーターが贈る、あなたのための特別な音声ガイド。美術作品をもっと深く、もっと身近に。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="antialiased bg-slate-950 text-slate-100 min-h-screen selection:bg-teal-500 selection:text-slate-950">
        {children}
      </body>
    </html>
  );
}

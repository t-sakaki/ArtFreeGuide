import './globals.css';
import type { Metadata } from 'next';
import { LOCALES } from '@/lib/i18n';
import { SITE_URL } from '@/lib/site';

const TITLE = 'ArtFreeGuide | 聴くほど賢くなるAI美術館音声ガイド';

const DESCRIPTION =
  'AIキュレーターが贈る、聴くほど賢くなる音声ガイド。作品名を入れるか写真を撮ると、5言語の解説と見どころ案内が始まります。あなたの質問と指摘は解説に残り、次の来訪者に届きます。';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: 'ArtFreeGuide',
  keywords: ['音声ガイド', '美術館', '絵画', 'AI', 'アートガイド', 'audio guide', 'museum', 'art'],
  alternates: {
    canonical: '/',
    languages: Object.fromEntries(LOCALES.map(locale => [locale, `/?lang=${locale}`])),
  },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    siteName: 'ArtFreeGuide',
    url: SITE_URL,
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'ArtFreeGuide' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/og-default.png'],
  },
};

/** Tells a crawler what the single page actually is, since the guide itself is client-rendered. */
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'ArtFreeGuide',
  url: SITE_URL,
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Any',
  inLanguage: LOCALES,
  description: DESCRIPTION,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="antialiased bg-slate-950 text-slate-100 min-h-screen selection:bg-teal-500 selection:text-slate-950">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
        {children}
      </body>
    </html>
  );
}

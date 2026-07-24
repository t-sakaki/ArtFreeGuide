import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { findArtwork, getArtworkImages, slugify } from '@/lib/db';
import ArtFreeGuideClient from './ArtFreeGuideClient';

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const rawWork = params.work || params.artwork || params.title;
  const rawArtist = params.artist;

  const work = Array.isArray(rawWork) ? rawWork[0] : rawWork || '';
  const artist = Array.isArray(rawArtist) ? rawArtist[0] : rawArtist || '';

  const siteUrl = 'https://art-free-guide-trial.taira-sakakibara.workers.dev';
  const defaultTitle = 'ArtFreeGuide | 無料の美術館専属音声ガイド';
  const defaultDesc = '専属キュレーターが贈る、あなたのための特別な音声ガイド。美術作品をもっと深く、もっと身近に。';
  const defaultImage = `${siteUrl}/og-default.png`;

  if (work) {
    try {
      const artwork = await findArtwork(work, artist);
      if (artwork) {
        const artistSlug = artwork.artist_slug || slugify(artwork.artist);
        const artworkSlug = artwork.artwork_slug || `${slugify(artwork.title)}-${artwork.id}`;
        const canonicalUrl = `${siteUrl}/art/${artistSlug}/${artworkSlug}`;

        const images = await getArtworkImages(artwork.id, true);
        const imageUrl = images.length > 0 ? images[0].url : defaultImage;

        const pageTitle = artwork.artist
          ? `${artwork.title} by ${artwork.artist} - 音声ガイド | ArtFreeGuide`
          : `${artwork.title} - 音声ガイド | ArtFreeGuide`;

        const shortClean = (artwork.guide_short || '').replace(/\s+/g, ' ').trim();
        const pageDesc = shortClean
          ? `【無料音声ガイド】${artwork.artist ? `${artwork.artist}『${artwork.title}』` : `『${artwork.title}』`}の魅力や歴史的背景、知られざる見どころを専属キュレーターが解説。${shortClean}`
          : `${artwork.title}${artwork.artist ? ` (${artwork.artist})` : ''}の歴史的背景、技法、知られざる見どころをわかりやすく解説する無料専属音声ガイド。`;

        return {
          title: pageTitle,
          description: pageDesc,
          openGraph: {
            title: pageTitle,
            description: pageDesc,
            url: canonicalUrl,
            siteName: 'ArtFreeGuide',
            images: [
              {
                url: imageUrl,
                alt: artwork.title,
              },
            ],
            type: 'article',
          },
          twitter: {
            card: 'summary_large_image',
            title: pageTitle,
            description: pageDesc,
            images: [imageUrl],
          },
        };
      }
    } catch (e) {
      console.warn('[Metadata] Failed to query artwork for dynamic OGP:', e);
    }
  }

  const fallbackTitle = work
    ? `${work}${artist ? ` by ${artist}` : ''} - 音声ガイド | ArtFreeGuide`
    : defaultTitle;

  return {
    title: fallbackTitle,
    description: defaultDesc,
    openGraph: {
      title: fallbackTitle,
      description: defaultDesc,
      url: siteUrl,
      siteName: 'ArtFreeGuide',
      images: [
        {
          url: defaultImage,
          alt: 'ArtFreeGuide',
        },
      ],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: fallbackTitle,
      description: defaultDesc,
      images: [defaultImage],
    },
  };
}

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  const rawWork = params.work || params.artwork || params.title;
  const rawArtist = params.artist;

  const work = Array.isArray(rawWork) ? rawWork[0] : rawWork || '';
  const artist = Array.isArray(rawArtist) ? rawArtist[0] : rawArtist || '';

  if (work) {
    try {
      const artwork = await findArtwork(work, artist);
      if (artwork) {
        const artistSlug = artwork.artist_slug || slugify(artwork.artist);
        const artworkSlug = artwork.artwork_slug || `${slugify(artwork.title)}-${artwork.id}`;
        redirect(`/art/${artistSlug}/${artworkSlug}`);
      }
    } catch (e: any) {
      if (e?.digest?.startsWith('NEXT_REDIRECT')) {
        throw e;
      }
      console.warn('[Page] Legacy redirect error:', e);
    }
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'ArtFreeGuide',
    url: 'https://art-free-guide-trial.taira-sakakibara.workers.dev',
    description: '専属キュレーターが贈る、あなたのための特別な音声ガイド。美術作品をもっと深く、もっと身近に。',
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ArtFreeGuideClient />
    </>
  );
}

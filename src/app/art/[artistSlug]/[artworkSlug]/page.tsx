import type { Metadata } from 'next';
import { findArtworkBySlug, getArtworkImages, incrementArtworkViewCount } from '@/lib/db';
import ArtFreeGuideClient from '../../../ArtFreeGuideClient';
import { InitialGuideData, RecommendationItem } from '@/types/knowledgeBase';

type Props = {
  params: Promise<{ artistSlug: string; artworkSlug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { artistSlug, artworkSlug } = await params;
  const siteUrl = 'https://art-free-guide-trial.taira-sakakibara.workers.dev';
  const defaultTitle = 'ArtFreeGuide | 無料の美術館専属音声ガイド';
  const defaultDesc = '専属キュレーターが贈る、あなたのための特別な音声ガイド。美術作品をもっと深く、もっと身近に。';
  const defaultImage = `${siteUrl}/og-default.png`;

  if (artistSlug && artworkSlug) {
    try {
      const artwork = await findArtworkBySlug(artistSlug, artworkSlug);
      if (artwork) {
        const images = await getArtworkImages(artwork.id, true);
        const imageUrl = (artwork as any).imageUrl || (images.length > 0 ? images[0].url : defaultImage);

        const pageTitle = artwork.artist
          ? `${artwork.title} | ${artwork.artist} - ArtFreeGuide`
          : `${artwork.title} - ArtFreeGuide`;

        const shortClean = (artwork.guide_short || '').replace(/\s+/g, ' ').trim();
        const pageDesc = shortClean || `【無料音声ガイド】${artwork.artist ? `${artwork.artist}『${artwork.title}』` : `『${artwork.title}』`}の歴史的背景、技法、見どころを詳しく解説する専属音声ガイド。`;

        const canonicalUrl = `${siteUrl}/art/${artwork.artist_slug || artistSlug}/${artwork.artwork_slug || artworkSlug}`;

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
      console.warn('[ArtSlugPage] Metadata error:', e);
    }
  }

  return {
    title: defaultTitle,
    description: defaultDesc,
    openGraph: {
      title: defaultTitle,
      description: defaultDesc,
      url: siteUrl,
      siteName: 'ArtFreeGuide',
      images: [{ url: defaultImage, alt: 'ArtFreeGuide' }],
      type: 'website',
    },
  };
}

export default async function ArtworkSlugPage({ params }: Props) {
  const { artistSlug, artworkSlug } = await params;
  let jsonLd: any = null;
  let initialGuide: InitialGuideData | null = null;

  if (artistSlug && artworkSlug) {
    try {
      const artwork = await findArtworkBySlug(artistSlug, artworkSlug);
      if (artwork) {
        // Asynchronously increment view_count
        incrementArtworkViewCount(artwork.id).catch(err => {
          console.warn('[ArtSlugPage] Non-blocking view_count increment error:', err);
        });

        const images = await getArtworkImages(artwork.id, true);
        const imageUrl = (artwork as any).imageUrl || (images.length > 0 ? images[0].url : null);
        const shortClean = (artwork.guide_short || '').replace(/\s+/g, ' ').trim();

        let parsedRecs: RecommendationItem[] = [];
        if (artwork.recommendations) {
          try {
            parsedRecs = JSON.parse(artwork.recommendations);
          } catch (e) {}
        }

        initialGuide = {
          id: artwork.id,
          title: artwork.title,
          artist: artwork.artist,
          location: artwork.location || null,
          year: artwork.year || null,
          short: artwork.guide_short,
          standard: artwork.guide_standard,
          deep: artwork.guide_deep,
          searchQuery: artwork.search_query || `${artwork.title} ${artwork.artist}`,
          imageUrl,
          recommendations: parsedRecs,
          artistSlug: artwork.artist_slug || artistSlug,
          artworkSlug: artwork.artwork_slug || artworkSlug,
        };

        jsonLd = {
          '@context': 'https://schema.org',
          '@type': 'VisualArtwork',
          name: artwork.title,
          ...(artwork.artist ? { creator: { '@type': 'Person', name: artwork.artist } } : {}),
          description: shortClean || `${artwork.title}の専属音声ガイド解説。`,
          ...(imageUrl ? { image: imageUrl } : {}),
          ...(artwork.location ? { locationCreated: { '@type': 'Place', name: artwork.location } } : {}),
          ...(artwork.year ? { dateCreated: artwork.year } : {}),
          associatedMedia: {
            '@type': 'AudioObject',
            name: `${artwork.title} 音声ガイド`,
            description: shortClean || `${artwork.title}の専属キュレーター音声ガイド解説。`,
            encodingFormat: 'audio/mpeg',
            inLanguage: 'ja',
          },
        };
      }
    } catch (e) {
      console.warn('[ArtSlugPage] D1 artwork lookup error:', e);
    }
  }

  if (!jsonLd) {
    jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'ArtFreeGuide',
      url: 'https://art-free-guide-trial.taira-sakakibara.workers.dev',
      description: '専属キュレーターが贈る、あなたのための特別な音声ガイド。美術作品をもっと深く、もっと身近に。',
    };
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ArtFreeGuideClient initialGuide={initialGuide} />
    </>
  );
}

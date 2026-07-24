import type { Metadata } from 'next';
import { getPlaylistBySlug } from '@/lib/db';
import ArtFreeGuideClient from '../../ArtFreeGuideClient';

type Props = {
  params: Promise<{ playlistSlug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { playlistSlug } = await params;
  const siteUrl = 'https://art-free-guide-trial.taira-sakakibara.workers.dev';
  const defaultTitle = 'ArtFreeGuide | 無料の美術館専属音声ガイドツアー';
  const defaultDesc = '専属キュレーターが贈るテーマ別美術館音声ガイドツアー。名作を順番に巡る特別な鑑賞体験。';
  const defaultImage = `${siteUrl}/og-default.png`;

  if (playlistSlug) {
    try {
      const playlist = await getPlaylistBySlug(playlistSlug);
      if (playlist) {
        const firstItemImage = playlist.items.find(i => i.imageUrl)?.imageUrl || defaultImage;
        const pageTitle = `${playlist.name} - 音声ガイドツアー | ArtFreeGuide`;
        const pageDesc = playlist.description
          ? `【音声ガイドツアー】${playlist.name}。${playlist.description}（全${playlist.items.length}作品）`
          : `【音声ガイドツアー】${playlist.name}。専属キュレーターの語りと共に名作を巡る特別な音声ガイド体験。`;

        const canonicalUrl = `${siteUrl}/playlist/${playlist.slug || playlistSlug}`;

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
                url: firstItemImage,
                alt: playlist.name,
              },
            ],
            type: 'article',
          },
          twitter: {
            card: 'summary_large_image',
            title: pageTitle,
            description: pageDesc,
            images: [firstItemImage],
          },
        };
      }
    } catch (e) {
      console.warn('[PlaylistPage] Metadata error:', e);
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

export default async function ArtworkPlaylistPage({ params }: Props) {
  const { playlistSlug } = await params;
  let playlistData: any = null;
  let jsonLd: any = null;

  if (playlistSlug) {
    try {
      playlistData = await getPlaylistBySlug(playlistSlug);
      if (playlistData) {
        jsonLd = {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: playlistData.name,
          description: playlistData.description || '美術館テーマ別ガイドツアー',
          itemListElement: playlistData.items.map((item: any, idx: number) => ({
            '@type': 'ListItem',
            position: idx + 1,
            name: item.title,
            item: `https://art-free-guide-trial.taira-sakakibara.workers.dev/art/${item.artistSlug || 'artist'}/${item.artworkSlug || 'artwork'}`
          }))
        };
      }
    } catch (e) {
      console.warn('[PlaylistPage] Fetch error:', e);
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
      <ArtFreeGuideClient initialPlaylist={playlistData} />
    </>
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import HomeClient from '../HomeClient';
import { guideMetadata, origin } from '@/lib/guideMetadata';
import { DEFAULT_LOCALE, Locale, isLocale } from '@/lib/i18n';
import { PLAYLISTS, localizePlaylist } from '@/lib/playlists';
import { SHARE_META } from '@/lib/shareMeta';
import { SLUG_ARTWORKS, artworkFromSlug, tourFromSlug } from '@/lib/slug';

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Permalinks live at the root — `/girl-with-a-pearl-earring`, `/impressionism` —
 * so a shared address stays short. Everything else about a visit (language,
 * depth, the focused detail) is still a query parameter on top of it.
 */
export function generateStaticParams() {
  return [
    ...SLUG_ARTWORKS.map(work => ({ slug: work.slug })),
    ...PLAYLISTS.map(playlist => ({ slug: playlist.id }))
  ];
}

function localeOf(value: string | string[] | undefined): Locale {
  const lang = (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
  return isLocale(lang) ? lang : DEFAULT_LOCALE;
}

export async function generateMetadata({
  params,
  searchParams
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = localeOf((await searchParams).lang);

  const work = artworkFromSlug(slug);
  if (work) {
    return guideMetadata({
      title: work.title,
      artist: work.artist,
      locale,
      canonical: `/${work.slug}`
    });
  }

  const playlist = tourFromSlug(slug);
  if (!playlist) return {};

  const copy = SHARE_META[locale];
  const shown = localizePlaylist(playlist, locale);
  const base = await origin();
  const canonical = `/${playlist.id}`;
  const title = `${shown.title} | ${copy.siteName}`;
  const image = new URL('/og-default.png', base).toString();

  return {
    metadataBase: new URL(base),
    title,
    description: shown.subtitle,
    alternates: { canonical },
    openGraph: {
      type: 'article',
      siteName: copy.siteName,
      title,
      description: shown.subtitle,
      url: new URL(canonical, base).toString(),
      images: [{ url: image, width: 1200, height: 630, alt: shown.title }]
    },
    twitter: { card: 'summary_large_image', title, description: shown.subtitle, images: [image] }
  };
}

export default async function PermalinkPage({ params }: { params: Params }) {
  const { slug } = await params;

  const work = artworkFromSlug(slug);
  if (work) return <HomeClient initialArtwork={work.title} initialArtist={work.artist} />;

  const playlist = tourFromSlug(slug);
  if (!playlist) notFound();

  return <HomeClient initialTour={playlist.id} />;
}

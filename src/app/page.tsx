import type { Metadata } from 'next';
import HomeClient from './HomeClient';
import { guideMetadata } from '@/lib/guideMetadata';
import { DEFAULT_LOCALE, Locale, isLocale } from '@/lib/i18n';
import { canonicalName } from '@/lib/names';
import { artworkPath } from '@/lib/site';
import { getDailyArtwork, type DailyArtwork } from '@/lib/dailyArtwork';
import { getCachedPublishedFeaturedTours } from '@/lib/featuredTours';
import type { Playlist } from '@/lib/playlists';

type SearchParams = Record<string, string | string[] | undefined>;

function param(params: SearchParams, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

/**
 * The artwork can still travel in the query string — old shared links, and the
 * artworks that have no permalink — so this page keeps unfurling them, pointing
 * the canonical at the permalink whenever one exists.
 */
export async function generateMetadata({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const params = await searchParams;
  const langParam = param(params, 'lang');
  const locale: Locale = isLocale(langParam) ? langParam : DEFAULT_LOCALE;

  const title = canonicalName(param(params, 'artwork'));
  const artist = canonicalName(param(params, 'artist'));

  return guideMetadata({
    title,
    artist,
    locale,
    canonical: title ? artworkPath(title, artist) : '/'
  });
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const langParam = param(params, 'lang');
  const locale: Locale = isLocale(langParam) ? langParam : DEFAULT_LOCALE;

  const title = canonicalName(param(params, 'artwork'));
  const artist = canonicalName(param(params, 'artist'));

  // Server-side daily pick: deterministic per day, driven by live feedback.
  // Display names are localized on the client (DailyArtworkCard follows the UI locale).
  let daily: DailyArtwork | null = null;
  try {
    daily = await getDailyArtwork();
  } catch {
    daily = null;
  }

  let featuredTours: Playlist[] = [];
  try {
    featuredTours = await getCachedPublishedFeaturedTours();
  } catch {
    featuredTours = [];
  }

  return <HomeClient daily={daily} featuredTours={featuredTours} />;
}

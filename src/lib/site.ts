/**
 * The address the app is published under. Metadata routes (sitemap, robots)
 * are rendered without a request, so they cannot read the host from headers.
 */
import { artworkSlug } from './slug';

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://art-free-guide.taira-sakakibara.workers.dev'
).replace(/\/$/, '');

/** `/<english-slug>` where there is one, the query string otherwise. */
export function artworkPath(title: string, artist: string): string {
  const slug = artworkSlug(title);
  if (slug) return `/${slug}`;

  const params = new URLSearchParams({ artwork: title });
  if (artist) params.set('artist', artist);
  return `/?${params.toString()}`;
}

export function artworkUrl(title: string, artist: string, locale: string): string {
  const url = new URL(artworkPath(title, artist), SITE_URL);
  url.searchParams.set('lang', locale);
  return url.toString();
}

export function tourUrl(tourId: string, locale: string): string {
  const url = new URL(`/${tourId}`, SITE_URL);
  url.searchParams.set('lang', locale);
  return url.toString();
}

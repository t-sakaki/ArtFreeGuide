/**
 * The address the app is published under. Metadata routes (sitemap, robots)
 * are rendered without a request, so they cannot read the host from headers.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://art-free-guide.taira-sakakibara.workers.dev'
).replace(/\/$/, '');

/** A deep link into the single page: the artwork travels in the query string. */
export function artworkUrl(title: string, artist: string, locale: string): string {
  const url = new URL(SITE_URL);
  url.searchParams.set('artwork', title);
  if (artist) url.searchParams.set('artist', artist);
  url.searchParams.set('lang', locale);
  return url.toString();
}

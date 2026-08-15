import type { MetadataRoute } from 'next';
import { LOCALES } from '@/lib/i18n';
import { PLAYLISTS } from '@/lib/playlists';
import { SITE_URL, artworkUrl, tourUrl } from '@/lib/site';
import { SLUG_ARTWORKS } from '@/lib/slug';

export default function sitemap(): MetadataRoute.Sitemap {
  const home = LOCALES.map(locale => ({
    url: `${SITE_URL}/?lang=${locale}`,
    changeFrequency: 'weekly' as const,
    priority: 1,
  }));

  const tours = LOCALES.flatMap(locale =>
    PLAYLISTS.map(playlist => ({
      url: tourUrl(playlist.id, locale),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    }))
  );

  const artworks = SLUG_ARTWORKS.flatMap(work =>
    LOCALES.map(locale => ({
      url: artworkUrl(work.title, work.artist, locale),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }))
  );

  return [...home, ...tours, ...artworks];
}

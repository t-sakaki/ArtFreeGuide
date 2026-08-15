import type { MetadataRoute } from 'next';
import { LOCALES } from '@/lib/i18n';
import { PLAYLISTS } from '@/lib/playlists';
import { SITE_URL, artworkUrl } from '@/lib/site';

/**
 * Every guide lives at the same path with the artwork in the query string, so
 * the sitemap is what tells a crawler those pages exist at all. The curated
 * tours are the catalogue we can name without asking the database, and they
 * are also the works whose guides are already archived.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const home = LOCALES.map(locale => ({
    url: `${SITE_URL}/?lang=${locale}`,
    changeFrequency: 'weekly' as const,
    priority: 1,
  }));

  const tours = LOCALES.flatMap(locale =>
    PLAYLISTS.map(playlist => ({
      url: `${SITE_URL}/?tour=${playlist.id}&lang=${locale}`,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    }))
  );

  const seen = new Set<string>();
  const artworks = PLAYLISTS.flatMap(playlist => playlist.items)
    .filter(item => {
      const key = `${item.title}::${item.artist}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .flatMap(item =>
      LOCALES.map(locale => ({
        url: artworkUrl(item.title, item.artist, locale),
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      }))
    );

  return [...home, ...tours, ...artworks];
}

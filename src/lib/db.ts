import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ArtworkRecord, ArtworkImageRecord, FeedbackRecord, RecommendationItem, PlaylistRecord, PlaylistData, PlaylistSummary } from '@/types/knowledgeBase';

export function slugify(text: string): string {
  if (!text) return '';
  const cleaned = text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (cleaned && cleaned !== 'artist' && cleaned !== 'artwork') {
    return cleaned;
  }
  return '';
}

export async function getD1DB(): Promise<any | null> {
  try {
    const context = await getCloudflareContext();
    const env = context?.env as any;
    if (env && env.DB) {
      return env.DB;
    }
  } catch (error) {
    console.warn('[D1] Could not access Cloudflare context or DB binding:', error);
  }
  return null;
}

/**
 * Searches DB for matching artwork by title and optional artist.
 */
export async function findArtwork(title: string, artist?: string): Promise<ArtworkRecord | null> {
  const db = await getD1DB();
  if (!db) return null;

  const normalizedTitle = title.trim().toLowerCase();
  const normalizedArtist = artist ? artist.trim().toLowerCase() : '';

  try {
    if (normalizedArtist) {
      const row = (await db.prepare(
        `SELECT * FROM artworks 
         WHERE LOWER(title) LIKE ? AND LOWER(artist) LIKE ?
         ORDER BY id DESC LIMIT 1`
      ).bind(`%${normalizedTitle}%`, `%${normalizedArtist}%`).first()) as ArtworkRecord | null;

      if (row) return row;
    }

    // Fallback: title search only
    const row = (await db.prepare(
      `SELECT * FROM artworks 
       WHERE LOWER(title) LIKE ? 
       ORDER BY id DESC LIMIT 1`
    ).bind(`%${normalizedTitle}%`).first()) as ArtworkRecord | null;

    return row || null;
  } catch (error) {
    console.error('[D1] Error in findArtwork:', error);
    return null;
  }
}

/**
 * Searches DB for matching artwork by artistSlug and artworkSlug.
 */
export async function findArtworkBySlug(artistSlug: string, artworkSlug: string): Promise<ArtworkRecord | null> {
  const db = await getD1DB();
  if (!db) return null;

  try {
    const row = (await db.prepare(
      `SELECT * FROM artworks 
       WHERE LOWER(artist_slug) = ? AND LOWER(artwork_slug) = ?
       LIMIT 1`
    ).bind(artistSlug.toLowerCase(), artworkSlug.toLowerCase()).first()) as ArtworkRecord | null;

    if (row) return row;

    // Fallback search by slugified titles/artists
    const allRows = (await db.prepare(`SELECT * FROM artworks ORDER BY id DESC`).all()) as { results: ArtworkRecord[] };
    if (allRows && allRows.results) {
      const found = allRows.results.find(item => {
        const itemArtistSlug = item.artist_slug || slugify(item.artist);
        const itemArtworkSlug = item.artwork_slug || slugify(item.title);
        return itemArtistSlug === artistSlug.toLowerCase() && itemArtworkSlug === artworkSlug.toLowerCase();
      });
      if (found) return found;
    }

    return null;
  } catch (error) {
    console.error('[D1] Error in findArtworkBySlug:', error);
    return null;
  }
}

/**
 * Increments artwork view_count asynchronously.
 */
export async function incrementArtworkViewCount(artworkId: number): Promise<boolean> {
  const db = await getD1DB();
  if (!db || !artworkId) return false;

  try {
    await db.prepare(`UPDATE artworks SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?`).bind(artworkId).run();
    return true;
  } catch (error) {
    console.error('[D1] Error incrementing view_count:', error);
    return false;
  }
}

/**
 * Retrieves valid images for a given artwork ID.
 */
export async function getArtworkImages(artworkId: number, onlyValid = true): Promise<ArtworkImageRecord[]> {
  const db = await getD1DB();
  if (!db) return [];

  try {
    const query = onlyValid
      ? `SELECT * FROM artwork_images WHERE artwork_id = ? AND is_valid = 1 ORDER BY is_primary DESC, id ASC`
      : `SELECT * FROM artwork_images WHERE artwork_id = ? ORDER BY is_primary DESC, id ASC`;

    const res = (await db.prepare(query).bind(artworkId).all()) as { results: ArtworkImageRecord[] };
    return res.results || [];
  } catch (error) {
    console.error('[D1] Error in getArtworkImages:', error);
    return [];
  }
}

/**
 * Retrieves a playlist by ID or SEO slug with ordered artworks.
 */
export async function getPlaylistBySlug(slugOrId: string | number): Promise<PlaylistData | null> {
  const db = await getD1DB();
  if (!db || !slugOrId) return null;

  try {
    let playlist: PlaylistRecord | null = null;
    const inputStr = String(slugOrId).trim().toLowerCase();

    if (/^\d+$/.test(inputStr)) {
      playlist = (await db.prepare(
        `SELECT * FROM playlists WHERE id = ? OR LOWER(playlist_slug) = ? LIMIT 1`
      ).bind(parseInt(inputStr, 10), inputStr).first()) as PlaylistRecord | null;
    } else {
      playlist = (await db.prepare(
        `SELECT * FROM playlists WHERE LOWER(playlist_slug) = ? LIMIT 1`
      ).bind(inputStr).first()) as PlaylistRecord | null;
    }

    if (!playlist) return null;

    const itemsQuery = `
      SELECT 
        pi.position,
        a.id,
        a.title,
        a.artist,
        a.location,
        a.year,
        a.guide_short,
        a.guide_standard,
        a.guide_deep,
        a.search_query,
        a.recommendations,
        a.artist_slug,
        a.artwork_slug
      FROM playlist_items pi
      JOIN artworks a ON pi.artwork_id = a.id
      WHERE pi.playlist_id = ?
      ORDER BY pi.position ASC
    `;

    const res = (await db.prepare(itemsQuery).bind(playlist.id).all()) as { results: any[] };
    const rawItems = res.results || [];

    const items = await Promise.all(rawItems.map(async (row) => {
      const images = await getArtworkImages(row.id, true);
      let parsedRecs: RecommendationItem[] = [];
      if (row.recommendations) {
        try {
          parsedRecs = JSON.parse(row.recommendations);
        } catch (e) {}
      }

      return {
        position: row.position,
        id: row.id,
        title: row.title,
        artist: row.artist,
        location: row.location || null,
        year: row.year || null,
        short: row.guide_short,
        standard: row.guide_standard || '',
        deep: row.guide_deep || '',
        searchQuery: row.search_query || `${row.title} ${row.artist}`,
        imageUrl: images.length > 0 ? images[0].url : null,
        recommendations: parsedRecs,
        artistSlug: row.artist_slug,
        artworkSlug: row.artwork_slug,
      };
    }));

    return {
      id: playlist.id,
      name: playlist.name,
      description: playlist.description || null,
      slug: playlist.playlist_slug || String(playlist.id),
      items
    };
  } catch (error) {
    console.error('[D1] Error fetching playlist:', error);
    return null;
  }
}

// Backward compatibility alias
export const getPlaylist = getPlaylistBySlug;

/**
 * Retrieves all playlists with thumbnail images (first artwork image of each playlist).
 */
export async function getAllPlaylists(): Promise<PlaylistSummary[]> {
  const db = await getD1DB();
  if (!db) {
    return [
      {
        id: 1,
        name: 'ゴッホと情熱の色彩ツアー',
        description: '星月夜、ひまわり、夜のカフェテラスなど、ゴッホの代表作を巡る感動の音声ガイドツアー。',
        slug: 'gogh-tour',
        itemCount: 3,
        thumbnailUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg/1280px-Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg'
      },
      {
        id: 2,
        name: '印象派の名画巡りツアー',
        description: 'モネ、ルノワール、ドガの光と色彩に溢れる名画の世界を体感。',
        slug: 'impressionism-tour',
        itemCount: 4,
        thumbnailUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Claude_Monet%2C_Impression%2C_soleil_levant.jpg/1280px-Claude_Monet%2C_Impression%2C_soleil_levant.jpg'
      }
    ];
  }

  try {
    const res = (await db.prepare(`SELECT * FROM playlists ORDER BY id ASC`).all()) as { results: PlaylistRecord[] };
    const playlists = res.results || [];

    const list = await Promise.all(
      playlists.map(async (p) => {
        const itemsRes = (await db.prepare(`
          SELECT pi.position, a.id, a.title, a.artist
          FROM playlist_items pi
          JOIN artworks a ON pi.artwork_id = a.id
          WHERE pi.playlist_id = ?
          ORDER BY pi.position ASC
        `).bind(p.id).all()) as { results: any[] };

        const items = itemsRes.results || [];
        let thumbnailUrl: string | null = null;

        if (items.length > 0) {
          const firstArtworkId = items[0].id;
          const images = await getArtworkImages(firstArtworkId, true);
          if (images.length > 0) {
            thumbnailUrl = images[0].url;
          }
        }

        return {
          id: p.id,
          name: p.name,
          description: p.description || null,
          slug: p.playlist_slug || String(p.id),
          itemCount: items.length,
          thumbnailUrl
        };
      })
    );

    return list;
  } catch (error) {
    console.error('[D1] Error fetching all playlists:', error);
    return [];
  }
}


/**
 * Saves a newly generated artwork and its initial primary image.
 */
export async function saveArtwork(data: {
  title: string;
  artist: string;
  location?: string;
  year?: string;
  guide_short: string;
  guide_standard: string;
  guide_deep: string;
  search_query?: string;
  recommendations?: RecommendationItem[];
  imageUrl?: string | null;
  artist_slug?: string | null;
  artwork_slug?: string | null;
}): Promise<{ artworkId: number; imageId?: number }> {
  const db = await getD1DB();
  if (!db) {
    return { artworkId: 0 };
  }

  try {
    const recsJson = data.recommendations ? JSON.stringify(data.recommendations) : null;
    const artistSlugVal = data.artist_slug || slugify(data.artist);
    const artworkSlugVal = data.artwork_slug || slugify(data.title);

    const insertRes = await db.prepare(
      `INSERT INTO artworks (title, artist, location, year, guide_short, guide_standard, guide_deep, search_query, recommendations, artist_slug, artwork_slug, view_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).bind(
      data.title,
      data.artist,
      data.location || null,
      data.year || null,
      data.guide_short,
      data.guide_standard,
      data.guide_deep,
      data.search_query || null,
      recsJson,
      artistSlugVal,
      artworkSlugVal
    ).run();

    const artworkId = insertRes.meta.last_row_id;
    let imageId: number | undefined;

    if (data.imageUrl && artworkId) {
      const imgRes = await db.prepare(
        `INSERT INTO artwork_images (artwork_id, url, is_primary, is_valid)
         VALUES (?, ?, 1, 1)`
      ).bind(artworkId, data.imageUrl).run();

      imageId = imgRes.meta.last_row_id;
    }

    return { artworkId, imageId };
  } catch (error) {
    console.error('[D1] Error saving artwork:', error);
    return { artworkId: 0 };
  }
}

/**
 * Saves user feedback.
 */
export async function saveFeedback(fb: FeedbackRecord): Promise<boolean> {
  const db = await getD1DB();
  if (!db) return false;

  try {
    await db.prepare(
      `INSERT INTO feedback (artwork_id, type, score, comment)
       VALUES (?, ?, ?, ?)`
    ).bind(fb.artwork_id, fb.type, fb.score ?? null, fb.comment ?? null).run();

    return true;
  } catch (error) {
    console.error('[D1] Error saving feedback:', error);
    return false;
  }
}

/**
 * Updates validity status of an image.
 */
export async function setImageValidity(imageId: number, isValid: boolean): Promise<boolean> {
  const db = await getD1DB();
  if (!db) return false;

  try {
    await db.prepare(
      `UPDATE artwork_images SET is_valid = ? WHERE id = ?`
    ).bind(isValid ? 1 : 0, imageId).run();

    return true;
  } catch (error) {
    console.error('[D1] Error updating image validity:', error);
    return false;
  }
}

/**
 * Adds a new image for an artwork.
 */
export async function addArtworkImage(artworkId: number, url: string, isPrimary = false): Promise<number | null> {
  const db = await getD1DB();
  if (!db) return null;

  try {
    if (isPrimary) {
      await db.prepare(`UPDATE artwork_images SET is_primary = 0 WHERE artwork_id = ?`).bind(artworkId).run();
    }

    const res = await db.prepare(
      `INSERT INTO artwork_images (artwork_id, url, is_primary, is_valid)
       VALUES (?, ?, ?, 1)`
    ).bind(artworkId, url, isPrimary ? 1 : 0).run();

    return res.meta.last_row_id || null;
  } catch (error) {
    console.error('[D1] Error adding artwork image:', error);
    return null;
  }
}

/**
 * Artwork Image Search & Verification Utility
 * Fetches images from Wikimedia Commons with multi-candidate filtering.
 */

const EXCLUDED_PATTERNS = [
  /SD_/i,
  /Rhinoceros/i,
  /parody/i,
  /meme/i,
  /stock_price/i,
  /\.pdf/i,
  /\.djvu/i,
  /advertisement/i,
  /diagram/i,
  /stamp/i,
  /book_cover/i,
  /cartoon/i,
  /caricature/i,
  /ai_generated/i,
  /stable_diffusion/i
];

export async function fetchArtworkImage(
  query: string,
  artworkTitle?: string,
  artistName?: string
): Promise<string | null> {
  if (!query) return null;

  try {
    // Search top 10 candidate pages from Wikimedia Commons
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      query
    )}&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=960&format=json&origin=*`;

    console.log(`[ImageSearch] Searching candidate images for: "${query}"`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ArtFreeGuide/1.0 (https://art-free-guide-trial.taira-sakakibara.workers.dev)',
        'Api-User-Agent': 'ArtFreeGuide/1.0 (https://art-free-guide-trial.taira-sakakibara.workers.dev)'
      }
    });

    if (!response.ok) return null;

    const data = await response.json();
    const pages = data.query?.pages;

    if (!pages || Object.keys(pages).length === 0) {
      console.warn(`[ImageSearch] No images found for query: ${query}`);
      return null;
    }

    const candidatePages = Object.values(pages) as any[];

    for (const page of candidatePages) {
      if (!page.imageinfo || page.imageinfo.length === 0) continue;

      const imgInfo = page.imageinfo[0];
      const imgUrl = imgInfo.thumburl || imgInfo.url || '';
      const mime = imgInfo.mime || '';
      const title = page.title || '';

      // Skip non-image mime types
      if (mime.includes('pdf') || mime.includes('djvu') || mime.includes('audio') || mime.includes('video')) {
        continue;
      }

      // Check blacklisted terms
      const isBlacklisted = EXCLUDED_PATTERNS.some(pattern => pattern.test(imgUrl) || pattern.test(title));
      if (isBlacklisted) {
        console.warn(`[ImageSearch] Filtered out blacklisted image: ${title}`);
        continue;
      }

      // Check title or artist relevance if provided
      if (artworkTitle || artistName) {
        const titleLower = title.toLowerCase();
        const tMatch = artworkTitle
          ? artworkTitle.toLowerCase().split(/\s+/).some(w => w.length > 2 && titleLower.includes(w))
          : true;
        const aMatch = artistName
          ? artistName.toLowerCase().split(/\s+/).some(w => w.length > 2 && titleLower.includes(w))
          : true;

        if (tMatch || aMatch || titleLower.includes('met_') || titleLower.includes('painting') || titleLower.includes('museum')) {
          console.log(`[ImageSearch] Verified candidate image: ${imgUrl}`);
          return imgUrl;
        }
      } else {
        return imgUrl;
      }
    }

    // Fallback: Return first non-blacklisted image
    for (const page of candidatePages) {
      const imgInfo = page.imageinfo?.[0];
      if (imgInfo) {
        const imgUrl = imgInfo.thumburl || imgInfo.url || '';
        const isBlacklisted = EXCLUDED_PATTERNS.some(pattern => pattern.test(imgUrl) || pattern.test(page.title || ''));
        if (!isBlacklisted && (imgInfo.mime || '').startsWith('image/')) {
          return imgUrl;
        }
      }
    }

    return null;
  } catch (error) {
    console.error('[ImageSearch] Error:', error);
    return null;
  }
}

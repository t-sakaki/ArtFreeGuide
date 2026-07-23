/**
 * Artwork Image Search Utility
 * Fetches images from Wikimedia Commons based on artwork name.
 */

export async function fetchArtworkImage(query: string): Promise<string | null> {
  if (!query) return null;

  try {
    // Optimized Wikimedia Commons API endpoint
    // Added 'gsrlimit=1' and ensured correct namespace for images
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=1&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json&origin=*`;
    
    console.log(`[ImageSearch] Searching for: ${query} via ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[ImageSearch] API response not OK: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const pages = data.query?.pages;

    if (!pages || Object.keys(pages).length === 0) {
      console.warn(`[ImageSearch] No images found for query: ${query}`);
      return null;
    }

    const pageId = Object.keys(pages)[0];
    const page = pages[pageId];

    if (page.imageinfo && page.imageinfo.length > 0) {
      const imgInfo = page.imageinfo[0];
      const finalUrl = imgInfo.thumburl || imgInfo.url;
      console.log(`[ImageSearch] Success! Found URL: ${finalUrl}`);
      return finalUrl;
    }

    console.warn(`[ImageSearch] No imageinfo found for page ${pageId}`);
    return null;
  } catch (error) {
    console.error('[ImageSearch] Critical error:', error);
    return null;
  }
}

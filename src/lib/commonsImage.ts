/** Thumbnail lookup on Wikimedia Commons, used for recommendation cards. */
export async function fetchCommonsThumbnail(query: string): Promise<string | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&generator=search' +
    `&gsrsearch=${encodeURIComponent(trimmed)}` +
    '&gsrnamespace=6&prop=imageinfo&iiprop=url&iiurlwidth=300&format=json&origin=*';

  try {
    const res = await fetch(url);
    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return null;

    const first = pages[Object.keys(pages)[0]];
    const info = first?.imageinfo?.[0];
    return info?.thumburl ?? info?.url ?? null;
  } catch (error) {
    console.error('Commons thumbnail lookup failed:', error);
    return null;
  }
}

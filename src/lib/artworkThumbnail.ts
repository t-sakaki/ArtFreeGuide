/**
 * The picture for a recommendation card.
 *
 * The lookup runs on the server (`/api/artwork-image`), because a Commons
 * search made from the browser with a Japanese title returns nothing: Commons
 * indexes its file pages in English. The server route translates the title,
 * checks the creator on Wikidata and writes the answer back to the catalogue,
 * so a card that had no picture once gets one for every later visitor.
 */
export async function fetchArtworkImage(title: string, artist: string): Promise<string | null> {
  if (!title.trim()) return null;

  try {
    const res = await fetch('/api/artwork-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, artist })
    });
    const data = (await res.json()) as { url?: unknown };
    return typeof data.url === 'string' ? data.url : null;
  } catch (error) {
    console.error('Artwork thumbnail lookup failed:', error);
    return null;
  }
}

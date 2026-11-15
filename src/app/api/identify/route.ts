import { NextResponse } from 'next/server';
import { DEFAULT_LOCALE, isLocale } from '@/lib/i18n';
import { identifyArtwork, validateImageDataUrl } from '@/lib/vision';

/**
 * Turns a photo taken in the gallery into a title and an artist, so the
 * visitor can start a guide without typing. The answer is never acted on
 * here: the client shows it for confirmation and keeps the manual form.
 *
 * The photo stays in memory for the length of one request and is never logged.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { image?: unknown; locale?: unknown };

    const image = validateImageDataUrl(body.image);
    if (!image) {
      return NextResponse.json(
        { error: 'unsupported_image', title: null, artist: null, confidence: 0 },
        { status: 400 }
      );
    }

    const locale =
      typeof body.locale === 'string' && isLocale(body.locale) ? body.locale : DEFAULT_LOCALE;

    return NextResponse.json(await identifyArtwork(image, locale));
  } catch (error) {
    console.error('Identify API Error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'identify_failed', title: null, artist: null, confidence: 0 },
      { status: 502 }
    );
  }
}

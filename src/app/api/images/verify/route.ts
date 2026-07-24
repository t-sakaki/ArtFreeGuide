import { NextResponse } from 'next/server';
import { setImageValidity, getArtworkImages, findArtwork, addArtworkImage } from '@/lib/db';
import { fetchArtworkImage } from '@/lib/image';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { image_id, is_valid, artwork_id } = body;

    if (image_id === undefined || is_valid === undefined) {
      return NextResponse.json({ error: 'image_id and is_valid are required' }, { status: 400 });
    }

    const updateSuccess = await setImageValidity(Number(image_id), Boolean(is_valid));

    if (!updateSuccess) {
      return NextResponse.json({ error: 'Failed to update image validity' }, { status: 500 });
    }

    let replacementImage = null;

    // Check if any valid images remain for this artwork
    if (artwork_id && !is_valid) {
      const remainingValid = await getArtworkImages(Number(artwork_id), true);
      if (remainingValid.length === 0) {
        console.log(`[ImageVerifyAPI] Artwork ${artwork_id} has 0 valid images left. Attempting replacement fetch...`);
        // Find artwork search query
        const artwork = await findArtwork('', ''); // Or query by ID
        // Perform search with fallback
        const searchQ = artwork?.search_query || `${artwork?.title || ''} ${artwork?.artist || ''}`.trim();
        if (searchQ) {
          const newUrl = await fetchArtworkImage(searchQ);
          if (newUrl) {
            const newImgId = await addArtworkImage(Number(artwork_id), newUrl, true);
            if (newImgId) {
              replacementImage = {
                id: newImgId,
                url: newUrl,
                is_primary: true,
                is_valid: true
              };
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Image validity updated',
      replacementImage
    });
  } catch (error: any) {
    console.error('[ImageVerifyAPI] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

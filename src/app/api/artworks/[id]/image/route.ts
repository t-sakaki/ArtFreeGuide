import { NextResponse } from 'next/server';
import { updateArtworkImageUrl } from '@/lib/db';
import { UpdateArtworkImageRequest } from '@/types/knowledgeBase';

type Props = {
  params: Promise<{ id: string }>;
};

function isValidUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== 'string' || !urlStr.trim()) return false;
  try {
    const parsed = new URL(urlStr.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function PATCH(request: Request, { params }: Props) {
  try {
    const { id } = await params;
    const artworkId = parseInt(id, 10);

    if (isNaN(artworkId) || artworkId <= 0) {
      return NextResponse.json(
        { error: 'Invalid artwork ID' },
        { status: 400 }
      );
    }

    let body: UpdateArtworkImageRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const { imageUrl } = body || {};
    const trimmedUrl = (imageUrl || '').trim();

    if (!trimmedUrl) {
      return NextResponse.json(
        { error: 'imageUrl is required and cannot be empty' },
        { status: 400 }
      );
    }

    if (!isValidUrl(trimmedUrl)) {
      return NextResponse.json(
        { error: 'Invalid imageUrl format' },
        { status: 400 }
      );
    }

    const result = await updateArtworkImageUrl(artworkId, trimmedUrl);

    if (result.notFound) {
      return NextResponse.json(
        { error: 'Artwork not found' },
        { status: 404 }
      );
    }

    if (!result.success) {
      return NextResponse.json(
        { error: 'Failed to update artwork image' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        id: artworkId,
        imageUrl: trimmedUrl,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[API] Error in PATCH /api/artworks/[id]/image:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

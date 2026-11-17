import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { isLocale } from '../../../../lib/i18n';
import {
  isExplanationMode,
  isValidArtworkId,
  isValidHash,
  narrationAudioKey,
  parseByteRange,
  resolveNarrationEnvironment,
} from '../../../../lib/narration';

interface R2ObjectMeta {
  size: number;
  etag?: string;
  httpEtag?: string;
  httpMetadata?: { contentType?: string };
}

interface R2ObjectBody extends R2ObjectMeta {
  body: ReadableStream;
}

interface R2Bucket {
  head(key: string): Promise<R2ObjectMeta | null>;
  get(key: string, options?: { range?: { offset: number; length: number } }): Promise<R2ObjectBody | null>;
}

async function getBindings() {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const e = env as unknown as { AUDIO?: R2Bucket; NARRATION_ENV?: string };
    return {
      audio: e.AUDIO ?? null,
      narrationEnv: resolveNarrationEnvironment(e.NARRATION_ENV ?? process.env.NARRATION_ENV),
    };
  } catch {
    return {
      audio: null,
      narrationEnv: resolveNarrationEnvironment(process.env.NARRATION_ENV),
    };
  }
}

function parseParams(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const artworkId = (searchParams.get('artworkId') || '').trim().toLowerCase();
  const locale = (searchParams.get('locale') || '').trim();
  const mode = (searchParams.get('mode') || '').trim();
  const contentHash = (searchParams.get('contentHash') || '').trim().toLowerCase();
  const voiceConfigHash = (searchParams.get('voiceConfigHash') || '').trim().toLowerCase();

  if (
    !isValidArtworkId(artworkId) ||
    !isLocale(locale) ||
    !isExplanationMode(mode) ||
    !isValidHash(contentHash) ||
    !isValidHash(voiceConfigHash)
  ) {
    return null;
  }

  return { artworkId, locale, mode, contentHash, voiceConfigHash };
}

function resolveEtag(meta: R2ObjectMeta, contentHash: string, voiceConfigHash: string): string {
  if (meta.httpEtag) return meta.httpEtag;
  if (meta.etag) return `"${meta.etag}"`;
  return `"${contentHash}-${voiceConfigHash}"`;
}

async function handleRequest(req: NextRequest, isHead: boolean) {
  const params = parseParams(req);
  if (!params) {
    return NextResponse.json({ error: 'invalid_parameters' }, { status: 400 });
  }

  const { audio, narrationEnv } = await getBindings();
  if (!audio) {
    return NextResponse.json({ error: 'no_r2_bucket' }, { status: 503 });
  }

  const key = narrationAudioKey(
    narrationEnv,
    params.artworkId,
    params.locale,
    params.mode,
    params.contentHash,
    params.voiceConfigHash,
  );

  const head = await audio.head(key);
  if (!head) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const etag = resolveEtag(head, params.contentHash, params.voiceConfigHash);
  const contentType = head.httpMetadata?.contentType || 'audio/ogg; codecs=opus';
  const cacheControl = 'public, max-age=31536000, immutable';

  const ifNoneMatch = req.headers.get('if-none-match');
  if (ifNoneMatch && ifNoneMatch.split(',').some(tag => tag.trim() === etag || tag.trim() === '*')) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        'Accept-Ranges': 'bytes',
        'Cache-Control': cacheControl,
      },
    });
  }

  const rangeHeader = req.headers.get('range');
  const parsedRange = parseByteRange(rangeHeader, head.size);

  if (parsedRange.kind === 'invalid' || parsedRange.kind === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: {
        'Content-Range': `bytes */${head.size}`,
        'Accept-Ranges': 'bytes',
      },
    });
  }

  if (parsedRange.kind === 'range') {
    const baseHeaders = {
      'Content-Type': contentType,
      'Content-Length': String(parsedRange.length),
      'Content-Range': `bytes ${parsedRange.start}-${parsedRange.end}/${head.size}`,
      'Accept-Ranges': 'bytes',
      ETag: etag,
      'Cache-Control': cacheControl,
    };

    if (isHead) {
      return new Response(null, { status: 206, headers: baseHeaders });
    }

    const obj = await audio.get(key, {
      range: { offset: parsedRange.start, length: parsedRange.length },
    });
    if (!obj) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return new Response(obj.body, { status: 206, headers: baseHeaders });
  }

  const fullHeaders = {
    'Content-Type': contentType,
    'Content-Length': String(head.size),
    'Accept-Ranges': 'bytes',
    ETag: etag,
    'Cache-Control': cacheControl,
  };

  if (isHead) {
    return new Response(null, { status: 200, headers: fullHeaders });
  }

  const obj = await audio.get(key);
  if (!obj) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return new Response(obj.body, { status: 200, headers: fullHeaders });
}

export async function GET(req: NextRequest) {
  return handleRequest(req, false);
}

export async function HEAD(req: NextRequest) {
  return handleRequest(req, true);
}

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { DEFAULT_LOCALE, isLocale } from '../../../lib/i18n';
import {
  buildNarrationAudioUrl,
  isExplanationMode,
  isValidArtworkId,
  isValidHash,
  narrationLatestKey,
  narrationManifestKey,
  resolveNarrationArtworkId,
  resolveNarrationEnvironment,
  type NarrationLatestPointer,
  type NarrationManifest,
} from '../../../lib/narration';

interface R2ObjectBody {
  text(): Promise<string>;
}

interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get('title') || '').trim();
  const artist = (searchParams.get('artist') || '').trim();
  const rawArtworkId = (searchParams.get('artworkId') || '').trim().toLowerCase();
  const localeRaw = (searchParams.get('locale') || '').trim();
  const modeRaw = (searchParams.get('mode') || '').trim();
  const contentHash = (searchParams.get('contentHash') || '').trim().toLowerCase();
  const explicitVoiceHash = (searchParams.get('voiceConfigHash') || '').trim().toLowerCase();

  const locale = isLocale(localeRaw) ? localeRaw : DEFAULT_LOCALE;
  if (!isExplanationMode(modeRaw)) {
    return NextResponse.json({ error: 'invalid_mode' }, { status: 400 });
  }
  if (!isValidHash(contentHash)) {
    return NextResponse.json({ error: 'invalid_content_hash' }, { status: 400 });
  }
  if (explicitVoiceHash && !isValidHash(explicitVoiceHash)) {
    return NextResponse.json({ error: 'invalid_voice_hash' }, { status: 400 });
  }

  let artworkId = '';
  if (rawArtworkId) {
    if (!isValidArtworkId(rawArtworkId)) {
      return NextResponse.json({ error: 'invalid_artwork_id' }, { status: 400 });
    }
    artworkId = rawArtworkId;
  } else if (title) {
    artworkId = resolveNarrationArtworkId(title, artist);
  } else {
    return NextResponse.json({ error: 'missing_artwork' }, { status: 400 });
  }

  const { audio, narrationEnv } = await getBindings();
  if (!audio) {
    return NextResponse.json(
      { status: 'unavailable' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let voiceConfigHash = explicitVoiceHash;
  if (!voiceConfigHash) {
    const latestObj = await audio.get(
      narrationLatestKey(narrationEnv, artworkId, locale, modeRaw, contentHash),
    );
    if (!latestObj) {
      return NextResponse.json(
        { status: 'none' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    try {
      const latest = JSON.parse(await latestObj.text()) as NarrationLatestPointer;
      if (!latest?.voiceConfigHash || !isValidHash(latest.voiceConfigHash)) {
        return NextResponse.json(
          { status: 'none' },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
      voiceConfigHash = latest.voiceConfigHash;
    } catch {
      return NextResponse.json(
        { status: 'none' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
  }

  const manifestObj = await audio.get(
    narrationManifestKey(narrationEnv, artworkId, locale, modeRaw, contentHash, voiceConfigHash),
  );
  if (!manifestObj) {
    return NextResponse.json(
      { status: 'none' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const manifest = JSON.parse(await manifestObj.text()) as NarrationManifest;
    if (
      manifest?.version !== 1 ||
      !Array.isArray(manifest.segments) ||
      manifest.contentHash !== contentHash ||
      manifest.voiceConfigHash !== voiceConfigHash
    ) {
      return NextResponse.json(
        { status: 'none' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const audioUrl = buildNarrationAudioUrl({
      artworkId,
      locale,
      mode: modeRaw,
      contentHash,
      voiceConfigHash,
    });

    return NextResponse.json(
      {
        status: 'ready',
        audioUrl,
        manifest,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=300',
        },
      },
    );
  } catch {
    return NextResponse.json(
      { status: 'none' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export const runtime = 'nodejs';

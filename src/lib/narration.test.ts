import { describe, it, expect } from 'vitest';
import {
  buildNarrationAudioUrl,
  computeContentHash,
  computeVoiceConfigHash,
  isValidArtworkId,
  isValidHash,
  narrationAudioKey,
  narrationLatestKey,
  narrationManifestKey,
  parseByteRange,
  resolveNarrationArtworkId,
  sha256Hex,
  verifyOpusBuffer,
} from './narration';

function makeOggPage(opts: {
  granule: bigint;
  payload: Uint8Array;
}): Uint8Array {
  const segCount = Math.ceil(opts.payload.length / 255) || 1;
  const page = new Uint8Array(27 + segCount + opts.payload.length);
  const view = new DataView(page.buffer);
  page.set([0x4f, 0x67, 0x67, 0x53], 0); // OggS
  page[4] = 0; // version
  page[5] = 0; // header type
  view.setBigInt64(6, opts.granule, true);
  view.setUint32(14, 1, true); // serial
  view.setUint32(18, 0, true); // seq
  view.setUint32(22, 0, true); // crc
  page[26] = segCount;

  let rem = opts.payload.length;
  for (let i = 0; i < segCount; i++) {
    const chunk = Math.min(255, rem);
    page[27 + i] = chunk;
    rem -= chunk;
  }
  page.set(opts.payload, 27 + segCount);
  return page;
}

function makeSyntheticOpusFile(durationSeconds = 2): Uint8Array {
  const opusHead = new Uint8Array(19);
  opusHead.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64], 0); // OpusHead
  opusHead[8] = 1; // version
  opusHead[9] = 1; // channels
  const headView = new DataView(opusHead.buffer);
  headView.setUint16(10, 312, true); // pre-skip
  headView.setUint32(12, 48000, true); // input sample rate

  const opusTags = new Uint8Array(16);
  opusTags.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73], 0); // OpusTags

  const audioPacket = new Uint8Array([0xf8, 0xff, 0xfe, 0x00]);
  const totalSamples = BigInt(312 + durationSeconds * 48000);

  const p1 = makeOggPage({ granule: BigInt(0), payload: opusHead });
  const p2 = makeOggPage({ granule: BigInt(0), payload: opusTags });
  const p3 = makeOggPage({ granule: totalSamples, payload: audioPacket });

  const out = new Uint8Array(p1.length + p2.length + p3.length);
  out.set(p1, 0);
  out.set(p2, p1.length);
  out.set(p3, p1.length + p2.length);
  return out;
}

describe('narration utilities and Opus verification', () => {
  it('computes standard SHA-256 vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('resolves known artwork slugs and deterministic fallback ids', () => {
    expect(resolveNarrationArtworkId('真珠の耳飾りの少女', 'ヨハネス・フェルメール')).toBe(
      'girl-with-a-pearl-earring',
    );
    expect(resolveNarrationArtworkId('星月夜', 'フィンセント・ファン・ゴッホ')).toBe(
      'the-starry-night',
    );
    expect(resolveNarrationArtworkId('The Starry Night', 'Vincent van Gogh')).toBe(
      'the-starry-night',
    );

    const unlisted = resolveNarrationArtworkId('未知の作品', '無名画家');
    expect(unlisted).toMatch(/^work-[a-f0-9]{16}$/);
    expect(isValidArtworkId(unlisted)).toBe(true);
  });

  it('builds safe, environment-isolated R2 keys and audio URLs', () => {
    const contentHash = computeContentHash('sample guide text');
    const voiceHash = computeVoiceConfigHash({
      provider: 'elevenlabs',
      modelId: 'eleven_multilingual_v2',
      voiceId: 'voice123',
      outputFormat: 'opus_48000_64',
      voiceSettings: { stability: 0.5, similarity_boost: 0.75 },
    });

    expect(isValidHash(contentHash)).toBe(true);
    expect(isValidHash(voiceHash)).toBe(true);

    expect(narrationLatestKey('staging', 'the-starry-night', 'ja', 'standard', contentHash)).toBe(
      `narration/staging/the-starry-night/ja/standard/${contentHash}/latest.json`,
    );
    expect(
      narrationAudioKey('production', 'the-starry-night', 'ja', 'standard', contentHash, voiceHash),
    ).toBe(
      `narration/production/the-starry-night/ja/standard/${contentHash}/${voiceHash}/audio.opus`,
    );
    expect(
      narrationManifestKey('staging', 'the-starry-night', 'ja', 'standard', contentHash, voiceHash),
    ).toBe(
      `narration/staging/the-starry-night/ja/standard/${contentHash}/${voiceHash}/manifest.json`,
    );
    expect(
      buildNarrationAudioUrl({
        artworkId: 'the-starry-night',
        locale: 'ja',
        mode: 'standard',
        contentHash,
        voiceConfigHash: voiceHash,
      }),
    ).toContain('/api/narration/audio?');
  });

  it('validates real Ogg/Opus containers and rejects HTML/JSON/WAV/MP3', () => {
    const validOpus = makeSyntheticOpusFile(3);
    const res = verifyOpusBuffer(validOpus);
    expect(res.valid).toBe(true);
    expect(res.format).toBe('opus');
    expect(res.durationMs).toBe(3000);
    expect(res.channels).toBe(1);

    expect(verifyOpusBuffer(new TextEncoder().encode('<html>500</html>')).valid).toBe(false);
    expect(verifyOpusBuffer(new TextEncoder().encode('{"error":"quota"}')).valid).toBe(false);
    expect(verifyOpusBuffer(new TextEncoder().encode('RIFF....WAVEfmt ' + '0'.repeat(40))).valid).toBe(false);
    expect(verifyOpusBuffer(new Uint8Array([0x49, 0x44, 0x33, ...new Array(60).fill(0)])).valid).toBe(false);
  });

  it('parses HTTP byte ranges accurately', () => {
    expect(parseByteRange(null, 1000)).toEqual({ kind: 'none' });
    expect(parseByteRange('bytes=0-499', 1000)).toEqual({
      kind: 'range',
      start: 0,
      end: 499,
      length: 500,
    });
    expect(parseByteRange('bytes=500-', 1000)).toEqual({
      kind: 'range',
      start: 500,
      end: 999,
      length: 500,
    });
    expect(parseByteRange('bytes=-200', 1000)).toEqual({
      kind: 'range',
      start: 800,
      end: 999,
      length: 200,
    });
    expect(parseByteRange('bytes=1000-1200', 1000)).toEqual({ kind: 'unsatisfiable' });
    expect(parseByteRange('bytes=500-400', 1000)).toEqual({ kind: 'unsatisfiable' });
    expect(parseByteRange('items=0-5', 1000)).toEqual({ kind: 'invalid' });
  });
});

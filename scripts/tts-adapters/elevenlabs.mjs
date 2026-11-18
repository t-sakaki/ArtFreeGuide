import { concatOggOpusBuffers, loadEnvVar } from './utils.mjs';

const MAX_CHUNK_CHARS = 9000;

export function isElevenLabsFatalError(httpStatus, errBody) {
  if (httpStatus === 401 || httpStatus === 402 || httpStatus === 429) {
    return true;
  }
  const body = String(errBody || '');
  // Request-level validation errors (e.g. >10,000 chars) are NOT account quota failures.
  if (/max_character_limit_exceeded|text_too_long/i.test(body)) {
    return false;
  }
  return /quota|credit|limit|payment/i.test(body);
}

export function splitSynthesisChunks(segments, maxChunkChars = MAX_CHUNK_CHARS) {
  const chunks = [];
  let current = [];
  let currentChars = 0;

  for (const seg of segments) {
    if (!seg.spoken) {
      current.push(seg);
      continue;
    }
    const addedLen = (currentChars > 0 ? 1 : 0) + seg.spoken.length;
    if (currentChars > 0 && currentChars + addedLen > maxChunkChars) {
      chunks.push(current);
      current = [seg];
      currentChars = seg.spoken.length;
    } else {
      current.push(seg);
      currentChars += addedLen;
    }
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

async function synthesizeElevenLabsChunk({
  text,
  locale,
  voiceId,
  modelId,
  outputFormat,
  voiceSettings,
  apiKey,
}) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=${encodeURIComponent(outputFormat)}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        language_code: locale,
        voice_settings: voiceSettings,
      }),
      signal: AbortSignal.timeout(180_000),
    });
  } catch (err) {
    return {
      ok: false,
      httpStatus: 0,
      fatal: false,
      error: err?.message || String(err),
      charCost: 0,
    };
  }

  const headerCost =
    Number.parseInt(
      res.headers.get('character-cost') || res.headers.get('x-character-count') || '0',
      10,
    ) || 0;

  if (!res.ok) {
    const errBody = await res.text();
    return {
      ok: false,
      httpStatus: res.status,
      fatal: isElevenLabsFatalError(res.status, errBody),
      error: errBody.slice(0, 400),
      charCost: headerCost,
    };
  }

  const data = await res.json();
  return {
    ok: true,
    audioBuf: Buffer.from(data.audio_base64 || '', 'base64'),
    alignment: data.alignment ?? null,
    charCost: headerCost,
  };
}

export const elevenlabsAdapter = {
  id: 'elevenlabs',
  defaultModelId: 'eleven_multilingual_v2',
  defaultOutputFormat: 'opus_48000_64',
  defaultVoiceSettings: {
    stability: 0.55,
    similarity_boost: 0.75,
    style: 0.0,
    use_speaker_boost: true,
  },
  defaultVoiceByLocale: {
    ja: 'oRjJxMXs2RKFFbRt3qwK', // Hana - Clear Japanese Narrator
    en: 'JBFqnCBsd6RMkjVDRZzb', // George - Warm, Captivating Storyteller
    fr: 'oRjJxMXs2RKFFbRt3qwK',
    es: 'oRjJxMXs2RKFFbRt3qwK',
    zh: 'oRjJxMXs2RKFFbRt3qwK',
  },

  async checkPreflight({ repoRoot }) {
    const apiKey = loadEnvVar('ELEVENLABS_API_KEY', repoRoot);
    if (!apiKey) {
      return { ok: false, missingKey: true, message: 'ELEVENLABS_API_KEY is missing in env or .env.local.' };
    }
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
        headers: { 'xi-api-key': apiKey },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        return { ok: false, status: res.status, requiresConfirmBudget: true, message: await res.text(), apiKey };
      }
      const sub = await res.json();
      const limit = Number(sub.character_limit ?? 0);
      const count = Number(sub.character_count ?? 0);
      return {
        ok: true,
        apiKey,
        tier: sub.tier,
        status: sub.status,
        characterCount: count,
        characterLimit: limit,
        remainingChars: Math.max(0, limit - count),
        canExtend: Boolean(sub.can_extend_character_limit),
        allowedToExtend: Boolean(sub.allowed_to_extend_character_limit),
        nextResetIso: sub.next_character_count_reset_unix
          ? new Date(sub.next_character_count_reset_unix * 1000).toISOString()
          : null,
      };
    } catch (err) {
      return { ok: false, status: 0, requiresConfirmBudget: true, message: err?.message || String(err), apiKey };
    }
  },

  async synthesize(job, { helpers, repoRoot }) {
    const apiKey = loadEnvVar('ELEVENLABS_API_KEY', repoRoot);
    if (!apiKey) {
      return { status: 'error', fatal: true, error: 'ELEVENLABS_API_KEY is missing.' };
    }

    const { buildNarrationSynthesisInput, mapCharacterAlignmentToSegments, verifyOpusBuffer } = helpers;
    const synthInput = buildNarrationSynthesisInput(job.guideText, job.locale);
    if (!synthInput.synthesisText) {
      return { status: 'skipped-empty', charCost: 0 };
    }

    // Single-request fast path when under ElevenLabs 10k-character limit
    if (synthInput.synthesisText.length <= MAX_CHUNK_CHARS) {
      const res = await synthesizeElevenLabsChunk({
        text: synthInput.synthesisText,
        locale: job.locale,
        voiceId: job.voiceId,
        modelId: job.modelId,
        outputFormat: job.outputFormat,
        voiceSettings: job.voiceSettings,
        apiKey,
      });
      if (!res.ok) {
        return {
          status: 'error',
          httpStatus: res.httpStatus,
          fatal: res.fatal,
          error: res.error,
          charCost: res.charCost,
        };
      }
      const opusCheck = verifyOpusBuffer(res.audioBuf);
      if (!opusCheck.valid) {
        return {
          status: 'error',
          fatal: false,
          error: `Opus verification failed: ${opusCheck.error}`,
          charCost: res.charCost || job.charCount,
        };
      }
      const segments = mapCharacterAlignmentToSegments(synthInput, res.alignment, opusCheck.durationMs);
      return {
        status: 'ok',
        audioBuf: res.audioBuf,
        opusCheck,
        segments,
        alignment: res.alignment,
        charCost: res.charCost || job.charCount,
        inputChars: job.charCount,
      };
    }

    // Chunked path for extra-long guides (> 9,000 chars)
    const chunks = splitSynthesisChunks(synthInput.segments, MAX_CHUNK_CHARS);
    const chunkAudioBufs = [];
    const mergedSegments = [];
    const chunkAlignments = [];
    let totalCharCost = 0;
    let offsetMs = 0;

    for (const chunkSegs of chunks) {
      const spokenSegs = chunkSegs.filter(s => s.spoken);
      if (spokenSegs.length === 0) {
        for (const s of chunkSegs) {
          mergedSegments.push({ index: s.index, startMs: offsetMs, endMs: offsetMs });
        }
        continue;
      }

      let chunkText = '';
      const localSegments = chunkSegs.map(s => {
        if (!s.spoken) {
          return { ...s, startChar: chunkText.length, endChar: chunkText.length };
        }
        if (chunkText.length > 0) chunkText += '\n';
        const startChar = chunkText.length;
        chunkText += s.spoken;
        const endChar = chunkText.length;
        return { ...s, startChar, endChar };
      });

      const res = await synthesizeElevenLabsChunk({
        text: chunkText,
        locale: job.locale,
        voiceId: job.voiceId,
        modelId: job.modelId,
        outputFormat: job.outputFormat,
        voiceSettings: job.voiceSettings,
        apiKey,
      });
      totalCharCost += res.charCost || 0;

      if (!res.ok) {
        return {
          status: 'error',
          httpStatus: res.httpStatus,
          fatal: res.fatal,
          error: res.error,
          charCost: totalCharCost,
        };
      }

      const chunkOpus = verifyOpusBuffer(res.audioBuf);
      if (!chunkOpus.valid) {
        return {
          status: 'error',
          fatal: false,
          error: `Chunk Opus verification failed: ${chunkOpus.error}`,
          charCost: totalCharCost || job.charCount,
        };
      }

      const localInput = {
        speakableSegments: chunkSegs.map(s => s.raw),
        segments: localSegments,
        synthesisText: chunkText,
      };
      const localTimings = mapCharacterAlignmentToSegments(
        localInput,
        res.alignment,
        chunkOpus.durationMs,
      );

      for (const t of localTimings) {
        mergedSegments.push({
          index: t.index,
          startMs: offsetMs + t.startMs,
          endMs: offsetMs + t.endMs,
        });
      }

      chunkAudioBufs.push(res.audioBuf);
      chunkAlignments.push(res.alignment);
      offsetMs += chunkOpus.durationMs;
    }

    const mergedBuf = concatOggOpusBuffers(chunkAudioBufs);
    const opusCheck = verifyOpusBuffer(mergedBuf);
    if (!opusCheck.valid) {
      return {
        status: 'error',
        fatal: false,
        error: `Merged Opus verification failed: ${opusCheck.error}`,
        charCost: totalCharCost || job.charCount,
      };
    }

    if (mergedSegments.length > 0 && opusCheck.durationMs > 0) {
      mergedSegments[mergedSegments.length - 1].endMs = Math.max(
        mergedSegments[mergedSegments.length - 1].endMs,
        opusCheck.durationMs,
      );
    }

    return {
      status: 'ok',
      audioBuf: mergedBuf,
      opusCheck,
      segments: mergedSegments,
      alignment: chunkAlignments,
      charCost: totalCharCost || job.charCount,
      inputChars: job.charCount,
    };
  },
};

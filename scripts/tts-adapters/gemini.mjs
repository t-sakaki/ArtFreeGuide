import {
  concatOggOpusBuffers,
  loadEnvVar,
  transcodeToOggOpus,
} from './utils.mjs';

function parsePcmRate(mimeType) {
  const m = /rate=(\d+)/i.exec(String(mimeType || ''));
  return m ? Number.parseInt(m[1], 10) : 24000;
}

async function synthesizeGeminiSegment({ text, voiceId, modelId, apiKey }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Read the following museum audio guide narration naturally and calmly without adding extra words:\n${text}`,
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceId },
            },
          },
        },
      }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (err) {
    return {
      ok: false,
      httpStatus: 0,
      fatal: false,
      error: err?.message || String(err),
    };
  }

  if (!res.ok) {
    const errBody = await res.text();
    const fatal = res.status === 401 || res.status === 403 || res.status === 429;
    return {
      ok: false,
      httpStatus: res.status,
      fatal,
      error: errBody.slice(0, 400),
    };
  }

  const data = await res.json();
  const inline = data?.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData;
  if (!inline?.data) {
    return {
      ok: false,
      httpStatus: 200,
      fatal: false,
      error: 'Gemini TTS response did not include inlineData audio.',
    };
  }

  const rawBuf = Buffer.from(inline.data, 'base64');
  const mimeType = String(inline.mimeType || 'audio/L16;rate=24000');
  let opusBuf;
  if (mimeType.toLowerCase().includes('l16') || mimeType.toLowerCase().includes('pcm')) {
    const rate = parsePcmRate(mimeType);
    opusBuf = transcodeToOggOpus(rawBuf, {
      inputArgs: ['-f', 's16le', '-ar', String(rate), '-ac', '1'],
      inputExt: 'pcm',
    });
  } else {
    opusBuf = transcodeToOggOpus(rawBuf, { inputExt: 'bin' });
  }

  return { ok: true, opusBuf };
}

export const geminiAdapter = {
  id: 'gemini',
  defaultModelId: 'gemini-2.5-flash-preview-tts',
  defaultOutputFormat: 'opus_48000_64',
  defaultVoiceSettings: {},
  defaultVoiceByLocale: {
    ja: 'Kore',
    en: 'Puck',
    fr: 'Aoede',
    es: 'Charon',
    zh: 'Kore',
  },

  async checkPreflight({ repoRoot }) {
    const key = loadEnvVar('GEMINI_API_KEY', repoRoot) || loadEnvVar('GOOGLE_AI_API_KEY', repoRoot);
    if (!key) {
      return {
        ok: false,
        missingKey: true,
        message: 'GEMINI_API_KEY (or GOOGLE_AI_API_KEY) is missing in env or .env.local.',
      };
    }
    return { ok: true, tier: 'configured' };
  },

  async synthesize(job, { helpers, repoRoot }) {
    const apiKey = loadEnvVar('GEMINI_API_KEY', repoRoot) || loadEnvVar('GOOGLE_AI_API_KEY', repoRoot);
    if (!apiKey) {
      return { status: 'error', fatal: true, error: 'GEMINI_API_KEY is missing.' };
    }

    const {
      buildNarrationSynthesisInput,
      buildSegmentTimingsFromDurations,
      verifyOpusBuffer,
    } = helpers;

    const synthInput = buildNarrationSynthesisInput(job.guideText, job.locale);
    if (!synthInput.synthesisText) {
      return { status: 'skipped-empty', charCost: 0 };
    }

    const gapMs = 150;
    const segBufs = [];
    const segDurations = [];

    for (const seg of synthInput.segments) {
      if (!seg.spoken) {
        segDurations.push(0);
        continue;
      }
      const res = await synthesizeGeminiSegment({
        text: seg.spoken,
        voiceId: job.voiceId,
        modelId: job.modelId,
        apiKey,
      });
      if (!res.ok) {
        return {
          status: 'error',
          httpStatus: res.httpStatus,
          fatal: res.fatal,
          error: res.error,
          charCost: job.charCount,
        };
      }
      const check = verifyOpusBuffer(res.opusBuf);
      if (!check.valid) {
        return {
          status: 'error',
          fatal: false,
          error: `Gemini segment Opus verification failed: ${check.error}`,
          charCost: job.charCount,
        };
      }
      segBufs.push(res.opusBuf);
      segDurations.push(check.durationMs);
    }

    const mergedBuf = concatOggOpusBuffers(segBufs, { gapMs });
    const opusCheck = verifyOpusBuffer(mergedBuf);
    if (!opusCheck.valid) {
      return {
        status: 'error',
        fatal: false,
        error: `Gemini merged Opus verification failed: ${opusCheck.error}`,
        charCost: job.charCount,
      };
    }

    const segments = buildSegmentTimingsFromDurations(
      synthInput.segments,
      segDurations,
      gapMs,
      opusCheck.durationMs,
    );

    return {
      status: 'ok',
      audioBuf: mergedBuf,
      opusCheck,
      segments,
      alignment: null,
      charCost: job.charCount,
      inputChars: job.charCount,
    };
  },
};

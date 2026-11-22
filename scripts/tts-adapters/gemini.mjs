import {
  concatOggOpusBuffers,
  loadEnvVar,
  transcodeToOggOpus,
} from './utils.mjs';

function parsePcmRate(mimeType) {
  const m = /rate=(\d+)/i.exec(String(mimeType || ''));
  return m ? Number.parseInt(m[1], 10) : 24000;
}

function isGeminiQuotaOrRateError(httpStatus, errorText) {
  if (httpStatus === 429) return true;
  const body = String(errorText || '').toLowerCase();
  return (
    body.includes('resource_exhausted') ||
    body.includes('quota') ||
    body.includes('rate limit') ||
    body.includes('too many requests')
  );
}

function resolveGeminiKeyConfig(repoRoot) {
  const primary = loadEnvVar('GEMINI_API_KEY', repoRoot) || loadEnvVar('GOOGLE_AI_API_KEY', repoRoot);
  const free = loadEnvVar('GEMINI_API_KEY_FREE', repoRoot);
  return {
    primary,
    free,
    hasFree: Boolean(free && free !== primary),
  };
}

async function synthesizeGeminiSegment({ text, voiceId, modelId, apiKey, signal }) {
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
                text,
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
      signal: signal || AbortSignal.timeout(90_000),
    });
  } catch (err) {
    return {
      ok: false,
      httpStatus: 0,
      fatal: false,
      quotaExhausted: false,
      error: err?.message || String(err),
    };
  }

  if (!res.ok) {
    const errBody = await res.text();
    const quotaExhausted = isGeminiQuotaOrRateError(res.status, errBody);
    const fatal = res.status === 401 || res.status === 403;
    return {
      ok: false,
      httpStatus: res.status,
      fatal,
      quotaExhausted,
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
      quotaExhausted: false,
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

  async checkPreflight({ repoRoot, keyTier = 'free' }) {
    const { primary, free, hasFree } = resolveGeminiKeyConfig(repoRoot);
    if (keyTier === 'free' ? !free : !primary) {
      return {
        ok: false,
        missingKey: true,
        message: keyTier === 'free'
          ? 'Free mode requires GEMINI_API_KEY_FREE from a verified unbilled project; primary key will not be used.'
          : 'Primary mode requires GEMINI_API_KEY (or GOOGLE_AI_API_KEY).',
      };
    }
    return {
      ok: true,
      tier: 'configured',
      hasPrimary: Boolean(primary),
      hasFreeBackup: hasFree,
    };
  },

  async synthesize(job, { helpers, repoRoot, geminiKeyContext, minRequestIntervalMs = 0 }) {
    const keyConfig = resolveGeminiKeyConfig(repoRoot);
    const activeTier = geminiKeyContext?.activeTier || 'free';
    const activeKey = activeTier === 'free' ? keyConfig.free : keyConfig.primary;
    if (!activeKey) {
      return {
        status: 'error', fatal: true, keyTier: activeTier,
        error: activeTier === 'free'
          ? 'Free mode requires GEMINI_API_KEY_FREE; primary key will not be used.'
          : 'Primary mode requires GEMINI_API_KEY (or GOOGLE_AI_API_KEY).',
      };
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

    const runWithKey = async (tierName, activeKey) => {
      const segBufs = [];
      const segDurations = [];
      for (const seg of synthInput.segments) {
        if (!seg.spoken) {
          segDurations.push(0);
          continue;
        }

        if (geminiKeyContext && typeof geminiKeyContext.waitForRateLimit === 'function') {
          try {
            await geminiKeyContext.waitForRateLimit(tierName, minRequestIntervalMs);
          } catch (err) {
            if (err?.message === 'GEMINI_FREE_BUDGET_EXHAUSTED') {
              return {
                status: 'error',
                fatal: false,
                quotaExhausted: false,
                freeBudgetExhausted: true,
                error: 'Free key request budget exhausted for this run.',
                charCost: job.charCount,
                keyTier: tierName,
              };
            }
            throw err;
          }
        }

        const res = await synthesizeGeminiSegment({
          text: seg.spoken,
          voiceId: job.voiceId,
          modelId: job.modelId,
          apiKey: activeKey,
        });

        if (!res.ok) {
          return {
            status: 'error',
            httpStatus: res.httpStatus,
            fatal: res.fatal,
            quotaExhausted: res.quotaExhausted,
            error: res.error,
            charCost: job.charCount,
            keyTier: tierName,
          };
        }

        const check = verifyOpusBuffer(res.opusBuf);
        if (!check.valid) {
          return {
            status: 'error',
            fatal: false,
            quotaExhausted: false,
            error: `Gemini segment Opus verification failed: ${check.error}`,
            charCost: job.charCount,
            keyTier: tierName,
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
          quotaExhausted: false,
          error: `Gemini merged Opus verification failed: ${opusCheck.error}`,
          charCost: job.charCount,
          keyTier: tierName,
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
        keyTier: tierName,
      };
    };

    let result = await runWithKey(activeTier, activeKey);

    // Fallback trigger (bulk mode): quota/rate error on the primary key switches to the free key.
    // In free-first daily mode the free key is NOT silently upgraded to the paid primary key;
    // quota errors surface to the runner, which stops safely and reports unprocessed items.
    if (
      result.status !== 'ok' &&
      result.quotaExhausted &&
      activeTier === 'primary' &&
      keyConfig.hasFree
    ) {
      console.warn(
        `[gemini-tts] Rate limit / quota error on primary key (${result.error || result.httpStatus}). Switching to fallback free key.`,
      );
      if (geminiKeyContext) {
        geminiKeyContext.activeTier = 'free';
      }
      result = await runWithKey('free', keyConfig.free);
    }

    return result;
  },
};

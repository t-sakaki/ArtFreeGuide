import {
  concatOggOpusBuffers,
  escapeXml,
  loadEnvVar,
  transcodeToOggOpus,
} from './utils.mjs';

const AZURE_LANG_MAP = {
  ja: 'ja-JP',
  en: 'en-US',
  fr: 'fr-FR',
  es: 'es-ES',
  zh: 'zh-CN',
};

function buildAzureSsml({ text, locale, voiceId, voiceSettings }) {
  const xmlLang = AZURE_LANG_MAP[locale] || 'ja-JP';
  const rate = String(voiceSettings?.rate ?? '0%');
  const pitch = String(voiceSettings?.pitch ?? '0%');
  return [
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${xmlLang}">`,
    `  <voice name="${escapeXml(voiceId)}">`,
    `    <prosody rate="${escapeXml(rate)}" pitch="${escapeXml(pitch)}">`,
    `      ${escapeXml(text)}`,
    `    </prosody>`,
    `  </voice>`,
    `</speak>`,
  ].join('\n');
}

async function synthesizeAzureSsml({ ssml, endpoint, apiKey, outputFormat }) {
  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': outputFormat,
        'User-Agent': 'ArtFreeGuide-NarrationGenerator/1.0',
      },
      body: ssml,
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
      error: errBody.slice(0, 400) || `HTTP ${res.status}`,
    };
  }

  return {
    ok: true,
    audioBuf: Buffer.from(await res.arrayBuffer()),
  };
}

export const azureAdapter = {
  id: 'azure',
  defaultModelId: 'neural',
  defaultOutputFormat: 'ogg-48khz-16bit-mono-opus',
  defaultVoiceSettings: {
    rate: '0%',
    pitch: '0%',
    strategy: 'single', // 'single' (1 tx/guide, F0 safe) or 'per-segment'
  },
  defaultVoiceByLocale: {
    ja: 'ja-JP-NanamiNeural',
    en: 'en-US-JennyNeural',
    fr: 'fr-FR-DeniseNeural',
    es: 'es-ES-ElviraNeural',
    zh: 'zh-CN-XiaoxiaoNeural',
  },

  async checkPreflight({ repoRoot }) {
    const key = loadEnvVar('AZURE_SPEECH_KEY', repoRoot);
    const region = loadEnvVar('AZURE_SPEECH_REGION', repoRoot);
    if (!key || !region) {
      return {
        ok: false,
        missingKey: true,
        message: 'AZURE_SPEECH_KEY or AZURE_SPEECH_REGION is missing in env or .env.local.',
      };
    }
    return {
      ok: true,
      tier: 'configured',
      region,
    };
  },

  async synthesize(job, { helpers, repoRoot }) {
    const apiKey = loadEnvVar('AZURE_SPEECH_KEY', repoRoot);
    const region = loadEnvVar('AZURE_SPEECH_REGION', repoRoot);
    if (!apiKey || !region) {
      return { status: 'error', fatal: true, error: 'AZURE_SPEECH_KEY or AZURE_SPEECH_REGION is missing.' };
    }

    const {
      buildNarrationSynthesisInput,
      buildSegmentTimingsFromDurations,
      buildUniformSegmentTimings,
      verifyOpusBuffer,
    } = helpers;

    const synthInput = buildNarrationSynthesisInput(job.guideText, job.locale);
    if (!synthInput.synthesisText) {
      return { status: 'skipped-empty', charCost: 0 };
    }

    const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const strategy = job.voiceSettings?.strategy === 'per-segment' ? 'per-segment' : 'single';

    if (strategy === 'per-segment') {
      const gapMs = 140;
      const segBufs = [];
      const segDurations = [];

      for (const seg of synthInput.segments) {
        if (!seg.spoken) {
          segDurations.push(0);
          continue;
        }
        const ssml = buildAzureSsml({
          text: seg.spoken,
          locale: job.locale,
          voiceId: job.voiceId,
          voiceSettings: job.voiceSettings,
        });
        const res = await synthesizeAzureSsml({
          ssml,
          endpoint,
          apiKey,
          outputFormat: job.outputFormat,
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

        let opusBuf = res.audioBuf;
        let check = verifyOpusBuffer(opusBuf);
        if (!check.valid) {
          opusBuf = transcodeToOggOpus(opusBuf, { inputExt: 'ogg' });
          check = verifyOpusBuffer(opusBuf);
        }
        if (!check.valid) {
          return {
            status: 'error',
            fatal: false,
            error: `Azure segment Opus verification failed: ${check.error}`,
            charCost: job.charCount,
          };
        }
        segBufs.push(opusBuf);
        segDurations.push(check.durationMs);
      }

      const mergedBuf = concatOggOpusBuffers(segBufs, { gapMs });
      const opusCheck = verifyOpusBuffer(mergedBuf);
      if (!opusCheck.valid) {
        return {
          status: 'error',
          fatal: false,
          error: `Azure merged Opus verification failed: ${opusCheck.error}`,
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
    }

    // Default single-request SSML (1 transaction per artwork, safe for F0 20 req/min)
    const ssml = buildAzureSsml({
      text: synthInput.synthesisText,
      locale: job.locale,
      voiceId: job.voiceId,
      voiceSettings: job.voiceSettings,
    });
    const res = await synthesizeAzureSsml({
      ssml,
      endpoint,
      apiKey,
      outputFormat: job.outputFormat,
    });
    if (!res.ok) {
      return {
        status: 'error',
        httpStatus: res.httpStatus,
        fatal: res.fatal,
        error: res.error,
        charCost: 0,
      };
    }

    let opusBuf = res.audioBuf;
    let opusCheck = verifyOpusBuffer(opusBuf);
    if (!opusCheck.valid) {
      opusBuf = transcodeToOggOpus(opusBuf, { inputExt: 'ogg' });
      opusCheck = verifyOpusBuffer(opusBuf);
    }
    if (!opusCheck.valid) {
      return {
        status: 'error',
        fatal: false,
        error: `Azure Opus verification failed: ${opusCheck.error}`,
        charCost: job.charCount,
      };
    }

    const segments = buildUniformSegmentTimings(synthInput.segments, opusCheck.durationMs);
    return {
      status: 'ok',
      audioBuf: opusBuf,
      opusCheck,
      segments,
      alignment: null,
      charCost: job.charCount,
      inputChars: job.charCount,
    };
  },
};

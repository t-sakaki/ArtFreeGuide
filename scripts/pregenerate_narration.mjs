#!/usr/bin/env node
/**
 * Pre-generates ElevenLabs Ogg/Opus narration + character-aligned segment timings,
 * archives them locally under tmp/narration-archive/, and uploads them to
 * Cloudflare R2 (artfreeguide-audio) under narration/{staging|production}/...
 *
 * Usage examples:
 *   node scripts/pregenerate_narration.mjs --dry-run --locales=ja,en
 *   node scripts/pregenerate_narration.mjs --env=staging --voice-id=oRjJxMXs2RKFFbRt3qwK --format=opus_48000_64 --max-chars=50000 --confirm-budget
 *   node scripts/pregenerate_narration.mjs --copy-to-prod --from-env=staging --to-env=production
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const REPO_ROOT = process.cwd();
const ARCHIVE_ROOT = path.resolve(REPO_ROOT, 'tmp/narration-archive');
const R2_BUCKET = 'artfreeguide-audio';
const D1_DB_NAME = 'artfreeguide_db_trial';
const DEFAULT_DEADLINE = '2026-11-18T00:00:00Z';

// Known curated works (matches src/lib/dailyArtwork.ts + playlists order)
const PRIORITY_TITLES = [
  '富嶽三十六景 神奈川沖浪裏',
  '神奈川沖浪裏',
  '真珠の耳飾りの少女',
  '星月夜',
  '睡蓮',
  '印象・日の出',
  'モナ・リザ',
  '叫び',
  'ひまわり',
  '最後の晩餐',
  'ゲルニカ',
  '記憶の固執',
  '風神雷神図屏風',
  'ヴィーナスの誕生',
  '夜警',
  '接吻',
  'アテナイの学堂',
  'アビニヨンの娘たち',
];

function parseArgs(argv) {
  const opts = {
    env: 'staging',
    dryRun: false,
    locales: ['ja', 'en'],
    modes: ['standard', 'short', 'deep'],
    voiceId: 'oRjJxMXs2RKFFbRt3qwK', // Hana
    voiceOverrides: {},
    modelId: 'eleven_multilingual_v2',
    format: 'opus_48000_64',
    maxChars: 0,
    deadline: DEFAULT_DEADLINE,
    limit: 0,
    titles: [],
    concurrency: 1,
    skipR2: false,
    checkRemoteR2: false,
    confirmBudget: false,
    copyToProd: false,
    fromEnv: 'staging',
    toEnv: 'production',
    localD1Json: '',
  };

  for (const raw of argv) {
    if (raw === '--dry-run') opts.dryRun = true;
    else if (raw === '--skip-r2') opts.skipR2 = true;
    else if (raw === '--check-remote-r2') opts.checkRemoteR2 = true;
    else if (raw === '--confirm-budget') opts.confirmBudget = true;
    else if (raw === '--copy-to-prod') opts.copyToProd = true;
    else if (raw.startsWith('--env=')) opts.env = raw.slice('--env='.length);
    else if (raw.startsWith('--from-env=')) opts.fromEnv = raw.slice('--from-env='.length);
    else if (raw.startsWith('--to-env=')) opts.toEnv = raw.slice('--to-env='.length);
    else if (raw.startsWith('--locales=')) {
      opts.locales = raw.slice('--locales='.length).split(',').map(s => s.trim()).filter(Boolean);
    } else if (raw.startsWith('--modes=')) {
      opts.modes = raw.slice('--modes='.length).split(',').map(s => s.trim()).filter(Boolean);
    } else if (raw.startsWith('--voice-id=')) {
      opts.voiceId = raw.slice('--voice-id='.length).trim();
    } else if (raw.startsWith('--voice-')) {
      const m = /^--voice-([a-z]{2})=(.+)$/.exec(raw);
      if (m) opts.voiceOverrides[m[1]] = m[2].trim();
    } else if (raw.startsWith('--model-id=')) {
      opts.modelId = raw.slice('--model-id='.length).trim();
    } else if (raw.startsWith('--format=')) {
      opts.format = raw.slice('--format='.length).trim();
    } else if (raw.startsWith('--max-chars=')) {
      opts.maxChars = Math.max(0, Number.parseInt(raw.slice('--max-chars='.length), 10) || 0);
    } else if (raw.startsWith('--deadline=')) {
      opts.deadline = raw.slice('--deadline='.length).trim();
    } else if (raw.startsWith('--limit=')) {
      opts.limit = Math.max(0, Number.parseInt(raw.slice('--limit='.length), 10) || 0);
    } else if (raw.startsWith('--titles=')) {
      opts.titles = raw.slice('--titles='.length).split(',').map(s => s.trim()).filter(Boolean);
    } else if (raw.startsWith('--concurrency=')) {
      opts.concurrency = Math.max(1, Math.min(2, Number.parseInt(raw.slice('--concurrency='.length), 10) || 1));
    } else if (raw.startsWith('--local-d1-json=')) {
      opts.localD1Json = raw.slice('--local-d1-json='.length).trim();
    } else if (raw === '--help' || raw === '-h') {
      printUsage();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${raw}`);
      process.exit(1);
    }
  }
  return opts;
}

function printUsage() {
  console.log(`Usage: node scripts/pregenerate_narration.mjs [options]
  --dry-run                Inspect D1 guides and estimate chars/jobs without calling ElevenLabs
  --env=staging|production Target R2 environment prefix (default: staging)
  --locales=ja,en          Comma-separated locales in priority order (default: ja,en)
  --modes=standard,short,deep Comma-separated modes (default: standard,short,deep)
  --voice-id=<id>          Default ElevenLabs voice_id (default: Hana oRjJxMXs2RKFFbRt3qwK)
  --voice-<loc>=<id>       Per-locale voice_id override (e.g. --voice-en=...)
  --model-id=<id>          ElevenLabs model_id (default: eleven_multilingual_v2)
  --format=<fmt>           output_format (default: opus_48000_64)
  --max-chars=<N>          Hard cap on cumulative input characters synthesized in this run
  --deadline=<ISO>         Hard UTC stop timestamp (default: ${DEFAULT_DEADLINE})
  --limit=<N>              Max number of synthesis jobs to run
  --titles=a,b             Filter to matching titles
  --concurrency=1|2        Parallelism (default: 1)
  --check-remote-r2        Also check remote R2 for existing latest.json when local archive misses
  --skip-r2                Keep generated files locally without uploading to R2
  --confirm-budget         Required for live synthesis if subscription endpoint lacks user_read
  --copy-to-prod           Upload local/staging archive artifacts under production prefix (no TTS calls)
`);
}

function loadElevenLabsKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  const envPath = path.resolve(REPO_ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return '';
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(/^ELEVENLABS_API_KEY=(.+)$/m);
  if (!match) return '';
  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

async function loadAppModules() {
  const virtualEntry = `
    export * from './src/lib/narration.ts';
    export * from './src/lib/narrationText.ts';
    export * from './src/lib/guideText.ts';
    export * from './src/lib/names.ts';
    export * from './src/lib/playlists.ts';
    export * from './src/lib/i18n.ts';
  `;
  const result = esbuild.buildSync({
    stdin: {
      contents: virtualEntry,
      resolveDir: REPO_ROOT,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });
  const tmpBundle = path.join(ARCHIVE_ROOT, '.bundle-helpers.mjs');
  fs.mkdirSync(ARCHIVE_ROOT, { recursive: true });
  fs.writeFileSync(tmpBundle, result.outputFiles[0].text, 'utf8');
  return await import(`${pathToFileURL(tmpBundle).href}?t=${Date.now()}`);
}

function parseLocaleFromCacheKey(cacheKey) {
  const parts = String(cacheKey || '').split('::');
  if (parts.length >= 3) {
    const tail = parts[parts.length - 1];
    if (['ja', 'en', 'fr', 'zh', 'es'].includes(tail)) return tail;
  }
  return 'ja';
}

function parseGuidePayload(payload, sanitizeGuideText) {
  const raw = String(payload || '').trim();
  if (!raw) return null;
  let short = '';
  let standard = '';
  let deep = '';
  try {
    let jsonString = raw;
    const firstBrace = jsonString.indexOf('{');
    const lastBrace = jsonString.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonString = jsonString.substring(firstBrace, lastBrace + 1);
    }
    const parsed = JSON.parse(jsonString);
    short = typeof parsed.short === 'string' ? parsed.short : '';
    standard = typeof parsed.standard === 'string' ? parsed.standard : '';
    deep = typeof parsed.deep === 'string' ? parsed.deep : '';
  } catch {
    short = raw;
  }
  return {
    short: sanitizeGuideText(short),
    standard: sanitizeGuideText(standard),
    deep: sanitizeGuideText(deep),
  };
}

function fetchD1Guides(localJsonPath) {
  if (localJsonPath) {
    const parsed = JSON.parse(fs.readFileSync(localJsonPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : parsed.results || [];
  }
  const sql = 'SELECT cache_key, title, artist, payload, updated_at FROM artwork_guides ORDER BY updated_at DESC';
  const stdout = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', D1_DB_NAME, '--remote', '--env', 'staging', '--json', '--command', sql],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, cwd: REPO_ROOT },
  );
  const parsed = JSON.parse(stdout);
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  const rows = first?.results ?? [];
  fs.mkdirSync(ARCHIVE_ROOT, { recursive: true });
  fs.writeFileSync(path.join(ARCHIVE_ROOT, 'd1-snapshot.json'), JSON.stringify(rows, null, 2), 'utf8');
  return rows;
}

function localFileForKey(key) {
  return path.join(ARCHIVE_ROOT, key);
}

function remoteR2Exists(key) {
  try {
    execFileSync(
      'npx',
      ['wrangler', 'r2', 'object', 'get', `${R2_BUCKET}/${key}`, '--remote', '--pipe'],
      { stdio: ['ignore', 'pipe', 'ignore'], cwd: REPO_ROOT },
    );
    return true;
  } catch {
    return false;
  }
}

function uploadR2File(key, localPath, contentType, cacheControl) {
  execFileSync(
    'npx',
    [
      'wrangler',
      'r2',
      'object',
      'put',
      `${R2_BUCKET}/${key}`,
      '--file',
      localPath,
      '--content-type',
      contentType,
      '--cache-control',
      cacheControl,
      '--remote',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], cwd: REPO_ROOT },
  );
}

async function checkElevenLabsCredit(apiKey) {
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': apiKey },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { ok: false, status: res.status, message: await res.text() };
    }
    const sub = await res.json();
    const limit = Number(sub.character_limit ?? 0);
    const count = Number(sub.character_count ?? 0);
    return {
      ok: true,
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
    return { ok: false, status: 0, message: err?.message || String(err) };
  }
}

function buildPriorityScore(job, opts, playlistTitleSet, canonicalName) {
  const localeIdx = opts.locales.indexOf(job.locale);
  const modeIdx = opts.modes.indexOf(job.mode);
  const canon = canonicalName(job.title);
  const curatedIdx = PRIORITY_TITLES.indexOf(canon);
  const isPlaylist = playlistTitleSet.has(canon);
  const isPriorityWork = curatedIdx !== -1 || isPlaylist;

  // Prefer canonical Japanese title + non-empty artist rows before alias/empty-artist duplicates.
  const isExactCanonicalRow = job.title.trim() === canon && job.artist.trim().length > 0;
  const rowQualityPenalty = isExactCanonicalRow ? 0 : job.artist.trim().length > 0 ? 1 : 2;

  let tier = 100 + localeIdx * 10 + modeIdx;
  if (job.mode === 'standard') {
    tier = localeIdx * 4 + (isPriorityWork ? 0 : 2) + (rowQualityPenalty > 0 ? 1 : 0);
  } else {
    tier = 20 + localeIdx * 10 + modeIdx * 3 + (isPriorityWork ? 0 : 1) + (rowQualityPenalty > 0 ? 1 : 0);
  }
  const workOrder = curatedIdx !== -1 ? curatedIdx : isPlaylist ? 500 : 1000;
  return tier * 100000 + rowQualityPenalty * 10000 + workOrder;
}

async function copyArchiveEnvironment(opts, helpers) {
  const { resolveNarrationEnvironment } = helpers;
  const fromEnv = resolveNarrationEnvironment(opts.fromEnv);
  const toEnv = resolveNarrationEnvironment(opts.toEnv);
  const fromRoot = path.join(ARCHIVE_ROOT, 'narration', fromEnv);
  if (!fs.existsSync(fromRoot)) {
    console.error(`Local archive for ${fromEnv} not found at ${fromRoot}`);
    process.exit(1);
  }

  let copied = 0;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!['audio.opus', 'manifest.json', 'latest.json'].includes(entry.name)) continue;
      const rel = path.relative(path.join(ARCHIVE_ROOT, 'narration', fromEnv), full);
      const destKey = `narration/${toEnv}/${rel.split(path.sep).join('/')}`;
      const destLocal = localFileForKey(destKey);
      fs.mkdirSync(path.dirname(destLocal), { recursive: true });
      fs.copyFileSync(full, destLocal);

      if (!opts.skipR2) {
        const ct = entry.name === 'audio.opus' ? 'audio/ogg; codecs=opus' : 'application/json';
        const cc = entry.name === 'latest.json' ? 'public, max-age=300' : 'public, max-age=31536000, immutable';
        uploadR2File(destKey, destLocal, ct, cc);
      }
      copied++;
    }
  }

  walk(fromRoot);
  console.log(`Copied ${copied} narration objects from ${fromEnv} -> ${toEnv} (skipR2=${opts.skipR2}).`);
}

async function synthesizeAndPersist(job, apiKey, opts, helpers) {
  const {
    buildNarrationSynthesisInput,
    mapCharacterAlignmentToSegments,
    verifyOpusBuffer,
    narrationAudioKey,
    narrationManifestKey,
    narrationLatestKey,
  } = helpers;

  const synthInput = buildNarrationSynthesisInput(job.guideText, job.locale);
  if (!synthInput.synthesisText) {
    return { status: 'skipped-empty', charCost: 0 };
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${job.voiceId}/with-timestamps?output_format=${encodeURIComponent(opts.format)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: synthInput.synthesisText,
      model_id: opts.modelId,
      language_code: job.locale,
      voice_settings: job.voiceSettings,
    }),
    signal: AbortSignal.timeout(90_000),
  });

  const headerCost = Number.parseInt(
    res.headers.get('character-cost') || res.headers.get('x-character-count') || '0',
    10,
  ) || 0;

  if (!res.ok) {
    const errBody = await res.text();
    const fatal =
      res.status === 401 ||
      res.status === 402 ||
      res.status === 429 ||
      /quota|credit|limit|payment/i.test(errBody);
    return {
      status: 'error',
      httpStatus: res.status,
      fatal,
      error: errBody.slice(0, 400),
      charCost: headerCost,
    };
  }

  const data = await res.json();
  const audioBuf = Buffer.from(data.audio_base64 || '', 'base64');
  const opusCheck = verifyOpusBuffer(audioBuf);
  if (!opusCheck.valid) {
    return {
      status: 'error',
      fatal: false,
      error: `Opus verification failed: ${opusCheck.error}`,
      charCost: headerCost || job.charCount,
    };
  }

  const segments = mapCharacterAlignmentToSegments(
    synthInput,
    data.alignment,
    opusCheck.durationMs,
  );

  const manifest = {
    version: 1,
    artworkId: job.artworkId,
    canonicalTitle: job.canonicalTitle,
    canonicalArtist: job.canonicalArtist,
    locale: job.locale,
    mode: job.mode,
    contentHash: job.contentHash,
    voiceConfigHash: job.voiceConfigHash,
    provider: 'elevenlabs',
    modelId: opts.modelId,
    voiceId: job.voiceId,
    outputFormat: opts.format,
    durationMs: opusCheck.durationMs,
    byteLength: audioBuf.length,
    segments,
    createdAt: new Date().toISOString(),
  };

  const latest = {
    voiceConfigHash: job.voiceConfigHash,
    updatedAt: manifest.createdAt,
  };

  const audioKey = narrationAudioKey(opts.env, job.artworkId, job.locale, job.mode, job.contentHash, job.voiceConfigHash);
  const manifestKey = narrationManifestKey(opts.env, job.artworkId, job.locale, job.mode, job.contentHash, job.voiceConfigHash);
  const latestKey = narrationLatestKey(opts.env, job.artworkId, job.locale, job.mode, job.contentHash);
  const alignmentKey = manifestKey.replace(/manifest\.json$/, 'alignment.json');

  const audioLocal = localFileForKey(audioKey);
  const manifestLocal = localFileForKey(manifestKey);
  const latestLocal = localFileForKey(latestKey);
  const alignmentLocal = localFileForKey(alignmentKey);

  fs.mkdirSync(path.dirname(audioLocal), { recursive: true });
  fs.writeFileSync(audioLocal, audioBuf);
  fs.writeFileSync(manifestLocal, JSON.stringify(manifest, null, 2), 'utf8');
  fs.writeFileSync(latestLocal, JSON.stringify(latest, null, 2), 'utf8');
  fs.writeFileSync(alignmentLocal, JSON.stringify(data.alignment ?? null, null, 2), 'utf8');

  if (!opts.skipR2) {
    uploadR2File(audioKey, audioLocal, 'audio/ogg; codecs=opus', 'public, max-age=31536000, immutable');
    uploadR2File(manifestKey, manifestLocal, 'application/json', 'public, max-age=31536000, immutable');
    uploadR2File(latestKey, latestLocal, 'application/json', 'public, max-age=300');
  }

  return {
    status: 'ok',
    bytes: audioBuf.length,
    durationMs: opusCheck.durationMs,
    segmentCount: segments.length,
    charCost: headerCost || job.charCount,
    inputChars: job.charCount,
    audioKey,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const helpers = await loadAppModules();
  opts.env = helpers.resolveNarrationEnvironment(opts.env);

  if (opts.copyToProd) {
    await copyArchiveEnvironment(opts, helpers);
    return;
  }

  const deadlineMs = Date.parse(opts.deadline);
  if (!Number.isFinite(deadlineMs)) {
    console.error(`Invalid --deadline timestamp: ${opts.deadline}`);
    process.exit(1);
  }

  const rows = fetchD1Guides(opts.localD1Json);
  console.log(`Loaded ${rows.length} rows from D1 artwork_guides.`);

  const playlistTitleSet = new Set();
  for (const pl of helpers.PLAYLISTS) {
    for (const item of pl.items) {
      playlistTitleSet.add(helpers.canonicalName(item.title));
    }
  }

  const voiceSettings = {
    stability: 0.55,
    similarity_boost: 0.75,
    style: 0.0,
    use_speaker_boost: true,
  };

  const titleFilters = opts.titles.map(t => t.toLowerCase());
  const jobs = [];
  const localeTotals = {};

  for (const row of rows) {
    const locale = parseLocaleFromCacheKey(row.cache_key);
    localeTotals[locale] = (localeTotals[locale] || 0) + 1;
    if (!opts.locales.includes(locale)) continue;

    const canonicalTitle = helpers.canonicalName(helpers.catalogueTitle(row.title));
    const canonicalArtist = row.artist ? helpers.canonicalName(row.artist) : '';
    if (
      titleFilters.length > 0 &&
      !titleFilters.some(
        f =>
          row.title.toLowerCase().includes(f) ||
          canonicalTitle.toLowerCase().includes(f),
      )
    ) {
      continue;
    }

    const parts = parseGuidePayload(row.payload, helpers.sanitizeGuideText);
    if (!parts || !parts.short) continue;

    const artworkId = helpers.resolveNarrationArtworkId(canonicalTitle, canonicalArtist);
    const voiceId = opts.voiceOverrides[locale] || opts.voiceId;
    const voiceConfigHash = helpers.computeVoiceConfigHash({
      provider: 'elevenlabs',
      modelId: opts.modelId,
      voiceId,
      outputFormat: opts.format,
      voiceSettings,
    });

    for (const mode of opts.modes) {
      if (!helpers.isExplanationMode(mode)) continue;
      const guideText = helpers.composeGuideModeText(parts, mode);
      if (!guideText) continue;
      const synthInput = helpers.buildNarrationSynthesisInput(guideText, locale);
      const charCount = synthInput.synthesisText.length;
      if (charCount === 0) continue;

      const contentHash = helpers.computeContentHash(guideText);
      const manifestKey = helpers.narrationManifestKey(
        opts.env,
        artworkId,
        locale,
        mode,
        contentHash,
        voiceConfigHash,
      );
      const audioKey = helpers.narrationAudioKey(
        opts.env,
        artworkId,
        locale,
        mode,
        contentHash,
        voiceConfigHash,
      );

      let alreadyCached =
        fs.existsSync(localFileForKey(audioKey)) &&
        fs.existsSync(localFileForKey(manifestKey));

      if (!alreadyCached && opts.checkRemoteR2) {
        alreadyCached = remoteR2Exists(manifestKey) && remoteR2Exists(audioKey);
      }

      jobs.push({
        title: row.title,
        artist: row.artist || '',
        canonicalTitle,
        canonicalArtist,
        artworkId,
        locale,
        mode,
        guideText,
        contentHash,
        voiceId,
        voiceSettings,
        voiceConfigHash,
        charCount,
        alreadyCached,
      });
    }
  }

  jobs.sort(
    (a, b) =>
      buildPriorityScore(a, opts, playlistTitleSet, helpers.canonicalName) -
      buildPriorityScore(b, opts, playlistTitleSet, helpers.canonicalName),
  );

  const pendingJobs = jobs.filter(j => !j.alreadyCached);
  const limitedJobs = opts.limit > 0 ? pendingJobs.slice(0, opts.limit) : pendingJobs;

  const summaryByLocaleMode = {};
  let totalInputChars = 0;
  for (const j of limitedJobs) {
    const k = `${j.locale}/${j.mode}`;
    if (!summaryByLocaleMode[k]) summaryByLocaleMode[k] = { count: 0, chars: 0 };
    summaryByLocaleMode[k].count += 1;
    summaryByLocaleMode[k].chars += j.charCount;
    totalInputChars += j.charCount;
  }

  console.log('D1 rows by locale:', JSON.stringify(localeTotals));
  console.log(
    `Total matching jobs: ${jobs.length} | Already cached: ${jobs.length - pendingJobs.length} | Pending: ${pendingJobs.length} | Selected: ${limitedJobs.length}`,
  );
  console.log('Selected breakdown:', JSON.stringify(summaryByLocaleMode, null, 2));
  console.log(`Estimated total input chars: ${totalInputChars}`);

  if (opts.dryRun) {
    console.log('\nFirst 15 priority jobs (dry-run):');
    for (const j of limitedJobs.slice(0, 15)) {
      console.log(
        `  - [${j.locale}/${j.mode}] ${j.canonicalTitle} (${j.artworkId}) | chars=${j.charCount} | hash=${j.contentHash}`,
      );
    }
    return;
  }

  const apiKey = loadElevenLabsKey();
  if (!apiKey) {
    console.error('ELEVENLABS_API_KEY is missing in env or .env.local.');
    process.exit(1);
  }

  const credit = await checkElevenLabsCredit(apiKey);
  if (credit.ok) {
    console.log('ElevenLabs subscription:', JSON.stringify(credit));
    if (credit.allowedToExtend) {
      console.error('ABORT: allowed_to_extend_character_limit is true (overage billing enabled). Disable overage first.');
      process.exit(1);
    }
    if (opts.maxChars === 0) {
      opts.maxChars = credit.remainingChars;
    }
  } else {
    console.warn(`Could not read /v1/user/subscription (status=${credit.status}).`);
    if (!opts.confirmBudget || opts.maxChars <= 0) {
      console.error(
        'ABORT: Pass both --confirm-budget and --max-chars=<N> when subscription credit cannot be verified via API.',
      );
      process.exit(1);
    }
  }

  let usedInputChars = 0;
  let reportedCharCost = 0;
  let completed = 0;
  let errors = 0;
  const report = [];

  for (let i = 0; i < limitedJobs.length; i += opts.concurrency) {
    if (Date.now() >= deadlineMs) {
      console.log(`Reached deadline (${opts.deadline}). Stopping cleanly.`);
      break;
    }

    const batch = [];
    for (let k = 0; k < opts.concurrency && i + k < limitedJobs.length; k++) {
      const job = limitedJobs[i + k];
      if (opts.maxChars > 0 && usedInputChars + job.charCount > opts.maxChars) {
        console.log(
          `Credit/char cap reached (${usedInputChars} + ${job.charCount} > --max-chars=${opts.maxChars}). Stopping cleanly.`,
        );
        i = limitedJobs.length;
        break;
      }
      usedInputChars += job.charCount;
      batch.push(job);
    }
    if (batch.length === 0) break;

    const results = await Promise.all(
      batch.map(async job => ({
        job,
        res: await synthesizeAndPersist(job, apiKey, opts, helpers),
      })),
    );

    let fatalStop = false;
    for (const { job, res } of results) {
      reportedCharCost += res.charCost || 0;
      if (res.status === 'ok') {
        completed++;
        console.log(
          `[OK ${completed}/${limitedJobs.length}] [${job.locale}/${job.mode}] ${job.canonicalTitle} | ${(res.durationMs / 1000).toFixed(1)}s | ${(res.bytes / 1024).toFixed(1)} KB | input=${res.inputChars} cost=${res.charCost}`,
        );
      } else {
        errors++;
        console.error(
          `[ERR] [${job.locale}/${job.mode}] ${job.canonicalTitle}: ${res.error || res.status}`,
        );
        if (res.fatal) fatalStop = true;
      }
      report.push({
        artworkId: job.artworkId,
        title: job.canonicalTitle,
        locale: job.locale,
        mode: job.mode,
        contentHash: job.contentHash,
        ...res,
      });
    }

    if (fatalStop) {
      console.error('Fatal quota/auth/rate error encountered. Stopping without retrying.');
      break;
    }
  }

  fs.mkdirSync(ARCHIVE_ROOT, { recursive: true });
  const reportPath = path.join(ARCHIVE_ROOT, `run-report-${Date.now()}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ completed, errors, usedInputChars, reportedCharCost, report }, null, 2),
    'utf8',
  );
  console.log(
    `Done. completed=${completed}, errors=${errors}, inputChars=${usedInputChars}, reportedCharCost=${reportedCharCost}. Report: ${reportPath}`,
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

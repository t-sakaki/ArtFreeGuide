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

import dns from 'node:dns';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';
import { getTtsAdapter, listTtsProviders, resolveJobTtsConfig } from './tts-adapters/registry.mjs';

// Avoid Node Happy Eyeballs / NAT64 IPv6 timeouts in WSL2 environments
dns.setDefaultResultOrder('ipv4first');
if (typeof net.setDefaultAutoSelectFamily === 'function') {
  net.setDefaultAutoSelectFamily(false);
}

const execFileAsync = promisify(execFile);

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
    provider: 'elevenlabs',
    providerOverrides: {},
    voiceId: '',
    voiceOverrides: {},
    modelId: '',
    modelOverrides: {},
    format: '',
    formatOverrides: {},
    voiceSettingsOverrides: {},
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
    filterVoices: [],
    filterModel: '',
    filterProvider: '',
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
    else if (raw.startsWith('--filter-voices=')) {
      opts.filterVoices = raw.slice('--filter-voices='.length).split(',').map(s => s.trim()).filter(Boolean);
    } else if (raw.startsWith('--filter-model=')) {
      opts.filterModel = raw.slice('--filter-model='.length).trim();
    } else if (raw.startsWith('--filter-provider=')) {
      opts.filterProvider = raw.slice('--filter-provider='.length).trim().toLowerCase();
    } else if (raw.startsWith('--locales=')) {
      opts.locales = raw.slice('--locales='.length).split(',').map(s => s.trim()).filter(Boolean);
    } else if (raw.startsWith('--modes=')) {
      opts.modes = raw.slice('--modes='.length).split(',').map(s => s.trim()).filter(Boolean);
    } else if (raw.startsWith('--provider=')) {
      opts.provider = raw.slice('--provider='.length).trim().toLowerCase();
    } else if (raw.startsWith('--provider-')) {
      const m = /^--provider-([a-z]{2})=(.+)$/.exec(raw);
      if (m) opts.providerOverrides[m[1]] = m[2].trim().toLowerCase();
    } else if (raw.startsWith('--voice-id=')) {
      opts.voiceId = raw.slice('--voice-id='.length).trim();
    } else if (raw.startsWith('--voice-settings=')) {
      try {
        opts.voiceSettingsOverrides = JSON.parse(raw.slice('--voice-settings='.length));
      } catch (err) {
        console.error(`Invalid JSON for --voice-settings: ${err?.message || err}`);
        process.exit(1);
      }
    } else if (raw.startsWith('--voice-')) {
      const m = /^--voice-([a-z]{2})=(.+)$/.exec(raw);
      if (m) opts.voiceOverrides[m[1]] = m[2].trim();
    } else if (raw.startsWith('--model-id=')) {
      opts.modelId = raw.slice('--model-id='.length).trim();
    } else if (raw.startsWith('--model-')) {
      const m = /^--model-([a-z]{2})=(.+)$/.exec(raw);
      if (m) opts.modelOverrides[m[1]] = m[2].trim();
    } else if (raw.startsWith('--format=')) {
      opts.format = raw.slice('--format='.length).trim();
    } else if (raw.startsWith('--format-')) {
      const m = /^--format-([a-z]{2})=(.+)$/.exec(raw);
      if (m) opts.formatOverrides[m[1]] = m[2].trim();
    } else if (raw.startsWith('--max-chars=')) {
      opts.maxChars = Math.max(0, Number.parseInt(raw.slice('--max-chars='.length), 10) || 0);
    } else if (raw.startsWith('--deadline=')) {
      opts.deadline = raw.slice('--deadline='.length).trim();
    } else if (raw.startsWith('--limit=')) {
      opts.limit = Math.max(0, Number.parseInt(raw.slice('--limit='.length), 10) || 0);
    } else if (raw.startsWith('--titles=')) {
      opts.titles = raw.slice('--titles='.length).split(',').map(s => s.trim()).filter(Boolean);
    } else if (raw.startsWith('--concurrency=')) {
      opts.concurrency = Math.max(1, Math.min(4, Number.parseInt(raw.slice('--concurrency='.length), 10) || 1));
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
  --dry-run                Inspect D1 guides and estimate chars/jobs without calling TTS APIs
  --env=staging|production Target R2 environment prefix (default: staging)
  --locales=ja,en          Comma-separated locales in priority order (default: ja,en)
  --modes=standard,short,deep Comma-separated modes (default: standard,short,deep)
  --provider=<name>        TTS adapter (${listTtsProviders().join('|')}, default: elevenlabs)
  --provider-<loc>=<name>  Per-locale TTS adapter override (e.g. --provider-ja=azure --provider-en=elevenlabs)
  --voice-id=<id>          Default voice_id (or comma-separated pool for per-artwork rotation)
  --voice-<loc>=<id>       Per-locale voice_id or pool (e.g. --voice-ja=id1,id2)
  --model-id=<id>          Model override for the active provider
  --model-<loc>=<id>       Per-locale model override
  --format=<fmt>           Output format override for the active provider
  --voice-settings=<json>  JSON object merged into provider default voiceSettings
  --max-chars=<N>          Hard cap on cumulative input characters synthesized in this run
  --deadline=<ISO>         Hard UTC stop timestamp (default: ${DEFAULT_DEADLINE})
  --limit=<N>              Max number of synthesis jobs to run
  --titles=a,b             Filter to matching titles
  --concurrency=1..4       Parallelism (default: 1; capped at 2 for live synthesis)
  --check-remote-r2        Also check remote R2 for existing latest.json when local archive misses
  --skip-r2                Keep generated files locally without uploading to R2
  --confirm-budget         Required for live ElevenLabs synthesis if subscription lacks user_read
  --copy-to-prod           Upload local/staging archive artifacts under production prefix (no TTS calls)
  --filter-voices=id1,id2  Only copy artifacts/pointers whose manifest.voiceId is in this list
  --filter-model=<id>      Only copy artifacts/pointers whose manifest.modelId matches
  --filter-provider=<name> Only copy artifacts/pointers whose manifest.provider matches
`);
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

async function uploadR2FileAsync(key, localPath, contentType, cacheControl) {
  await execFileAsync(
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
    { cwd: REPO_ROOT },
  );
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

  const hasFilters =
    opts.filterVoices.length > 0 || Boolean(opts.filterModel) || Boolean(opts.filterProvider);

  function matchesManifestFilter(manifestPath) {
    if (!hasFilters) return true;
    if (!fs.existsSync(manifestPath)) return false;
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (opts.filterVoices.length > 0 && !opts.filterVoices.includes(m.voiceId)) return false;
      if (opts.filterModel && m.modelId !== opts.filterModel) return false;
      if (opts.filterProvider && String(m.provider || '').toLowerCase() !== opts.filterProvider) return false;
      return true;
    } catch {
      return false;
    }
  }

  const artifacts = [];
  const pointers = [];
  let skipped = 0;

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!['audio.opus', 'manifest.json', 'latest.json'].includes(entry.name)) continue;

      if (hasFilters) {
        if (entry.name === 'latest.json') {
          let pointedHash = '';
          try {
            pointedHash = JSON.parse(fs.readFileSync(full, 'utf8')).voiceConfigHash || '';
          } catch {
            pointedHash = '';
          }
          const manifestPath = pointedHash ? path.join(path.dirname(full), pointedHash, 'manifest.json') : '';
          if (!matchesManifestFilter(manifestPath)) {
            skipped++;
            continue;
          }
        } else {
          const manifestPath = path.join(path.dirname(full), 'manifest.json');
          if (!matchesManifestFilter(manifestPath)) {
            skipped++;
            continue;
          }
        }
      }

      const rel = path.relative(path.join(ARCHIVE_ROOT, 'narration', fromEnv), full);
      const destKey = `narration/${toEnv}/${rel.split(path.sep).join('/')}`;
      const destLocal = localFileForKey(destKey);
      fs.mkdirSync(path.dirname(destLocal), { recursive: true });
      fs.copyFileSync(full, destLocal);

      const item = {
        destKey,
        destLocal,
        ct: entry.name === 'audio.opus' ? 'audio/ogg; codecs=opus' : 'application/json',
        cc: entry.name === 'latest.json' ? 'public, max-age=300' : 'public, max-age=31536000, immutable',
      };
      if (entry.name === 'latest.json') pointers.push(item);
      else artifacts.push(item);
    }
  }

  walk(fromRoot);

  if (!opts.skipR2) {
    const uploadBatch = async items => {
      let idx = 0;
      const workers = Array.from({ length: Math.min(opts.concurrency, items.length || 1) }, async () => {
        while (idx < items.length) {
          const item = items[idx++];
          await uploadR2FileAsync(item.destKey, item.destLocal, item.ct, item.cc);
        }
      });
      await Promise.all(workers);
    };
    await uploadBatch(artifacts);
    await uploadBatch(pointers);
  }

  const copied = artifacts.length + pointers.length;
  console.log(
    `Copied ${copied} narration objects (${artifacts.length} artifacts, ${pointers.length} pointers, ${skipped} filtered out) from ${fromEnv} -> ${toEnv} (skipR2=${opts.skipR2}).`,
  );
}

async function synthesizeAndPersist(job, opts, helpers) {
  const {
    narrationAudioKey,
    narrationManifestKey,
    narrationLatestKey,
  } = helpers;

  const adapter = getTtsAdapter(job.provider);
  const synth = await adapter.synthesize(job, { helpers, repoRoot: REPO_ROOT });
  if (synth.status !== 'ok') {
    return synth;
  }

  const { audioBuf, opusCheck, segments, alignment, charCost, inputChars } = synth;
  const manifest = {
    version: 1,
    artworkId: job.artworkId,
    canonicalTitle: job.canonicalTitle,
    canonicalArtist: job.canonicalArtist,
    locale: job.locale,
    mode: job.mode,
    contentHash: job.contentHash,
    voiceConfigHash: job.voiceConfigHash,
    provider: job.provider,
    modelId: job.modelId,
    voiceId: job.voiceId,
    outputFormat: job.outputFormat,
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
  if (alignment) {
    fs.writeFileSync(alignmentLocal, JSON.stringify(alignment, null, 2), 'utf8');
  }

  if (!opts.skipR2) {
    try {
      await uploadR2FileAsync(audioKey, audioLocal, 'audio/ogg; codecs=opus', 'public, max-age=31536000, immutable');
      await uploadR2FileAsync(manifestKey, manifestLocal, 'application/json', 'public, max-age=31536000, immutable');
      await uploadR2FileAsync(latestKey, latestLocal, 'application/json', 'public, max-age=300');
    } catch (err) {
      return {
        status: 'error',
        httpStatus: 0,
        fatal: false,
        error: `R2 upload failed (saved locally): ${err?.message || err}`,
        charCost: charCost || job.charCount,
        inputChars: inputChars || job.charCount,
        audioKey,
      };
    }
  }

  return {
    status: 'ok',
    bytes: audioBuf.length,
    durationMs: opusCheck.durationMs,
    segmentCount: segments.length,
    charCost: charCost || job.charCount,
    inputChars: inputChars || job.charCount,
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
    const ttsConfig = resolveJobTtsConfig(opts, locale, artworkId);
    const voiceConfigHash = helpers.computeVoiceConfigHash({
      provider: ttsConfig.provider,
      modelId: ttsConfig.modelId,
      voiceId: ttsConfig.voiceId,
      outputFormat: ttsConfig.outputFormat,
      voiceSettings: ttsConfig.voiceSettings,
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
        provider: ttsConfig.provider,
        modelId: ttsConfig.modelId,
        voiceId: ttsConfig.voiceId,
        outputFormat: ttsConfig.outputFormat,
        voiceSettings: ttsConfig.voiceSettings,
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
    const k = `${j.locale}/${j.mode} (${j.provider}:${j.voiceId})`;
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
        `  - [${j.locale}/${j.mode}] (${j.provider}/${j.modelId}/${j.voiceId}) ${j.canonicalTitle} (${j.artworkId}) | chars=${j.charCount} | hash=${j.contentHash}`,
      );
    }
    return;
  }

  const activeProviders = [...new Set(limitedJobs.map(j => j.provider))];
  for (const providerName of activeProviders) {
    const adapter = getTtsAdapter(providerName);
    const preflight = await adapter.checkPreflight({ repoRoot: REPO_ROOT });
    if (preflight.missingKey) {
      console.error(preflight.message);
      process.exit(1);
    }
    if (providerName === 'elevenlabs') {
      if (preflight.ok) {
        console.log('ElevenLabs subscription:', JSON.stringify({ ...preflight, apiKey: undefined }));
        if (preflight.allowedToExtend) {
          console.error('ABORT: allowed_to_extend_character_limit is true (overage billing enabled). Disable overage first.');
          process.exit(1);
        }
        if (opts.maxChars === 0) {
          opts.maxChars = preflight.remainingChars;
        }
      } else {
        console.warn(`Could not read /v1/user/subscription (status=${preflight.status}).`);
        if (!opts.confirmBudget || opts.maxChars <= 0) {
          console.error(
            'ABORT: Pass both --confirm-budget and --max-chars=<N> when subscription credit cannot be verified via API.',
          );
          process.exit(1);
        }
      }
    } else if (!preflight.ok) {
      console.error(`Preflight failed for ${providerName}: ${preflight.message}`);
      process.exit(1);
    } else {
      console.log(`Provider ${providerName} preflight:`, JSON.stringify(preflight));
    }
  }

  const synthConcurrency = Math.min(2, Math.max(1, opts.concurrency));
  let usedInputChars = 0;
  let reportedCharCost = 0;
  let completed = 0;
  let errors = 0;
  const report = [];

  for (let i = 0; i < limitedJobs.length; i += synthConcurrency) {
    if (Date.now() >= deadlineMs) {
      console.log(`Reached deadline (${opts.deadline}). Stopping cleanly.`);
      break;
    }

    const batch = [];
    let provisionalChars = 0;
    for (let k = 0; k < synthConcurrency && i + k < limitedJobs.length; k++) {
      const job = limitedJobs[i + k];
      if (opts.maxChars > 0 && usedInputChars + provisionalChars + job.charCount > opts.maxChars) {
        console.log(
          `Credit/char cap reached (${usedInputChars + provisionalChars} + ${job.charCount} > --max-chars=${opts.maxChars}). Stopping cleanly.`,
        );
        i = limitedJobs.length;
        break;
      }
      provisionalChars += job.charCount;
      batch.push(job);
    }
    if (batch.length === 0) break;

    const results = await Promise.all(
      batch.map(async job => ({
        job,
        res: await synthesizeAndPersist(job, opts, helpers),
      })),
    );

    let fatalStop = false;
    for (const { job, res } of results) {
      reportedCharCost += res.charCost || 0;
      if (res.status === 'ok' || (res.httpStatus && res.httpStatus > 0) || (res.charCost && res.charCost > 0)) {
        usedInputChars += job.charCount;
      }
      if (res.status === 'ok') {
        completed++;
        console.log(
          `[OK ${completed}/${limitedJobs.length}] [${job.locale}/${job.mode}] (${job.provider}) ${job.canonicalTitle} | ${(res.durationMs / 1000).toFixed(1)}s | ${(res.bytes / 1024).toFixed(1)} KB | input=${res.inputChars} cost=${res.charCost}`,
        );
      } else {
        errors++;
        console.error(
          `[ERR] [${job.locale}/${job.mode}] (${job.provider}) ${job.canonicalTitle}: ${res.error || res.status}`,
        );
        if (res.fatal) fatalStop = true;
      }
      report.push({
        artworkId: job.artworkId,
        title: job.canonicalTitle,
        locale: job.locale,
        mode: job.mode,
        provider: job.provider,
        modelId: job.modelId,
        voiceId: job.voiceId,
        contentHash: job.contentHash,
        status: res.status,
        bytes: res.bytes,
        durationMs: res.durationMs,
        segmentCount: res.segmentCount,
        charCost: res.charCost,
        inputChars: res.inputChars,
        audioKey: res.audioKey,
        httpStatus: res.httpStatus,
        fatal: res.fatal,
        error: res.error,
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

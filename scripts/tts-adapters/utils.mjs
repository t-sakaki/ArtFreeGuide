import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export function loadEnvVar(name, repoRoot = process.cwd()) {
  if (process.env[name]) return process.env[name].trim();
  const envPath = path.resolve(repoRoot, '.env.local');
  if (!fs.existsSync(envPath)) return '';
  const content = fs.readFileSync(envPath, 'utf8');
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`^${escaped}=(.+)$`, 'm'));
  if (!match) return '';
  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

export function escapeXml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function transcodeToOggOpus(
  inputBuf,
  { inputArgs = [], inputExt = 'bin', bitrate = '64k', sampleRate = 48000 } = {},
) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'afg-tts-'));
  const inFile = path.join(workDir, `input.${inputExt}`);
  const outFile = path.join(workDir, 'output.opus');
  try {
    fs.writeFileSync(inFile, inputBuf);
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        ...inputArgs,
        '-i',
        inFile,
        '-c:a',
        'libopus',
        '-b:a',
        bitrate,
        '-vbr',
        'on',
        '-ar',
        String(sampleRate),
        '-ac',
        '1',
        outFile,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return fs.readFileSync(outFile);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

export function concatOggOpusBuffers(
  buffers,
  { gapMs = 0, bitrate = '64k', sampleRate = 48000 } = {},
) {
  if (buffers.length === 0) {
    throw new Error('concatOggOpusBuffers requires at least one audio buffer.');
  }
  if (buffers.length === 1 && gapMs <= 0) {
    return buffers[0];
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'afg-concat-'));
  try {
    const entries = [];
    let gapFile = '';
    if (gapMs > 0) {
      gapFile = path.join(workDir, 'gap.opus');
      execFileSync(
        'ffmpeg',
        [
          '-y',
          '-hide_banner',
          '-loglevel',
          'error',
          '-f',
          'lavfi',
          '-i',
          `anullsrc=r=${sampleRate}:cl=mono`,
          '-t',
          (gapMs / 1000).toFixed(3),
          '-c:a',
          'libopus',
          '-b:a',
          bitrate,
          '-ar',
          String(sampleRate),
          '-ac',
          '1',
          gapFile,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
    }

    for (let i = 0; i < buffers.length; i++) {
      const segFile = path.join(workDir, `seg-${i}.opus`);
      fs.writeFileSync(segFile, buffers[i]);
      entries.push(`file '${segFile.replace(/'/g, "'\\''")}'`);
      if (gapFile && i < buffers.length - 1) {
        entries.push(`file '${gapFile.replace(/'/g, "'\\''")}'`);
      }
    }

    const listFile = path.join(workDir, 'list.txt');
    const outFile = path.join(workDir, 'merged.opus');
    fs.writeFileSync(listFile, entries.join('\n'), 'utf8');

    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listFile,
        '-c:a',
        'libopus',
        '-b:a',
        bitrate,
        '-vbr',
        'on',
        '-ar',
        String(sampleRate),
        '-ac',
        '1',
        outFile,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    return fs.readFileSync(outFile);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

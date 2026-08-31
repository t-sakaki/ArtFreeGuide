import https from 'https';

// Probe GMI Cloud for the correct MiniMax Music model id + payload shape.
// Usage: GMI_API_KEY=... node scripts/_gmi_music_probe.mjs
// Prints the raw submit response for each candidate so we can see which the
// requestqueue accepts (HTTP 200 + a request_id) vs rejects (4xx + message).

const KEY = process.env.GMI_API_KEY || process.env.GMI_CLOUD_API_KEY;
if (!KEY) {
  console.error('set GMI_API_KEY');
  process.exit(1);
}
const BASE = 'https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey';

const req = (method, path, body) =>
  new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = https.request(
      BASE + path,
      {
        method,
        headers: {
          Authorization: 'Bearer ' + KEY,
          'Content-Type': 'application/json',
        },
      },
      x => {
        let b = '';
        x.on('data', c => (b += c));
        x.on('end', () => resolve({ status: x.statusCode, body: b }));
      },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });

const LYRICS = `[Verse]\n黄金の花が夏を見上げる\n風が光をゆらす\n[Chorus]\nひまわり ひまわり\nどこまでも太陽へ`;
const STYLE = 'warm cinematic art-song, piano and strings, mid tempo, gentle female vocal';

// Candidate (model, payload) combinations to try.
const candidates = [
  ['minimax-music-3.0', { lyrics: LYRICS, prompt: STYLE, format: 'mp3', sample_rate: 44100, bitrate: 256000 }],
  ['minimax-music-1.5', { lyrics: LYRICS, prompt: STYLE, format: 'mp3' }],
  ['minimax-music-01', { lyrics: LYRICS, prompt: STYLE, format: 'mp3' }],
  ['music-1.5', { lyrics: LYRICS, prompt: STYLE, format: 'mp3' }],
  ['minimax/music-1.5', { lyrics: LYRICS, prompt: STYLE, format: 'mp3' }],
  ['minimax-music-3.0', { lyrics: LYRICS, style: STYLE, audio_setting: { format: 'mp3', sample_rate: 44100 } }],
];

(async () => {
  // What does the queue list as available? (may or may not be supported)
  for (const p of ['/models', '/model', '']) {
    try {
      const r = await req('GET', p || '/requests?limit=1');
      console.log(`GET ${p || '/requests'} -> ${r.status}: ${r.body.slice(0, 300)}`);
    } catch (e) {
      console.log(`GET ${p} error ${e.message}`);
    }
  }
  console.log('\n--- submit candidates ---');
  for (const [model, payload] of candidates) {
    try {
      const r = await req('POST', '/requests', { model, payload });
      console.log(`\n[${model}] ${JSON.stringify(payload).slice(0, 90)}`);
      console.log(`  HTTP ${r.status}: ${r.body.slice(0, 400)}`);
    } catch (e) {
      console.log(`\n[${model}] error ${e.message}`);
    }
  }
})();

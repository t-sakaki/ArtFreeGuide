import https from 'https';

// Does GMI keep a music job running after the client disconnects?
// Submit, abort the connection after 4s, then list /requests to see whether the
// job is there (and with what status). If yes, we can drive the whole flow with
// short polling requests instead of a multi-minute blocking call.
// Usage: GMI_API_KEY=... node scripts/_gmi_async_probe.mjs

const KEY = process.env.GMI_API_KEY || process.env.GMI_CLOUD_API_KEY;
if (!KEY) { console.error('set GMI_API_KEY'); process.exit(1); }
const BASE = 'https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey';

const get = path =>
  new Promise((resolve, reject) => {
    https.get(BASE + path, { headers: { Authorization: 'Bearer ' + KEY } }, x => {
      let b = ''; x.on('data', c => (b += c)); x.on('end', () => resolve({ status: x.statusCode, body: b }));
    }).on('error', reject);
  });

const LYRICS = `[Verse]\n沈む夕陽に 名前をつけた\n[Chorus]\nまた明日 また明日`;
const STYLE = 'warm cinematic art-song, piano and strings, mid tempo, gentle female vocal';

async function submitAbort(ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  const started = Date.now();
  try {
    const res = await fetch(BASE + '/requests', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'minimax-music-3.0',
        payload: { lyrics: LYRICS, prompt: STYLE, format: 'mp3', sample_rate: 44100, bitrate: 256000 },
      }),
      signal: ctl.signal,
    });
    clearTimeout(t);
    const body = await res.text();
    console.log(`submit completed in ${Date.now() - started}ms: HTTP ${res.status} ${body.slice(0, 200)}`);
  } catch (e) {
    console.log(`submit aborted after ${Date.now() - started}ms (${e.name})`);
  }
}

(async () => {
  const before = await get('/requests?limit=5');
  const beforeIds = new Set((JSON.parse(before.body).requests || []).map(r => r.request_id));
  console.log(`existing requests: ${beforeIds.size}`);

  await submitAbort(4000);

  for (const wait of [2000, 10000, 20000]) {
    await new Promise(r => setTimeout(r, wait));
    const now = await get('/requests?limit=5');
    const rows = JSON.parse(now.body).requests || [];
    const fresh = rows.filter(r => !beforeIds.has(r.request_id));
    console.log(`+${wait}ms: ${fresh.length} new request(s): ${fresh.map(r => `${r.request_id.slice(0, 8)}=${r.status}`).join(', ') || '(none)'}`);
  }
})();

import https from 'https';

const KEY = process.env.GMI_API_KEY;
const post = (p) => new Promise((res, rej) => {
  const d = JSON.stringify(p);
  const r = https.request('https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests',
    { method: 'POST', headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' } },
    (x) => { let b = ''; x.on('data', c => b += c); x.on('end', () => res(JSON.parse(b))); });
  r.on('error', rej); r.write(d); r.end();
});
const get = (id) => new Promise((res, rej) => {
  https.get('https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests/' + id,
    { headers: { 'Authorization': 'Bearer ' + KEY } },
    (x) => { let b = ''; x.on('data', c => b += c); x.on('end', () => res(JSON.parse(b))); }).on('error', rej);
});

(async () => {
  const r = await post({ model: 'minimax-tts-speech-2.8-hd', payload: { text: 'こんにちは、これはテストです。美術館の音声ガイドをお届けします。', format: 'mp3', language_boost: 'ja' } });
  console.log('SUBMIT:', JSON.stringify(r).slice(0, 300));
  const rid = r.request_id || r.id;
  console.log('RID:', rid);
  for (let i = 0; i < 20; i++) {
    await new Promise(s => setTimeout(s, 15000));
    const st = await get(rid);
    const s = st.status;
    console.log(`poll ${i}: ${s}`);
    if (s === 'success') {
      const o = st.outcome || {};
      console.log('URL:', o.audio_url || (o.media_urls || [{}])[0].url);
      break;
    }
    if (s === 'failed' || s === 'error') { console.log('FAIL:', JSON.stringify(st).slice(0, 400)); break; }
  }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });

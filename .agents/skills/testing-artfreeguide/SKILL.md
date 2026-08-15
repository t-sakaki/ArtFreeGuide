---
name: testing-artfreeguide
description: How to run and end-to-end test the ArtFreeGuide Next.js app locally (Cloudflare Workers AI LLM, dev server, Japanese input, hotspot/見どころ UI, Web Speech API limits on headless VMs).
---

# Testing ArtFreeGuide locally

## Run the app
- `npm ci` then `npm run dev` (Next.js 16 + Turbopack, port 3000, ready in <1s).
- **Open `http://localhost:3000`, never `http://127.0.0.1:3000`.** Dev chunks are served from
  `localhost`, so on `127.0.0.1` the page renders but never hydrates and every click is a no-op.
- The app writes the current work back into the URL, so to reach the pristine landing state clear
  history/localStorage and open a URL with no `artwork` param (a dummy query such as `/?fresh=1` works).
- Budget 60-90s per guide generation before asserting on post-generation UI.
- The LLM is **Cloudflare Workers AI**, not Gemini. Despite that, plain `npm run dev` CAN generate
  real guides: `next.config.js` calls `initOpenNextCloudflareForDev()` in development, which wires up
  the Cloudflare bindings; the `AI` binding always resolves against remote Cloudflare resources
  (log line: `AI bindings always access remote resources...`). A valid `CLOUDFLARE_API_TOKEN` in the
  environment is required. So there is usually no need for `wrangler dev` / `npm run preview`.
- Set `LLM_PROVIDER=workers-ai` in `.env.local` (gitignored) if an old `LLM_PROVIDER=gemini` is present.
  The Gemini key that used to live in git history is revoked — Google returns
  `403 ... Your API key was reported as leaked.` Do not waste time on it.
- **Known blocker: the Cloudflare account's free Workers AI allocation (10,000 neurons/day) runs out
  quickly.** When it does, `/api/chat` and `/api/suggest` return 500 after ~10s of retries and the UI
  shows 「現在、音声ガイドサービスをご利用いただけません。」. Confirm the cause in the dev-server log
  (`4006: you have used up your daily free allocation of 10,000 neurons`) before blaming the PR.
  Workarounds: revisit an already-cached guide via the 📜履歴 sidebar, test against production, or ask
  for a paid-plan token. Everything that does not need the LLM (images, hotspots, Supabase
  recommendations) still works while the quota is exhausted.
- `GUIDE_STORE=d1`; the D1 cache read/write failures under `next dev` are caught and generation continues.
- Production deployment: https://art-free-guide.taira-sakakibara.workers.dev (useful as a "before"
  build when comparing a fix branch against `main`).
- **Cached-guide testing without the LLM quota:** `next dev` has no D1 binding, so every guide is
  regenerated (40-90s, and it fails outright once the neuron quota is gone). Use the OpenNext preview
  with remote bindings instead — it returns D1-cached guides in ~1s and `/api/ask` in ~15s:
  ```bash
  export PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH"   # wrangler needs Node >= 22
  npx opennextjs-cloudflare preview -- --port 8788 --remote
  ```
  Then open `http://localhost:8788/?fresh=1`.
- Smoke-test the API without the UI (note the payload shape is `messages`, not `artwork`):
  ```bash
  curl -s -X POST localhost:3000/api/chat -H 'Content-Type: application/json' \
    -d '{"messages":[{"role":"user","content":"作品名: ひまわり / 作者: ゴッホ"}]}'
  ```
  A guide generation takes ~15-40s. For a curated artwork also pass `title`/`artist` at the top level:
  `{"title":"富嶽三十六景 神奈川沖浪裏","artist":"葛飾北斎","messages":[...]}`.
  In the UI, the fastest path is the landing page one-tap cards (睡蓮 / 星月夜 / モナ・リザ /
  真珠の耳飾りの少女 / 叫び / 富嶽三十六景 神奈川沖浪裏) — these are exactly the 6 curated-hotspot works.

## Devin Secrets Needed
- `CLOUDFLARE_API_TOKEN` — needed for the remote Workers AI binding under `next dev`.
  Without it `/api/chat` cannot generate a guide.
- `GEMINI_API_KEY` — only if someone re-enables `LLM_PROVIDER=gemini`; the historical key is revoked.

## Typing Japanese into the UI
`computer.type` / `xdotool type` with Japanese text is unreliable and often lands late or duplicated.
Prefer either:
- The artwork autocomplete: type a short kana string, wait, then click a 「もしかして…」 suggestion (fills the field and generates), or
- Deep links with percent-encoded params, which is also the supported feature path:
  `localhost:3000/?artwork=%E3%81%B2%E3%81%BE%E3%82%8F%E3%82%8A&mode=deep&speed=2.0`
  (`artwork`, `artist`, `mode` = short|standard|deep, `speed` ∈ 1.0/1.2/1.5/1.7/2.0/2.5).

## Web Speech API on a headless VM
- `speechSynthesis.getVoices()` returns 0 — there is no TTS engine. Every utterance fires
  `onerror` with `error: 'synthesis-failed'` almost instantly, so the app races through all
  sentences and the active-sentence highlight is NOT visually observable and no audio is audible.
- Installing `espeak-ng` + `speech-dispatcher` and starting `pulseaudio` did NOT make voices appear
  (`spd-say` hangs, no audio device). Assume audible TTS cannot be verified on these VMs.
- Verify speech functionally via the DevTools console instead. Working playback logs:
  `[AUDIO] Button Clicked` → `[AUDIO] Attempting to speak sentence #0` → `#1` → `#2`.
  If speech init is broken, only `[AUDIO] Button Clicked` appears (handlePlayPause early-returns
  on `!speechSupported`). This is the discriminating signal.
- `browser_console` only returns logs since the previous call — read it immediately after the action.
- **Best way to prove speech actually happens: wrap `speechSynthesis.speak` before opening an artwork**
  and render a visible overlay so the count shows up in the recording. Ignore empty utterances — the
  app speaks `new SpeechSynthesisUtterance('')` as an audio-unlock dummy, so only count
  `u.text.trim().length > 0`:
  ```js
  (() => { const orig = speechSynthesis.speak.bind(speechSynthesis); window.__spoken = [];
    const box = document.createElement('div'); box.style.cssText='position:fixed;z-index:99999;top:8px;left:8px;max-width:380px;background:#000e;color:#0f8;font:13px monospace;padding:10px;border:2px solid #0f8;white-space:pre-wrap';
    const render=()=>{box.textContent='[計測] speak(本文) 呼出: '+window.__spoken.length+' 件\n'+window.__spoken.map((t,i)=>`${i+1}. [${t.length}字] ${t.slice(0,24)}`).join('\n');};
    speechSynthesis.speak = u => { if ((u.text||'').trim()) { window.__spoken.push(u.text); render(); } return orig(u); };
    window.__resetSpoken=()=>{window.__spoken=[];render();};
    window.__dupCount=()=>window.__spoken.filter((t,i)=>i>0&&t===window.__spoken[i-1]).length;
    render(); document.body.appendChild(box); })();
  ```
  The hook survives SPA navigation (clicking cards); a full page load removes it — re-inject.
- Because every utterance fails instantly, a whole guide is "spoken" in <1s, so you cannot click
  ⏩/⏪ *while* playing. Instead drive the index from the stopped state (⏩ n times, then press play)
  and assert which sentence the speak() log starts at.
- Autoplay regression to watch for: the bottom button can show the pause icon (looks like playing)
  while zero non-empty utterances were ever queued — the speech-trigger effect in `src/app/page.tsx`
  must depend on `speakableSegments`, since autoplay sets `isPlaying` one render before the segments
  exist. Never judge playback by the icon alone.

## Useful UI landmarks
- There is one 「さがす」 hub (`renderBrowseHub`) shared by the landing page and the drawer opened from
  the header 「🔍 さがす」 button: ツアー中バッジ / テーマで巡るツアー / 1作品だけ聴く / 名前で探す / 閲覧履歴.
  Any choice made inside the drawer closes it via the `onPick` callback.
- Playback has a single control: the circular button in the bottom bar. Before the first playback a
  「🎧 ここから再生」 bubble points at it (the old large 「🎧 音声ガイドを再生する」 button is gone).
- Bottom bar: ⚡ speed popover (leftmost), ⏮️前作品, ⏪1文戻る, play/pause circle, ⏩1文進む.
- Speed selection writes `art_free_guide_playback_speed` to localStorage and syncs `?speed=`.
- 🎙️「感想を声で伝える」 only renders when a `SpeechRecognition` instance exists (Chrome).
- 📜履歴 sidebar (top right) lists generated artworks; clicking an entry reloads that guide (fast way to
  revisit an already-generated work without paying the LLM latency again).

## Recommendations / taste shelf (ForYouShelf, Supabase pgvector)
- Anonymous user id lives in localStorage under `art_free_guide_user_id` (`src/lib/user.ts`);
  clear localStorage to simulate a first visit (no taste vector ⇒ the 「✨ あなたのために」 shelf is
  correctly absent).
- The shelf only renders when `items.length > 0 && basis !== 'none'`. Headings: `artwork` ⇒
  「🎨 この作品に近い」, `taste`/`blend` ⇒ 「✨ あなたのために」.
- Building a taste vector normally requires finishing narration, which is impossible on a headless VM
  (TTS fails instantly, listened seconds ≈ 0, so `/api/history` never records a completed listen).
  Accepted workaround (ask first): call the API once from the DevTools console —
  ```js
  fetch('/api/history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    userId: localStorage.getItem('art_free_guide_user_id'), title:'星月夜',
    artist:'フィンセント・ファン・ゴッホ', depth:'standard', listenedSeconds:120, completed:true})})
  ```
  then reload; the shelf switches to 「✨ あなたのために」 with 「n作品を聴取」 and `#タグ` chips.
- Supabase env vars in `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`) are live, so recommendations work even when Workers AI is out of quota.
  Quick smoke test: `curl -s -X POST localhost:3000/api/recommendations -H 'Content-Type: application/json' -d '{"userId":"<uuid>"}'`
  (taste-only mode) and `GET /api/profile?userId=<uuid>`.
- Mobile-width checks: `xdotool windowsize` is unreliable while Chrome is maximized — use DevTools
  device emulation (`Ctrl+Shift+M`) and set the width to 430 in the device toolbar.

## Testing against production (fastest full-feature path)
- https://art-free-guide.taira-sakakibara.workers.dev has D1-cached guides, so a curated artwork opens
  in 1-3s (vs 40-90s locally). For demo/README-style verification prefer production over `next dev`.
- The header 「ArtFreeGuide」 is a button (`returnToHub`): it clears the guide/image/recommendations,
  stops playback, clears the 作品名/作者名 inputs + drafts and strips `artwork/artist/mode/tour/spot`
  from the URL while keeping `lang`/`speed`. Handy to reset between artworks without a reload.
- The app restores the previous artwork from localStorage on load, so a bare production URL may open a
  guide instead of the entrance hall — click the header banner to get the hub.
- Language switch: hamburger (top-right) → flag row (🇯🇵/🇬🇧/🇫🇷/🇪🇸/🇨🇳). If the target-locale guide is
  pre-warmed it appears in a few seconds; otherwise expect a full ~60s regeneration.
- Page scrolling is fought by the auto-scroll of the sentence player: **pause playback first**, then
  scroll with the cursor over the left margin (x≈150) to reach 「💡 次におすすめの作品」 / 「🎨 この作品に近い」.
- Full-resolution screenshots for README/PR evidence: `import -window <chrome_window_id> out.png`
  (get the id from `wmctrl -l -G`/`xdotool search`) — the computer-tool screenshot is downscaled.
- Recommendation thumbnails: 「💡 次におすすめの作品」 images are resolved per title from Wikimedia at
  runtime. Non-canonical Japanese titles invented by the LLM (e.g. 「レースの少女」 instead of
  「レースを編む女」) never resolve and stay a 🖼️ placeholder — this is a data/title problem, not a
  layout bug. The pgvector shelf uses catalogue rows and always has images.

## Hotspots (見どころ) feature
- Data lives in `src/lib/hotspots.ts` (6 works × 4 hotspots, x/y in 0–1, per-hotspot `zoom`).
  Read the x/y there first, then judge alignment against a full-resolution `zoom` screenshot of the
  image rect: expected pixel = rect_x + x*rect_w, rect_y + y*rect_h.
- Markers are `<button aria-label="<label>">` inside the stage — count/locate them from the DOM rather
  than by eye; they are low-contrast and easy to miss on busy paintings, especially in fullscreen.
- Button label differs: curated works show 「🔍 見どころを拡大」, others 「🔍 拡大」 with the message
  「この作品にはまだ見どころの登録がありません。」 — a quick way to assert curated vs non-curated.
- Known rough edge: hotspots with a high `zoom` near an image corner (e.g. 神奈川沖浪裏 の「題箋と落款」,
  zoom 3.2, x0.07/y0.11) push the image out of the frame and leave a black gap; worth re-checking.
- ken-burns (`.animate-ken-burns`) only applies while `isPlaying` and no hotspot is active. Because TTS
  fails instantly on headless VMs, `isPlaying` never persists, so ken-burns is effectively untestable
  there — say so rather than claiming a pass.

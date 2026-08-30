import urllib.request, json, time, os, sys

KEY = os.environ["GMI_API_KEY"]
BASE = "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey"


def post(payload):
    req = urllib.request.Request(
        f"{BASE}/requests",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def get(rid):
    req = urllib.request.Request(
        f"{BASE}/requests/{rid}",
        headers={"Authorization": f"Bearer {KEY}"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def run(model, payload, label):
    print(f"\n=== {label} ===", flush=True)
    r = post({"model": model, "payload": payload})
    rid = r.get("request_id") or r.get("id")
    print(f"SUBMIT: {json.dumps(r, ensure_ascii=False)[:200]}", flush=True)
    print(f"RID: {rid}", flush=True)
    for i in range(24):
        time.sleep(15)
        st = get(rid)
        s = st.get("status")
        print(f"poll {i}: {s}", flush=True)
        if s == "success":
            o = st.get("outcome") or {}
            url = o.get("audio_url") or (o.get("media_urls") or [{}])[0].get("url")
            print(f"URL: {url}", flush=True)
            return url
        if s in ("failed", "error"):
            print(f"FAIL: {json.dumps(st, ensure_ascii=False)[:400]}", flush=True)
            return None
    return None


if __name__ == "__main__":
    # Speech 2.8 probe
    run(
        "minimax-tts-speech-2.8-hd",
        {"text": "こんにちは、これはテストです。美術館の音声ガイドをお届けします。", "format": "mp3", "language_boost": "ja"},
        "Speech 2.8 JA",
    )

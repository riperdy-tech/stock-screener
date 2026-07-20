"""Pull kis_trades rows from Supabase (read-only) to compare REAL fills
against paper assumptions. Never prints secrets. Skips cleanly if keys
are absent."""
import json
import os
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent / "out"
env = {}
for fn in (".env.local", ".env"):
    p = ROOT / fn
    if p.exists():
        for line in p.read_text(encoding="utf-8", errors="ignore").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, _, v = line.partition("=")
                env.setdefault(k.strip(), v.strip().strip('"').strip("'"))
url = env.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = (env.get("SUPABASE_SERVICE_KEY") or env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
       or os.environ.get("SUPABASE_SERVICE_KEY"))
if not (url and key):
    print("SKIP: no supabase url/key found (record as open item)")
    raise SystemExit(0)
req = urllib.request.Request(
    f"{url}/rest/v1/kis_trades?select=*&order=run_id.desc&limit=500",
    headers={"apikey": key, "Authorization": f"Bearer {key}"})
try:
    rows = json.loads(urllib.request.urlopen(req, timeout=30).read())
except Exception as e:
    print(f"SKIP: kis_trades query failed ({type(e).__name__}: {e})")
    raise SystemExit(0)
OUT.mkdir(exist_ok=True)
(OUT / "kis_trades.json").write_text(json.dumps(rows, indent=1), encoding="utf-8")
envs = sorted({r.get("env") for r in rows})
runs = sorted({r.get("run_id") for r in rows})
print(f"fetched {len(rows)} kis_trades rows -> out/kis_trades.json")
print(f"envs seen: {envs}; runs: {len(runs)} (latest: {runs[-1] if runs else None})")

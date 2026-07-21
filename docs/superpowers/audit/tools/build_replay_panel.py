"""Build the dated signal+price panel for the churn policy replay, from git
history (read-only). Pass 1: per commit of factor_scores.json, extract each
ticker's quant band / LLM band / LLM percentile / vetoes + the
llm_overlay_applied flag. Pass 2: for the union of ever-signal tickers, pull
that commit's price_history.json last close. One row per calendar date (last
commit of the day wins). Benchmarks (IWM/QQQ/SPY) joined from the ledger's
own nav_series. Cache: out/replay_panel.json"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent / "out"
FS = "public/data/factor_scores.json"
PH = "public/data/price_history.json"


def git_show(sha, path):
    r = subprocess.run(["git", "-C", str(ROOT), "show", f"{sha}:{path}"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        return None
    try:
        return json.loads(r.stdout)
    except Exception:
        return None


log = subprocess.run(["git", "-C", str(ROOT), "log", "--format=%H %cI", "--", FS],
                     capture_output=True, text=True, check=True).stdout.split()
commits = list(zip(log[0::2], log[1::2]))[::-1]          # oldest -> newest

# pass 1 — signals
by_date = {}            # date -> {"sha":, "signals": {t: row}, "overlay_on": bool}
for sha, iso in commits:
    d = iso[:10]
    doc = git_show(sha, FS)
    if not doc:
        continue
    sig = {}
    for t, e in (doc.get("tickers") or {}).items():
        b, bl = e.get("fct_band"), e.get("fct_band_llm")
        if b in ("research_now", "watchlist") or bl is not None:
            sig[t] = {"q": b, "l": bl, "lp": e.get("fct_percentile_llm"),
                      "lv": e.get("fct_llm_veto"), "qv": e.get("fct_veto")}
    by_date[d] = {"sha": sha, "signals": sig,
                  "overlay_on": bool(doc.get("llm_overlay_applied"))}
    print(f"  pass1 {d} {sha[:8]}: {len(sig)} signal tickers", flush=True)

union = sorted({t for day in by_date.values() for t in day["signals"]})
print(f"pass1 done: {len(by_date)} dates, {len(union)} union tickers", flush=True)

# pass 2 — prices for the union at each date's commit
for d, day in by_date.items():
    doc = git_show(day["sha"], PH)
    px = {}
    if doc:
        prices = doc.get("prices") or {}
        for t in union:
            arr = prices.get(t)
            if isinstance(arr, list) and arr and isinstance(arr[-1], (int, float)):
                px[t] = round(float(arr[-1]), 4)
    day["px"] = px
    day.pop("sha")
    print(f"  pass2 {d}: {len(px)} prices", flush=True)

# benchmarks per date from the ledger book (already dated)
book = json.loads((ROOT / "public/data/paper_ledgers.json").read_text(encoding="utf-8"))
bench = {}
for row in (book["ledgers"]["equal"].get("nav_series") or []):
    if row.get("benches"):
        bench[row["date"]] = row["benches"]

panel = {"dates": sorted(by_date), "days": by_date, "bench": bench,
         "union_tickers": union}
OUT.mkdir(exist_ok=True)
(OUT / "replay_panel.json").write_text(json.dumps(panel), encoding="utf-8")
sizes = [len(by_date[d]["px"]) for d in sorted(by_date)]
print(f"panel written: {len(by_date)} dates, prices/day min={min(sizes)} max={max(sizes)}")

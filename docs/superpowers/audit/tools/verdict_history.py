"""Rebuild per-ticker verdict timelines from git history of llm_overlay.json.
A verdict flip is a real trade in the live book. Read-only (git show)."""
import csv
import json
import subprocess
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent / "out"
PATH = "public/data/llm_overlay.json"

log = subprocess.run(["git", "-C", str(ROOT), "log", "--format=%H %cI", "--", PATH],
                     capture_output=True, text=True, check=True).stdout.split()
commits = list(zip(log[0::2], log[1::2]))[::-1]          # oldest -> newest
rows, timeline, conv_series = [], defaultdict(list), defaultdict(list)
for sha, iso in commits:
    try:
        blob = subprocess.run(["git", "-C", str(ROOT), "show", f"{sha}:{PATH}"],
                              capture_output=True, text=True, check=True).stdout
        tickers = (json.loads(blob) or {}).get("tickers", {})
    except Exception:
        continue
    for t, v in tickers.items():
        action = str(v.get("action") or "?").upper()
        conv = v.get("conviction")
        rows.append((t, iso, action, conv))
        timeline[t].append((iso, action, v.get("analyzed_date")))
        if conv is not None:
            conv_series[t].append(conv)

def fam(a):
    """Collapse free-text actions to BULL/HOLD/BEAR families — a family change is
    what moves the book; wording churn alone should not count as a flip."""
    a = a.upper()
    if any(k in a for k in ("AVOID", "SELL", "REDUCE", "TRIM", "EXIT")):
        return "BEAR"
    if any(k in a for k in ("BUY", "ACCUMULATE", "ADD", "INITIATE")):
        return "BULL"
    return "HOLD"

flips_txt, flips_fam, reanalyses = {}, {}, {}
for t, seq in timeline.items():
    # only count transitions where a NEW analysis happened (analyzed_date changed)
    flips_txt[t] = sum(1 for a, b in zip(seq, seq[1:]) if a[1] != b[1])
    flips_fam[t] = sum(1 for a, b in zip(seq, seq[1:])
                       if fam(a[1]) != fam(b[1]))
    reanalyses[t] = sum(1 for a, b in zip(seq, seq[1:]) if a[2] != b[2])

obs = sum(len(s) for s in timeline.values())
transitions = sum(len(s) - 1 for s in timeline.values() if len(s) > 1)
total_re = sum(reanalyses.values())
OUT.mkdir(exist_ok=True)
with (OUT / "verdict_history.csv").open("w", newline="", encoding="utf-8") as f:
    csv.writer(f).writerows([("ticker", "commit_iso", "action", "conviction"), *rows])
(OUT / "verdict_flips.json").write_text(json.dumps({
    "commits": len(commits), "tickers": len(timeline), "observations": obs,
    "snapshot_transitions": transitions,
    "reanalysis_transitions": total_re,
    "action_text_flips": sum(flips_txt.values()),
    "action_family_flips": sum(flips_fam.values()),
    "family_flip_rate_per_reanalysis": (round(sum(flips_fam.values()) / total_re, 4)
                                        if total_re else None),
    "top_family_flippers": dict(sorted(((t, n) for t, n in flips_fam.items() if n),
                                       key=lambda kv: -kv[1])[:25]),
    "cadence_days": sorted({c[1][:10] for c in commits}),
}, indent=1), encoding="utf-8")
print(f"{len(commits)} overlay commits, {len(timeline)} tickers, {obs} observations")
print(f"reanalysis transitions: {total_re}; text flips {sum(flips_txt.values())}; "
      f"FAMILY flips {sum(flips_fam.values())}")

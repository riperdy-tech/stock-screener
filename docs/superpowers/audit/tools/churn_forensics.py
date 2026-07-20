"""Round-trip churn decomposition per ledger from paper_ledgers.json.
Field names verified against tools/out/trades_sample.json (Task 1).
Key outputs per ledger: hold-time distribution, re-entry flip-flops,
modeled cost drag (10 bps/side on traded value), P&L by hold bucket,
and post-exit forward returns (did exits keep falling = good sells,
or bounce = sold too early). Read-only."""
import json
import statistics
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent / "out"
book = json.loads((ROOT / "public/data/paper_ledgers.json").read_text(encoding="utf-8"))
COST_BPS = 10  # per side, the tracker's own assumption (track_paper_portfolios.py:64)


def d(s):
    return date.fromisoformat(str(s)[:10])


summary = {}
for name in ("equal", "equal_llm", "plan", "plan_llm", "plan2", "plan2_llm"):
    led = book["ledgers"].get(name)
    if not led:
        continue
    closed = led.get("closed", [])
    trades = led.get("trades", [])
    holds = [c["hold_days"] for c in closed if c.get("hold_days") is not None]
    rets = [c["return_pct"] for c in closed if c.get("return_pct") is not None]
    post = [c["post_exit_return_pct"] for c in closed
            if c.get("post_exit_return_pct") is not None]
    exits_by_ticker = defaultdict(list)
    for c in closed:
        exits_by_ticker[c["ticker"]].append(d(c["exit_date"]))
    reentries = 0
    for c in closed:
        t, e = c["ticker"], d(c["entry_date"])
        reentries += any(0 < (e - x).days <= 14 for x in exits_by_ticker.get(t, []))
    for t, h in (led.get("state") or {}).get("holdings", {}).items():
        e = d(h["entry_date"])
        reentries += any(0 < (e - x).days <= 14 for x in exits_by_ticker.get(t, []))
    total_traded = sum(t.get("value") or 0 for t in trades)
    navs = [p["nav"] for p in led.get("nav_series", []) if p.get("nav")]
    avg_nav = statistics.fmean(navs) if navs else 100.0
    buckets = defaultdict(list)
    for c in closed:
        h, p = c.get("hold_days"), c.get("return_pct")
        if h is None or p is None:
            continue
        buckets["<=5d" if h <= 5 else "6-15d" if h <= 15 else ">15d"].append(p)
    summary[name] = {
        "round_trips": len(closed),
        "open_positions": len((led.get("state") or {}).get("holdings", {})),
        "median_hold_days": statistics.median(holds) if holds else None,
        "reentries_within_14d": reentries,
        "total_traded_nav_pts": round(total_traded, 2),
        "turnover_x_of_nav": round(total_traded / avg_nav, 2),
        "modeled_cost_drag_nav_bps": round(total_traded / avg_nav * COST_BPS, 1),
        "mean_closed_return_pct": round(statistics.fmean(rets), 2) if rets else None,
        "win_rate": round(sum(r > 0 for r in rets) / len(rets), 3) if rets else None,
        "pnl_by_hold_bucket": {k: {"mean_pct": round(statistics.fmean(v), 2), "n": len(v)}
                               for k, v in sorted(buckets.items())},
        "post_exit_30d": {
            "n": len(post),
            "mean_pct": round(statistics.fmean(post), 2) if post else None,
            "pct_positive": round(sum(p > 0 for p in post) / len(post), 3) if post else None,
        },
    }
OUT.mkdir(exist_ok=True)
(OUT / "churn_summary.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")
print(json.dumps(summary, indent=1))

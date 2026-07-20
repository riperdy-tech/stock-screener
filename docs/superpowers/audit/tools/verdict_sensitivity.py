"""How big are RS2's scoring swings between re-analyses?  For every
consecutive re-analysis of the same ticker (analyzed_date changed):
  d_conviction, d_fair_value_pct, d_mos_pts, family flip y/n.
Key split (user hypothesis 2026-07-20): flips where |d_fair_value| < 5%
are ENGINE NOISE (the valuation barely moved but the action flipped);
flips with large d_fair_value are legitimate re-pricing. Read-only."""
import json
import statistics
import subprocess
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent / "out"
PATH = "public/data/llm_overlay.json"

log = subprocess.run(["git", "-C", str(ROOT), "log", "--format=%H %cI", "--", PATH],
                     capture_output=True, text=True, check=True).stdout.split()
commits = list(zip(log[0::2], log[1::2]))[::-1]

timeline = defaultdict(list)   # ticker -> [(analyzed_date, action, conviction, fair_value, mos)]
for sha, iso in commits:
    try:
        blob = subprocess.run(["git", "-C", str(ROOT), "show", f"{sha}:{PATH}"],
                              capture_output=True, text=True, check=True).stdout
        tickers = (json.loads(blob) or {}).get("tickers", {})
    except Exception:
        continue
    for t, v in tickers.items():
        rec = (v.get("analyzed_date"), str(v.get("action") or "?").upper(),
               v.get("conviction"), v.get("fair_value"),
               v.get("realistic_mos_pct", v.get("mos_pct")))
        if not timeline[t] or timeline[t][-1][0] != rec[0]:   # keep one per analysis
            timeline[t].append(rec)


def fam(a):
    if any(k in a for k in ("AVOID", "SELL", "REDUCE", "TRIM", "EXIT")):
        return "BEAR"
    if any(k in a for k in ("BUY", "ACCUMULATE", "ADD", "INITIATE")):
        return "BULL"
    return "HOLD"


d_conv, d_fv, d_mos = [], [], []
flips_total = flips_low_fv = flips_hi_fv = flips_no_fv = 0
noise_examples = []
for t, seq in timeline.items():
    for a, b in zip(seq, seq[1:]):
        _, act0, c0, fv0, m0 = a
        _, act1, c1, fv1, m1 = b
        if isinstance(c0, (int, float)) and isinstance(c1, (int, float)):
            d_conv.append(c1 - c0)
        dfv = None
        if isinstance(fv0, (int, float)) and isinstance(fv1, (int, float)) and fv0:
            dfv = (fv1 / fv0 - 1) * 100
            d_fv.append(dfv)
        if isinstance(m0, (int, float)) and isinstance(m1, (int, float)):
            d_mos.append(m1 - m0)
        if fam(act0) != fam(act1):
            flips_total += 1
            if dfv is None:
                flips_no_fv += 1
            elif abs(dfv) < 5:
                flips_low_fv += 1
                if len(noise_examples) < 12:
                    noise_examples.append(
                        f"{t}: {fam(act0)}->{fam(act1)} with dFV {dfv:+.1f}% "
                        f"(conv {c0}->{c1})")
            else:
                flips_hi_fv += 1


def dist(xs, label):
    if not xs:
        return {label: None}
    ax = sorted(abs(x) for x in xs)
    return {label: {
        "n": len(xs),
        "median_abs": round(ax[len(ax) // 2], 2),
        "p90_abs": round(ax[int(len(ax) * 0.9)], 2),
        "max_abs": round(ax[-1], 2),
    }}


out = {
    "reanalysis_pairs": len(d_conv),
    **dist(d_conv, "delta_conviction"),
    **dist(d_fv, "delta_fair_value_pct"),
    **dist(d_mos, "delta_mos_pts"),
    "family_flips_total": flips_total,
    "flips_with_dFV_under_5pct (engine noise)": flips_low_fv,
    "flips_with_dFV_over_5pct (repricing)": flips_hi_fv,
    "flips_missing_fair_value": flips_no_fv,
    "noise_flip_examples": noise_examples,
}
OUT.mkdir(exist_ok=True)
(OUT / "verdict_sensitivity.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
print(json.dumps(out, indent=1))

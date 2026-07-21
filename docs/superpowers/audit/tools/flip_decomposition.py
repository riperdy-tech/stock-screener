"""Decompose the wild ~35% verdict flip rate into causes, using the full
verdict.json history in RS2 Local/reports. Each verdict stores raw_action
(the model's own opinion before the brake) and action (after the
deterministic don't-chase brake). For consecutive analyses of a ticker:

  brake_retier   raw opinion family UNCHANGED, final action family changed
                 -> the deterministic price-threshold brake re-tiered it
                    (no-hysteresis boundary design, not model instability)
  opinion_flip   the model's own raw opinion family changed
     .. with_input_change    |dFV|>=5% or |dPrice|>=10% (arguably legitimate)
     .. no_input_change      neither moved -> upstream sampling cascade noise

Exit-review verdicts excluded (framing forces an action change). Read-only."""
import json
import re
from collections import defaultdict
from pathlib import Path

REPORTS = Path(r"C:\Users\riper\Downloads\RS2 Local\reports")
OUT = Path(__file__).resolve().parent / "out"

BEARS = ("AVOID", "SELL", "REDUCE", "TRIM", "EXIT", "UNDERWEIGHT")
HOLDS = ("HOLD", "WAIT", "WATCHLIST", "MONITOR", "DO NOT CHASE")
BULLS = ("BUY", "ACCUMULAT", "SCALE", "ADD", "OVERWEIGHT", "STARTER", "INITIAT", "ENTER")


def fam(s):
    s = (s or "").upper()
    if any(w in s for w in BEARS):
        return "BEAR"
    if any(w in s for w in HOLDS):
        return "HOLD"
    if any(w in s for w in BULLS):
        return "BULL"
    return "?"


by_ticker = defaultdict(list)
for d in sorted(REPORTS.iterdir()):
    if not d.is_dir() or not re.match(r"^[A-Z.]+_\d{8}_\d{6}$", d.name):
        continue
    try:
        v = json.loads((d / "verdict.json").read_text(encoding="utf-8"))
    except Exception:
        continue
    if not v.get("action") or v.get("exit_review"):
        continue
    by_ticker[v["ticker"]].append((d.name, v))

pairs = 0
flips = []
counts = {"brake_retier": 0, "opinion_with_input_change": 0,
          "opinion_no_input_change": 0, "unclassifiable": 0}
for t, seq in by_ticker.items():
    # one verdict per analyzed date (keep the last run of the day)
    dedup = {}
    for name, v in seq:
        dedup[v.get("date")] = (name, v)
    seq = [dedup[k] for k in sorted(dedup)]
    for (n0, v0), (n1, v1) in zip(seq, seq[1:]):
        pairs += 1
        if fam(v1.get("action")) == fam(v0.get("action")):
            continue
        raw_changed = fam(v1.get("raw_action") or v1.get("action")) != \
            fam(v0.get("raw_action") or v0.get("action"))
        fv0, fv1 = v0.get("fair_value"), v1.get("fair_value")
        p0, p1 = v0.get("price"), v1.get("price")
        dfv = abs(fv1 / fv0 - 1) * 100 if (isinstance(fv0, (int, float))
                                           and isinstance(fv1, (int, float)) and fv0) else None
        dpx = abs(p1 / p0 - 1) * 100 if (isinstance(p0, (int, float))
                                         and isinstance(p1, (int, float)) and p0) else None
        if not raw_changed:
            kind = "brake_retier"
        elif (dfv is not None and dfv >= 5) or (dpx is not None and dpx >= 10):
            kind = "opinion_with_input_change"
        elif dfv is None and dpx is None:
            kind = "unclassifiable"
        else:
            kind = "opinion_no_input_change"
        counts[kind] += 1
        flips.append({"ticker": t, "from": v0.get("action"), "to": v1.get("action"),
                      "raw_from": v0.get("raw_action"), "raw_to": v1.get("raw_action"),
                      "kind": kind, "dFV_pct": round(dfv, 1) if dfv is not None else None,
                      "dPrice_pct": round(dpx, 1) if dpx is not None else None,
                      "dates": [v0.get("date"), v1.get("date")]})

total_flips = sum(counts.values())
OUT.mkdir(exist_ok=True)
(OUT / "flip_decomposition.json").write_text(
    json.dumps({"pairs": pairs, "flips": total_flips, "counts": counts,
                "detail": flips}, indent=1), encoding="utf-8")
print(f"consecutive analysis pairs: {pairs}; action-family flips: {total_flips} "
      f"({round(100 * total_flips / pairs, 1)}%)")
for k, n in counts.items():
    print(f"  {k:<28} {n:>3}  ({round(100 * n / total_flips, 1) if total_flips else 0}% of flips)")
print("\nexamples of opinion_no_input_change (the pure cascade noise):")
for f in [x for x in flips if x["kind"] == "opinion_no_input_change"][:8]:
    print(f"  {f['ticker']}: {f['raw_from']!r} -> {f['raw_to']!r} "
          f"(dFV {f['dFV_pct']}%, dPx {f['dPrice_pct']}%)")
print("\nexamples of brake_retier (deterministic threshold crossings):")
for f in [x for x in flips if x["kind"] == "brake_retier"][:8]:
    print(f"  {f['ticker']}: raw stayed {fam(f['raw_to'])}; action {f['from']!r} -> {f['to']!r} "
          f"(dPx {f['dPrice_pct']}%)")

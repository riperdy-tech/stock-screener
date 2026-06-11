"""calibrate_factor_weights.py — IC drift monitor (diagnostic ONLY).

June 2026 repurpose: per the Integrated Ecosystem review (DeMiguel-Garlappi-
Uppal 2009; McLean-Pontiff 2016), the composite is EQUAL-WEIGHTED across the
five robust factors and this script NO LONGER writes weights. It reads the
measured per-factor rank-ICs (public/data/factor_ic.json, produced by
backtest_lite.py) and writes public/data/factor_ic_drift.md comparing the
live equal weights against what IC-proportional weighting WOULD pick — so a
persistent, large divergence is visible to the operator without ever letting
short-sample estimation steer the engine.

The benchmark that would change this policy (recorded in factor_weights.json):
point-in-time data + deflated-Sharpe + purged-CV evidence that a shrunk-IC
tilt beats equal-weight out-of-sample net of turnover.

Usage: python scripts/calibrate_factor_weights.py
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[1]
FACTOR_IC_JSON = ROOT / "public" / "data" / "factor_ic.json"
WEIGHTS_JSON = Path(__file__).resolve().with_name("factor_weights.json")
DRIFT_MD = ROOT / "public" / "data" / "factor_ic_drift.md"

MEASURABLE = ["value", "quality", "momentum", "lowvol"]


def main():
    if not FACTOR_IC_JSON.exists():
        print(f"FATAL: {FACTOR_IC_JSON} missing — run backtest_lite.py first.")
        sys.exit(1)
    ic_data = json.loads(FACTOR_IC_JSON.read_text(encoding="utf-8"))
    factors = ic_data.get("factors", {})
    weights_file = json.loads(WEIGHTS_JSON.read_text(encoding="utf-8"))
    live = weights_file.get("current", {}).get("weights", {})

    mean_ics = {f: (factors.get(f) or {}).get("mean_ic") for f in MEASURABLE}
    raw = {f: max(0.0, ic) for f, ic in mean_ics.items() if ic is not None}
    total = sum(raw.values())
    ic_would = ({f: round(raw.get(f, 0.0) / total, 3) for f in MEASURABLE}
                if total > 0 else {f: None for f in MEASURABLE})

    lines = [
        "# Factor IC Drift Report (diagnostic — weights are equal by design)",
        "",
        f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}",
        "",
        "The composite is equal-weighted (see factor_weights.json for the evidence",
        "rationale). This report shows what IC-proportional weighting WOULD pick,",
        "so persistent large divergence is visible without steering the engine.",
        "",
        "| Factor | Live weight | Mean IC | IC-proportional (hypothetical) | Positive quarters |",
        "|---|---|---|---|---|",
    ]
    for f in MEASURABLE + ["revisions"]:
        fd = factors.get(f) or {}
        lines.append(
            f"| {f} | {live.get(f, '—')} | {fd.get('mean_ic', '—')} "
            f"| {ic_would.get(f, '—') if f in MEASURABLE else 'n/a (no PIT history)'} "
            f"| {fd.get('positive_quarters_pct', '—')}% |")
    lines += [
        "",
        f"_Survivorship caveat applies to all ICs: {ic_data.get('survivorship_caveat', '')}_",
    ]
    DRIFT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Live weights: {live}")
    print(f"IC-proportional would be: {ic_would} (NOT applied)")
    print(f"Written: {DRIFT_MD.name}")


if __name__ == "__main__":
    main()

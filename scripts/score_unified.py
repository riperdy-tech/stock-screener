"""score_unified.py — unified weighted-sum composite with hard vetoes (audit item 7).

Combines the two existing engines plus the revision/theme sidecars into ONE
ranking with percentile bands, replacing scale-compressing multiplication
with a weighted sum — while keeping the anti-Nikola floor as explicit vetoes.

    pillars (0-100, renormalized over what's available per stock):
      V value      = rev_mos                 (reverse engine, weight .30)
      Q quality    = rev_quality             (reverse engine, weight .25)
      M momentum   = pdm_momentum_score      (paradigm engine, weight .20)
      R revisions  = EPS trajectory slope + analyst structured (weight .15)
      T theme      = membership x theme median momentum        (weight .10)

    score = weighted_sum x survivability_haircut x data_quality_haircut
    vetoes (score -> 0, reason recorded):
      - reverse band Excluded/Reject/Reject-tier  (carries Z<1.8, leverage,
        cash-burn, data-quality eliminators from Stage 1)
      - M_SCORE_ELEVATED AND ACCRUALS_HIGH together (forensic pair; either
        alone is a x0.85 haircut, not a veto — Beneish false-positives on
        legitimate hypergrowth, see NVDA)
      - HEAVY_ISSUANCE outside archetypes E/F (early-stage dilution is a
        business model, mature dilution is a red flag)

    bands by PERCENTILE among scored, non-vetoed stocks (self-calibrating):
      >= 97th research_now | >= 90th watchlist | >= 70th monitor | else pass

Additive: writes public/data/unified_scores.json sidecar only. Never touches
rev_* or pdm_* values. V/Q/M must all be present for a score; R/T are bonus
pillars (weights renormalize when absent).

Usage: python scripts/score_unified.py   (run via run_chain.py)
"""

import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"
REVERSE_SCORES_JSON = DATA / "reverse_scores.json"
PARADIGM_SCORES_JSON = DATA / "paradigm_scores.json"
THEME_METRICS_JSON = DATA / "paradigm_theme_metrics.json"
EPS_TRAJECTORY_JSON = DATA / "eps_trajectory.json"
ANALYST_JSON = DATA / "analyst_coverage.json"
BATTERY_JSON = DATA / "fundamentals_battery.json"
CONFIG_JSON = Path(__file__).resolve().with_name("unified_config.json")
OUT_JSON = DATA / "unified_scores.json"

DEFAULT_CONFIG = {
    "weights": {"value": 0.30, "quality": 0.25, "momentum": 0.20,
                "revisions": 0.15, "theme": 0.10},
    "required_pillars": ["value", "quality", "momentum"],
    "single_forensic_haircut": 0.85,
    "bands": {"research_now": 97, "watchlist": 90, "monitor": 70},
    "_note": ("Audit item 7 (June 2026). Weighted sum fixes the triple-product "
              "scale compression that muted real winners (LLY case); vetoes "
              "keep the anti-Nikola discipline explicit and auditable."),
}

VETO_BANDS = ("Excluded", "Reject", "Reject-tier")


def load_json(path, default=None):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def num(v):
    return v if isinstance(v, (int, float)) and math.isfinite(v) else None


def clamp01(x):
    return max(0.0, min(1.0, x))


def revisions_pillar(traj_entry, analyst_entry):
    """0-100 from EPS-trajectory slope and analyst structured score; None if neither."""
    parts = []
    if traj_entry:
        slope = num(traj_entry.get("trajectory_slope"))
        if slope is not None:
            parts.append(clamp01((max(-1.0, min(1.0, slope)) + 1.0) / 2.0))
    if analyst_entry:
        structured = num(analyst_entry.get("structured_score"))
        if structured is not None:
            parts.append(clamp01(structured / 100.0))
    if not parts:
        return None
    return round(sum(parts) / len(parts) * 100)


def theme_pillar(pdm, theme_metrics):
    """0-100: membership confidence x primary theme's median momentum."""
    mem = num(pdm.get("pdm_membership_score"))
    primary = pdm.get("pdm_theme_primary")
    if mem is None or not primary:
        return None
    tm = (theme_metrics or {}).get(primary) or {}
    theme_mom = num(tm.get("median_momentum"))
    if theme_mom is None:
        return None
    return round(mem * theme_mom / 100)


def main():
    config = load_json(CONFIG_JSON, None)
    if config is None:
        CONFIG_JSON.write_text(json.dumps(DEFAULT_CONFIG, indent=2) + "\n", encoding="utf-8")
        config = dict(DEFAULT_CONFIG)
        print(f"Wrote default {CONFIG_JSON.name}")

    weights = config["weights"]
    required = set(config.get("required_pillars", ["value", "quality", "momentum"]))
    single_forensic_haircut = config.get("single_forensic_haircut", 0.85)
    band_cuts = config.get("bands", DEFAULT_CONFIG["bands"])

    reverse = load_json(REVERSE_SCORES_JSON, {})
    paradigm = load_json(PARADIGM_SCORES_JSON, {})
    theme_metrics = (load_json(THEME_METRICS_JSON, {}) or {}).get("themes", {})
    eps_traj = load_json(EPS_TRAJECTORY_JSON, {}) or {}
    eps_traj = eps_traj.get("tickers", eps_traj) if isinstance(eps_traj, dict) else {}
    analyst = load_json(ANALYST_JSON, {}) or {}
    analyst = analyst.get("tickers", analyst) if isinstance(analyst, dict) else {}

    results = {}
    vetoed_count = {}
    scored = []

    for ticker, rv in reverse.items():
        if not isinstance(rv, dict):
            continue
        pdm = paradigm.get(ticker) or {}
        flags = rv.get("rev_flags") or ""

        pillars = {
            "value": num(rv.get("rev_mos")),
            "quality": num(rv.get("rev_quality")),
            "momentum": num(pdm.get("pdm_momentum_score")),
            "revisions": revisions_pillar(eps_traj.get(ticker), analyst.get(ticker)),
            "theme": theme_pillar(pdm, theme_metrics),
        }

        entry = {
            "uni_pillars": pillars,
            "uni_score": None,
            "uni_band": None,
            "uni_rank": None,
            "uni_veto": None,
            "uni_haircuts": {},
        }
        results[ticker] = entry

        # ── Vetoes (explicit, auditable) ─────────────────────────────────
        band = rv.get("rev_band")
        m_fired = "M_SCORE_ELEVATED" in flags
        a_fired = "ACCRUALS_HIGH" in flags
        issuance_fired = "HEAVY_ISSUANCE" in flags
        archetype = rv.get("rev_archetype")

        if band in VETO_BANDS:
            entry["uni_veto"] = "reverse_engine_reject"
        elif m_fired and a_fired:
            entry["uni_veto"] = "forensic_pair"
        elif issuance_fired and archetype not in ("E", "F"):
            entry["uni_veto"] = "heavy_issuance"
        if entry["uni_veto"]:
            vetoed_count[entry["uni_veto"]] = vetoed_count.get(entry["uni_veto"], 0) + 1
            entry["uni_score"] = 0
            continue

        # ── Required pillars present? ────────────────────────────────────
        if any(pillars[p] is None for p in required):
            entry["uni_veto"] = None
            entry["uni_band"] = "insufficient_pillars"
            continue

        available = {p: w for p, w in weights.items() if pillars[p] is not None}
        total_w = sum(available.values())
        base = sum(pillars[p] * w for p, w in available.items()) / total_w

        surv = num(rv.get("rev_survivability"))
        surv_haircut = 0.7 + 0.3 * (surv / 100.0) if surv is not None else 0.7
        dq = num(rv.get("rev_data_quality"))
        dq_haircut = min(1.0, 0.8 + 0.04 * dq) if dq is not None else 0.8
        forensic_haircut = single_forensic_haircut if (m_fired or a_fired) else 1.0

        entry["uni_haircuts"] = {
            "survivability": round(surv_haircut, 3),
            "data_quality": round(dq_haircut, 3),
            "forensic": forensic_haircut,
        }
        score = base * surv_haircut * dq_haircut * forensic_haircut
        entry["uni_score"] = round(score, 2)
        scored.append((ticker, score))

    # ── Percentile bands + dense rank among scored, non-vetoed ──────────
    scored.sort(key=lambda x: (-x[1], x[0]))
    n = len(scored)
    for idx, (ticker, score) in enumerate(scored):
        pct = 100.0 * (n - idx) / n  # top stock ~100th percentile
        entry = results[ticker]
        entry["uni_rank"] = idx + 1
        if pct >= band_cuts["research_now"]:
            entry["uni_band"] = "research_now"
        elif pct >= band_cuts["watchlist"]:
            entry["uni_band"] = "watchlist"
        elif pct >= band_cuts["monitor"]:
            entry["uni_band"] = "monitor"
        else:
            entry["uni_band"] = "pass"

    band_counts = {}
    for e in results.values():
        b = e.get("uni_band") or ("vetoed" if e.get("uni_veto") else "unscored")
        band_counts[b] = band_counts.get(b, 0) + 1

    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "scored_count": n,
        "band_counts": band_counts,
        "veto_counts": vetoed_count,
        "weights_used": weights,
        "tickers": {t: results[t] for t in sorted(results)},
    }
    OUT_JSON.write_text(json.dumps(payload, indent=1, sort_keys=True) + "\n", encoding="utf-8")

    print(f"Unified composite: {n} scored | bands {band_counts} | vetoes {vetoed_count}")
    top10 = [f"{t}({s:.1f})" for t, s in scored[:10]]
    print(f"Top 10: {', '.join(top10)}")
    print(f"Written: {OUT_JSON.name}")


if __name__ == "__main__":
    main()

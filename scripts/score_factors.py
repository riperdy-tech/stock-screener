"""score_factors.py — Factor Lab: sector-neutral multi-factor ranking engine.

Supersedes score_unified.py in the scoring chain. Differences that matter:

  1. SECTOR-NEUTRAL z-scores: every raw metric is winsorized (1st/99th pct)
     and z-scored WITHIN its GICS sector (groups < 15 fall back to universe
     stats). Universe-wide percentiles let sector beta masquerade as signal —
     "high momentum" was mostly "is a tech stock".
  2. EQUAL-WEIGHT composite across the five robust factors (June 2026,
     per the Integrated Ecosystem review: DeMiguel-Garlappi-Uppal 2009 —
     estimated weights rarely beat 1/N out-of-sample). Weights live in
     scripts/factor_weights.json; IC measurement continues as a DIAGNOSTIC
     only (calibrate_factor_weights.py writes a drift report, never weights).
     Theme is a context tag, never additive alpha.
  3. EXPANDED factors: low-volatility (monthly-return sigma — the low-vol
     anomaly), owner-earnings yield inside Value, margin stability +
     continuous F-score inside Quality.
  4. Same anti-Nikola floor: hard vetoes carried over verbatim from
     score_unified.py (reverse Stage-1 rejects, forensic pair, heavy
     issuance outside E/F); single forensic flag is a x0.85 haircut.

Composite mechanics: weighted sum of factor z's (value/quality/momentum
required; revisions/theme bonus) -> cross-sectional percentile (0-100) ->
multiplied by survivability / data-quality / forensic haircuts -> re-ranked
-> percentile bands (>=97 research_now, >=90 watchlist, >=70 monitor).
Haircuts are applied on the percentile scale, not the z scale, so a penalty
can never make a below-average stock look better.

Output: public/data/factor_scores.json (sidecar only; never mutates rev_*/pdm_*).
Usage: python scripts/score_factors.py   (run via run_chain.py)
"""

import json
import math
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
from score_paradigm import compute_skip_month_return, compute_high_proximity  # noqa: E402
from score_unified import revisions_pillar, theme_pillar, VETO_BANDS  # noqa: E402

ROOT = SCRIPT_DIR.parent
DATA = ROOT / "public" / "data"
STOCKS_JSON = DATA / "stocks.json"
REVERSE_SCORES_JSON = DATA / "reverse_scores.json"
PARADIGM_SCORES_JSON = DATA / "paradigm_scores.json"
THEME_METRICS_JSON = DATA / "paradigm_theme_metrics.json"
PRICE_HISTORY_JSON = DATA / "price_history.json"
FUNDAMENTALS_HISTORY_JSON = DATA / "fundamentals_history.json"
BATTERY_JSON = DATA / "fundamentals_battery.json"
EPS_TRAJECTORY_JSON = DATA / "eps_trajectory.json"
ANALYST_JSON = DATA / "analyst_coverage.json"
WEIGHTS_JSON = SCRIPT_DIR / "factor_weights.json"
OUT_JSON = DATA / "factor_scores.json"

MIN_SECTOR_GROUP = 15
Z_CLAMP = 3.0
BANDS = {"research_now": 97, "watchlist": 90, "monitor": 70}
SINGLE_FORENSIC_HAIRCUT = 0.85
REQUIRED_FACTORS = ("value", "quality", "momentum")


def load_json(path, default=None):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def num(v):
    return v if isinstance(v, (int, float)) and math.isfinite(v) else None


def pctl(sorted_vals, q):
    """Linear-interpolated percentile q (0-100) of a pre-sorted list."""
    n = len(sorted_vals)
    if n == 0:
        return None
    if n == 1:
        return sorted_vals[0]
    pos = (q / 100) * (n - 1)
    lo = int(math.floor(pos))
    hi = min(lo + 1, n - 1)
    frac = pos - lo
    return sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac


def sector_neutral_z(raw_by_ticker, sector_by_ticker):
    """Winsorized z-scores within sector; groups < MIN_SECTOR_GROUP use universe stats."""
    by_sector = {}
    universe = []
    for t, v in raw_by_ticker.items():
        if v is None:
            continue
        universe.append(v)
        by_sector.setdefault(sector_by_ticker.get(t) or "Unknown", []).append(v)
    if len(universe) < 2:
        return {t: None for t in raw_by_ticker}

    def stats_for(vals):
        s = sorted(vals)
        lo, hi = pctl(s, 1), pctl(s, 99)
        w = [min(max(v, lo), hi) for v in vals]
        mean = sum(w) / len(w)
        sd = statistics.pstdev(w)
        return lo, hi, mean, (sd if sd > 1e-12 else None)

    uni_stats = stats_for(universe)
    sec_stats = {}
    for sec, vals in by_sector.items():
        sec_stats[sec] = stats_for(vals) if len(vals) >= MIN_SECTOR_GROUP else uni_stats

    z = {}
    for t, v in raw_by_ticker.items():
        if v is None:
            z[t] = None
            continue
        lo, hi, mean, sd = sec_stats.get(sector_by_ticker.get(t) or "Unknown", uni_stats)
        if sd is None:
            z[t] = 0.0
            continue
        vv = min(max(v, lo), hi)
        z[t] = max(-Z_CLAMP, min(Z_CLAMP, (vv - mean) / sd))
    return z


def mean_of_available(*vals):
    present = [v for v in vals if v is not None]
    return sum(present) / len(present) if present else None


def latest_fy(ydata):
    """(year, row, prev_row) for the most recent fiscal year in a history entry."""
    years = sorted(int(y) for y in ydata.keys())
    if not years:
        return None, None, None
    y0 = years[-1]
    return y0, ydata[str(y0)], ydata.get(str(y0 - 1))


def _reband(p):
    if p >= BANDS["research_now"]:
        return "research_now"
    if p >= BANDS["watchlist"]:
        return "watchlist"
    if p >= BANDS["monitor"]:
        return "monitor"
    return "pass"


def apply_llm_overlay(results):
    """Stage-5 LLM veto/promote/tilt overlay. Reads public/data/llm_overlay.json (written by the
    local RS2 orchestrator) and lets each verdict adjust the quant ranking:
      - bounded TILT of fct_percentile from conviction + stance (+-25 pts max),
      - hard DEMOTE (out of research_now) + veto='llm_reject' on a bearish/low-conviction verdict,
      - hard PROMOTE (into research_now) on a high-conviction bullish verdict.
    Re-derives fct_band, preserves fct_band_quant (pre-overlay) for A/B, records fct_llm + the raw
    verdict for the frontend. STRICT NO-OP when the overlay file is absent/empty — never breaks the
    cloud pipeline before verdicts exist (AUDIT-safe, per the plan)."""
    try:
        ov = (json.loads((DATA / "llm_overlay.json").read_text(encoding="utf-8")) or {}).get("tickers", {})
    except Exception:
        return 0
    if not ov:
        return 0
    BEAR = ("AVOID", "SELL", "REDUCE", "TRIM", "EXIT")
    BULL = ("BUY", "ACCUMULAT", "SCALE", "ADD", "OVERWEIGHT")
    clamp = lambda x, lo, hi: max(lo, min(hi, x))
    applied = 0
    for t, v in ov.items():
        e = results.get(t)
        if not e or e.get("fct_percentile") is None:
            continue
        act = (v.get("action") or "").upper()
        stance = (v.get("stance") or "").lower()
        conv = v.get("conviction")
        has_conv = isinstance(conv, (int, float))
        bearish = any(w in act for w in BEAR) or stance == "overvalued"
        bullish = (any(w in act for w in BULL) or stance == "undervalued") and not bearish
        # stale verdict (older than ~the RN refresh window) -> halve its influence
        stale = False
        try:
            from datetime import date
            stale = bool(v.get("analyzed_date")) and \
                (date.today() - date.fromisoformat(v["analyzed_date"])).days > 10
        except Exception:
            pass
        tilt = clamp(((conv - 9) * 2 if has_conv else 0)
                     + (8 if stance == "undervalued" else -8 if stance == "overvalued" else 0), -25, 25)
        if stale:
            tilt *= 0.5
        e["fct_band_quant"] = e.get("fct_band")          # preserve pre-overlay band
        e["fct_llm_verdict"] = {"stance": stance or None, "action": v.get("action"),
                                "conviction": conv, "method": v.get("method"),
                                "mos_pct": v.get("mos_pct"), "gap": v.get("expectations_gap_pts"),
                                "recommended_weight_pct": v.get("recommended_weight_pct"),
                                "analyzed_date": v.get("analyzed_date")}
        p = clamp((e["fct_percentile"] or 0) + tilt, 0, 100)
        e["fct_llm"] = "none"
        if bearish or (has_conv and conv < 7):
            p = min(p, BANDS["research_now"] - 0.1)      # demote out of research_now
            e["fct_llm"] = "demoted"
            if any(w in act for w in ("AVOID", "SELL")):
                e["fct_veto"] = "llm_reject"             # also exclude from the portfolio candidate set
        elif bullish and has_conv and conv >= 10:
            p = max(p, float(BANDS["research_now"]))     # promote into research_now
            e["fct_llm"] = "promoted"
        e["fct_percentile"] = round(p, 1)
        e["fct_band"] = _reband(p)
        applied += 1
    return applied


def main():
    weights_file = load_json(WEIGHTS_JSON, None)
    if not weights_file or "current" not in weights_file:
        print("FATAL: scripts/factor_weights.json missing — run calibrate_factor_weights.py.")
        sys.exit(1)
    weights = weights_file["current"]["weights"]

    stocks = {s["symbol"]: s for s in load_json(STOCKS_JSON, []) if s.get("symbol")}
    reverse = load_json(REVERSE_SCORES_JSON, {})
    paradigm = load_json(PARADIGM_SCORES_JSON, {})
    theme_metrics = (load_json(THEME_METRICS_JSON, {}) or {}).get("themes", {})
    prices = (load_json(PRICE_HISTORY_JSON, {}) or {}).get("prices", {})
    fundamentals = (load_json(FUNDAMENTALS_HISTORY_JSON, {}) or {}).get("tickers", {})
    battery = (load_json(BATTERY_JSON, {}) or {}).get("tickers", {})
    eps_traj = load_json(EPS_TRAJECTORY_JSON, {}) or {}
    eps_traj = eps_traj.get("tickers", eps_traj) if isinstance(eps_traj, dict) else {}
    analyst = load_json(ANALYST_JSON, {}) or {}
    analyst = analyst.get("tickers", analyst) if isinstance(analyst, dict) else {}

    tickers = sorted(reverse.keys())
    sector_by_ticker = {t: (stocks.get(t) or {}).get("sector") for t in tickers}

    # ── Raw sub-metrics ──────────────────────────────────────────────────
    raw = {name: {} for name in (
        "fcf_yield", "owner_yield", "ebit_yield", "earnings_yield",
        "rev_quality", "gm_stability", "neg_accruals", "f_score",
        "skip_12_1", "high_52w", "neg_vol")}
    annualized_vol = {}  # ticker -> sigma for Kelly sizing

    for t in tickers:
        stock = stocks.get(t) or {}
        mcap = num(stock.get("marketCap"))
        fy_row = prev_row = None
        ydata = fundamentals.get(t)
        if ydata:
            _, fy_row, prev_row = latest_fy(ydata)

        # Value
        if fy_row and mcap and mcap > 0:
            fcf = num(fy_row.get("fcf"))
            raw["fcf_yield"][t] = fcf / mcap if fcf is not None else None
            ni, da, capex = (num(fy_row.get("net_income")), num(fy_row.get("da")),
                             num(fy_row.get("capex")))
            raw["owner_yield"][t] = ((ni + da - capex) / mcap
                                     if None not in (ni, da, capex) else None)
            op = num(fy_row.get("operating_income"))
            debt = num(fy_row.get("lt_debt")) or 0.0
            cash = num(fy_row.get("cash")) or 0.0
            ev = mcap + debt - cash
            raw["ebit_yield"][t] = op / ev if (op is not None and ev > 0) else None
            # Earnings yield: broadest-coverage value sub (rescues filers whose
            # capex/DA/op-income tags are missing, e.g. LLY)
            raw["earnings_yield"][t] = ni / mcap if ni is not None else None

        # Quality
        rv = reverse.get(t) or {}
        raw["rev_quality"][t] = num(rv.get("rev_quality"))
        if ydata:
            margins = []
            for y in sorted(ydata.keys()):
                row = ydata[y]
                gp, rev_ = num(row.get("gross_profit")), num(row.get("revenue"))
                if gp is not None and rev_ and rev_ > 0:
                    margins.append(gp / rev_)
            if len(margins) >= 4:
                raw["gm_stability"][t] = -statistics.pstdev(margins)
        bat = battery.get(t) or {}
        acc = num(bat.get("accruals_ratio"))
        raw["neg_accruals"][t] = -acc if acc is not None else None
        raw["f_score"][t] = num(bat.get("f_score"))

        # Momentum + LowVol
        closes = prices.get(t)
        if isinstance(closes, list) and len(closes) >= 2:
            raw["skip_12_1"][t] = compute_skip_month_return(closes)
            raw["high_52w"][t] = compute_high_proximity(closes)
            rets = [closes[i] / closes[i - 1] - 1 for i in range(1, len(closes))
                    if closes[i - 1] and closes[i - 1] > 0]
            if len(rets) >= 12:
                monthly_sigma = statistics.pstdev(rets)
                raw["neg_vol"][t] = -monthly_sigma
                # Annualized vol exported for Kelly sizing (fct_vol)
                annualized_vol[t] = round(monthly_sigma * math.sqrt(12), 4)

    # ── Sector-neutral z per sub-metric, then factor z = mean of subs ────
    z = {name: sector_neutral_z(vals, sector_by_ticker) for name, vals in raw.items()}

    factor_z = {}
    for t in tickers:
        factor_z[t] = {
            "value": mean_of_available(z["fcf_yield"].get(t), z["owner_yield"].get(t),
                                       z["ebit_yield"].get(t), z["earnings_yield"].get(t)),
            "quality": mean_of_available(z["rev_quality"].get(t), z["gm_stability"].get(t),
                                         z["neg_accruals"].get(t), z["f_score"].get(t)),
            "momentum": mean_of_available(z["skip_12_1"].get(t), z["high_52w"].get(t)),
            "lowvol": z["neg_vol"].get(t),
        }
        # Revisions reuses the 0-100 pillar logic, recentred to z-ish scale
        rp = revisions_pillar(eps_traj.get(t), analyst.get(t))
        factor_z[t]["revisions"] = (rp - 50) / 25.0 if rp is not None else None

    # ── Vetoes (verbatim from score_unified) + composite z ──────────────
    results = {}
    veto_counts = {}
    composite_z = []
    for t in tickers:
        rv = reverse.get(t) or {}
        flags = rv.get("rev_flags") or ""
        fz = factor_z[t]
        # Theme: CONTEXT TAG ONLY, never additive alpha (Ben-David et al. 2023:
        # naive theme exposure averages -3.1%/yr; the paradigm lens keeps the
        # full theme machinery for hunting, gated by economics).
        pdm = paradigm.get(t) or {}
        tp = theme_pillar(pdm, theme_metrics)
        entry = {
            "fct_z": {k: (round(v, 3) if v is not None else None) for k, v in fz.items()},
            "fct_context": {
                "theme_score": tp,
                "theme_primary": pdm.get("pdm_theme_primary"),
                "pdm_band": pdm.get("pdm_band"),
            },
            "fct_vol": annualized_vol.get(t),
            "fct_composite": None, "fct_percentile": None, "fct_band": None,
            "fct_rank": None, "fct_veto": None, "fct_contributions": None,
            "fct_haircuts": None,
        }
        results[t] = entry

        m_fired = "M_SCORE_ELEVATED" in flags
        a_fired = "ACCRUALS_HIGH" in flags
        issuance_fired = "HEAVY_ISSUANCE" in flags
        archetype = rv.get("rev_archetype")
        if rv.get("rev_band") in VETO_BANDS:
            entry["fct_veto"] = "reverse_engine_reject"
        elif m_fired and a_fired:
            entry["fct_veto"] = "forensic_pair"
        elif issuance_fired and archetype not in ("E", "F"):
            entry["fct_veto"] = "heavy_issuance"
        if entry["fct_veto"]:
            veto_counts[entry["fct_veto"]] = veto_counts.get(entry["fct_veto"], 0) + 1
            continue

        if any(fz[f] is None for f in REQUIRED_FACTORS):
            entry["fct_band"] = "insufficient_factors"
            continue

        available = {f: w for f, w in weights.items() if fz.get(f) is not None}
        total_w = sum(available.values())
        cz = sum(fz[f] * w for f, w in available.items()) / total_w
        contributions = {f: round(fz[f] * w / total_w, 3) for f, w in available.items()}
        entry["fct_contributions"] = contributions

        surv = num(rv.get("rev_survivability"))
        dq = num(rv.get("rev_data_quality"))
        entry["fct_haircuts"] = {
            "survivability": round(0.7 + 0.3 * (surv / 100.0), 3) if surv is not None else 0.7,
            "data_quality": round(min(1.0, 0.8 + 0.04 * dq), 3) if dq is not None else 0.8,
            "forensic": SINGLE_FORENSIC_HAIRCUT if (m_fired or a_fired) else 1.0,
        }
        composite_z.append((t, cz))

    # ── z -> percentile -> haircuts -> final score -> bands ─────────────
    composite_z.sort(key=lambda x: (x[1], x[0]))
    n = len(composite_z)
    finals = []
    for idx, (t, cz) in enumerate(composite_z):
        pct = 100.0 * idx / (n - 1) if n > 1 else 50.0
        h = results[t]["fct_haircuts"]
        final = pct * h["survivability"] * h["data_quality"] * h["forensic"]
        results[t]["fct_composite"] = round(final, 2)
        finals.append((t, final))

    finals.sort(key=lambda x: (-x[1], x[0]))
    for idx, (t, final) in enumerate(finals):
        pct = 100.0 * (n - idx) / n if n else None
        results[t]["fct_rank"] = idx + 1
        results[t]["fct_percentile"] = round(pct, 1)
        if pct >= BANDS["research_now"]:
            results[t]["fct_band"] = "research_now"
        elif pct >= BANDS["watchlist"]:
            results[t]["fct_band"] = "watchlist"
        elif pct >= BANDS["monitor"]:
            results[t]["fct_band"] = "monitor"
        else:
            results[t]["fct_band"] = "pass"

    # Stage-5 LLM overlay (no-op if public/data/llm_overlay.json absent) — veto/promote/tilt the
    # quant bands using the local RS2 verdicts. Runs AFTER the quant bands so fct_band_quant is set.
    llm_applied = apply_llm_overlay(results)

    band_counts = {}
    for e in results.values():
        b = e.get("fct_band") or ("vetoed" if e.get("fct_veto") else "unscored")
        band_counts[b] = band_counts.get(b, 0) + 1

    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "engine": "factor_lab_v2_equal",
        "weights_scheme": weights_file["current"].get("scheme", "unknown"),
        "scored_count": n,
        "llm_overlay_applied": llm_applied,
        "band_counts": band_counts,
        "veto_counts": veto_counts,
        "weights_used": weights,
        "weights_calibrated_at": weights_file["current"].get("calibrated_at"),
        "tickers": {t: results[t] for t in sorted(results)},
    }
    OUT_JSON.write_text(json.dumps(payload, indent=1, sort_keys=True) + "\n", encoding="utf-8")

    print(f"Factor Lab: {n} scored | bands {band_counts} | vetoes {veto_counts} | LLM overlay {llm_applied}")
    print(f"Weights: {weights}")
    top10 = [f"{t}({s:.1f})" for t, s in finals[:10]]
    print(f"Top 10: {', '.join(top10)}")
    print(f"Written: {OUT_JSON.name}")


if __name__ == "__main__":
    main()

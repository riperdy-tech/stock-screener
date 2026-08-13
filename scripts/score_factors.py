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
import tradability  # noqa: E402
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
    """Stage-5 LLM overlay — RS2-PRIMARY / quant-GUARDRAIL (parallel A/B layer; does NOT mutate the
    quant baseline). RS2 (institutional reverse-DCF analysis, public/data/llm_overlay.json from the
    local orchestrator) DRIVES the LLM band: action + conviction + stance set fct_percentile_llm /
    fct_band_llm directly. The quant engine acts ONLY as a hard GUARDRAIL — names the quant forensic/
    accounting engine hard-vetoed (reverse-reject / forensic-pair / heavy-issuance) carry fct_percentile
    == None and are skipped, so RS2 can never pull a red-flagged name into the LLM set. Names RS2 did
    not review keep no LLM band (fall back to quant downstream). STRICT NO-OP when the file is absent.

    Bands come from conviction (scale ~4-14, neutral 9): a BULLISH action needs conviction >= RN_CONV
    for research_now, >= WL_CONV for watchlist. BEARISH (avoid/sell/reduce/overvalued) is demoted out
    of RN; hard AVOID/SELL also sets fct_llm_veto='llm_reject' (excluded from the LLM portfolio set).
    Stale verdicts (>14d = the max WL refresh cadence) shrink conviction toward neutral. Writes
    fct_band_llm / fct_percentile_llm / fct_llm / fct_llm_veto / fct_llm_verdict; LEAVES the quant
    baseline untouched."""
    try:
        ov = (json.loads((DATA / "llm_overlay.json").read_text(encoding="utf-8")) or {}).get("tickers", {})
    except Exception:
        return 0
    if not ov:
        return 0
    # #4 live prices to recompute margin of safety daily (the verdict's MoS is frozen at analysis-time
    # price; a name that rallied +30% since is no longer as cheap as its stored MoS claims).
    _prices = (load_json(PRICE_HISTORY_JSON, {}) or {}).get("prices", {})
    def _live_price(t):
        c = _prices.get(t)
        return c[-1] if isinstance(c, list) and c and c[-1] else None
    BEAR = ("AVOID", "SELL", "REDUCE", "TRIM", "EXIT", "SHORT")
    BULL = ("BUY", "ACCUMULAT", "INITIAT", "SCALE", "ADD", "OVERWEIGHT")
    HARD_SELL = ("AVOID", "SELL", "SHORT")
    RN_CONV, WL_CONV = 9.5, 8.0
    # research_now gate is on RS2's STRUCTURED signals (margin of safety + entry_timing), NOT the
    # free-text action keyword (which read "accumulate on weakness / hold" as bullish and over-promoted).
    # Two-tier: DEEP value (MoS >= RN_DEEP_MOS) earns a research flag regardless of conviction; MODERATE
    # value (>= RN_MOS, or a genuine fresh buy) additionally needs conviction >= RN_CONV.
    RN_MOS, RN_DEEP_MOS = 15.0, 30.0
    clamp = lambda x, lo, hi: max(lo, min(hi, x))
    applied = 0
    for t, v in ov.items():
        e = results.get(t)
        # GUARDRAIL: quant hard-veto (forensic pair / heavy issuance / reverse reject) blocks the
        # LLM layer — RS2 can never pull a red-flagged name in. A name that is merely UNSCORABLE
        # (insufficient factor data -> fct_percentile None, no veto) keeps its RS2 verdict: the
        # guardrail is a red-flag filter, not a data-coverage filter.
        if not e or e.get("fct_veto") is not None:
            continue
        act = (v.get("action") or "").upper()
        stance = (v.get("stance") or "").lower()
        conv = v.get("conviction")
        has_conv = isinstance(conv, (int, float))
        bearish = any(w in act for w in BEAR) or stance == "overvalued"
        bullish = (any(w in act for w in BULL) or stance == "undervalued") and not bearish
        stale = False
        try:
            from datetime import date
            stale = bool(v.get("analyzed_date")) and \
                (date.today() - date.fromisoformat(v["analyzed_date"])).days > 14  # #5 = max WL refresh
        except Exception:
            pass
        e["fct_llm_verdict"] = {"stance": stance or None, "action": v.get("action"),
                                "conviction": conv, "method": v.get("method"),
                                "mos_pct": v.get("mos_pct"), "gap": v.get("expectations_gap_pts"),
                                "recommended_weight_pct": v.get("recommended_weight_pct"),
                                "analyzed_date": v.get("analyzed_date"),
                                # holder's exit review (name left the quant list) — UI badges it
                                "exit_review": bool(v.get("exit_review")) or None}
        e["fct_llm"] = "none"
        e["fct_llm_veto"] = None

        # RS2 PRIMARY: conviction drives the band (stale -> shrink toward neutral 9).
        c = (conv if has_conv else 9.0)
        if stale:
            c = 9.0 + (c - 9.0) * 0.5
        stance_adj = 2.0 if stance == "undervalued" else 0.0
        # RS2's own margin of safety and entry-timing drive the research_now gate. #4: recompute MoS
        # against the LIVE price (fair_value / today's close) so a mid-cycle price move is reflected
        # immediately; fall back to the verdict's frozen realistic_mos_pct / mos_pct if no live price.
        fv, lp = v.get("fair_value"), _live_price(t)
        if isinstance(fv, (int, float)) and lp:
            mos = (fv / lp - 1.0) * 100.0
        else:
            mos = v.get("realistic_mos_pct")
            if mos is None:
                mos = v.get("mos_pct")
        et = (v.get("entry_timing") or "").lower()
        deep_value = mos is not None and mos >= RN_DEEP_MOS
        rn_qualify = (not bearish) and (
            deep_value or (c >= RN_CONV and ((mos is not None and mos >= RN_MOS) or et == "buy")))
        if bearish:
            pctl = clamp(50 + (c - 9.0) * 3.0 - (8 if stance == "overvalued" else 0),
                         0, BANDS["research_now"] - 5)
            e["fct_llm"] = "demoted"
            if any(w in act for w in HARD_SELL):
                e["fct_llm_veto"] = "llm_reject"
        elif rn_qualify:
            pctl = clamp(97 + (c - RN_CONV) + stance_adj + (2 if deep_value else 0), 97, 100)
            if e.get("fct_band") != "research_now":
                e["fct_llm"] = "promoted"
        elif bullish and c >= WL_CONV:
            pctl = clamp(90 + (c - WL_CONV) * 3.5 + stance_adj, 90, 96.9)
        elif bullish:
            pctl = clamp(60 + (c - 6.0) * 6 + stance_adj, 40, 89)
        else:  # neutral (fair / hold, no directional call): monitor, RS2 not endorsing a buy
            pctl = clamp(55 + (c - 9.0) * 4, 25, 89)
        e["fct_percentile_llm"] = round(pctl, 1)
        e["fct_band_llm"] = _reband(pctl)
        # ── parallel STRUCTURED-STANCE band (telemetry only — no ledger consumes it yet).
        # Gate design 2026-07-21: numbers govern the middle (live MoS + conviction);
        # stance only vetoes (<=2 or thesis_break) and fast-passes (5, floored at
        # MoS>=5). Runs alongside the text path so agreement can be measured daily
        # before any switchover.
        ss, tb = v.get("stance_score"), bool(v.get("thesis_break"))
        if isinstance(ss, (int, float)):
            e["fct_stance"] = ss
            e["fct_thesis_break"] = tb or None
            if tb or ss <= 2:
                e["fct_band_llm_score"] = "demoted"
            elif (mos is not None and mos >= 30) or \
                    (c >= 9.5 and mos is not None and mos >= 15) or \
                    (ss >= 5 and mos is not None and mos >= 5):
                e["fct_band_llm_score"] = "research_now"
            elif ss >= 4 and c >= 8.0:
                e["fct_band_llm_score"] = "watchlist"
            else:
                e["fct_band_llm_score"] = "monitor"
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

    # Names that cannot be traded (off the exchange listing, or hand-blocked).
    # Vetoed below, which strips the quant band and — via the veto guardrail in
    # apply_llm_overlay — the RS2 lane too. See scripts/tradability.py.
    untradable, untradable_note = tradability.scan(stocks)
    print(f"Tradability: {untradable_note}")

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
            "fct_rank": None, "fct_veto": None, "fct_veto_detail": None,
            "fct_contributions": None, "fct_haircuts": None,
        }
        results[t] = entry

        m_fired = "M_SCORE_ELEVATED" in flags
        a_fired = "ACCRUALS_HIGH" in flags
        issuance_fired = "HEAVY_ISSUANCE" in flags
        archetype = rv.get("rev_archetype")
        # Tradability is checked FIRST: if the name cannot be bought, no amount
        # of factor quality is relevant, and the reason belongs in the output
        # rather than being masked by whichever veto happens to fire next.
        if t in untradable:
            entry["fct_veto"] = "not_tradable"
            entry["fct_veto_detail"] = untradable[t]
        elif rv.get("rev_band") in VETO_BANDS:
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

    # Stage-5 LLM overlay (no-op if public/data/llm_overlay.json absent) — a parallel LLM band
    # from the local RS2 verdicts. Runs AFTER the quant bands (fct_band is the guardrail input).
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

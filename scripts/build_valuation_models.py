"""build_valuation_models.py — reverse-DCF expectations models (audit revamp Phase 2).

For every Factor Lab research_now / watchlist name, solve the question the
screen can't answer: "what growth must you believe to justify today's price?"

Method (two-stage FCF DCF, solved backwards by bisection):
  - base cash flow: latest-FY owner earnings (NI + D&A − capex), fallback FCF
  - years 1-5 grow at g (the unknown), years 6-10 fade linearly g -> terminal
  - terminal value: Gordon growth at 2.5% on year-10 cash flow
  - discount at sector WACC (scripts/reverse_config.json sector_wacc table)
  - solve g so that PV equals current market cap

Evidence comparison: implied g vs demonstrated 5y revenue CAGR and 5y FCF
CAGR (SEC fundamentals_history) plus the forward EPS trajectory slope. The
EXPECTATIONS GAP (implied minus demonstrated revenue growth, in points) is
the headline: large positive gap = the price assumes acceleration nobody has
demonstrated; negative gap = the market pays for less growth than delivered.

Honesty rules: negative/missing base cash flow -> model is null with a
reason, never a fabricated number. All assumptions recorded per ticker so
the frontend workbench can recompute interactively with user overrides.

Usage: python scripts/build_valuation_models.py   (run via run_chain.py)
Output: public/data/valuation_models.json
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

sys.path.append(str(Path(__file__).resolve().parent))
from industry_taxonomy import get_taxonomy_profile  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"
STOCKS_JSON = DATA / "stocks.json"
FACTOR_SCORES_JSON = DATA / "factor_scores.json"
FUNDAMENTALS_HISTORY_JSON = DATA / "fundamentals_history.json"
EPS_TRAJECTORY_JSON = DATA / "eps_trajectory.json"
REVERSE_CONFIG_JSON = Path(__file__).resolve().with_name("reverse_config.json")
COST_OF_CAPITAL_ANCHOR_JSON = DATA / "mri" / "cost_of_capital_anchor.json"
OUT_JSON = DATA / "valuation_models.json"

TERMINAL_GROWTH = 0.025
STAGE1_YEARS = 5
FADE_YEARS = 5
G_LO, G_HI = -0.50, 1.50
ELIGIBLE_BANDS = ("research_now", "watchlist")

# stocks.json carries Yahoo sector names; the WACC table uses GICS-ish names.
SECTOR_ALIASES = {
    "Consumer Cyclical": "Consumer Discretionary",
    "Consumer Defensive": "Consumer Staples",
    "Financial Services": "Financials",
    "Basic Materials": "Materials",
}
DEFAULT_WACC = 10.0

# P3.9 (SCR-05): MRI's cost-of-capital anchor -> GICS sector -> its macro id, for the
# sector_loadings lookup below. Mirrors score_factors_dual_door.py's GICS_TO_MACRO_ID.
GICS_TO_MACRO_ID = {
    "Basic Materials": "materials",
    "Communication Services": "communication_services",
    "Consumer Cyclical": "consumer_discretionary",
    "Consumer Defensive": "consumer_staples",
    "Energy": "energy",
    "Financial Services": "financials",
    "Healthcare": "health_care",
    "Industrials": "industrials",
    "Real Estate": "real_estate",
    "Technology": "information_technology",
    "Utilities": "utilities",
}
COST_OF_CAPITAL_ANCHOR_MAX_AGE_DAYS = 45


def load_json(path, default=None):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def num(v):
    return v if isinstance(v, (int, float)) and math.isfinite(v) else None


def dcf_value(base_cf, g, wacc, terminal_g=TERMINAL_GROWTH,
              stage1=STAGE1_YEARS, fade=FADE_YEARS):
    """PV of two-stage FCF stream. Same math mirrored in lib/dcf.ts."""
    if wacc <= terminal_g:
        return None
    pv = 0.0
    cf = base_cf
    year = 0
    for _ in range(stage1):
        year += 1
        cf *= (1 + g)
        pv += cf / (1 + wacc) ** year
    for i in range(1, fade + 1):
        year += 1
        g_t = g + (terminal_g - g) * i / fade
        cf *= (1 + g_t)
        pv += cf / (1 + wacc) ** year
    terminal = cf * (1 + terminal_g) / (wacc - terminal_g)
    pv += terminal / (1 + wacc) ** year
    return pv


def solve_implied_growth(base_cf, target_value, wacc):
    """Bisection for g in [G_LO, G_HI] with DCF(g) == target_value."""
    if base_cf <= 0 or target_value <= 0:
        return None
    lo_v = dcf_value(base_cf, G_LO, wacc)
    hi_v = dcf_value(base_cf, G_HI, wacc)
    if lo_v is None or hi_v is None:
        return None
    if target_value <= lo_v:
        return G_LO  # priced below even deep-decline assumptions
    if target_value >= hi_v:
        return G_HI  # priced beyond +150%/yr — clamp
    lo, hi = G_LO, G_HI
    for _ in range(60):
        mid = (lo + hi) / 2
        v = dcf_value(base_cf, mid, wacc)
        if v is None:
            return None
        if v < target_value:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def cagr(first, last, years):
    if not first or not last or first <= 0 or last <= 0 or years <= 0:
        return None
    return (last / first) ** (1 / years) - 1


def growth_evidence(ydata):
    """(revenue_cagr_5y, fcf_cagr_5y) from up to 6 fiscal years."""
    years = sorted(int(y) for y in ydata.keys())
    rev_pts = [(y, num(ydata[str(y)].get("revenue"))) for y in years]
    rev_pts = [(y, v) for y, v in rev_pts if v and v > 0]
    fcf_pts = [(y, num(ydata[str(y)].get("fcf"))) for y in years]
    fcf_pts = [(y, v) for y, v in fcf_pts if v and v > 0]
    rev_cagr = fcf_cagr = None
    if len(rev_pts) >= 4:
        (ya, va), (yb, vb) = rev_pts[max(0, len(rev_pts) - 6)], rev_pts[-1]
        rev_cagr = cagr(va, vb, yb - ya)
    if len(fcf_pts) >= 4:
        (ya, va), (yb, vb) = fcf_pts[max(0, len(fcf_pts) - 6)], fcf_pts[-1]
        fcf_cagr = cagr(va, vb, yb - ya)
    return rev_cagr, fcf_cagr


def owner_cf_cagr_5y(ydata):
    """P3.9 (SCR-05): 5-year CAGR of the owner-earnings base — ni + da - capex per fiscal
    year, falling back to that year's fcf when any of the three is missing — same up-to-6-
    fiscal-year / >=4-positive-points shape as growth_evidence()'s revenue/fcf CAGRs. None
    ("undefined CAGR") when there aren't enough positive points."""
    years = sorted(int(y) for y in ydata.keys())
    pts = []
    for y in years:
        row = ydata[str(y)]
        ni_y, da_y, capex_y = num(row.get("net_income")), num(row.get("da")), num(row.get("capex"))
        v = (ni_y + da_y - capex_y) if None not in (ni_y, da_y, capex_y) else num(row.get("fcf"))
        if v and v > 0:
            pts.append((y, v))
    if len(pts) < 4:
        return None
    (ya, va), (yb, vb) = pts[max(0, len(pts) - 6)], pts[-1]
    return cagr(va, vb, yb - ya)


def _parse_mri_date(raw):
    """MRI writes `asof`/`date` as `YYYY-MM-DD` (or `YYYY-MM-DD HH:MM:SS` in older shapes)."""
    if not raw:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def load_coe_anchor():
    """MRI's cost-of-capital anchor (P3.9, SCR-05) — see score_factors_dual_door.py's
    load_coe_anchor() for the full contract; duplicated here since the two scripts share no
    imports. Returns (anchor_dict_or_None, meta)."""
    path = COST_OF_CAPITAL_ANCHOR_JSON
    if not path.exists():
        return None, {"discount_rate_source": "constant_fallback", "reason": "anchor_missing",
                       "path": None, "asof": None, "age_days": None}
    try:
        anchor = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return None, {"discount_rate_source": "constant_fallback", "reason": f"unparseable:{exc}",
                       "path": str(path), "asof": None, "age_days": None}

    asof_raw = anchor.get("asof")
    parsed = _parse_mri_date(asof_raw)
    now = datetime.now(timezone.utc)
    age_days = (now - parsed).days if parsed is not None else None

    if anchor.get("degraded") is not False:
        return None, {"discount_rate_source": "constant_fallback", "reason": "degraded",
                       "path": str(path), "asof": asof_raw, "age_days": age_days}
    if parsed is None:
        return None, {"discount_rate_source": "constant_fallback", "reason": "asof_missing_or_unparseable",
                       "path": str(path), "asof": asof_raw, "age_days": age_days}
    if parsed > now:
        return None, {"discount_rate_source": "constant_fallback", "reason": "future_dated",
                       "path": str(path), "asof": asof_raw, "age_days": age_days}
    if age_days > COST_OF_CAPITAL_ANCHOR_MAX_AGE_DAYS:
        return None, {"discount_rate_source": "constant_fallback", "reason": f"stale_{age_days}d",
                       "path": str(path), "asof": asof_raw, "age_days": age_days}

    # C6: when anchor lacks risk_free.nominal_10y or implied_erp (or sector loadings path fails),
    # discount_rate_source is "anchor_incomplete_fallback" (not "anchor") with the missing field named
    risk_free = anchor.get("risk_free")
    rf_10y = risk_free.get("nominal_10y") if isinstance(risk_free, dict) else None
    if rf_10y is None or not isinstance(rf_10y, (int, float)):
        return None, {"discount_rate_source": "anchor_incomplete_fallback",
                       "reason": "missing_risk_free.nominal_10y",
                       "missing_field": "risk_free.nominal_10y",
                       "path": str(path), "asof": asof_raw, "age_days": age_days}

    implied_erp = anchor.get("implied_erp")
    if implied_erp is None or not isinstance(implied_erp, (int, float)):
        return None, {"discount_rate_source": "anchor_incomplete_fallback",
                       "reason": "missing_implied_erp",
                       "missing_field": "implied_erp",
                       "path": str(path), "asof": asof_raw, "age_days": age_days}

    sector_loadings = anchor.get("sector_loadings")
    if not isinstance(sector_loadings, dict) or not sector_loadings:
        return None, {"discount_rate_source": "anchor_incomplete_fallback",
                       "reason": "missing_sector_loadings",
                       "missing_field": "sector_loadings",
                       "path": str(path), "asof": asof_raw, "age_days": age_days}

    return anchor, {"discount_rate_source": "anchor", "reason": "ok",
                     "path": str(path), "asof": asof_raw, "age_days": age_days}


def resolve_coe_pct(anchor, mgi_subindustry_id, sector, fallback_pct):
    """Per-name cost of equity (%), P3.9: risk_free.nominal_10y + sector_loading *
    implied_erp. sector_loadings tries the finer mgi_subindustry_id first, then the coarser
    GICS_TO_MACRO_ID id, then defaults to a loading of 1.0 with a "coe_default_loading" flag.
    anchor is None (unusable) -> fallback_pct unchanged, no flag."""
    if anchor is None:
        return fallback_pct, None
    risk_free = (anchor.get("risk_free") or {}).get("nominal_10y")
    implied_erp = anchor.get("implied_erp")
    sector_loadings = anchor.get("sector_loadings") or {}
    if risk_free is None or implied_erp is None:
        return fallback_pct, None

    loading = sector_loadings.get(mgi_subindustry_id) if mgi_subindustry_id else None
    if loading is None:
        loading = sector_loadings.get(GICS_TO_MACRO_ID.get(sector))
    flag = None
    if loading is None:
        loading = 1.0
        flag = "coe_default_loading"
    return (risk_free + loading * implied_erp) * 100.0, flag


def verdict_line(gap_pts):
    if gap_pts is None:
        return "No growth evidence to compare against — judge the implied rate on its own."
    if gap_pts > 10:
        return f"Price demands ~{gap_pts:+.0f}pts MORE growth than demonstrated — must believe in acceleration."
    if gap_pts > 5:
        return f"Price assumes modest acceleration ({gap_pts:+.0f}pts above demonstrated)."
    if gap_pts >= -5:
        return "Priced roughly in line with demonstrated growth."
    return f"Priced {abs(gap_pts):.0f}pts BELOW demonstrated growth — market expects deceleration."


def main():
    stocks = {s["symbol"]: s for s in load_json(STOCKS_JSON, []) if s.get("symbol")}
    factor = (load_json(FACTOR_SCORES_JSON, {}) or {}).get("tickers", {})
    fundamentals = (load_json(FUNDAMENTALS_HISTORY_JSON, {}) or {}).get("tickers", {})
    eps_traj = load_json(EPS_TRAJECTORY_JSON, {}) or {}
    eps_traj = eps_traj.get("tickers", eps_traj) if isinstance(eps_traj, dict) else {}
    wacc_table = (load_json(REVERSE_CONFIG_JSON, {}) or {}).get("sector_wacc", {})

    # P3.9 (SCR-05): the reverse-DCF discount rate — MRI cost-of-capital anchor when fresh and
    # non-degraded, else the current sector_wacc table (unchanged; also used by score_reverse.py's
    # ROIC call sites, so that table itself is never touched here).
    coe_anchor, coe_anchor_meta = load_coe_anchor()
    print(f"Cost-of-capital anchor: {coe_anchor_meta['discount_rate_source']} "
          f"(reason={coe_anchor_meta['reason']}, asof={coe_anchor_meta['asof']}, "
          f"age_days={coe_anchor_meta['age_days']})")
    if coe_anchor is None:
        print(f"  WARNING: reverse-DCF discount rate falling back to the sector_wacc constants "
              f"— MRI cost-of-capital anchor unavailable ({coe_anchor_meta['reason']}).")

    eligible = sorted(t for t, e in factor.items() if e.get("fct_band") in ELIGIBLE_BANDS)
    models = {}
    modeled = 0
    skipped = {}

    for t in eligible:
        stock = stocks.get(t) or {}
        mcap = num(stock.get("marketCap"))
        sector = stock.get("sector") or "Unknown"
        fallback_wacc_pct = wacc_table.get(SECTOR_ALIASES.get(sector, sector), DEFAULT_WACC)
        mgi_subindustry_id = get_taxonomy_profile(stock.get("industry"), sector)["mgi_subindustry_id"]
        wacc_pct, coe_flag = resolve_coe_pct(coe_anchor, mgi_subindustry_id, sector, fallback_wacc_pct)
        wacc = wacc_pct / 100.0

        ydata = fundamentals.get(t)
        if not ydata:
            skipped["no_fundamentals"] = skipped.get("no_fundamentals", 0) + 1
            models[t] = {"implied_growth": None, "reason": "no_fundamentals"}
            continue
        years = sorted(int(y) for y in ydata.keys())
        fy = ydata[str(years[-1])]
        ni, da, capex = num(fy.get("net_income")), num(fy.get("da")), num(fy.get("capex"))
        owner = (ni + da - capex) if None not in (ni, da, capex) else None
        fcf = num(fy.get("fcf"))
        # Prefer owner earnings; fall back to FCF when owner earnings are
        # negative/missing but cash generation is real (one-off charges,
        # non-cash writedowns depress NI without killing the cash stream).
        ocf = num(fy.get("ocf"))
        if owner is not None and owner > 0:
            base_cf, base_kind = owner, "owner_earnings"
        elif fcf is not None and fcf > 0:
            base_cf, base_kind = fcf, "fcf_fallback"
        elif capex is None and None not in (ocf, da) and (ocf - da) > 0:
            # capex tag missing entirely: steady-state proxy capex ~= D&A.
            # Conservative for asset-light names; assumption recorded.
            base_cf, base_kind = ocf - da, "ocf_minus_da_proxy"
        else:
            base_cf, base_kind = (owner if owner is not None else fcf), "none"
        if base_cf is None or base_cf <= 0:
            skipped["negative_base_cash_flow"] = skipped.get("negative_base_cash_flow", 0) + 1
            models[t] = {"implied_growth": None, "reason": "negative_base_cash_flow"}
            continue
        if not mcap or mcap <= 0:
            skipped["no_market_cap"] = skipped.get("no_market_cap", 0) + 1
            models[t] = {"implied_growth": None, "reason": "no_market_cap"}
            continue

        implied = solve_implied_growth(base_cf, mcap, wacc)
        if implied is None:
            skipped["solver_failed"] = skipped.get("solver_failed", 0) + 1
            models[t] = {"implied_growth": None, "reason": "solver_failed"}
            continue

        rev_cagr, fcf_cagr = growth_evidence(ydata)
        slope = num((eps_traj.get(t) or {}).get("trajectory_slope"))

        # P3.9 (SCR-05): gap on one basis — implied growth vs. the demonstrated 5-year CAGR of
        # the owner-earnings base itself; only when that's undefined (negative base, too few
        # points) does the comparison fall back to the revenue CAGR.
        owner_cf_cagr = owner_cf_cagr_5y(ydata)
        if owner_cf_cagr is not None:
            used_cagr, gap_basis = owner_cf_cagr, "owner_cf"
        elif rev_cagr is not None:
            used_cagr, gap_basis = rev_cagr, "revenue_fallback"
        else:
            used_cagr, gap_basis = None, None
        gap_pts = (implied - used_cagr) * 100 if used_cagr is not None else None

        models[t] = {
            "implied_growth": round(implied, 4),
            "implied_growth_clamped": implied in (G_LO, G_HI),
            "hist_revenue_cagr_5y": round(rev_cagr, 4) if rev_cagr is not None else None,
            "hist_fcf_cagr_5y": round(fcf_cagr, 4) if fcf_cagr is not None else None,
            "hist_owner_cf_cagr_5y": round(owner_cf_cagr, 4) if owner_cf_cagr is not None else None,
            "gap_basis": gap_basis,
            "trajectory_slope": slope,
            "expectations_gap_pts": round(gap_pts, 1) if gap_pts is not None else None,
            "verdict": verdict_line(gap_pts),
            "assumptions": {
                "base_cf": round(base_cf),
                "base_cf_kind": base_kind,
                "fiscal_year": years[-1],
                "wacc": wacc_pct,
                "discount_rate_source": coe_anchor_meta["discount_rate_source"],
                "coe_default_loading": coe_flag == "coe_default_loading",
                "terminal_growth": TERMINAL_GROWTH,
                "stage1_years": STAGE1_YEARS,
                "fade_years": FADE_YEARS,
                "market_cap": round(mcap),
            },
        }
        modeled += 1

    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "disclaimer": ("Reverse-DCF expectations models, not price targets. The implied "
                       "growth rate is what the CURRENT price requires under the stated "
                       "assumptions; the gap vs demonstrated growth is the conversation starter."),
        "eligible_count": len(eligible),
        "modeled_count": modeled,
        "skipped_counts": skipped,
        # P3.9 (SCR-05): "anchor" or "constant_fallback", stamped loudly alongside each row's
        # assumptions.discount_rate_source above.
        "discount_rate_source": coe_anchor_meta["discount_rate_source"],
        "discount_rate_meta": coe_anchor_meta,
        "tickers": models,
    }
    OUT_JSON.write_text(json.dumps(payload, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Valuation models: {modeled}/{len(eligible)} modeled | skipped {skipped}")
    print(f"Written: {OUT_JSON.name}")


if __name__ == "__main__":
    main()

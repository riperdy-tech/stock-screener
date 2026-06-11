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

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"
STOCKS_JSON = DATA / "stocks.json"
FACTOR_SCORES_JSON = DATA / "factor_scores.json"
FUNDAMENTALS_HISTORY_JSON = DATA / "fundamentals_history.json"
EPS_TRAJECTORY_JSON = DATA / "eps_trajectory.json"
REVERSE_CONFIG_JSON = Path(__file__).resolve().with_name("reverse_config.json")
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

    eligible = sorted(t for t, e in factor.items() if e.get("fct_band") in ELIGIBLE_BANDS)
    models = {}
    modeled = 0
    skipped = {}

    for t in eligible:
        stock = stocks.get(t) or {}
        mcap = num(stock.get("marketCap"))
        sector = stock.get("sector") or "Unknown"
        wacc_pct = wacc_table.get(SECTOR_ALIASES.get(sector, sector), DEFAULT_WACC)
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
        gap_pts = (implied - rev_cagr) * 100 if rev_cagr is not None else None

        models[t] = {
            "implied_growth": round(implied, 4),
            "implied_growth_clamped": implied in (G_LO, G_HI),
            "hist_revenue_cagr_5y": round(rev_cagr, 4) if rev_cagr is not None else None,
            "hist_fcf_cagr_5y": round(fcf_cagr, 4) if fcf_cagr is not None else None,
            "trajectory_slope": slope,
            "expectations_gap_pts": round(gap_pts, 1) if gap_pts is not None else None,
            "verdict": verdict_line(gap_pts),
            "assumptions": {
                "base_cf": round(base_cf),
                "base_cf_kind": base_kind,
                "fiscal_year": years[-1],
                "wacc": wacc_pct,
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
        "tickers": models,
    }
    OUT_JSON.write_text(json.dumps(payload, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Valuation models: {modeled}/{len(eligible)} modeled | skipped {skipped}")
    print(f"Written: {OUT_JSON.name}")


if __name__ == "__main__":
    main()

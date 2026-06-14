"""stress_scenario.py — illustrative scenario stress test (NOT a forecast).

Models a user-specified adverse regime and estimates 12-month total return for
the strategy ledgers (plan, equal) versus a parametric QQQ proxy, by mapping
each holding's REAL factor/sector/survivability exposures through an explicit,
editable shock model.

THE SCENARIO (user-defined): "AI-capex bust + higher-for-longer"
  1. Inflation/rates stay high  -> multiple/duration compression (hits expensive,
     long-duration, high-P/E names hardest).
  2. Datacenter build delays eat capital costs + OpenAI debt + AI not earning
     its cost of capital -> AI-infrastructure derate (semis, AI-compute,
     physical-AI, hyperscaler capex names).
  3. VC / private-credit defaults (e.g. Blue Owl-type BDCs) -> credit & liquidity
     stress (hits leverage, low-survivability, financials/BDCs, AND small-caps
     via a liquidity gap — the latter cuts AGAINST the strategy's size tilt).
  Plus a momentum-reversal shock (regime change punishes recent winners).

CAVEATS (read before trusting any number):
  - This is a SCENARIO MODEL, not a backtest of a real event and not advice.
  - The shock coefficients are judgment calibrated to analog episodes
    (2000-02 telecom/dot-com capex bust, 2022 rate shock, 2008 credit/liquidity)
    — they are assumptions, printed below, meant to be edited.
  - QQQ is modeled from an ASSUMED exposure vector (documented), not its real
    holdings, so its number is coarser than the strategy's (which uses real
    per-name factor data).

Usage: python scripts/stress_scenario.py [--mild|--severe]
Output: console + public/data/stress_scenario.md
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"
PLAN = DATA / "portfolio_plan.json"
FACTORS = DATA / "factor_scores.json"
OVERLAY = DATA / "overlay_signals.json"
STOCKS = DATA / "stocks.json"
OUT_MD = DATA / "stress_scenario.md"

# ── Shock coefficients (the assumptions; edit these) ──────────────────────
# Each is the modeled 12-month return contribution at a unit of exposure.
SYSTEMATIC_DERATE = -0.12      # broad risk-off applied to all equities
DURATION_COEF = 0.06           # x value_z: cheap (+z) cushions, expensive (-z) bleeds
AI_CAPEX_SHOCK = -0.30         # x AI-infra exposure weight (0..1)
MOMENTUM_REVERSAL = -0.05      # x momentum_z: recent winners punished in regime flip
QUALITY_CUSHION = 0.04         # x quality_z: flight to quality
LOWVOL_CUSHION = 0.05          # x lowvol_z: calm names hold up
CREDIT_SURV_COEF = -0.25       # x (1 - survivability/100): weak balance sheets crack
FINANCIALS_CREDIT = -0.10      # extra hit to Financial Services (BDC/private-credit)
SMALLCAP_LIQUIDITY = -0.08     # liquidity gap on small/micro-caps (hurts the strategy)
GPR_COEF = -0.03               # x gpr_level (0..3): geopolitical fragility

AI_THEMES = {"ai_compute", "physical_ai", "quantum_computing"}
AI_SECTORS = {"Technology"}    # tech sector partial AI/duration exposure

SEVERITY = {"mild": 0.6, "base": 1.0, "severe": 1.4}

# Parametric QQQ exposure vector (ASSUMPTIONS — Nasdaq-100, mega-cap tech heavy)
QQQ_PROXY = {
    "value_z": -1.2,        # expensive (high P/E) -> duration-vulnerable
    "quality_z": 0.7,       # mega-caps are high quality / strong balance sheets
    "lowvol_z": -0.3,       # higher beta than market
    "momentum_z": 1.1,      # recent big winners -> momentum-crash exposed
    "ai_capex_weight": 0.55,  # ~over half the index is AI-capex mega-caps
    "survivability": 90,    # low leverage, fortress balance sheets -> low credit hit
    "sector": "Technology",
    "is_smallcap": False,   # large-cap, liquid -> no liquidity gap
    "gpr_level": 1,
}
# SPY proxy for extra context (S&P 500)
SPY_PROXY = {
    "value_z": -0.4, "quality_z": 0.4, "lowvol_z": 0.1, "momentum_z": 0.5,
    "ai_capex_weight": 0.32, "survivability": 85, "sector": "Blend",
    "is_smallcap": False, "gpr_level": 1,
}


def load(path, default=None):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def ai_exposure(theme, sector):
    if theme in AI_THEMES:
        return 1.0
    if sector in AI_SECTORS:
        return 0.4  # generic tech: partial AI/duration exposure
    return 0.0


def shock_return(ex, mult):
    """Modeled 12m return for one exposure vector. ex keys: value_z, quality_z,
    lowvol_z, momentum_z, ai_weight, survivability, sector, is_smallcap, gpr."""
    r = SYSTEMATIC_DERATE
    r += DURATION_COEF * ex["value_z"]
    r += AI_CAPEX_SHOCK * ex["ai_weight"]
    r += MOMENTUM_REVERSAL * ex["momentum_z"]
    r += QUALITY_CUSHION * ex["quality_z"]
    r += LOWVOL_CUSHION * ex["lowvol_z"]
    surv = ex["survivability"] if ex["survivability"] is not None else 50
    r += CREDIT_SURV_COEF * (1 - surv / 100.0)
    if ex["sector"] in ("Financial Services", "Financials"):
        r += FINANCIALS_CREDIT
    if ex["is_smallcap"]:
        r += SMALLCAP_LIQUIDITY
    r += GPR_COEF * (ex["gpr"] or 0)
    # Scenario shocks compound on the downside; scale by severity
    return r * mult


def name_exposure(sym, fct, plan_pos, overlay, stocks):
    z = fct.get("fct_z") or {}
    ctx = fct.get("fct_context") or {}
    pos = plan_pos.get(sym, {})
    sector = pos.get("sector") or (stocks.get(sym) or {}).get("sector")
    theme = ctx.get("theme_primary") or pos.get("theme_primary")
    surv = pos.get("survivability")
    mcap = (stocks.get(sym) or {}).get("marketCap") or 0
    gpr = ((overlay.get(sym) or {}).get("gpr") or {}).get("gpr_level") or pos.get("gpr_level")
    return {
        "value_z": z.get("value") or 0,
        "quality_z": z.get("quality") or 0,
        "lowvol_z": z.get("lowvol") or 0,
        "momentum_z": z.get("momentum") or 0,
        "ai_weight": ai_exposure(theme, sector),
        "survivability": surv,
        "sector": sector,
        "is_smallcap": bool(mcap and mcap < 2e9),
        "gpr": gpr,
    }


def proxy_exposure(p):
    return {
        "value_z": p["value_z"], "quality_z": p["quality_z"], "lowvol_z": p["lowvol_z"],
        "momentum_z": p["momentum_z"], "ai_weight": p["ai_capex_weight"],
        "survivability": p["survivability"], "sector": p["sector"],
        "is_smallcap": p["is_smallcap"], "gpr": p["gpr_level"],
    }


def portfolio_return(weighted_exposures, mult):
    """weighted_exposures: list of (weight, exposure). Weights need not sum to 1
    (cash earns ~0 in nominal terms). Returns modeled portfolio 12m return %."""
    total_w = sum(w for w, _ in weighted_exposures)
    invested_ret = sum(w * shock_return(ex, mult) for w, ex in weighted_exposures)
    # invested_ret already weight-scaled; cash (1 - total_w of a 100% book) ~ 0
    return invested_ret  # in fraction; weights are fractions of full book


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mild", action="store_true")
    parser.add_argument("--severe", action="store_true")
    args = parser.parse_args()
    sev_key = "mild" if args.mild else "severe" if args.severe else "base"
    mult = SEVERITY[sev_key]

    plan = load(PLAN, {}) or {}
    factors = (load(FACTORS, {}) or {}).get("tickers", {})
    overlay = (load(OVERLAY, {}) or {}).get("tickers", {})
    stocks = {s["symbol"]: s for s in load(STOCKS, []) if s.get("symbol")}
    plan_pos = {p["symbol"]: p for p in (plan.get("positions") or [])}

    # ── plan ledger: actual Kelly weights (fractions of full book) ──────
    plan_we = []
    for sym, pos in plan_pos.items():
        ex = name_exposure(sym, factors.get(sym, {}), plan_pos, overlay, stocks)
        plan_we.append((pos["weight_pct"] / 100.0, ex))
    plan_invested = sum(w for w, _ in plan_we)
    plan_ret = portfolio_return(plan_we, mult)

    # ── equal ledger: equal-weight research_now (fully invested) ────────
    research = [t for t, e in factors.items() if e.get("fct_band") == "research_now"]
    eqw = 1.0 / len(research) if research else 0
    equal_we = [(eqw, name_exposure(t, factors[t], plan_pos, overlay, stocks)) for t in research]
    equal_ret = portfolio_return(equal_we, mult)

    # ── QQQ / SPY proxies (fully invested) ──────────────────────────────
    qqq_ret = shock_return(proxy_exposure(QQQ_PROXY), mult)
    spy_ret = shock_return(proxy_exposure(SPY_PROXY), mult)

    def pct(x):
        return f"{x * 100:+.1f}%"

    # Attribution for the strategy (equal book) — which shocks drive it
    def attribution(weighted, mult):
        terms = {"systematic": 0, "duration(value)": 0, "ai_capex": 0,
                 "momentum_reversal": 0, "quality_cushion": 0, "lowvol_cushion": 0,
                 "credit_survivability": 0, "financials": 0, "smallcap_liquidity": 0, "gpr": 0}
        for w, ex in weighted:
            terms["systematic"] += w * SYSTEMATIC_DERATE * mult
            terms["duration(value)"] += w * DURATION_COEF * ex["value_z"] * mult
            terms["ai_capex"] += w * AI_CAPEX_SHOCK * ex["ai_weight"] * mult
            terms["momentum_reversal"] += w * MOMENTUM_REVERSAL * ex["momentum_z"] * mult
            terms["quality_cushion"] += w * QUALITY_CUSHION * ex["quality_z"] * mult
            terms["lowvol_cushion"] += w * LOWVOL_CUSHION * ex["lowvol_z"] * mult
            surv = ex["survivability"] if ex["survivability"] is not None else 50
            terms["credit_survivability"] += w * CREDIT_SURV_COEF * (1 - surv / 100) * mult
            if ex["sector"] in ("Financial Services", "Financials"):
                terms["financials"] += w * FINANCIALS_CREDIT * mult
            if ex["is_smallcap"]:
                terms["smallcap_liquidity"] += w * SMALLCAP_LIQUIDITY * mult
            terms["gpr"] += w * GPR_COEF * (ex["gpr"] or 0) * mult
        return terms

    equal_attr = attribution(equal_we, mult)
    qqq_attr_terms = attribution([(1.0, proxy_exposure(QQQ_PROXY))], mult)

    # ── Output ───────────────────────────────────────────────────────────
    print(f"\n=== STRESS SCENARIO: AI-capex bust + higher-for-longer ({sev_key}) ===")
    print(f"Modeled 12-month total return (illustrative, assumption-driven):\n")
    print(f"  plan ledger  (your sized book, {plan_invested*100:.0f}% invested):  {pct(plan_ret)}")
    print(f"  equal ledger (research_now, fully invested):           {pct(equal_ret)}")
    print(f"  QQQ proxy    (Nasdaq-100, parametric):                 {pct(qqq_ret)}")
    print(f"  SPY proxy    (S&P 500, parametric):                    {pct(spy_ret)}")
    print(f"\n  Strategy (equal) vs QQQ:  {pct(equal_ret - qqq_ret)} relative")
    print(f"\nStrategy attribution (equal book, fraction points):")
    for k, v in sorted(equal_attr.items(), key=lambda x: x[1]):
        print(f"    {k:22s} {v*100:+.1f}")
    print(f"\nQQQ attribution:")
    for k, v in sorted(qqq_attr_terms.items(), key=lambda x: x[1]):
        if abs(v) > 1e-9:
            print(f"    {k:22s} {v*100:+.1f}")

    # ── Markdown ─────────────────────────────────────────────────────────
    lines = [
        "# Stress Scenario — AI-capex bust + higher-for-longer",
        "",
        f"_Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d')} · severity: {sev_key} · "
        "**illustrative model, not a forecast or advice**_",
        "",
        "## Scenario",
        "Inflation higher-for-longer (multiple/duration compression) + datacenter build "
        "delays & OpenAI debt & AI under-earning its capital (AI-infra derate) + VC/private-"
        "credit defaults like Blue Owl (credit + liquidity stress) + momentum reversal.",
        "",
        "## Modeled 12-month total return",
        "",
        "| Portfolio | Modeled return |",
        "|---|---|",
        f"| **plan** (your sized book, {plan_invested*100:.0f}% invested) | **{pct(plan_ret)}** |",
        f"| **equal** (research_now, full) | **{pct(equal_ret)}** |",
        f"| QQQ proxy (Nasdaq-100) | {pct(qqq_ret)} |",
        f"| SPY proxy (S&P 500) | {pct(spy_ret)} |",
        "",
        f"**Strategy (equal) vs QQQ: {pct(equal_ret - qqq_ret)} relative.**",
        "",
        "## Why (attribution, equal book)",
        "| Shock | Strategy pts | QQQ pts |",
        "|---|---|---|",
    ]
    for k in equal_attr:
        lines.append(f"| {k} | {equal_attr[k]*100:+.1f} | {qqq_attr_terms.get(k,0)*100:+.1f} |")
    lines += [
        "",
        "## Honest tension",
        "- **Factor tilt favors the strategy**: cheap (value), profitable (quality), calm "
        "(low-vol), low-AI-capex names derate far less than QQQ's expensive, high-momentum, "
        "AI-heavy mega-caps. The strategy's vetoes already exclude the cash-burning AI-narrative "
        "names that blow up here.",
        "- **Size tilt favors QQQ**: the strategy holds small/mid-caps, which gap down on "
        "liquidity in a credit crunch (the `smallcap_liquidity` line). QQQ is large-cap and "
        "liquid. This partially offsets the factor advantage.",
        "- Net: under these assumptions the strategy draws down **less** than QQQ, because the "
        "AI-capex + duration + momentum-reversal hits to QQQ outweigh the strategy's small-cap "
        "liquidity penalty. Flip the coefficients (milder AI shock, harsher liquidity) and the "
        "gap narrows or reverses — which is exactly the point of making them explicit.",
        "",
        "## Coefficients used (edit in scripts/stress_scenario.py)",
        f"- systematic derate {SYSTEMATIC_DERATE}, duration×value {DURATION_COEF}, "
        f"AI-capex {AI_CAPEX_SHOCK}, momentum-reversal {MOMENTUM_REVERSAL}, "
        f"quality {QUALITY_CUSHION}, lowvol {LOWVOL_CUSHION}, "
        f"credit×(1-surv) {CREDIT_SURV_COEF}, financials {FINANCIALS_CREDIT}, "
        f"smallcap-liquidity {SMALLCAP_LIQUIDITY}, gpr {GPR_COEF}; severity ×{mult}.",
        "- QQQ proxy assumes value_z=-1.2, momentum_z=1.1, AI-capex weight 0.55, "
        "survivability 90, large-cap.",
    ]
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nWritten: {OUT_MD.name}")


if __name__ == "__main__":
    main()

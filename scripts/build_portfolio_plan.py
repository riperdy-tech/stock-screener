"""build_portfolio_plan.py — decision-support portfolio plan (v1).

Turns the reverse engine's nominated list into a sized, capped, exit-ruled
candidate plan — the layer the audit found missing between "ranked lists"
and "an investable decision". This is DECISION SUPPORT, not execution:
no orders, no broker, human judgment required on every name.

Sizing logic (config-overridable in portfolio_config.json):
  weight_i = base_position_pct
             x survivability scaling (rev_survivability / 100)
             x risk-class haircut (archetype E/F or micro-cap -> high_risk)
             x macro de-risk (>= macro_derisk_flag_count flags -> halve)
  then sector (<=25%) and theme (<=30%) caps applied greedily by rank,
  with a cash floor as the residual.

Exit/review triggers armed per position (reported, not auto-executed):
  - economics gate falls to 0 or reverse band drops to Reject
  - any forensic flag fires (M_SCORE_ELEVATED / F_SCORE_WEAK / ACCRUALS_HIGH / HEAVY_ISSUANCE)
  - score age exceeds 90 days without a chain re-run (engine rule 15)

Usage:
    python scripts/build_portfolio_plan.py
Outputs:
    public/data/portfolio_plan.json
    public/data/portfolio_report.md
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
DATA = ROOT / "public" / "data"
STOCKS_JSON = DATA / "stocks.json"
REVERSE_SCORES_JSON = DATA / "reverse_scores.json"
PARADIGM_SCORES_JSON = DATA / "paradigm_scores.json"
FACTOR_SCORES_JSON = DATA / "factor_scores.json"
VALUATION_MODELS_JSON = DATA / "valuation_models.json"
OVERLAY_SIGNALS_JSON = DATA / "overlay_signals.json"
BATTERY_JSON = DATA / "fundamentals_battery.json"
MACRO_STATE_JSON = DATA / "macro_state.json"
CONFIG_JSON = Path(__file__).resolve().with_name("portfolio_config.json")
PLAN_JSON = DATA / "portfolio_plan.json"
REPORT_MD = DATA / "portfolio_report.md"

FORENSIC_FLAGS = ("M_SCORE_ELEVATED", "F_SCORE_WEAK", "ACCRUALS_HIGH", "HEAVY_ISSUANCE")

DEFAULT_CONFIG = {
    "base_position_pct": 3.0,
    "high_risk_position_pct": 1.5,
    "high_risk_archetypes": ["E", "F"],
    "high_risk_mcap_below": 300_000_000,
    "min_position_pct": 0.75,
    "sector_cap_pct": 25.0,
    "theme_cap_pct": 30.0,
    "max_invested_pct": 90.0,
    "macro_derisk_flag_count": 2,
    "macro_derisk_multiplier": 0.5,
    "kelly_fraction": 0.25,
    "kelly_gap_horizon_years": 3.0,
    "kelly_mu_cap": 0.15,
    "kelly_sigma_floor": 0.15,
    "kelly_position_cap_pct": 5.0,
    "quality_sleeve_position_pct": 2.5,
    "quality_sleeve_max_pct": 35.0,
    "quality_sleeve_max_names": 15,
    "_note": ("v1 defaults from the June 2026 audit. Edit and re-run; the plan "
              "is deterministic from inputs + this config."),
}


def load_json(path, default=None):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def main():
    config = load_json(CONFIG_JSON, None)
    if config is None:
        CONFIG_JSON.write_text(json.dumps(DEFAULT_CONFIG, indent=2) + "\n", encoding="utf-8")
        config = dict(DEFAULT_CONFIG)
        print(f"Wrote default {CONFIG_JSON.name}")
    # Backfill any keys added after the user's config file was written
    for key, value in DEFAULT_CONFIG.items():
        config.setdefault(key, value)

    stocks = {s["symbol"]: s for s in load_json(STOCKS_JSON, []) if s.get("symbol")}
    reverse = load_json(REVERSE_SCORES_JSON, {})
    paradigm = load_json(PARADIGM_SCORES_JSON, {})
    battery = (load_json(BATTERY_JSON, {}) or {}).get("tickers", {})
    factor = (load_json(FACTOR_SCORES_JSON, {}) or {}).get("tickers", {})
    valuations = (load_json(VALUATION_MODELS_JSON, {}) or {}).get("tickers", {})
    overlay = (load_json(OVERLAY_SIGNALS_JSON, {}) or {}).get("tickers", {})
    macro = load_json(MACRO_STATE_JSON, {}) or {}
    macro_flags = macro.get("triggered_flags", []) or []

    # --llm : build the PARALLEL LLM-overlay variant (candidates from fct_band_llm, conviction
    # sizing, LLM veto) into portfolio_plan_llm.json — for baseline-vs-LLM A/B. Without the flag
    # this is the pristine baseline (fct_band only), byte-identical to before.
    LLM = "--llm" in sys.argv
    band_field = "fct_band_llm" if LLM else "fct_band"
    out_plan = (DATA / "portfolio_plan_llm.json") if LLM else PLAN_JSON
    out_report = (DATA / "portfolio_report_llm.md") if LLM else REPORT_MD

    # Candidate list = Factor Lab research_now (Stage 1 of the funnel produces
    # the nomination list per the ecosystem doc). Reverse-engine data rides
    # along for haircuts/fallback/exit triggers; rev_nominated becomes a
    # confirmation chip rather than the source.
    nominated = [(sym, reverse.get(sym) or {}) for sym, e in factor.items()
                 if (e.get(band_field) or e.get("fct_band")) == "research_now"
                 and not (LLM and e.get("fct_llm_veto") == "llm_reject")]   # LLM AVOID/SELL excluded (LLM variant only)
    nominated.sort(key=lambda x: ((factor.get(x[0]) or {}).get("fct_rank") or 10**9))

    macro_derisk = len(macro_flags) >= config["macro_derisk_flag_count"]
    derisk_mult = config["macro_derisk_multiplier"] if macro_derisk else 1.0

    sector_alloc = {}
    theme_alloc = {}
    invested = 0.0
    positions = []
    skipped = []

    for sym, rv in nominated:
        stock = stocks.get(sym, {})
        pdm = paradigm.get(sym, {}) or {}
        bat = battery.get(sym, {}) or {}
        sector = stock.get("sector") or "Unknown"
        theme = pdm.get("pdm_theme_primary")
        archetype = rv.get("rev_archetype")
        mcap = stock.get("marketCap") or 0
        surv = rv.get("rev_survivability")
        flags = (rv.get("rev_flags") or "")
        forensic_fired = [f for f in FORENSIC_FLAGS if f in flags]

        high_risk = (archetype in config["high_risk_archetypes"]
                     or (mcap and mcap < config["high_risk_mcap_below"]))

        # ── Sizing: quarter-Kelly when an expectations model exists ──────
        # mu = expected annual excess return if the expectations gap closes
        # over ~3 years (only NEGATIVE gaps — priced below demonstrated
        # growth — count as edge). f = 0.25 * mu / sigma^2, capped.
        # Mirrored client-side in lib/kelly.ts — keep both in sync.
        fct = factor.get(sym) or {}
        vm = valuations.get(sym) or {}
        gap = vm.get("expectations_gap_pts")
        sigma = fct.get("fct_vol")
        # An RS2-reviewed name in the LLM variant: if quant Kelly sees no gap-edge, fall through to
        # the heuristic base size (scaled by LLM conviction below) instead of skipping — otherwise
        # the LLM plan silently reverts to quant's view and the A/B never expresses RS2's picks.
        # Kelly itself stays quant-owned (RS2 is a single-stock analyst, not a sizing engine).
        llm_pick = LLM and isinstance(((fct.get("fct_llm_verdict") or {}).get("conviction")), (int, float))
        if gap is not None and isinstance(sigma, (int, float)) and sigma > 0 \
                and not (llm_pick and gap >= 0):
            mu = max(0.0, min(config["kelly_mu_cap"], -gap / 100.0 / config["kelly_gap_horizon_years"]))
            sigma_f = max(sigma, config["kelly_sigma_floor"])
            weight = min(config["kelly_position_cap_pct"],
                         100 * config["kelly_fraction"] * mu / (sigma_f ** 2))
            sizing_method = "quarter_kelly"
            if mu == 0.0:
                skipped.append({"symbol": sym,
                                "reason": f"no Kelly edge (expectations gap {gap:+.0f}pts >= 0: price already assumes more growth than demonstrated)"})
                continue
        else:
            base = config["high_risk_position_pct"] if high_risk else config["base_position_pct"]
            surv_scale = (surv / 100.0) if isinstance(surv, (int, float)) else 0.5
            weight = base * max(0.3, surv_scale)
            sizing_method = "heuristic_llm_pick" if (llm_pick and gap is not None and gap >= 0) else "heuristic"

        weight *= derisk_mult
        # Forensic flags halve size rather than auto-exclude (flags, not vetoes;
        # the human decides after reading the con line).
        if forensic_fired:
            weight *= 0.5

        # ── Stage-4 overlay multipliers (GPR exposure + informed demand) ──
        ov = overlay.get(sym) or {}
        gpr_level = (ov.get("gpr") or {}).get("gpr_level")
        informed = ov.get("informed_demand")
        if gpr_level == 3:
            if gap is None or gap >= 0:
                skipped.append({"symbol": sym,
                                "reason": "GPR level 3 requires a negative expectations gap (extra margin of safety)"})
                continue
            weight *= 0.5
        elif gpr_level == 2:
            weight *= 0.75
        if informed == -1:
            weight *= 0.75

        # ── Stage-5 LLM overlay (LLM variant only): the RS2 deep-dive sizes the position ──
        # Scale by conviction (0.3x at conv<=4 up to 1.0x at conv>=12) and cap at the verdict's
        # own recommended weight. Baseline run is untouched.
        if LLM:
            llmv = (factor.get(sym) or {}).get("fct_llm_verdict") or {}
            lconv = llmv.get("conviction")
            if isinstance(lconv, (int, float)):
                weight *= max(0.3, min(1.0, lconv / 12.0))
                sizing_method += "+llm_conv"
            lrec = llmv.get("recommended_weight_pct")
            if isinstance(lrec, (int, float)) and lrec > 0:
                weight = min(weight, lrec)

        weight = round(weight, 2)

        if weight < config["min_position_pct"]:
            skipped.append({"symbol": sym, "reason": f"sized below minimum ({weight}% < {config['min_position_pct']}%)"})
            continue
        if invested + weight > config["max_invested_pct"]:
            skipped.append({"symbol": sym, "reason": "max invested reached"})
            continue
        if sector_alloc.get(sector, 0) + weight > config["sector_cap_pct"]:
            skipped.append({"symbol": sym, "reason": f"sector cap {sector} ({config['sector_cap_pct']}%)"})
            continue
        if theme and theme_alloc.get(theme, 0) + weight > config["theme_cap_pct"]:
            skipped.append({"symbol": sym, "reason": f"theme cap {theme} ({config['theme_cap_pct']}%)"})
            continue

        sector_alloc[sector] = round(sector_alloc.get(sector, 0) + weight, 2)
        if theme:
            theme_alloc[theme] = round(theme_alloc.get(theme, 0) + weight, 2)
        invested = round(invested + weight, 2)

        positions.append({
            "symbol": sym,
            "weight_pct": weight,
            "rank": fct.get("fct_rank"),
            "rev_nominated": bool(rv.get("rev_nominated")),
            "archetype": archetype,
            "composite": rv.get("rev_composite"),
            "survivability": surv,
            "sector": sector,
            "theme_primary": theme,
            "pdm_band": pdm.get("pdm_band"),
            "pdm_signal": pdm.get("pdm_signal"),
            "fct_composite": fct.get("fct_composite"),
            "fct_rank": fct.get("fct_rank"),
            "fct_band": fct.get("fct_band"),
            "sizing_method": sizing_method,
            "expectations_gap_pts": gap,
            "fct_vol": sigma,
            "gpr_level": gpr_level,
            "informed_demand": informed,
            "high_risk_class": bool(high_risk),
            "forensic_flags": forensic_fired,
            "f_score": bat.get("f_score"),
            "m_score": bat.get("m_score"),
            "accruals_ratio": bat.get("accruals_ratio"),
            "pro": rv.get("rev_pro"),
            "con": rv.get("rev_con"),
            "exit_triggers": [
                "economics gate -> 0 or band -> Reject on any chain run",
                "any forensic flag newly fires",
                "scores older than 90 days (engine rule 15)",
            ],
        })

    cash = round(100.0 - invested, 2)

    # ── plan2: Hybrid = value core + quality sleeve ──────────────────────
    # Same value-gated core, PLUS a sleeve that buys the top-ranked
    # research_now names REGARDLESS of valuation gap (capped), so the book
    # captures expensive quality leaders (TSM, GOOGL, MU...) the Kelly core
    # skips, and deploys idle cash. Sized by survivability, not Kelly (these
    # names have no measured valuation edge — sized for participation, not
    # conviction). Same vetoes, forensic halving, and sector/theme caps.
    def make_sleeve_position(sym, weight):
        rv = reverse.get(sym) or {}
        fct = factor.get(sym) or {}
        bat = battery.get(sym) or {}
        pdm = paradigm.get(sym) or {}
        vm = valuations.get(sym) or {}
        flags = rv.get("rev_flags") or ""
        forensic = [f for f in FORENSIC_FLAGS if f in flags]
        return {
            "symbol": sym, "weight_pct": weight, "rank": fct.get("fct_rank"),
            "rev_nominated": bool(rv.get("rev_nominated")),
            "archetype": rv.get("rev_archetype"), "composite": rv.get("rev_composite"),
            "survivability": rv.get("rev_survivability"),
            "sector": (stocks.get(sym) or {}).get("sector") or "Unknown",
            "theme_primary": pdm.get("pdm_theme_primary"),
            "pdm_band": pdm.get("pdm_band"), "pdm_signal": pdm.get("pdm_signal"),
            "fct_composite": fct.get("fct_composite"), "fct_rank": fct.get("fct_rank"),
            "fct_band": fct.get("fct_band"), "sizing_method": "quality_sleeve",
            "expectations_gap_pts": vm.get("expectations_gap_pts"),
            "fct_vol": fct.get("fct_vol"),
            "gpr_level": ((overlay.get(sym) or {}).get("gpr") or {}).get("gpr_level"),
            "informed_demand": (overlay.get(sym) or {}).get("informed_demand"),
            "high_risk_class": rv.get("rev_archetype") in config["high_risk_archetypes"],
            "forensic_flags": forensic,
            "f_score": bat.get("f_score"), "m_score": bat.get("m_score"),
            "accruals_ratio": bat.get("accruals_ratio"),
            "pro": rv.get("rev_pro"), "con": rv.get("rev_con"),
            "exit_triggers": ["dropped out of research_now band", "any forensic flag newly fires"],
        }

    p2_positions = [dict(p) for p in positions]
    p2_sector = dict(sector_alloc)
    p2_theme = dict(theme_alloc)
    p2_invested = invested
    held = {p["symbol"] for p in positions}
    sleeve_added = 0.0
    sleeve_pos = config["quality_sleeve_position_pct"]
    sleeve_max = config["quality_sleeve_max_pct"]
    ranked = sorted(((fe.get("fct_rank") or 10**9, sym) for sym, fe in factor.items()
                     if (fe.get(band_field) or fe.get("fct_band")) == "research_now"
                     and not (LLM and fe.get("fct_llm_veto") == "llm_reject")), key=lambda x: x[0])
    for _, sym in ranked:
        if sym in held or sleeve_added >= sleeve_max:
            continue
        if len([p for p in p2_positions if p["sizing_method"] == "quality_sleeve"]) >= config["quality_sleeve_max_names"]:
            break
        rv = reverse.get(sym) or {}
        surv = rv.get("rev_survivability")
        surv_scale = (surv / 100.0) if isinstance(surv, (int, float)) else 0.5
        w = round(sleeve_pos * max(0.3, surv_scale) * derisk_mult, 2)
        if "M_SCORE_ELEVATED" in (rv.get("rev_flags") or "") and "ACCRUALS_HIGH" in (rv.get("rev_flags") or ""):
            continue  # forensic pair -> skip even in sleeve
        if any(f in (rv.get("rev_flags") or "") for f in FORENSIC_FLAGS):
            w = round(w * 0.5, 2)
        if w < config["min_position_pct"]:
            continue
        sector = (stocks.get(sym) or {}).get("sector") or "Unknown"
        theme = (paradigm.get(sym) or {}).get("pdm_theme_primary")
        if p2_invested + w > config["max_invested_pct"]:
            continue
        if p2_sector.get(sector, 0) + w > config["sector_cap_pct"]:
            continue
        if theme and p2_theme.get(theme, 0) + w > config["theme_cap_pct"]:
            continue
        p2_sector[sector] = round(p2_sector.get(sector, 0) + w, 2)
        if theme:
            p2_theme[theme] = round(p2_theme.get(theme, 0) + w, 2)
        p2_invested = round(p2_invested + w, 2)
        sleeve_added = round(sleeve_added + w, 2)
        p2_positions.append(make_sleeve_position(sym, w))

    plan2 = {
        "label": "Hybrid (value core + quality sleeve)",
        "invested_pct": p2_invested,
        "cash_pct": round(100.0 - p2_invested, 2),
        "position_count": len(p2_positions),
        "sleeve_pct": round(sleeve_added, 2),
        "sector_allocation": dict(sorted(p2_sector.items(), key=lambda x: -x[1])),
        "theme_allocation": dict(sorted(p2_theme.items(), key=lambda x: -x[1])),
        "positions": p2_positions,
        "note": ("Value core (Kelly, only names priced below demonstrated growth) PLUS a "
                 "quality sleeve buying top-ranked names regardless of valuation gap, capped at "
                 f"{sleeve_max}% of book. Captures expensive quality leaders the core skips."),
    }

    plan = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "disclaimer": ("Decision support only. Not investment advice, not an order list. "
                       "Every position requires human review of the con line and flags."),
        "macro_flags": macro_flags,
        "macro_derisk_active": macro_derisk,
        "variant": "llm" if LLM else "baseline",
        "label": "Value core (Kelly-sized)" + (" — LLM overlay" if LLM else ""),
        "invested_pct": invested,
        "cash_pct": cash,
        "position_count": len(positions),
        "sector_allocation": dict(sorted(sector_alloc.items(), key=lambda x: -x[1])),
        "theme_allocation": dict(sorted(theme_alloc.items(), key=lambda x: -x[1])),
        "positions": positions,
        "skipped": skipped,
        "plan2": plan2,
        "config_used": {k: v for k, v in config.items() if not k.startswith("_")},
    }
    out_plan.write_text(json.dumps(plan, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    # ── Markdown report ──────────────────────────────────────────────────
    lines = ["# Portfolio Plan (v1 — decision support)", "",
             f"Generated: {plan['generated_at']}",
             f"Macro flags: {macro_flags if macro_flags else 'none'}"
             + ("  → **DE-RISK ACTIVE (sizes halved)**" if macro_derisk else ""),
             f"Invested: **{invested}%**  |  Cash: **{cash}%**  |  Positions: {len(positions)}", "",
             "| # | Sym | Wt% | Arch | Comp | Surv | FctRank | FctBand | Theme | PdmBand | F | M | Flags |",
             "|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for p in positions:
        lines.append(
            f"| {p['rank']} | **{p['symbol']}** | {p['weight_pct']} | {p['archetype']} "
            f"| {p['composite']} | {p['survivability']} "
            f"| {p['fct_rank'] if p['fct_rank'] is not None else '-'} | {p['fct_band'] or '-'} "
            f"| {p['theme_primary'] or '-'} "
            f"| {p['pdm_band'] or '-'} | {p['f_score'] if p['f_score'] is not None else '-'} "
            f"| {p['m_score'] if p['m_score'] is not None else '-'} "
            f"| {','.join(p['forensic_flags']) or '-'} |")
    lines += ["", "## Sector allocation",
              *(f"- {s}: {w}%" for s, w in plan["sector_allocation"].items()),
              "", "## Theme allocation",
              *(f"- {t}: {w}%" for t, w in plan["theme_allocation"].items())]
    if skipped:
        lines += ["", "## Skipped (caps/sizing)",
                  *(f"- {s['symbol']}: {s['reason']}" for s in skipped)]
    kelly_n = sum(1 for p in positions if p.get("sizing_method") == "quarter_kelly")
    lines += ["", "## Sizing method",
              f"- Quarter-Kelly: {kelly_n} positions — f = {config['kelly_fraction']} x mu/sigma^2, "
              f"mu = expectations-gap recovery over {config['kelly_gap_horizon_years']:.0f}y (cap {config['kelly_mu_cap']:.0%}), "
              f"sigma floor {config['kelly_sigma_floor']:.0%}, position cap {config['kelly_position_cap_pct']}%.",
              f"- Heuristic fallback: {len(positions) - kelly_n} positions (no expectations model): "
              "base x survivability scaling.",
              "- Overlay multipliers: GPR level 2 -> x0.75, level 3 -> x0.5 + requires negative gap; "
              "informed-demand -1 -> x0.75."]
    lines += ["", "## Standing exit/review triggers (all positions)",
              "- Economics gate falls to 0 or reverse band drops to Reject -> re-underwrite within a week",
              "- A forensic flag newly fires (M/F/accruals/issuance) -> re-underwrite",
              "- Scores older than 90 days -> position is unreviewed, treat as expired (engine rule 15)",
              "", f"_{plan['disclaimer']}_"]
    out_report.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"[{'LLM' if LLM else 'baseline'}] Plan (value core): {len(positions)} positions, {invested}% invested, "
          f"{cash}% cash" + (" [MACRO DE-RISK]" if macro_derisk else ""))
    print(f"           Plan2 (hybrid): {plan2['position_count']} positions, {plan2['invested_pct']}% invested, "
          f"{plan2['cash_pct']}% cash (sleeve {plan2['sleeve_pct']}%)")
    print(f"Written: {out_plan.name}, {out_report.name}")


if __name__ == "__main__":
    main()

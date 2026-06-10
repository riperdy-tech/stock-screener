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

    stocks = {s["symbol"]: s for s in load_json(STOCKS_JSON, []) if s.get("symbol")}
    reverse = load_json(REVERSE_SCORES_JSON, {})
    paradigm = load_json(PARADIGM_SCORES_JSON, {})
    battery = (load_json(BATTERY_JSON, {}) or {}).get("tickers", {})
    macro = load_json(MACRO_STATE_JSON, {}) or {}
    macro_flags = macro.get("triggered_flags", []) or []

    nominated = [(sym, rv) for sym, rv in reverse.items()
                 if isinstance(rv, dict) and rv.get("rev_nominated")]
    nominated.sort(key=lambda x: (x[1].get("rev_rank") or 10**9))

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
        base = config["high_risk_position_pct"] if high_risk else config["base_position_pct"]
        surv_scale = (surv / 100.0) if isinstance(surv, (int, float)) else 0.5
        weight = base * max(0.3, surv_scale) * derisk_mult
        # Forensic flags halve size rather than auto-exclude (flags, not vetoes;
        # the human decides after reading the con line).
        if forensic_fired:
            weight *= 0.5
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
            "rank": rv.get("rev_rank"),
            "archetype": archetype,
            "composite": rv.get("rev_composite"),
            "survivability": surv,
            "sector": sector,
            "theme_primary": theme,
            "pdm_band": pdm.get("pdm_band"),
            "pdm_signal": pdm.get("pdm_signal"),
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
    plan = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "disclaimer": ("Decision support only. Not investment advice, not an order list. "
                       "Every position requires human review of the con line and flags."),
        "macro_flags": macro_flags,
        "macro_derisk_active": macro_derisk,
        "invested_pct": invested,
        "cash_pct": cash,
        "position_count": len(positions),
        "sector_allocation": dict(sorted(sector_alloc.items(), key=lambda x: -x[1])),
        "theme_allocation": dict(sorted(theme_alloc.items(), key=lambda x: -x[1])),
        "positions": positions,
        "skipped": skipped,
        "config_used": {k: v for k, v in config.items() if not k.startswith("_")},
    }
    PLAN_JSON.write_text(json.dumps(plan, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    # ── Markdown report ──────────────────────────────────────────────────
    lines = ["# Portfolio Plan (v1 — decision support)", "",
             f"Generated: {plan['generated_at']}",
             f"Macro flags: {macro_flags if macro_flags else 'none'}"
             + ("  → **DE-RISK ACTIVE (sizes halved)**" if macro_derisk else ""),
             f"Invested: **{invested}%**  |  Cash: **{cash}%**  |  Positions: {len(positions)}", "",
             "| # | Sym | Wt% | Arch | Comp | Surv | Theme | PdmBand | F | M | Flags |",
             "|---|---|---|---|---|---|---|---|---|---|---|"]
    for p in positions:
        lines.append(
            f"| {p['rank']} | **{p['symbol']}** | {p['weight_pct']} | {p['archetype']} "
            f"| {p['composite']} | {p['survivability']} | {p['theme_primary'] or '-'} "
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
    lines += ["", "## Standing exit/review triggers (all positions)",
              "- Economics gate falls to 0 or reverse band drops to Reject -> re-underwrite within a week",
              "- A forensic flag newly fires (M/F/accruals/issuance) -> re-underwrite",
              "- Scores older than 90 days -> position is unreviewed, treat as expired (engine rule 15)",
              "", f"_{plan['disclaimer']}_"]
    REPORT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"Plan: {len(positions)} positions, {invested}% invested, {cash}% cash"
          + (" [MACRO DE-RISK]" if macro_derisk else ""))
    print(f"Written: {PLAN_JSON.name}, {REPORT_MD.name}")


if __name__ == "__main__":
    main()

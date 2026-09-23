"""test_p3_review_b1.py — Regression test for Phase 3 approval review finding B1.

PHASE_3_APPROVAL.md B1: Door-3 names were ranked together with Door-1/2 nominees by
`best_pctl` (score_factors_dual_door.py's old `nominated_pool = sorted(all_nominated_map.keys())`
included Door-3 members before the rank/band step), so a Door-3 name whose `best_pctl` beat the
tail of the book could push a genuine Door-1/2 nominee out of its band. `band_counts` was also
overstated because of overlap between rn_set and wl_set caused by the same mixing.

The fix: Door 1/2 are ranked and banded on their OWN nomination (captured before Door 3 is
merged in) — exactly as if Door 3 did not exist. Door 3's bands are then added on top as extra
slots, never displacing a Door-1/2 name, and rn_set/wl_set are kept disjoint.

This test runs the REAL sifter (main(), via scripts/tools/dual_door_diff.py's run_sifter
harness) on a synthetic data dir — not a re-implementation of the ranking/banding logic — for
both the last commit before this fix (54edeb317d, the approval review's reviewed baseline) and
the current working tree, and shows the fix actually changes the outcome the approval review
measured: legitimate Door-1/2 nominees that the old code silently dropped are back in the book,
and the published band_counts equal the real row counts.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parent
TOOLS_DIR = SCRIPTS_DIR / "tools"
for p in (str(SCRIPTS_DIR), str(TOOLS_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

from dual_door_diff import (  # noqa: E402
    load_sifter_module,
    run_sifter,
    get_git_file_content,
    ROOT,
    DEFAULT_SIFTER_PATH,
)

# The commit immediately before the B1/C1/B3/C10/C12 review fix batch — PHASE_3_APPROVAL.md's
# reviewed baseline. Pinned (not "HEAD") so this stays a real regression test even after the fix
# is committed on top of it.
B1_BASELINE_REF = "54edeb317db8e39181062bc5edf9b4c969e3561c"

TECH_CLUSTER_INDUSTRIES = [
    "Semiconductors", "Software-Infrastructure", "Computer Hardware",
    "Information Technology Services", "Solar",
]
OTHER_SECTORS = [
    ("Healthcare", "Biotechnology"),
    ("Industrials", "Aerospace & Defense"),
    ("Consumer Cyclical", "Auto Manufacturers"),
    ("Financial Services", "Banks-Diversified"),
    ("Basic Materials", "Gold"),
    ("Consumer Defensive", "Packaged Foods"),
    ("Energy", "Oil & Gas E&P"),
    ("Utilities", "Utilities-Regulated Electric"),
    ("Communication Services", "Telecom Services"),
    ("Real Estate", "REIT-Office"),
]


def _add_ticker(stocks, fundamentals_history, battery, eps_trajectory, price_history,
                momentum_state, t, sector, industry, rank01, mom_12_1=0.08, high_52w=-0.05):
    """rank01 in [0, 1] drives the fundamentals magnitude (higher -> better quality/value)."""
    stocks[t] = {
        "symbol": t, "sector": sector, "industry": industry,
        "marketCap": 5e9, "price": 40.0, "volume": 2_000_000,
        "metrics": {"adv_20d_usd": 20_000_000.0, "zScore": 4.0},
    }
    rev0 = 100_000_000.0
    op = rev0 * (0.10 + 0.30 * rank01)
    ni = op * 0.75
    da = rev0 * 0.03
    capex = rev0 * (0.08 - 0.05 * rank01)
    fcf = ni + da - capex
    ocf = ni + da
    fundamentals_history["tickers"][t] = {
        str(y): {
            "revenue": rev0 * (1.0 + 0.05 * (y - 2021)),
            "operating_income": op * (1.0 + 0.05 * (y - 2021)),
            "net_income": ni * (1.0 + 0.05 * (y - 2021)),
            "ocf": ocf * (1.0 + 0.05 * (y - 2021)),
            "fcf": fcf * (1.0 + 0.05 * (y - 2021)),
            "da": da, "capex": capex,
            "lt_debt": 0.0, "cash": rev0 * 0.2, "equity": rev0 * 0.5,
            "gross_profit": rev0 * (0.30 + 0.15 * rank01),
        }
        for y in (2021, 2022, 2023, 2024)
    }
    battery["tickers"][t] = {"accruals_ratio": 0.02, "f_score": 5 + round(3 * rank01), "m_score": -2.6}
    eps_trajectory["tickers"][t] = {"trajectory_slope": 0.01 + 0.12 * rank01}
    price_history["tickers"][t] = [30.0 * ((1.0 + mom_12_1) ** (i / 11.0)) for i in range(16)]
    momentum_state["tickers"][t] = {
        "mom_12_1": mom_12_1, "pct_from_52w_high": high_52w, "mom_break": False,
        "regime_shift_down": False,
    }


def _build_fixture(base_dir: Path) -> Path:
    """A synthetic public/data with >135 Door-1/2-eligible names so the top-50/top-135 rank
    cutoffs actually bind, and one sector (Technology, 50 names) oversubscribed against its
    24-name sector ceiling so several good-but-ceiling-excluded names are genuinely NOT
    Door-1/2-nominated — exactly the class of name that becomes a real Door-3 candidate."""
    data_dir = base_dir / "public" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    stocks: dict = {}
    fundamentals_history: dict = {"tickers": {}}
    battery: dict = {"tickers": {}}
    eps_trajectory: dict = {"tickers": {}}
    price_history: dict = {"tickers": {}}
    momentum_state = {"asof": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "tickers": {}}

    def add(t, sector, industry, rank01, mom_12_1=0.08, high_52w=-0.05):
        _add_ticker(stocks, fundamentals_history, battery, eps_trajectory, price_history,
                    momentum_state, t, sector, industry, rank01, mom_12_1, high_52w)

    # 10 "other" sectors, mediocre quality — 12 tickers each = 120, all comfortably nominated.
    for si, (sector, industry) in enumerate(OTHER_SECTORS):
        for i in range(12):
            add(f"OTH_{si}_{i}", sector, industry, rank01=0.15 + 0.30 * (i / 11.0),
                mom_12_1=0.06 + 0.01 * i)

    # Technology: 50 names competing for a 24-name sector ceiling (47 very-high-quality "solid"
    # names plus 3 slightly-lower-quality names with extreme 12-1 momentum) — the bottom few by
    # score are excluded from Door 1/2 purely by the ceiling, not by quality, and some of those
    # (the extreme-momentum three) are exactly the class of name Door 3 exists for.
    for i in range(47):
        add(f"TECH_{i}", "Technology", TECH_CLUSTER_INDUSTRIES[i % len(TECH_CLUSTER_INDUSTRIES)],
            rank01=0.90 + 0.09 * (i / 46.0), mom_12_1=0.05 + 0.002 * i)
    for i in range(3):
        add(f"HOT_{i}", "Technology", TECH_CLUSTER_INDUSTRIES[i % len(TECH_CLUSTER_INDUSTRIES)],
            rank01=0.86 + 0.01 * i, mom_12_1=2.5, high_52w=-0.01)

    (data_dir / "stocks.json").write_text(json.dumps(stocks), encoding="utf-8")
    (data_dir / "price_history.json").write_text(json.dumps(price_history), encoding="utf-8")
    (data_dir / "fundamentals_history.json").write_text(json.dumps(fundamentals_history), encoding="utf-8")
    (data_dir / "fundamentals_battery.json").write_text(json.dumps(battery), encoding="utf-8")
    (data_dir / "eps_trajectory.json").write_text(json.dumps(eps_trajectory), encoding="utf-8")
    (data_dir / "momentum_state.json").write_text(json.dumps(momentum_state), encoding="utf-8")

    return data_dir


def _run(source: str, data_dir: Path, out_dir: Path, module_name: str):
    mod = load_sifter_module(source, module_name, DEFAULT_SIFTER_PATH)
    return run_sifter(mod, out_dir, data_dir=data_dir, quiet=True)


def test_b1_door3_never_demotes_door12_nominee_and_band_counts_are_real(tmp_path: Path):
    data_dir = _build_fixture(tmp_path)

    baseline_code = get_git_file_content(ROOT, B1_BASELINE_REF)
    working_code = DEFAULT_SIFTER_PATH.read_text(encoding="utf-8")

    b_summary, b_compat = _run(baseline_code, data_dir, tmp_path / "outb", "sifter_b1_baseline")
    w_summary, w_compat = _run(working_code, data_dir, tmp_path / "outw", "sifter_b1_working")

    # ── Reproduce the bug on the pre-fix baseline (sanity check on the fixture itself) ──
    b_book = {t for t, p in b_compat["tickers"].items() if p["fct_band"] in ("research_now", "watchlist")}
    w_book = {t for t, p in w_compat["tickers"].items() if p["fct_band"] in ("research_now", "watchlist")}
    rescued = sorted(w_book - b_book)
    lost = sorted(b_book - w_book)

    # The old code displaced these 5 genuine Door-1/2 nominees (ranks 131-135 of the pure
    # Door-1/2 order) once Door-3's ceiling-excluded Technology names were merged into the same
    # ranked pool. This is a fixed, deterministic fixture (no randomness) so the exact names are
    # asserted directly.
    assert rescued == ["OTH_7_5", "OTH_8_1", "OTH_8_2", "OTH_8_3", "OTH_8_4"]
    assert lost == []  # the fix never drops a name the old code kept

    # ── The fix's own invariants, on the current working tree ──
    for t in rescued:
        band = w_compat["tickers"][t]["fct_band"]
        assert band in ("research_now", "watchlist"), f"{t} lost its band under the fix: {band}"
        assert w_compat["tickers"][t]["fct_rank"] <= 135

    # Door 3 selected names, and none of them are Door-1/2 nominees (no ticker double-counted).
    door3_members = {
        t for t, p in w_summary.get("profiles", {}).items()
        if "DOOR_3_TREND_LEADER" in p.get("nominated_doors", [])
    }
    assert len(door3_members) == w_summary["door3_count"] > 0
    door12_members = {
        t for t, p in w_summary.get("profiles", {}).items()
        if any(d.startswith("DOOR_1") or d.startswith("DOOR_2") for d in p.get("nominated_doors", []))
    }
    assert door3_members.isdisjoint(door12_members)

    # rn_set and wl_set are disjoint by construction (a name is never in both bands).
    rn = {t for t, p in w_compat["tickers"].items() if p["fct_band"] == "research_now"}
    wl = {t for t, p in w_compat["tickers"].items() if p["fct_band"] == "watchlist"}
    assert rn.isdisjoint(wl)

    # band_counts is fixed: the published counts equal the real row counts (PHASE_3_APPROVAL.md:
    # "band_counts.watchlist is overstated. It reports 93 against 88 actual rows").
    assert w_compat["band_counts"]["research_now"] == len(rn)
    assert w_compat["band_counts"]["watchlist"] == len(wl)

    # The baseline's own band_counts WAS overstated on this fixture (the bug this test guards
    # against) -- confirms the fixture actually exercises the defect, not just the fix.
    b_rn = {t for t, p in b_compat["tickers"].items() if p["fct_band"] == "research_now"}
    b_wl = {t for t, p in b_compat["tickers"].items() if p["fct_band"] == "watchlist"}
    assert b_compat["band_counts"]["watchlist"] != len(b_wl) or b_compat["band_counts"]["research_now"] != len(b_rn)


def test_b1_book_grows_by_door12_book_plus_door3(tmp_path: Path):
    """B1 design: the book is 135 (Door 1/2, hysteresis aside) plus whatever Door 3 adds on top
    (its own names not already Door-1/2 nominated) -- not a mixed ranking that can shrink the
    Door-1/2 side."""
    data_dir = _build_fixture(tmp_path)
    working_code = DEFAULT_SIFTER_PATH.read_text(encoding="utf-8")
    summary, compat = _run(working_code, data_dir, tmp_path / "out", "sifter_b1_growth")

    door3_count = summary["door3_count"]
    assert door3_count > 0
    # With this fixture there is no pre-existing hysteresis (first run), so the Door-1/2 side of
    # the book is exactly the 135-name nomination target, and Door 3 adds door3_count more.
    assert summary["nominated_count"] == 135 + door3_count

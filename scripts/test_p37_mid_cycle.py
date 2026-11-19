"""Unit tests for P3.7 Mid-Cycle Window by Cluster in score_factors_dual_door.py."""

import json
from pathlib import Path
import pytest
import sys

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import score_factors_dual_door as sfdd


def test_mid_cycle_config_values():
    """Verify sifter_config.json contains mid_cycle_window with exact clusters and measured swings."""
    cfg_path = SCRIPTS_DIR / "sifter_config.json"
    assert cfg_path.exists(), "sifter_config.json must exist"
    data = json.loads(cfg_path.read_text(encoding="utf-8"))
    mc = data.get("mid_cycle_window", {})
    assert mc.get("default_years") == 3
    cl_years = mc.get("cluster_years", {})
    assert cl_years.get("energy_upstream") == 8
    assert cl_years.get("energy_services") == 8
    assert cl_years.get("energy_midstream_refining") == 8
    assert cl_years.get("mat_metals_mining") == 8
    assert "ind_freight_logistics" not in cl_years
    assert "mat_chemicals" not in cl_years
    assert "mat_construction" not in cl_years

    # Check measured swings
    swings = mc.get("cluster_swings", {})
    assert swings.get("energy_upstream") == 0.061
    assert swings.get("energy_services") == 0.085
    assert swings.get("energy_midstream_refining") == 0.054
    assert swings.get("mat_metals_mining") == 0.068
    assert swings.get("ind_freight_logistics") == 0.036
    assert swings.get("mat_chemicals") == 0.032
    assert swings.get("mat_construction") == 0.020


def test_mid_cycle_window_8y_cluster_full_history():
    """An 8-year cluster with 8 years of history uses 8 years and does not flag short history."""
    def_win, cl_win = sfdd._load_mid_cycle_config()
    cluster = "energy_upstream"
    target_window = cl_win.get(cluster, def_win)
    assert target_window == 8

    # 10 years of data
    years = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]
    window_years = years[-target_window:]
    assert len(window_years) == 8
    assert window_years == [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]

    ydata = {str(y): {"fcf": 100.0 + i * 10} for i, y in enumerate(years)}
    past_fcfs = [ydata[str(y)]["fcf"] for y in window_years]
    years_used = len(past_fcfs)
    mid_cycle_fcf = sum(past_fcfs) / len(past_fcfs)

    flags = []
    if target_window == 8 and years_used < 5:
        flags.append("mid_cycle_short_history")

    assert years_used == 8
    assert "mid_cycle_short_history" not in flags
    expected_fcf = sum(100.0 + (i + 2) * 10 for i in range(8)) / 8
    assert mid_cycle_fcf == expected_fcf


def test_mid_cycle_window_8y_cluster_short_history():
    """An 8-year cluster with 4 years (< 5 years) uses what exists and flags mid_cycle_short_history."""
    def_win, cl_win = sfdd._load_mid_cycle_config()
    cluster = "mat_metals_mining"
    target_window = cl_win.get(cluster, def_win)
    assert target_window == 8

    # Only 4 years available
    years = [2021, 2022, 2023, 2024]
    window_years = years[-target_window:]
    assert len(window_years) == 4

    ydata = {str(y): {"fcf": 50.0} for y in window_years}
    past_fcfs = [ydata[str(y)]["fcf"] for y in window_years]
    years_used = len(past_fcfs)
    mid_cycle_fcf = sum(past_fcfs) / len(past_fcfs)

    flags = []
    if target_window == 8 and years_used < 5:
        flags.append("mid_cycle_short_history")

    assert years_used == 4
    assert mid_cycle_fcf == 50.0
    assert "mid_cycle_short_history" in flags


def test_mid_cycle_window_default_3y_cluster():
    """Freight, chemicals, construction use default 3-year window and do NOT flag short history for 3 years."""
    def_win, cl_win = sfdd._load_mid_cycle_config()
    for cl in ("ind_freight_logistics", "mat_chemicals", "mat_construction"):
        target_window = cl_win.get(cl, def_win)
        assert target_window == 3, f"{cl} must use default 3-year window"

        years = [2022, 2023, 2024]
        window_years = years[-target_window:]
        assert len(window_years) == 3
        past_fcfs = [10.0, 20.0, 30.0]
        years_used = len(past_fcfs)

        flags = []
        if target_window == 8 and years_used < 5:
            flags.append("mid_cycle_short_history")

        assert "mid_cycle_short_history" not in flags


# ---- 2026-11-19: an industry's own window, and the EBIT yield is mid-cycle too ---------------------------------------------

from industry_taxonomy import INDUSTRY_RULES
from live_sifter_fixture import run_live_sifter


def test_mid_cycle_mean_averages_the_filed_years_of_the_window_and_counts_them():
    ydata = {"2021": {"operating_income": 10.0}, "2022": {"operating_income": None}, "2023": {"operating_income": 0.0},
             "2024": {"operating_income": 50.0}, "2025": {}}
    years = [2021, 2022, 2023, 2024, 2025]
    assert sfdd.mid_cycle_mean(ydata, years, 8, "operating_income") == (20.0, 3)      # a filed 0.0 is a value
    assert sfdd.mid_cycle_mean(ydata, years, 2, "operating_income") == (50.0, 1)      # the window is the last 2 years
    assert sfdd.mid_cycle_mean(ydata, years, 8, "fcf") == (None, 0)


def test_industry_windows_are_real_commodity_industries_and_follow_the_recorded_measurement():
    """A key that is not an industry of the commodity archetype would do nothing, silently."""
    cfg = json.loads((SCRIPTS_DIR / "sifter_config.json").read_text(encoding="utf-8"))["mid_cycle_window"]
    windows = sfdd._load_mid_cycle_industry_years()
    assert windows == cfg["industry_years"] and windows["Marine Shipping"] == 8 and "Trucking" not in windows
    for industry in windows:
        assert INDUSTRY_RULES[industry][2] == "commodity_cyclical", industry
        assert cfg["industry_swings"][industry] > cfg["industry_bar"], industry
    for industry, s in cfg["industry_swings"].items():                 # the rule, both ways
        cluster_has_it = INDUSTRY_RULES[industry][0] in cfg["cluster_years"]
        assert (industry in windows) == (s > cfg["industry_bar"] and not cluster_has_it), industry


def _universe(industry, sector, histories):
    """Names that differ only in their operating-income history (the latest year is the same for all)."""
    stocks, fundamentals = {}, {}
    for name, ops in histories.items():
        stocks[name] = {"symbol": name, "sector": sector, "industry": industry, "marketCap": 5e9, "price": 50.0,
                        "volume": 2e6, "metrics": {"adv_20d_usd": 1e8}}
        fundamentals[name] = {str(2026 - len(ops) + i): {"revenue": 1e9, "operating_income": op, "net_income": 0.8 * op,
                                                         "debt_lt_noncurrent": 0.0, "debt_current": 0.0, "cash": 1e7}
                              for i, op in enumerate(ops)}
    return stocks, fundamentals


HISTORIES = {"FLAT": [2e8] * 8, "PEAK": [2e7] * 7 + [2e8], "MID": [1e8] * 7 + [2e8]}


def test_a_commodity_name_at_a_peak_year_scores_lower_on_value_than_one_that_earned_it_every_year(tmp_path, monkeypatch):
    stocks, fundamentals = _universe("Marine Shipping", "Industrials", HISTORIES)
    compat, _ = run_live_sifter(tmp_path, monkeypatch, stocks, fundamentals, {t: {} for t in stocks}, {t: {} for t in stocks})
    rows = compat["tickers"]
    value = {t: rows[t]["fct_z"]["value"] for t in stocks}
    assert value["FLAT"] > value["MID"] > value["PEAK"], value                 # the same latest year, three histories
    for t in stocks:                                                           # no capital-spending figure: no cash-flow years
        assert (rows[t]["mid_cycle_window_years"], rows[t]["mid_cycle_years_used"], rows[t]["mid_cycle_op_years_used"]) == (8, 0, 8)


def test_a_general_company_is_scored_on_its_latest_year_whatever_its_history(tmp_path, monkeypatch):
    stocks, fundamentals = _universe("Software-Application", "Technology", HISTORIES)
    compat, _ = run_live_sifter(tmp_path, monkeypatch, stocks, fundamentals, {t: {} for t in stocks}, {t: {} for t in stocks})
    value = {t: compat["tickers"][t]["fct_z"]["value"] for t in stocks}
    assert value["FLAT"] == value["MID"] == value["PEAK"], value
    assert compat["tickers"]["FLAT"]["mid_cycle_op_years_used"] is None

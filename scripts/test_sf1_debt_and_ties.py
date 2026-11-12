"""test_sf1_debt_and_ties.py - WO_SF1 (2026-11-12): the scorer reads debt from the current
fundamentals fields (debt_lt_noncurrent + debt_current), carries absence instead of a fabricated
zero, and ranks without the alphabet breaking ties.

All tests call the scorer's own code: sfdd.resolve_total_debt / sfdd.rank_key_for_profile
directly, and sfdd.main() end to end on a tiny universe.
"""

import json
from pathlib import Path

import score_factors_dual_door as sfdd


# -- helpers -----------------------------------------------------------------------------

def _run_main(tmp_path: Path, monkeypatch, fundamentals_rows: dict, mcap: float = 3e9) -> dict:
    """Run main() on a universe with one name per key; returns factor_scores.json['tickers']."""
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True)
    stocks = {
        t: {"symbol": t, "sector": "Technology", "industry": "Software-Application",
            "marketCap": mcap, "price": 50.0, "volume": 2_000_000,
            "metrics": {"adv_20d_usd": 50_000_000.0}}
        for t in fundamentals_rows
    }
    fundamentals = {"tickers": {t: {"2025": row} for t, row in fundamentals_rows.items()}}
    (data_dir / "stocks.json").write_text(json.dumps(stocks), encoding="utf-8")
    (data_dir / "fundamentals_history.json").write_text(json.dumps(fundamentals), encoding="utf-8")
    out_dual = tmp_path / "factor_scores_dual_door.json"
    out_compat = tmp_path / "factor_scores.json"
    monkeypatch.setattr(sfdd, "DATA", data_dir)
    monkeypatch.setattr(sfdd, "STOCKS_JSON", data_dir / "stocks.json")
    monkeypatch.setattr(sfdd, "PRICE_HISTORY_JSON", data_dir / "price_history.json")
    monkeypatch.setattr(sfdd, "FUNDAMENTALS_HISTORY_JSON", data_dir / "fundamentals_history.json")
    monkeypatch.setattr(sfdd, "BATTERY_JSON", data_dir / "fundamentals_battery.json")
    monkeypatch.setattr(sfdd, "EPS_TRAJECTORY_JSON", data_dir / "eps_trajectory.json")
    monkeypatch.setattr(sfdd, "TIER1_SURVIVORS_JSON", data_dir / "tier1_hygiene_survivors.json")
    monkeypatch.setattr(sfdd, "MOMENTUM_STATE_JSON", data_dir / "momentum_state.json")
    monkeypatch.setattr(sfdd, "OUT_JSON", out_dual)
    monkeypatch.setattr(sfdd, "FACTOR_SCORES_COMPAT_JSON", out_compat)
    monkeypatch.setattr(sfdd, "sync_mri_snapshot", lambda: None)
    sfdd.main()
    return json.loads(out_compat.read_text(encoding="utf-8"))["tickers"]


# A loss-making year: fcf < 0 and operating income < 0.
_LOSS = {"revenue": 1e9, "operating_income": -1e8, "net_income": -1.5e8, "da": 5e7,
         "capex": 3e8, "ocf": 1e8, "fcf": -2e8, "cash": 1e8}
_GOOD = {"revenue": 1e9, "operating_income": 2e8, "net_income": 1.5e8, "da": 5e7,
         "capex": 5e7, "ocf": 2e8, "fcf": 1.5e8, "cash": 1e8}


# -- resolve_total_debt (the helper main() uses) -----------------------------------------

def test_debt_from_new_fields_is_summed_without_flag():
    total, flag, _ = sfdd.resolve_total_debt({"debt_lt_noncurrent": 2e9, "debt_current": 5e8})
    assert total == 2.5e9 and flag is None


def test_new_fields_win_over_the_legacy_field():
    total, flag, _ = sfdd.resolve_total_debt(
        {"debt_lt_noncurrent": 2e9, "debt_current": 5e8, "lt_debt": 1.0})
    assert total == 2.5e9 and flag is None


def test_real_zero_debt_is_zero_with_no_flag():
    total, flag, _ = sfdd.resolve_total_debt({"debt_lt_noncurrent": 0.0, "debt_current": 0.0})
    assert total == 0.0 and flag is None


def test_zero_legacy_debt_is_zero_not_absent():
    total, flag, _ = sfdd.resolve_total_debt({"lt_debt": 0.0})
    assert total == 0.0 and flag == "debt_from_legacy_field"


def test_legacy_only_is_used_and_flagged():
    total, flag, _ = sfdd.resolve_total_debt({"lt_debt": 7e8})
    assert total == 7e8 and flag == "debt_from_legacy_field"


def test_only_noncurrent_present_is_partial():
    total, flag, _ = sfdd.resolve_total_debt({"debt_lt_noncurrent": 3e9})
    assert total == 3e9 and flag == "debt_partial"


def test_only_current_present_takes_noncurrent_from_legacy_when_it_exists():
    total, flag, detail = sfdd.resolve_total_debt({"debt_current": 0.0, "lt_debt": 6e9})
    assert total == 6e9 and flag == "debt_partial"
    assert detail["noncurrent_from_legacy_lt_debt"] is True


def test_only_current_present_without_legacy_is_current_alone_partial():
    total, flag, _ = sfdd.resolve_total_debt({"debt_current": 1.5e8})
    assert total == 1.5e8 and flag == "debt_partial"


def test_no_debt_field_is_unknown_not_zero():
    total, flag, _ = sfdd.resolve_total_debt({"revenue": 1e9})
    assert total is None and flag == "debt_unknown"


# -- main() end to end -------------------------------------------------------------------

def test_leverage_veto_fires_on_debt_held_only_in_the_new_fields(tmp_path, monkeypatch):
    rows = {"NEWDEBT": {**_LOSS, "debt_lt_noncurrent": 1.8e9, "debt_current": 4e8}}
    t = _run_main(tmp_path, monkeypatch, rows)["NEWDEBT"]
    assert t["fct_veto"] == "CHRONIC_OPERATING_LOSS_LEVERAGE"


def test_leverage_veto_does_not_fire_on_real_zero_debt(tmp_path, monkeypatch):
    rows = {"NODEBT": {**_LOSS, "debt_lt_noncurrent": 0.0, "debt_current": 0.0}}
    t = _run_main(tmp_path, monkeypatch, rows)["NODEBT"]
    assert t["fct_veto"] is None
    for f in ("debt_unknown", "debt_partial", "debt_from_legacy_field"):
        assert f not in t["fct_flags"]


def test_unknown_debt_neither_vetoes_nor_clears_and_says_so(tmp_path, monkeypatch):
    rows = {"UNKDEBT": {**_LOSS}}          # no debt field of any kind
    t = _run_main(tmp_path, monkeypatch, rows)["UNKDEBT"]
    assert t["fct_veto"] is None
    assert "debt_unknown" in t["fct_flags"]
    assert t["fct_flag_detail"]["debt_unknown"]["leverage_veto"] == "not_evaluable"


def test_unknown_debt_is_flagged_and_known_debt_is_not(tmp_path, monkeypatch):
    rows = {"KNOWN": {**_GOOD, "debt_lt_noncurrent": 1e8, "debt_current": 0.0},
            "UNKNOWN": {**_GOOD}}
    out = _run_main(tmp_path, monkeypatch, rows)
    assert "debt_unknown" in out["UNKNOWN"]["fct_flags"]
    assert out["UNKNOWN"]["fct_veto"] is None
    assert "debt_unknown" not in out["KNOWN"]["fct_flags"]


def test_cash_absent_flags_cash_unknown_and_never_defaults_to_zero(tmp_path, monkeypatch):
    row = {k: v for k, v in _GOOD.items() if k != "cash"}
    rows = {"NOCASH": {**row, "debt_lt_noncurrent": 1e8, "debt_current": 0.0}}
    t = _run_main(tmp_path, monkeypatch, rows)["NOCASH"]
    assert "cash_unknown" in t["fct_flags"]
    assert "debt_unknown" not in t["fct_flags"]


def test_real_zero_cash_is_a_value_with_no_flag(tmp_path, monkeypatch):
    rows = {"ZEROCASH": {**_GOOD, "cash": 0.0, "debt_lt_noncurrent": 1e8, "debt_current": 0.0}}
    t = _run_main(tmp_path, monkeypatch, rows)["ZEROCASH"]
    assert "cash_unknown" not in t["fct_flags"]


def test_zero_fcf_is_a_value_not_replaced_by_the_fallback(tmp_path, monkeypatch):
    # A filed fcf of 0.0 must not be replaced by ocf - capex (the `or` defect). Here ocf - capex
    # is -2e8 (would trip the loss rule: op < 0, fcf < 0, debt 2e9); a real fcf of 0.0 does not.
    rows = {"ZEROFCF": {"revenue": 1e9, "operating_income": -1e8, "net_income": -1.5e8,
                        "da": 5e7, "capex": 3e8, "ocf": 1e8, "fcf": 0.0, "cash": 1e8,
                        "debt_lt_noncurrent": 2e9, "debt_current": 0.0, "lt_debt": 2e9}}
    t = _run_main(tmp_path, monkeypatch, rows)["ZEROFCF"]
    assert t["fct_veto"] is None


# -- rank key (F10) ----------------------------------------------------------------------

def _prof(ticker, best_raw, d1=None, d2=None, doors=None, d2_ok=True):
    return {"ticker": ticker, "best_pctl_raw": best_raw,
            "best_pctl": None if best_raw is None else round(best_raw, 1),
            "score_door1": d1, "score_door2": d2, "d2_eligible": d2_ok,
            "nominated_doors": doors or []}


def _order(profiles):
    return sorted(profiles, key=lambda t: sfdd.rank_key_for_profile(profiles[t]))


def test_two_names_equal_at_one_decimal_rank_by_the_unrounded_value():
    # Both round to 99.3; ZED is higher beyond the first decimal and must come first although
    # AAA is first alphabetically (the old stable sort put AAA first).
    p = {"AAA": _prof("AAA", 99.2793, d1=1.0), "ZED": _prof("ZED", 99.3207, d1=1.0)}
    assert p["AAA"]["best_pctl"] == p["ZED"]["best_pctl"] == 99.3
    assert _order(p) == ["ZED", "AAA"]


def test_exact_ties_fall_to_higher_door_score_then_ticker():
    assert _order({"ZZZ": _prof("ZZZ", 98.0, d1=2.0), "AAA": _prof("AAA", 98.0, d1=1.0)}) \
        == ["ZZZ", "AAA"]
    assert _order({"BBB": _prof("BBB", 98.0, d1=1.0), "AAA": _prof("AAA", 98.0, d1=1.0)}) \
        == ["AAA", "BBB"]


def test_champion_bonus_still_adds_to_the_unrounded_value():
    p = {"CHAMP": _prof("CHAMP", 90.04, d1=1.0, doors=["DOUBLE_DOOR_CHAMPION"]),
         "OTHER": _prof("OTHER", 92.0, d1=1.0)}
    assert _order(p) == ["CHAMP", "OTHER"]


def test_missing_best_percentile_ranks_last():
    p = {"AAA": _prof("AAA", None), "ZZZ": _prof("ZZZ", 1.0, d1=0.1)}
    assert _order(p) == ["ZZZ", "AAA"]

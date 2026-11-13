"""test_ds1_nomination_ties.py - WO_DS1 B3.4 (2026-11-13): the nomination sorts (the cluster pass,
the merit pass and the wildcard cut) no longer let the alphabet decide between two names whose best
percentile is equal at one decimal. They use the same key as the priority ranking (F10,
sfdd.rank_key_for_profile): the unrounded best percentile, then the higher door score, then ticker.

Every test runs sfdd.main() end to end on a one-sector universe of 1,900 names scored by Door 2
alone (no price history, so Door 1 is not eligible). The name at position k from the top is
T{1900-k:04d}, so of two neighbours the BETTER one is alphabetically LATER. Positions 1 to 19 are
exact ties (the 99th-percentile winsor); from position 20 down every score is distinct, and at 1,900
names two neighbours often share a one-decimal percentile (24/25 -> 98.7, 28/29 -> 98.5,
30/31 -> 98.4).
"""

import json
from pathlib import Path

import score_factors_dual_door as sfdd

N = 1900
SOFTWARE = "Software - Application"          # cluster tech_software
HARDWARE = "Computer Hardware"               # cluster tech_hardware_systems
IT_SERVICES = "Information Technology Services"   # cluster tech_it_services
SEMIS = "Semiconductors"                     # cluster tech_semiconductors


def _name(k: int) -> str:
    """Ticker of the name at position k from the top (1 = best)."""
    return f"T{N - k:04d}"


def _run(tmp_path: Path, monkeypatch, industry_by_position: dict) -> dict:
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True)
    stocks, fundamentals = {}, {}
    for i in range(N):
        t = f"T{i:04d}"
        k = N - i
        stocks[t] = {"symbol": t, "sector": "Technology",
                     "industry": industry_by_position.get(k, SOFTWARE),
                     "marketCap": 3e9, "price": 50.0, "volume": 2_000_000,
                     "metrics": {"adv_20d_usd": 50_000_000.0}}
        x = 1e8 + i * 1e5                      # every yield rises with i
        fundamentals[t] = {"2025": {"revenue": 2e9, "operating_income": x, "net_income": x,
                                    "da": 5e7, "capex": 5e7, "ocf": x + 5e7, "fcf": x,
                                    "cash": 1e8, "debt_lt_noncurrent": 1e8, "debt_current": 0.0}}
    (data_dir / "stocks.json").write_text(json.dumps(stocks), encoding="utf-8")
    (data_dir / "fundamentals_history.json").write_text(json.dumps({"tickers": fundamentals}), encoding="utf-8")
    out_compat = tmp_path / "factor_scores.json"
    monkeypatch.setattr(sfdd, "DATA", data_dir)
    monkeypatch.setattr(sfdd, "STOCKS_JSON", data_dir / "stocks.json")
    monkeypatch.setattr(sfdd, "PRICE_HISTORY_JSON", data_dir / "price_history.json")
    monkeypatch.setattr(sfdd, "FUNDAMENTALS_HISTORY_JSON", data_dir / "fundamentals_history.json")
    monkeypatch.setattr(sfdd, "BATTERY_JSON", data_dir / "fundamentals_battery.json")
    monkeypatch.setattr(sfdd, "EPS_TRAJECTORY_JSON", data_dir / "eps_trajectory.json")
    monkeypatch.setattr(sfdd, "TIER1_SURVIVORS_JSON", data_dir / "tier1_hygiene_survivors.json")
    monkeypatch.setattr(sfdd, "MOMENTUM_STATE_JSON", data_dir / "momentum_state.json")
    monkeypatch.setattr(sfdd, "OUT_JSON", tmp_path / "factor_scores_dual_door.json")
    monkeypatch.setattr(sfdd, "FACTOR_SCORES_COMPAT_JSON", out_compat)
    monkeypatch.setattr(sfdd, "sync_mri_snapshot", lambda: None)
    sfdd.main()
    return json.loads(out_compat.read_text(encoding="utf-8"))["tickers"]


def _nominated(row: dict) -> bool:
    """Nominated by the cluster pass, the merit pass or the wildcard cut. (With fewer than 135
    nominees the band step tags the next-ranked names HYSTERESIS_RETAINED; those are not nominees.)"""
    doors = row["fct_nominated_doors"]
    return bool(doors) and "HYSTERESIS_RETAINED" not in doors


def _assert_tied_at_one_decimal(out: dict, better: str, worse: str):
    assert out[better]["fct_percentile"] == out[worse]["fct_percentile"], "the pair must tie at one decimal"
    assert out[better]["fct_z"]["value"] > out[worse]["fct_z"]["value"], "and differ beyond it"


def test_wildcard_cut_between_two_names_tied_at_one_decimal_takes_the_better(tmp_path, monkeypatch):
    # One cluster: 3 core slots (cluster cap), then wildcards up to the sector ceiling of 24. The
    # last slot is contested by positions 24 and 25, both 98.7.
    out = _run(tmp_path, monkeypatch, {})
    better, worse = _name(24), _name(25)
    _assert_tied_at_one_decimal(out, better, worse)
    assert sum(1 for r in out.values() if _nominated(r)) == sfdd.MAX_SECTOR_CEILING
    assert "GLOBAL_WILDCARD" in out[better]["fct_nominated_doors"]
    assert not _nominated(out[worse])


def test_merit_pass_cluster_cap_between_two_names_tied_at_one_decimal_takes_the_better(tmp_path, monkeypatch):
    # Semiconductors holds positions 28, 29 (98.5) and 30, 31 (98.4). The cluster pass takes one,
    # the merit pass two more (cluster cap 3): the third semiconductor slot is contested by 30 and 31.
    out = _run(tmp_path, monkeypatch, {28: SEMIS, 29: SEMIS, 30: SEMIS, 31: SEMIS})
    better, worse = _name(30), _name(31)
    _assert_tied_at_one_decimal(out, better, worse)
    assert _nominated(out[_name(28)]) and _nominated(out[_name(29)])
    assert _nominated(out[better]) and "GLOBAL_WILDCARD" not in out[better]["fct_nominated_doors"]
    assert not _nominated(out[worse])


def test_cluster_pass_between_two_names_tied_at_one_decimal_takes_the_better(tmp_path, monkeypatch):
    # Four clusters take one slot each in the cluster pass; the four merit slots then go to
    # software and hardware. Semiconductors holds only positions 30 and 31 (98.4): its one slot
    # is the cluster pass's.
    out = _run(tmp_path, monkeypatch, {20: HARDWARE, 21: HARDWARE, 22: HARDWARE,
                                       23: IT_SERVICES, 24: IT_SERVICES, 30: SEMIS, 31: SEMIS})
    better, worse = _name(30), _name(31)
    _assert_tied_at_one_decimal(out, better, worse)
    assert _nominated(out[better]) and "GLOBAL_WILDCARD" not in out[better]["fct_nominated_doors"]
    assert not _nominated(out[worse])

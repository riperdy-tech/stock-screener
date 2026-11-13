"""test_ds1_revisions_out_of_door1.py - WO_DS1 B5 (2026-11-13): the "revisions" input no longer
enters Door 1.

What eps_trajectory.json stores is not a revision: `trajectory_slope` compares the year's EPS
estimate with one quarter's, in dollars per share, clamped to [-1, 1]. On the stored file it sits at
+1.0 for 145 of the 333 scored names that have it and ranks with the dollar level of EPS per share
at +0.85; only 12% of Door-1 names have it at all (REPORT_DS1_scorer_design.md). Door 1 is quality
and momentum for every name. z_revisions is still published, and Door 3's rule on it is untouched.

Both tests run sfdd.main() end to end on a 40-name universe with fundamentals and 24 monthly
closes, so Door 1 scores every name.
"""

import json
from pathlib import Path

import score_factors_dual_door as sfdd

N = 40


def _run(tmp_path: Path, monkeypatch, slopes: dict) -> dict:
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True)
    stocks, fundamentals, prices = {}, {}, {}
    for i in range(N):
        t = f"T{i:02d}"
        stocks[t] = {"symbol": t, "sector": "Technology", "industry": "Software - Application",
                     "marketCap": 3e9, "price": 50.0, "volume": 2_000_000,
                     "metrics": {"adv_20d_usd": 50_000_000.0}}
        x = 1e8 + i * 5e6
        fundamentals[t] = {"2025": {"revenue": 2e9, "operating_income": x, "net_income": x,
                                    "da": 5e7, "capex": 5e7, "ocf": x + 5e7, "fcf": x,
                                    "cash": 1e8, "debt_lt_noncurrent": 1e8, "debt_current": 0.0}}
        g = 1.0 + 0.002 * ((i * 7) % N)            # a different monthly growth rate per name
        prices[t] = [round(20.0 * g ** m, 4) for m in range(24)]
    (data_dir / "stocks.json").write_text(json.dumps(stocks), encoding="utf-8")
    (data_dir / "fundamentals_history.json").write_text(json.dumps({"tickers": fundamentals}), encoding="utf-8")
    (data_dir / "price_history.json").write_text(json.dumps({"prices": prices}), encoding="utf-8")
    if slopes:
        (data_dir / "eps_trajectory.json").write_text(
            json.dumps({t: {"trajectory_slope": s} for t, s in slopes.items()}), encoding="utf-8")
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


# Half the names carry a slope, from -1 to +1, unrelated to their quality or momentum order.
_SLOPES = {f"T{i:02d}": round(-1.0 + 2.0 * ((i * 11) % N) / (N - 1), 4) for i in range(0, N, 2)}


def test_door1_uses_quality_and_momentum_for_a_name_that_has_a_slope(tmp_path, monkeypatch):
    out = _run(tmp_path, monkeypatch, _SLOPES)
    for t, row in out.items():
        assert row["door1_pillars_used"] == ["quality", "momentum"], t
        assert row["door1_weight_scale"] == 1.25, t
    with_slope = [t for t in out if t in _SLOPES]
    assert all(out[t]["fct_z"]["revisions"] is not None for t in with_slope)      # still published
    assert all(out[t]["fct_z"]["revisions"] is None for t in out if t not in _SLOPES)


def test_the_slope_file_moves_no_percentile_and_no_rank(tmp_path, monkeypatch):
    with_file = _run(tmp_path / "a", monkeypatch, _SLOPES)
    without = _run(tmp_path / "b", monkeypatch, {})
    assert {t: (r["fct_percentile"], r["fct_rank"]) for t, r in with_file.items()} == \
           {t: (r["fct_percentile"], r["fct_rank"]) for t, r in without.items()}

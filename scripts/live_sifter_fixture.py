"""Runs the live score_factors_dual_door.main() on a tiny synthetic data dir, for tests that check one name's veto,
flags or detail without keeping a copy of the scorer's logic. Not a test file."""
import contextlib
import io
import json

import score_factors_dual_door as sfdd


def run_live_sifter(tmp_path, monkeypatch, stocks, fundamentals=None, battery=None, momentum_state=None,
                    tier1_survivors=None):
    """Writes the given inputs under tmp_path, points the live module at them and runs main().
    Returns (compat, summary): factor_scores.json and factor_scores_dual_door.json as dicts."""
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    files = {
        "stocks.json": stocks,
        "fundamentals_history.json": {"tickers": fundamentals or {}},
        "fundamentals_battery.json": {"tickers": battery or {}},
    }
    if momentum_state is not None:
        files["momentum_state.json"] = {"asof": "2026-11-13T00:00:00Z", "tickers": momentum_state}
    if tier1_survivors is not None:
        files["tier1_hygiene_survivors.json"] = tier1_survivors
    for name, payload in files.items():
        (data_dir / name).write_text(json.dumps(payload), encoding="utf-8")
    out_dual = tmp_path / "factor_scores_dual_door.json"
    out_compat = tmp_path / "factor_scores.json"
    for attr, name in (("STOCKS_JSON", "stocks.json"), ("PRICE_HISTORY_JSON", "price_history.json"),
                       ("FUNDAMENTALS_HISTORY_JSON", "fundamentals_history.json"),
                       ("BATTERY_JSON", "fundamentals_battery.json"), ("EPS_TRAJECTORY_JSON", "eps_trajectory.json"),
                       ("TIER1_SURVIVORS_JSON", "tier1_hygiene_survivors.json"),
                       ("MOMENTUM_STATE_JSON", "momentum_state.json")):
        monkeypatch.setattr(sfdd, attr, data_dir / name)
    monkeypatch.setattr(sfdd, "DATA", data_dir)
    monkeypatch.setattr(sfdd, "OUT_JSON", out_dual)
    monkeypatch.setattr(sfdd, "FACTOR_SCORES_COMPAT_JSON", out_compat)
    monkeypatch.setattr(sfdd, "sync_mri_snapshot", lambda: None)
    with contextlib.redirect_stdout(io.StringIO()):
        sfdd.main()
    return (json.loads(out_compat.read_text(encoding="utf-8")),
            json.loads(out_dual.read_text(encoding="utf-8")))

"""fetch_eps_trajectory: a failed fetch must not become a cached 'answer' that is never retried.

Before the fix a failure wrote an all-null row stamped with the current input_hash, and every later run
treated that row as a cache hit: 56 of the 110 all-null rows in eps_trajectory.json at 3094fc70 date
from 2026-05-25. Offline: yfinance is replaced by a stub, paths by a temporary folder.
"""
import json
import sys

import pytest

import fetch_eps_trajectory as f

AAA = {"symbol": "AAA", "metrics": {"forwardEpsEstimate": 1.0}}
GOOD = {"next_q_eps": 1.0, "next_q_plus_1_eps": 1.1, "next_y_eps": 4.0}


@pytest.fixture
def env(tmp_path, monkeypatch):
    stocks, traj = tmp_path / "stocks.json", tmp_path / "eps_trajectory.json"
    stocks.write_text(json.dumps([AAA]), encoding="utf-8")
    monkeypatch.setattr(f, "STOCKS_JSON", stocks)
    monkeypatch.setattr(f, "EPS_TRAJECTORY_JSON", traj)
    monkeypatch.setattr(f, "RATE_LIMIT_SECONDS", 0)
    calls = []

    def run(provider, *argv):
        def stub(ticker):
            calls.append(ticker)
            return provider(ticker)
        monkeypatch.setattr(f, "extract_eps_estimates", stub)
        monkeypatch.setattr(sys, "argv", ["fetch_eps_trajectory.py", "--apply", *argv])
        f.main()
        return json.loads(traj.read_text(encoding="utf-8"))

    return traj, calls, run


def row(**kw):
    base = {"next_q_eps": None, "next_q_plus_1_eps": None, "next_y_eps": None, "trajectory_slope": None,
            "fetched_at": "2026-05-25T00:00:00Z", "source": "yfinance.Ticker.earnings_estimate",
            "input_hash": f.compute_input_hash("AAA", AAA)}
    base.update(kw)
    return base


def boom(_):
    raise RuntimeError("provider down")


def test_failure_keeps_the_previous_row_and_is_retried_next_run(env):
    traj, calls, run = env
    previous = row(next_q_eps=0.9, next_q_plus_1_eps=1.0, next_y_eps=3.5, input_hash="older-hash")
    traj.write_text(json.dumps({"AAA": previous}), encoding="utf-8")
    after_failure = run(boom)
    assert after_failure["AAA"] == previous           # not overwritten by a null row with the new hash
    after_success = run(lambda t: GOOD)
    assert calls == ["AAA", "AAA"]                    # retried, not served from a poisoned cache
    assert after_success["AAA"]["next_y_eps"] == 4.0


def test_legacy_all_null_row_with_matching_hash_is_not_a_cache_hit(env):
    traj, calls, run = env
    traj.write_text(json.dumps({"AAA": row()}), encoding="utf-8")
    out = run(lambda t: GOOD)
    assert calls == ["AAA"]
    assert out["AAA"]["next_q_eps"] == 1.0


def test_usable_row_with_matching_hash_is_still_a_cache_hit(env):
    traj, calls, run = env
    traj.write_text(json.dumps({"AAA": row(next_y_eps=4.0)}), encoding="utf-8")
    run(boom)
    assert calls == []


def test_a_failed_attempt_counts_against_max_calls(env, tmp_path, monkeypatch):
    traj, calls, run = env
    stocks = [AAA, {"symbol": "BBB", "metrics": {"forwardEpsEstimate": 2.0}}]
    f.STOCKS_JSON.write_text(json.dumps(stocks), encoding="utf-8")
    traj.write_text(json.dumps({"AAA": row(input_hash="x"), "BBB": row(input_hash="y")}), encoding="utf-8")
    run(boom, "--max-calls", "1")
    assert calls == ["AAA"]

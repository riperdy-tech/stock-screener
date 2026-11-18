"""fetch_analyst_targets.py: band selection, freshness windows, cap, null entries, failures, atomic write.

No network, a fake fetcher, temp files. Run: python -m pytest scripts/test_fetch_analyst_targets.py
"""

import importlib.util
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location(
    "fat", str(Path(__file__).resolve().parent / "fetch_analyst_targets.py"))
fat = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fat)

NOW = datetime(2026, 11, 18, 12, 0, 0, tzinfo=timezone.utc)

FACTOR = {
    "RN1": {"fct_band": "research_now"},
    "WL1": {"fct_band": "watchlist"},
    "P1": {"fct_band": "pass"},
    "P2": {"fct_band": "pass"},
    "P3": {"fct_band": "pass"},
    "V1": {"fct_band": "vetoed"},
}
STOCKS = ["RN1", "WL1", "P1", "P2", "P3", "V1", "NOFACTOR"]


def ago(**kw):
    return fat.utc_iso(NOW - timedelta(**kw))


def entry(at, mean=1.0):
    return {"mean": mean, "median": mean, "high": mean, "low": mean, "fetched_at": at}


def fake(calls=None, fail=(), figures=None):
    def fetch(t):
        if calls is not None:
            calls.append(t)
        if t in fail:
            raise RuntimeError("throttled")
        return figures.get(t) if figures and t in figures else {"mean": 10.0, "median": 9.0, "high": 12.0, "low": 8.0}
    return fetch


def go(entries=None, **kw):
    payload = {"tickers": dict(entries or {})}
    kw.setdefault("pause", 0)
    res = fat.run(FACTOR, STOCKS, payload, NOW, kw.pop("fetch", fake()), **kw)
    return payload["tickers"], res


def test_list_is_research_now_and_watchlist_only_then_rest_excludes_vetoed_and_unscored():
    calls = []
    _, (nl, nr, failed, fresh) = go(fetch=fake(calls))
    assert calls == ["RN1", "WL1", "P1", "P2", "P3"]  # list first; V1 vetoed and NOFACTOR never asked
    assert (nl, nr, failed, fresh) == (2, 3, 0, 0)


def test_list_window_is_20_hours():
    calls = []
    entries = {"RN1": entry(ago(hours=19)), "WL1": entry(ago(hours=21))}
    go(entries, fetch=fake(calls), max_calls=0)
    assert calls == ["WL1"]


def test_rest_window_is_7_days():
    calls = []
    entries = {"P1": entry(ago(days=6)), "P2": entry(ago(days=8)), "P3": entry(ago(days=1))}
    _, (_, nr, _, fresh) = go(entries, fetch=fake(calls))
    assert [c for c in calls if c.startswith("P")] == ["P2"]
    assert nr == 1 and fresh == 2


def test_rest_oldest_first_absent_first_and_cap_applies_to_rest_only():
    calls = []
    entries = {"P1": entry(ago(days=20)), "P2": entry(ago(days=10))}  # P3 absent
    _, (nl, nr, _, _) = go(entries, fetch=fake(calls), max_calls=2)
    assert calls == ["RN1", "WL1", "P3", "P1"]  # list uncapped; rest: absent, then oldest; P2 beyond the cap
    assert (nl, nr) == (2, 2)


def test_null_target_is_written_and_not_refetched_in_window():
    nulls = {k: None for k in fat.FIGURES}
    got, _ = go(fetch=fake(figures={"P1": nulls}))
    assert got["P1"]["mean"] is None and got["P1"]["fetched_at"]
    calls = []
    go(got, fetch=fake(calls))
    assert "P1" not in calls


def test_failing_name_keeps_previous_entry_and_run_continues():
    old = entry(ago(days=30), mean=7.0)
    got, (nl, nr, failed, _) = go({"P1": old}, fetch=fake(fail={"P1", "RN1"}))
    assert got["P1"] == old
    assert "RN1" not in got
    assert failed == 2 and nl == 1 and nr == 2


def test_names_outside_both_sets_are_kept():
    gone = entry(ago(days=90), mean=3.0)
    got, _ = go({"V1": gone, "OLDLIST": gone})
    assert got["V1"] == gone and got["OLDLIST"] == gone


def test_zero_is_a_value():
    got, _ = go(fetch=fake(figures={"RN1": {"mean": 0.0, "median": 0.0, "high": 0.0, "low": 0.0}}))
    assert got["RN1"]["mean"] == 0.0 and got["RN1"]["low"] == 0.0


def test_dry_run_calls_nothing_and_changes_nothing(capsys):
    calls = []
    got, res = go(fetch=fake(calls), dry_run=True)
    assert calls == [] and got == {} and res[:3] == (0, 0, 0)
    assert "WOULD fetch 2 list names" in capsys.readouterr().out


def test_only_restricts_the_names():
    calls = []
    go(fetch=fake(calls), only={"WL1", "P2"})
    assert calls == ["WL1", "P2"]


def test_atomic_write_replaces_whole_file_and_leaves_no_temp(tmp_path):
    target = tmp_path / "analyst_targets.json"
    target.write_text('{"old": true}', encoding="utf-8")
    fat.write_json_atomic(target, {"schema": "analyst_targets_v1", "tickers": {"A": entry(ago(hours=1))}})
    assert json.loads(target.read_text(encoding="utf-8"))["schema"] == "analyst_targets_v1"
    assert [p.name for p in tmp_path.iterdir()] == ["analyst_targets.json"]


def test_atomic_write_failure_leaves_old_file(tmp_path):
    target = tmp_path / "analyst_targets.json"
    target.write_text('{"old": true}', encoding="utf-8")
    with pytest.raises(TypeError):
        fat.write_json_atomic(target, {"bad": object()})
    assert json.loads(target.read_text(encoding="utf-8")) == {"old": True}

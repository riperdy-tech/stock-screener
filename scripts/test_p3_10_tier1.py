"""test_p3_10_tier1.py — Unit tests for P3.10 (Tier 1 statutory rule and hard benchmark gate).

Covers: the SEC staleness rule on a period-end basis (16 months, not a hardcoded fiscal year);
the fundamentals_ttm.json fy_leg_end fallback when fundamentals_history has no period-end
entry for the latest fiscal year; ALTERNATE_REPORTING written per ticker into the survivors
file; the ADV source order (P3.6c, now shared with SCR-03b via hygiene_thresholds.py); and the
benchmark preservation gate exiting non-zero for any non-NOT_TRADABLE veto of a preserved name.

Never writes under public/data — every path is monkeypatched to a pytest tmp_path.
Run: python -m pytest scripts/test_p3_10_tier1.py -q
"""
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import filter_tier1_hygiene as fth  # noqa: E402


def _stock(symbol, mcap=1e9, price=50.0, vol=1_000_000, sector="Technology",
           industry="Software", country="United States", adv_20d_usd=None):
    s = {
        "symbol": symbol, "marketCap": mcap, "price": price, "volume": vol,
        "sector": sector, "industry": industry, "country": country,
    }
    if adv_20d_usd is not None:
        s["metrics"] = {"adv_20d_usd": adv_20d_usd}
    return s


def _date_months_ago(months):
    now = datetime.now(timezone.utc)
    return (now - timedelta(days=months * 30.4368)).strftime("%Y-%m-%d")


def _setup(tmp_path, monkeypatch, stocks, fundamentals_tickers=None, period_end=None,
           ttm_tickers=None, momentum_tickers=None, benchmark_preserve=None):
    monkeypatch.setattr(fth, "STOCKS_JSON", tmp_path / "stocks.json")
    monkeypatch.setattr(fth, "FUNDAMENTALS_JSON", tmp_path / "fundamentals_history.json")
    monkeypatch.setattr(fth, "FUNDAMENTALS_TTM_JSON", tmp_path / "fundamentals_ttm.json")
    monkeypatch.setattr(fth, "MOMENTUM_STATE_JSON", tmp_path / "momentum_state.json")
    monkeypatch.setattr(fth, "CIK_MAP_JSON", tmp_path / "cik_map.json")
    monkeypatch.setattr(fth, "OUT_SURVIVORS_JSON", tmp_path / "tier1_hygiene_survivors.json")
    monkeypatch.setattr(fth, "OUT_AUDIT_JSON", tmp_path / "tier1_hygiene_audit.json")
    monkeypatch.setattr(fth, "BENCHMARK_PRESERVE", benchmark_preserve if benchmark_preserve is not None else [])

    (tmp_path / "stocks.json").write_text(json.dumps(stocks), encoding="utf-8")
    (tmp_path / "fundamentals_history.json").write_text(json.dumps({
        "tickers": fundamentals_tickers or {},
        "provenance": {"period_end": period_end or {}},
    }), encoding="utf-8")
    (tmp_path / "fundamentals_ttm.json").write_text(json.dumps({
        "tickers": ttm_tickers or {},
    }), encoding="utf-8")
    (tmp_path / "momentum_state.json").write_text(json.dumps({
        "tickers": momentum_tickers or {},
    }), encoding="utf-8")
    (tmp_path / "cik_map.json").write_text(json.dumps({}), encoding="utf-8")


# ── Constant removal (P3.10) ─────────────────────────────────────────────────

def test_old_constants_removed_and_one_used_constant_remains():
    assert not hasattr(fth, "EVAL_YEAR")
    assert not hasattr(fth, "MIN_COMPLIANT_FY")
    assert not hasattr(fth, "MAX_STALE_MONTHS")
    assert fth.STALE_ANNUAL_REPORT_MAX_MONTHS == 16


# ── Period-end resolution (pure function) ────────────────────────────────────

def test_resolve_period_end_prefers_fundamentals_history_over_ttm():
    pe = fth.resolve_period_end(
        "AAPL", [2024, 2025], {"AAPL": {"2025": "2025-09-27"}}, {"AAPL": {"fy_leg_end": "2025-01-01"}}
    )
    assert pe == "2025-09-27"


def test_resolve_period_end_falls_back_to_ttm_fy_leg_end():
    pe = fth.resolve_period_end("XYZ", [2024, 2025], {}, {"XYZ": {"fy_leg_end": "2025-10-31"}})
    assert pe == "2025-10-31"


def test_resolve_period_end_none_when_neither_source_has_it():
    assert fth.resolve_period_end("ZZZ", [2024], {}, {}) is None


def test_resolve_period_end_none_when_no_fundamentals_years():
    assert fth.resolve_period_end("ZZZ", [], {"ZZZ": {"2024": "2024-01-01"}}, {}) is None


# ── months_since (pure function) ─────────────────────────────────────────────

def test_months_since_basic():
    now = datetime(2026, 9, 24, tzinfo=timezone.utc)
    assert fth.months_since("2026-07-24", now) == pytest.approx(2.0, abs=0.1)


def test_months_since_none_for_missing_or_bad_date():
    now = datetime.now(timezone.utc)
    assert fth.months_since(None, now) is None
    assert fth.months_since("not-a-date", now) is None


# ── SEC statutory staleness on a period-end basis (integration through evaluate_tier1) ──

def test_recent_period_end_survives_no_staleness_veto(tmp_path, monkeypatch):
    stocks = [_stock("FRESH")]
    _setup(tmp_path, monkeypatch, stocks,
           fundamentals_tickers={"FRESH": {"2025": {}}},
           period_end={"FRESH": {"2025": _date_months_ago(3)}})

    survivors = fth.evaluate_tier1()

    assert "FRESH" in survivors
    audit = json.loads((tmp_path / "tier1_hygiene_audit.json").read_text(encoding="utf-8"))
    assert audit["details"]["FRESH"]["decision"] == "PASS"


def test_stale_period_end_beyond_16_months_vetoes(tmp_path, monkeypatch):
    stocks = [_stock("STALE")]
    _setup(tmp_path, monkeypatch, stocks,
           fundamentals_tickers={"STALE": {"2024": {}}},
           period_end={"STALE": {"2024": _date_months_ago(20)}})

    survivors = fth.evaluate_tier1()

    assert "STALE" not in survivors
    audit = json.loads((tmp_path / "tier1_hygiene_audit.json").read_text(encoding="utf-8"))
    assert audit["details"]["STALE"]["primary_reason"] == "SEC_DELINQUENT_STALE_ANNUAL_REPORT"


def test_just_under_16_months_is_not_stale():
    # The rule is "> 16 months", not ">=" — a day inside the boundary must not trip it.
    now = datetime.now(timezone.utc)
    d = (now - timedelta(days=16 * 30.4368 - 1)).strftime("%Y-%m-%d")
    assert fth.months_since(d, now) < 16.0


def test_ttm_fy_leg_end_fallback_used_when_period_end_missing(tmp_path, monkeypatch):
    stocks = [_stock("TTMFALLBACK")]
    _setup(tmp_path, monkeypatch, stocks,
           fundamentals_tickers={"TTMFALLBACK": {"2025": {}}},
           period_end={},   # no period_end entry at all for this ticker
           ttm_tickers={"TTMFALLBACK": {"fy_leg_end": _date_months_ago(20)}})

    survivors = fth.evaluate_tier1()

    assert "TTMFALLBACK" not in survivors
    audit = json.loads((tmp_path / "tier1_hygiene_audit.json").read_text(encoding="utf-8"))
    assert audit["details"]["TTMFALLBACK"]["primary_reason"] == "SEC_DELINQUENT_STALE_ANNUAL_REPORT"


# ── ALTERNATE_REPORTING written per ticker into the survivors file (P3.10) ──

def test_alternate_reporting_survivor_is_written_into_survivors_file(tmp_path, monkeypatch):
    stocks = [_stock("FOREIGN", country="Japan")]
    _setup(tmp_path, monkeypatch, stocks, fundamentals_tickers={}, period_end={})

    survivors = fth.evaluate_tier1()

    assert "FOREIGN" in survivors
    survivors_data = json.loads((tmp_path / "tier1_hygiene_survivors.json").read_text(encoding="utf-8"))
    assert survivors_data["alternate_reporting"] == ["FOREIGN"]


def test_domestic_issuer_with_no_fundamentals_is_vetoed_not_flagged(tmp_path, monkeypatch):
    stocks = [_stock("NODATA", country="United States")]
    _setup(tmp_path, monkeypatch, stocks, fundamentals_tickers={}, period_end={})

    survivors = fth.evaluate_tier1()

    assert "NODATA" not in survivors
    survivors_data = json.loads((tmp_path / "tier1_hygiene_survivors.json").read_text(encoding="utf-8"))
    assert survivors_data["alternate_reporting"] == []


# ── ADV source order (P3.6c): stocks.metrics.adv_20d_usd -> momentum_state -> snapshot ──

def test_adv_prefers_stocks_metrics_over_momentum_state_and_snapshot(tmp_path, monkeypatch):
    # Snapshot (vol*price) and momentum_state would both fail the 300k floor; the universe-wide
    # stocks.metrics value clears it, so the name must survive on that value alone.
    stocks = [_stock("ADVWIDE", vol=1.0, price=50.0, adv_20d_usd=500_000.0)]
    _setup(tmp_path, monkeypatch, stocks,
           fundamentals_tickers={"ADVWIDE": {"2025": {}}},
           period_end={"ADVWIDE": {"2025": _date_months_ago(1)}},
           momentum_tickers={"ADVWIDE": {"adv_20d_usd": 1_000.0}})

    survivors = fth.evaluate_tier1()

    assert "ADVWIDE" in survivors


def test_adv_below_300k_from_stocks_metrics_still_vetoes(tmp_path, monkeypatch):
    stocks = [_stock("ADVTHIN", vol=1_000_000.0, price=50.0, adv_20d_usd=100_000.0)]
    _setup(tmp_path, monkeypatch, stocks,
           fundamentals_tickers={"ADVTHIN": {"2025": {}}},
           period_end={"ADVTHIN": {"2025": _date_months_ago(1)}})

    survivors = fth.evaluate_tier1()

    assert "ADVTHIN" not in survivors
    audit = json.loads((tmp_path / "tier1_hygiene_audit.json").read_text(encoding="utf-8"))
    assert audit["details"]["ADVTHIN"]["primary_reason"] == "ADV_BELOW_300K"


# ── Benchmark preservation hard gate (P3.10) ─────────────────────────────────

def test_benchmark_hard_fail_exempts_not_tradable_only():
    audit_log = {
        "A": {"primary_reason": "NOT_TRADABLE"},
        "B": {"primary_reason": "PRICE_BELOW_3"},
        "C": {},   # never scored at all -> no primary_reason
    }
    assert fth.benchmark_hard_fail(["A", "B", "C"], audit_log) == ["B", "C"]
    assert fth.benchmark_hard_fail(["A"], audit_log) == []


def test_benchmark_vetoed_for_non_not_tradable_reason_exits_nonzero(tmp_path, monkeypatch):
    stocks = [_stock("BADBENCH", price=1.0)]   # fails PRICE_BELOW_3
    _setup(tmp_path, monkeypatch, stocks, benchmark_preserve=["BADBENCH"])

    with pytest.raises(SystemExit) as exc_info:
        fth.evaluate_tier1()
    assert exc_info.value.code == 1


def test_benchmark_all_present_and_clean_does_not_exit(tmp_path, monkeypatch):
    stocks = [_stock("GOODBENCH")]
    _setup(tmp_path, monkeypatch, stocks,
           fundamentals_tickers={"GOODBENCH": {"2025": {}}},
           period_end={"GOODBENCH": {"2025": _date_months_ago(1)}},
           benchmark_preserve=["GOODBENCH"])

    survivors = fth.evaluate_tier1()   # must not raise SystemExit

    assert "GOODBENCH" in survivors


# ── SCR-03b: alternate_reporting_unverified veto_detail (score_factors_dual_door.py) ────────
# Mirrors the one-line stamp added next to score_factors_dual_door.py's NO_FUNDAMENTAL_HISTORY
# veto (same pattern test_p36_forensic_solvency.py uses for the rest of that file's gates).

def _no_fundamental_history_veto_detail(ticker, years, alternate_reporting_tickers):
    if years:
        return None
    return "alternate_reporting_unverified" if ticker in alternate_reporting_tickers else None


def test_alternate_reporting_ticker_gets_specific_veto_detail():
    assert _no_fundamental_history_veto_detail("FOREIGN", [], {"FOREIGN"}) == "alternate_reporting_unverified"


def test_plain_no_fundamentals_ticker_gets_no_veto_detail():
    assert _no_fundamental_history_veto_detail("NODATA", [], set()) is None

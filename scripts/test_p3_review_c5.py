"""test_p3_review_c5.py — tests for C5 benchmark hard gate untradable exemption."""
import json
import pytest
from datetime import datetime, timezone
import filter_tier1_hygiene as fth
import tradability


def _stock(sym, price=50.0, mcap=1e9, vol=1e6, adv_20d_usd=None, country="United States",
           industry="Software", last_listed="2026-09-01"):
    s = {
        "symbol": sym,
        "price": price,
        "marketCap": mcap,
        "volume": vol,
        "country": country,
        "industry": industry,
        "last_listed": last_listed,
    }
    if adv_20d_usd is not None:
        s["metrics"] = {"adv_20d_usd": adv_20d_usd}
    return s


def _setup(tmp_path, monkeypatch, stocks, benchmark_preserve=None, untradable_cfg=None):
    monkeypatch.setattr(fth, "DATA", tmp_path)
    monkeypatch.setattr(fth, "STOCKS_JSON", tmp_path / "stocks.json")
    monkeypatch.setattr(fth, "FUNDAMENTALS_JSON", tmp_path / "fundamentals_history.json")
    monkeypatch.setattr(fth, "FUNDAMENTALS_TTM_JSON", tmp_path / "fundamentals_ttm.json")
    monkeypatch.setattr(fth, "MOMENTUM_STATE_JSON", tmp_path / "momentum_state.json")
    monkeypatch.setattr(fth, "CIK_MAP_JSON", tmp_path / "cik_map.json")
    monkeypatch.setattr(fth, "OUT_SURVIVORS_JSON", tmp_path / "tier1_hygiene_survivors.json")
    monkeypatch.setattr(fth, "OUT_AUDIT_JSON", tmp_path / "tier1_hygiene_audit.json")

    if benchmark_preserve is not None:
        monkeypatch.setattr(fth, "BENCHMARK_PRESERVE", list(benchmark_preserve))

    if untradable_cfg is not None:
        monkeypatch.setattr(tradability, "load_config", lambda path=None: untradable_cfg)

    (tmp_path / "stocks.json").write_text(json.dumps(stocks), encoding="utf-8")

    # Provide clean fundamentals for all stocks
    tickers = {s["symbol"]: {"2025": {}} for s in stocks}
    p_ends = {s["symbol"]: {"2025": "2026-06-30"} for s in stocks}
    (tmp_path / "fundamentals_history.json").write_text(
        json.dumps({"tickers": tickers, "provenance": {"period_end": p_ends}}), encoding="utf-8")
    (tmp_path / "fundamentals_ttm.json").write_text(json.dumps({"tickers": {}}), encoding="utf-8")
    (tmp_path / "momentum_state.json").write_text(json.dumps({"tickers": {}}), encoding="utf-8")
    (tmp_path / "cik_map.json").write_text(json.dumps({s["symbol"]: "0001" for s in stocks}), encoding="utf-8")


def test_benchmark_hard_fail_unit():
    audit_log = {
        "UNTRADABLE_BENCH": {"primary_reason": "NOT_TRADABLE"},
        "CHEAP_BENCH": {"primary_reason": "PRICE_BELOW_3"},
        "CLEAN_BENCH": {"primary_reason": "CLEAN"},
    }
    untradable_map = {"UNTRADABLE_BENCH": "delisted"}
    # Missing benchmarks: UNTRADABLE_BENCH and CHEAP_BENCH
    fails = fth.benchmark_hard_fail(["UNTRADABLE_BENCH", "CHEAP_BENCH"], audit_log, untradable_map)
    assert fails == ["CHEAP_BENCH"]

    # When untradable_map has it even if audit_log had another reason
    fails2 = fth.benchmark_hard_fail(["CHEAP_BENCH"], audit_log, {"CHEAP_BENCH": "halted"})
    assert fails2 == []


def test_delisted_benchmark_does_not_fail_chain_and_prints_note(tmp_path, monkeypatch, capsys):
    """C5: A benchmark marked untradable does not exit 1 and prints an exemption note."""
    stocks = [
        _stock("BENCH_DELISTED"),
        _stock("BENCH_ACTIVE"),
    ]
    untradable_cfg = {
        "grace_days": 5,
        "tickers": {"BENCH_DELISTED": {"reason": "acquired and delisted"}},
    }
    _setup(tmp_path, monkeypatch, stocks,
           benchmark_preserve=["BENCH_DELISTED", "BENCH_ACTIVE"],
           untradable_cfg=untradable_cfg)

    # Should not raise SystemExit
    survivors = fth.evaluate_tier1()

    assert "BENCH_ACTIVE" in survivors
    assert "BENCH_DELISTED" not in survivors

    captured = capsys.readouterr()
    assert "[NOTE] Benchmark preservation exemption: BENCH_DELISTED is untradable" in captured.out
    assert "Benchmark Preservation verified" in captured.out


def test_benchmark_vetoed_for_other_reason_still_fails(tmp_path, monkeypatch):
    """C5: A benchmark vetoed for anything else (e.g. price < 3) still fails with exit 1."""
    stocks = [
        _stock("BENCH_CHEAP", price=1.50),
        _stock("BENCH_ACTIVE"),
    ]
    untradable_cfg = {"grace_days": 5, "tickers": {}}
    _setup(tmp_path, monkeypatch, stocks,
           benchmark_preserve=["BENCH_CHEAP", "BENCH_ACTIVE"],
           untradable_cfg=untradable_cfg)

    with pytest.raises(SystemExit) as exc_info:
        fth.evaluate_tier1()
    assert exc_info.value.code == 1

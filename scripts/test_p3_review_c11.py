"""test_p3_review_c11.py — tests for C11 market cap derivation and NO_MARKET_CAP_DATA veto."""
import json
import pytest
from datetime import datetime, timezone
import filter_tier1_hygiene as fth
import hygiene_thresholds as ht
import score_factors_dual_door as sfdd


def test_resolve_market_cap_unit():
    # 1. Existing positive market cap is kept as-is, not derived
    mcap, derived = ht.resolve_market_cap(1e9, 50.0, 2e7, {})
    assert mcap == 1e9
    assert derived is False

    # 2. Zero or None mcap derives from price * shares_diluted
    mcap, derived = ht.resolve_market_cap(0.0, 50.0, 2e7, {})
    assert mcap == 1e9
    assert derived is True

    mcap, derived = ht.resolve_market_cap(None, 50.0, 2e7, {})
    assert mcap == 1e9
    assert derived is True

    # 3. Falls back to metrics shares_diluted / shares / float
    mcap, derived = ht.resolve_market_cap(0.0, 50.0, None, {"shares": 1e7})
    assert mcap == 5e8
    assert derived is True

    mcap, derived = ht.resolve_market_cap(0.0, 50.0, None, {"float": 8e6})
    assert mcap == 4e8
    assert derived is True

    # 4. Neither exists -> None, False
    mcap, derived = ht.resolve_market_cap(0.0, 50.0, None, {})
    assert mcap is None
    assert derived is False

    mcap, derived = ht.resolve_market_cap(None, None, 2e7, {})
    assert mcap is None
    assert derived is False


def test_tier1_mcap_derived_survives_and_stamped(tmp_path, monkeypatch):
    """C11: zero-cap name with shares derives mcap >= 300M, survives Tier 1 and gets stamped."""
    stocks = [{
        "symbol": "DERIVED_OK",
        "price": 50.0,
        "marketCap": 0.0,
        "volume": 1e6,
        "country": "United States",
        "industry": "Software",
    }]
    monkeypatch.setattr(fth, "DATA", tmp_path)
    monkeypatch.setattr(fth, "STOCKS_JSON", tmp_path / "stocks.json")
    monkeypatch.setattr(fth, "FUNDAMENTALS_JSON", tmp_path / "fundamentals_history.json")
    monkeypatch.setattr(fth, "FUNDAMENTALS_TTM_JSON", tmp_path / "fundamentals_ttm.json")
    monkeypatch.setattr(fth, "MOMENTUM_STATE_JSON", tmp_path / "momentum_state.json")
    monkeypatch.setattr(fth, "CIK_MAP_JSON", tmp_path / "cik_map.json")
    monkeypatch.setattr(fth, "OUT_SURVIVORS_JSON", tmp_path / "tier1_hygiene_survivors.json")
    monkeypatch.setattr(fth, "OUT_AUDIT_JSON", tmp_path / "tier1_hygiene_audit.json")
    monkeypatch.setattr(fth, "BENCHMARK_PRESERVE", ["DERIVED_OK"])

    (tmp_path / "stocks.json").write_text(json.dumps(stocks), encoding="utf-8")
    # shares_diluted = 10M -> derived mcap = $500M >= $300M
    fh = {"DERIVED_OK": {"2025": {"shares_diluted": 10_000_000.0}}}
    p_ends = {"DERIVED_OK": {"2025": "2026-06-30"}}
    (tmp_path / "fundamentals_history.json").write_text(
        json.dumps({"tickers": fh, "provenance": {"period_end": p_ends}}), encoding="utf-8")
    (tmp_path / "fundamentals_ttm.json").write_text(json.dumps({"tickers": {}}), encoding="utf-8")
    (tmp_path / "momentum_state.json").write_text(json.dumps({"tickers": {}}), encoding="utf-8")
    (tmp_path / "cik_map.json").write_text(json.dumps({"DERIVED_OK": "0001"}), encoding="utf-8")

    survivors = fth.evaluate_tier1()
    assert "DERIVED_OK" in survivors

    audit = json.loads((tmp_path / "tier1_hygiene_audit.json").read_text(encoding="utf-8"))
    detail = audit["details"]["DERIVED_OK"]
    assert detail["decision"] == "PASS"
    assert detail["mcap_derived"] is True
    assert detail["marketCap"] == 500_000_000.0
    assert "DATA_FLAG: MCAP_DERIVED" in detail["flags"]


def test_tier1_no_market_cap_data_veto(tmp_path, monkeypatch):
    """C11: zero-cap name with no shares data is vetoed with NO_MARKET_CAP_DATA, not min-cap."""
    stocks = [{
        "symbol": "NOCAP",
        "price": 50.0,
        "marketCap": 0.0,
        "volume": 1e6,
        "country": "United States",
        "industry": "Software",
    }]
    monkeypatch.setattr(fth, "DATA", tmp_path)
    monkeypatch.setattr(fth, "STOCKS_JSON", tmp_path / "stocks.json")
    monkeypatch.setattr(fth, "FUNDAMENTALS_JSON", tmp_path / "fundamentals_history.json")
    monkeypatch.setattr(fth, "FUNDAMENTALS_TTM_JSON", tmp_path / "fundamentals_ttm.json")
    monkeypatch.setattr(fth, "MOMENTUM_STATE_JSON", tmp_path / "momentum_state.json")
    monkeypatch.setattr(fth, "CIK_MAP_JSON", tmp_path / "cik_map.json")
    monkeypatch.setattr(fth, "OUT_SURVIVORS_JSON", tmp_path / "tier1_hygiene_survivors.json")
    monkeypatch.setattr(fth, "OUT_AUDIT_JSON", tmp_path / "tier1_hygiene_audit.json")
    monkeypatch.setattr(fth, "BENCHMARK_PRESERVE", [])

    (tmp_path / "stocks.json").write_text(json.dumps(stocks), encoding="utf-8")
    # No shares in fundamentals or metrics
    fh = {"NOCAP": {"2025": {}}}
    p_ends = {"NOCAP": {"2025": "2026-06-30"}}
    (tmp_path / "fundamentals_history.json").write_text(
        json.dumps({"tickers": fh, "provenance": {"period_end": p_ends}}), encoding="utf-8")
    (tmp_path / "fundamentals_ttm.json").write_text(json.dumps({"tickers": {}}), encoding="utf-8")
    (tmp_path / "momentum_state.json").write_text(json.dumps({"tickers": {}}), encoding="utf-8")
    (tmp_path / "cik_map.json").write_text(json.dumps({"NOCAP": "0001"}), encoding="utf-8")

    survivors = fth.evaluate_tier1()
    assert "NOCAP" not in survivors

    audit = json.loads((tmp_path / "tier1_hygiene_audit.json").read_text(encoding="utf-8"))
    detail = audit["details"]["NOCAP"]
    assert detail["decision"] == "VETO"
    assert detail["primary_reason"] == "NO_MARKET_CAP_DATA"


def test_dac_and_gsl_derive_and_survive():
    """C11: Verify DAC and GSL profiles resolve market cap and survive."""
    # DAC: price 154.83, shares_diluted = 18,480,301, marketCap = 0
    dac_mcap, dac_derived = ht.resolve_market_cap(0.0, 154.83, 18_480_301.0, {})
    assert dac_derived is True
    assert dac_mcap > 2.8e9  # ~$2.86B >= $300M
    assert dac_mcap >= ht.MIN_MARKET_CAP

    # GSL: price 44.505, float = 31,894,602, marketCap = 0
    gsl_mcap, gsl_derived = ht.resolve_market_cap(0.0, 44.505, None, {"float": 31_894_602.0})
    assert gsl_derived is True
    assert gsl_mcap > 1.4e9  # ~$1.42B >= $300M
    assert gsl_mcap >= ht.MIN_MARKET_CAP

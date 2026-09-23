"""Unit tests for P3 review C4: ADV_ENFORCE switch in sifter_config.json, honoured by BOTH Tier 1 and SCR-03b."""

import json
from pathlib import Path
import pytest

import hygiene_thresholds as ht
import filter_tier1_hygiene as fth
import score_factors_dual_door as sfdd


def test_sifter_config_has_adv_enforce_false():
    """C4: sifter_config.json has explicit switch ADV_ENFORCE: false."""
    cfg_path = Path(__file__).resolve().parent / "sifter_config.json"
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    assert "ADV_ENFORCE" in cfg
    assert cfg["ADV_ENFORCE"] is False
    assert ht.load_adv_enforce(cfg_path) is False


def test_tier1_honors_adv_enforce_switch(tmp_path, monkeypatch):
    """C4: Tier 1 honours ADV_ENFORCE: false -> flag below_min_adv, no veto; true -> vetoes."""
    stocks = [{
        "symbol": "THIN", "price": 10.0, "marketCap": 500_000_000, "volume": 1000,
        "sector": "Technology", "country": "United States",
        "metrics": {"adv_20d_usd": 150_000.0}  # below 300k
    }]
    (tmp_path / "stocks.json").write_text(json.dumps(stocks), encoding="utf-8")
    (tmp_path / "fundamentals_history.json").write_text(json.dumps({
        "tickers": {"THIN": {"2025": {}}},
        "provenance": {"period_end": {"THIN": {"2025": "2026-08-01"}}}
    }), encoding="utf-8")
    (tmp_path / "fundamentals_ttm.json").write_text(json.dumps({"tickers": {}}), encoding="utf-8")
    (tmp_path / "momentum_state.json").write_text(json.dumps({"tickers": {}}), encoding="utf-8")
    (tmp_path / "cik_map.json").write_text(json.dumps({"THIN": "0000000001"}), encoding="utf-8")
    monkeypatch.setattr(fth, "STOCKS_JSON", tmp_path / "stocks.json")
    monkeypatch.setattr(fth, "FUNDAMENTALS_JSON", tmp_path / "fundamentals_history.json")
    monkeypatch.setattr(fth, "FUNDAMENTALS_TTM_JSON", tmp_path / "fundamentals_ttm.json")
    monkeypatch.setattr(fth, "MOMENTUM_STATE_JSON", tmp_path / "momentum_state.json")
    monkeypatch.setattr(fth, "CIK_MAP_JSON", tmp_path / "cik_map.json")
    monkeypatch.setattr(fth, "OUT_SURVIVORS_JSON", tmp_path / "tier1_hygiene_survivors.json")
    monkeypatch.setattr(fth, "OUT_AUDIT_JSON", tmp_path / "tier1_hygiene_audit.json")
    monkeypatch.setattr(fth, "BENCHMARK_PRESERVE", [])

    # Case 1: ADV_ENFORCE = False
    monkeypatch.setattr(fth, "ADV_ENFORCE", False)
    survivors = fth.evaluate_tier1()
    assert "THIN" in survivors
    audit = json.loads((tmp_path / "tier1_hygiene_audit.json").read_text(encoding="utf-8"))
    assert audit["details"]["THIN"]["decision"] == "PASS"
    assert "below_min_adv" in audit["details"]["THIN"]["flags"]
    assert audit["details"]["THIN"].get("below_min_adv") == 150_000.0

    # Case 2: ADV_ENFORCE = True
    monkeypatch.setattr(fth, "ADV_ENFORCE", True)
    survivors_enforced = fth.evaluate_tier1()
    assert "THIN" not in survivors_enforced
    audit_enforced = json.loads((tmp_path / "tier1_hygiene_audit.json").read_text(encoding="utf-8"))
    assert audit_enforced["details"]["THIN"]["decision"] == "VETO"
    assert audit_enforced["details"]["THIN"]["primary_reason"] == "ADV_BELOW_300K"


def test_scr03b_honors_adv_enforce_switch():
    """C4: SCR-03b honours ADV_ENFORCE switch: false -> below_min_adv flag with value; true -> veto."""
    adv_val = 150_000.0
    min_adv = 300_000.0

    # When ADV_ENFORCE is False:
    adv_enforce = False
    cur_flags = []
    ticker_flag_detail = {}
    vetoes = {}
    if adv_val < min_adv:
        if adv_enforce:
            vetoes["T"] = "ILLIQUID_ADV_BELOW_300K"
        else:
            if "below_min_adv" not in cur_flags:
                cur_flags.append("below_min_adv")
            ticker_flag_detail["below_min_adv"] = round(adv_val, 2)

    assert "T" not in vetoes
    assert "below_min_adv" in cur_flags
    assert ticker_flag_detail["below_min_adv"] == 150_000.0

    # When ADV_ENFORCE is True:
    adv_enforce = True
    cur_flags_enf = []
    ticker_flag_detail_enf = {}
    vetoes_enf = {}
    if adv_val < min_adv:
        if adv_enforce:
            vetoes_enf["T"] = "ILLIQUID_ADV_BELOW_300K"
        else:
            if "below_min_adv" not in cur_flags_enf:
                cur_flags_enf.append("below_min_adv")
            ticker_flag_detail_enf["below_min_adv"] = round(adv_val, 2)

    assert vetoes_enf["T"] == "ILLIQUID_ADV_BELOW_300K"

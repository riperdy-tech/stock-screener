"""test_p3_review_c6.py — tests for C6 anchor_incomplete_fallback when anchor lacks required fields
and stale P3.11 invariant text fix.
"""
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
import pytest
import score_factors_dual_door as sfdd
import build_valuation_models as bvm


def _iso_date(days_ago: int = 0) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).strftime("%Y-%m-%d")


def _write(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")


def _good_anchor():
    return {
        "asof": _iso_date(1),
        "degraded": False,
        "risk_free": {"nominal_10y": 0.045},
        "implied_erp": 0.05,
        "sector_loadings": {"Technology": 1.2, "information_technology": 1.2},
    }


def test_sfdd_anchor_missing_nominal_10y(tmp_path, monkeypatch):
    data = _good_anchor()
    del data["risk_free"]["nominal_10y"]
    path = tmp_path / "cost_of_capital_anchor.json"
    _write(path, data)
    monkeypatch.setattr(sfdd, "COST_OF_CAPITAL_ANCHOR_JSON", path)

    anchor, meta = sfdd.load_coe_anchor()
    assert anchor is None
    assert meta["discount_rate_source"] == "anchor_incomplete_fallback"
    assert "risk_free.nominal_10y" in meta["reason"]
    assert meta.get("missing_field") == "risk_free.nominal_10y"


def test_sfdd_anchor_missing_implied_erp(tmp_path, monkeypatch):
    data = _good_anchor()
    del data["implied_erp"]
    path = tmp_path / "cost_of_capital_anchor.json"
    _write(path, data)
    monkeypatch.setattr(sfdd, "COST_OF_CAPITAL_ANCHOR_JSON", path)

    anchor, meta = sfdd.load_coe_anchor()
    assert anchor is None
    assert meta["discount_rate_source"] == "anchor_incomplete_fallback"
    assert "implied_erp" in meta["reason"]
    assert meta.get("missing_field") == "implied_erp"


def test_sfdd_anchor_missing_sector_loadings(tmp_path, monkeypatch):
    data = _good_anchor()
    del data["sector_loadings"]
    path = tmp_path / "cost_of_capital_anchor.json"
    _write(path, data)
    monkeypatch.setattr(sfdd, "COST_OF_CAPITAL_ANCHOR_JSON", path)

    anchor, meta = sfdd.load_coe_anchor()
    assert anchor is None
    assert meta["discount_rate_source"] == "anchor_incomplete_fallback"
    assert "sector_loadings" in meta["reason"]
    assert meta.get("missing_field") == "sector_loadings"


def test_bvm_anchor_incomplete_fallback_matches_sfdd(tmp_path, monkeypatch):
    data = _good_anchor()
    del data["risk_free"]["nominal_10y"]
    path = tmp_path / "cost_of_capital_anchor.json"
    _write(path, data)
    monkeypatch.setattr(bvm, "COST_OF_CAPITAL_ANCHOR_JSON", path)

    anchor, meta = bvm.load_coe_anchor()
    assert anchor is None
    assert meta["discount_rate_source"] == "anchor_incomplete_fallback"
    assert "risk_free.nominal_10y" in meta["reason"]
    assert meta.get("missing_field") == "risk_free.nominal_10y"


def test_run_chain_invariant_text_not_stale():
    run_chain_text = Path(__file__).resolve().with_name("run_chain.py").read_text(encoding="utf-8")
    assert "constant fallback until P3.9" not in run_chain_text

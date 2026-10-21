"""build_macro_events.py: the MRI-15 per-stock news index (display only; nothing here changes a score)."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_macro_events as bme  # noqa: E402

STOCKS = [
    {"symbol": "CRWV", "sector": "Technology", "industry": "Information Technology Services"},
    {"symbol": "ACN", "sector": "Technology", "industry": "Information Technology Services"},
    {"symbol": "XOM", "sector": "Energy", "industry": "Oil & Gas Integrated"},
    {"symbol": "JPM", "sector": "Financial Services", "industry": "Banks - Diversified"},
]


def _cand(cid, onset, tickers=(), sectors=(), checks=()):
    return {"candidate_id": cid, "title": f"t {cid}", "onset": onset, "status_window": {"status": "open"},
            "publisher_count": 1, "corroboration": {"category": "single_source"},
            "classification_status": {"classified_reports": 1}, "themes": [{"theme_id": "credit_stress", "direction": "positive"}],
            "entities_resolved": [{"key": f"T:{t}", "tickers": [t]} for t in tickers],
            "sector_exposure": [{"sector_id": s} for s in sectors], "flags": ["single_source", "resolver_flags"],
            "market_response": {"checks": list(checks), "company_checks": [], "bond_data": "unavailable"}}


def _register(cands):
    return {"schema_version": 1, "as_of_date": "2026-10-21", "notice": "n", "candidates": cands,
            "market_response_method": {"meaning": "what the market did"}}


def test_named_peer_and_sector_tiers():
    reg = _register([
        _cand("evt_1", "2026-10-14T20:46:32", tickers=("CRWV",), sectors=("information_technology",)),
        _cand("evt_2", "2026-10-15T10:00:00", sectors=("energy",)),
        _cand("evt_3", "2026-10-16T10:00:00"),   # no ticker, no sector: not in the index
    ])
    idx = bme.build_index(reg, STOCKS)
    ids = [c["candidate_id"] for c in idx["candidates"]]
    assert ids == ["evt_2", "evt_1"]                      # newest first; evt_3 has no ticker and no sector
    assert idx["named"] == {"CRWV": [ids.index("evt_1")]}
    cluster = bme.get_taxonomy_profile("Information Technology Services", "Technology")["cluster"]
    if cluster != "general_unclassified":
        assert idx["peer"] == {cluster: [ids.index("evt_1")]}
        assert idx["cluster_of"]["ACN"] == cluster and "XOM" not in idx["cluster_of"]
    assert idx["sector"] == {"Energy": [ids.index("evt_2")], "Technology": [ids.index("evt_1")]}
    assert idx["candidates"][ids.index("evt_1")]["flags"] == ["single_source"]
    assert idx["market_meaning"] == "what the market did" and idx["register_as_of_date"] == "2026-10-21"


def test_unknown_register_schema_is_refused():
    with pytest.raises(ValueError):
        bme.build_index({"schema_version": 2, "candidates": []}, STOCKS)


def test_missing_register_leaves_the_index_alone(tmp_path):
    out = tmp_path / "macro_events.json"
    out.write_text("{}", encoding="utf-8")
    assert bme.build_macro_events(outputs_dir=tmp_path, stocks_path=tmp_path / "none.json", out_path=out) is None
    assert out.read_text(encoding="utf-8") == "{}"


def test_writes_the_index_with_the_run_status(tmp_path):
    (tmp_path / "event_register.json").write_text(json.dumps(_register([_cand("evt_1", "2026-10-14", tickers=("XOM",))])),
                                                  encoding="utf-8")
    (tmp_path / "event_register_run.json").write_text(json.dumps({"status": "ok"}), encoding="utf-8")
    stocks = tmp_path / "stocks.json"
    stocks.write_text(json.dumps(STOCKS), encoding="utf-8")
    out = tmp_path / "mri" / "macro_events.json"
    idx = bme.build_macro_events(outputs_dir=tmp_path, stocks_path=stocks, out_path=out)
    assert idx["register_run_status"] == "ok"
    assert json.loads(out.read_text(encoding="utf-8"))["named"]["XOM"] == [0]


def test_sector_map_matches_the_scorer():
    sfdd = pytest.importorskip("score_factors_dual_door")
    assert bme.GICS_TO_MACRO_ID == sfdd.GICS_TO_MACRO_ID

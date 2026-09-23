"""Unit tests for apply_llm_overlay in score_factors_dual_door.py.

Pins the gate on actionable: false (P1.3 screener side).
Run: python -m pytest scripts/test_apply_llm_overlay.py -q
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import score_factors_dual_door as sfdd  # noqa: E402


def test_actionable_false_row_is_not_promoted(tmp_path, monkeypatch):
    overlay_data = {
        "tickers": {
            "NON_ACTIONABLE": {
                "direction": "undervalued",
                "actionable": False,
                "mos_vs_median_pct": 25.0,
            },
            "LEGACY_ROW": {
                "direction": "undervalued",
                # no "actionable" field
                "mos_vs_median_pct": 25.0,
            },
            "ACTIONABLE_ROW": {
                "direction": "undervalued",
                "actionable": True,
                "mos_vs_median_pct": 25.0,
            },
        }
    }
    overlay_file = tmp_path / "depth_overlay.json"
    overlay_file.write_text(json.dumps(overlay_data), encoding="utf-8")
    monkeypatch.setattr(sfdd, "DATA", tmp_path)

    results = {
        "NON_ACTIONABLE": {"fct_band": "watchlist"},
        "LEGACY_ROW": {"fct_band": "watchlist"},
        "ACTIONABLE_ROW": {"fct_band": "watchlist"},
    }

    applied = sfdd.apply_llm_overlay(results)

    # NON_ACTIONABLE must not be promoted or modified
    assert results["NON_ACTIONABLE"].get("fct_llm") != "promoted"
    assert "fct_band_llm" not in results["NON_ACTIONABLE"]
    assert "fct_llm_verdict" not in results["NON_ACTIONABLE"]

    # Legacy row without actionable field behaves as before (promoted)
    assert results["LEGACY_ROW"].get("fct_llm") == "promoted"
    assert results["LEGACY_ROW"].get("fct_band_llm") == "research_now"

    # Actionable row is promoted
    assert results["ACTIONABLE_ROW"].get("fct_llm") == "promoted"
    assert results["ACTIONABLE_ROW"].get("fct_band_llm") == "research_now"

    assert applied == 2

"""Unit tests for apply_llm_overlay in score_factors_dual_door.py (P3.12 SCR-04 mapping).

One test per mapping row: full promotion, undervalued-failing-floors (partial), the P1.3
fail-open ending on missing `actionable`, `actionable: false` still skipping entirely, missing
MoS (no promotion, never m=0.0), the mos_vs_median_pct fallback note, hold -> monitor always,
overvalued -> pass always (+ the low-quality veto reading conviction_score first / the prose
parser only as fallback), thesis_status == "breached" blocking promotion, and
fct_llm_gate_version being stamped.

Run: python -m pytest scripts/test_apply_llm_overlay.py -q
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import score_factors_dual_door as sfdd  # noqa: E402


def _write_overlay(tmp_path, tickers):
    overlay_file = tmp_path / "depth_overlay.json"
    overlay_file.write_text(json.dumps({"tickers": tickers}), encoding="utf-8")


def test_full_promotion_requires_actionable_percentile_and_mos_floors(tmp_path, monkeypatch):
    _write_overlay(tmp_path, {
        "PROMOTE": {
            "direction": "undervalued", "actionable": True,
            "mos_vs_base_pct": 15.0, "mos_vs_median_pct": 34.8,
        },
    })
    monkeypatch.setattr(sfdd, "DATA", tmp_path)
    results = {"PROMOTE": {"fct_band": "watchlist", "fct_percentile": 82.0}}

    applied = sfdd.apply_llm_overlay(results)

    e = results["PROMOTE"]
    assert applied == 1
    assert e["fct_llm"] == "promoted"
    assert e["fct_band_llm"] == "research_now"
    assert 97.0 <= e["fct_percentile_llm"] <= 100.0
    assert e["fct_llm_note"] is None
    assert e["fct_llm_gate_version"] == sfdd.FCT_LLM_GATE_VERSION


def test_undervalued_failing_percentile_floor_lands_in_watchlist_partial(tmp_path, monkeypatch):
    _write_overlay(tmp_path, {
        "PARTIAL": {
            "direction": "undervalued", "actionable": True,
            "mos_vs_base_pct": 15.0,
        },
    })
    monkeypatch.setattr(sfdd, "DATA", tmp_path)
    # fct_percentile below the 70 monitor floor
    results = {"PARTIAL": {"fct_band": "pass", "fct_percentile": 55.0}}

    sfdd.apply_llm_overlay(results)

    e = results["PARTIAL"]
    assert e["fct_llm"] == "promoted_partial"
    assert e["fct_band_llm"] == "watchlist"
    assert 90.0 <= e["fct_percentile_llm"] <= 96.9


def test_missing_actionable_field_is_no_longer_promoted(tmp_path, monkeypatch):
    """P1.3 fail-open ends here (C8 of the Phase 1 review): a row with NO actionable field
    used to be treated as actionable and promoted straight to research_now. It now fails the
    actionable==true floor like any other unmet condition and lands in the partial band."""
    _write_overlay(tmp_path, {
        "NO_ACTIONABLE_FIELD": {
            "direction": "undervalued",
            # no "actionable" key at all
            "mos_vs_base_pct": 25.0,
        },
    })
    monkeypatch.setattr(sfdd, "DATA", tmp_path)
    results = {"NO_ACTIONABLE_FIELD": {"fct_band": "watchlist", "fct_percentile": 90.0}}

    sfdd.apply_llm_overlay(results)

    e = results["NO_ACTIONABLE_FIELD"]
    assert e["fct_llm"] == "promoted_partial"
    assert e["fct_band_llm"] != "research_now"


def test_actionable_false_still_skips_entirely(tmp_path, monkeypatch):
    _write_overlay(tmp_path, {
        "NON_ACTIONABLE": {
            "direction": "undervalued", "actionable": False,
            "mos_vs_base_pct": 25.0,
        },
    })
    monkeypatch.setattr(sfdd, "DATA", tmp_path)
    results = {"NON_ACTIONABLE": {"fct_band": "watchlist", "fct_percentile": 90.0}}

    applied = sfdd.apply_llm_overlay(results)

    assert applied == 0
    assert "fct_llm_verdict" not in results["NON_ACTIONABLE"]
    assert "fct_band_llm" not in results["NON_ACTIONABLE"]


def test_missing_mos_never_defaults_to_zero_and_blocks_any_band():
    ov = {
        "NO_MOS": {"direction": "undervalued", "actionable": True},   # neither MoS field present
    }
    results = {"NO_MOS": {"fct_band": "watchlist", "fct_percentile": 90.0}}
    applied = _run_overlay(ov, results)

    e = results["NO_MOS"]
    assert applied == 1
    assert e["fct_llm_note"] == "no_mos"
    assert "fct_band_llm" not in e
    assert "fct_percentile_llm" not in e
    assert e["fct_llm"] == "none"


def test_mos_vs_median_pct_fallback_is_noted_when_base_is_absent():
    ov = {
        "FALLBACK": {
            "direction": "undervalued", "actionable": True,
            "mos_vs_median_pct": 20.0,   # no mos_vs_base_pct
        },
    }
    results = {"FALLBACK": {"fct_band": "watchlist", "fct_percentile": 80.0}}
    _run_overlay(ov, results)

    e = results["FALLBACK"]
    assert e["fct_llm"] == "promoted"
    assert e["fct_llm_note"] == "mos_median_fallback"


def test_hold_always_lands_in_monitor_regardless_of_sign():
    ov = {
        "HOLD_POS": {"direction": "hold", "actionable": True, "mos_vs_base_pct": 40.0},
        "HOLD_NEG": {"direction": "hold", "actionable": True, "mos_vs_base_pct": -40.0},
    }
    results = {
        "HOLD_POS": {"fct_band": "pass", "fct_percentile": 50.0},
        "HOLD_NEG": {"fct_band": "pass", "fct_percentile": 50.0},
    }
    _run_overlay(ov, results)

    for t in ("HOLD_POS", "HOLD_NEG"):
        e = results[t]
        assert e["fct_band_llm"] == "monitor"
        assert 70.0 <= e["fct_percentile_llm"] <= 89.0


def test_overvalued_always_demotes_to_pass_regardless_of_sign():
    ov = {
        "OV_POS": {"direction": "overvalued", "actionable": True, "mos_vs_base_pct": 40.0,
                   "conviction_score": 12.0},
        "OV_NEG": {"direction": "overvalued", "actionable": True, "mos_vs_base_pct": -40.0,
                   "conviction_score": 12.0},
    }
    results = {
        "OV_POS": {"fct_band": "watchlist", "fct_percentile": 80.0},
        "OV_NEG": {"fct_band": "watchlist", "fct_percentile": 80.0},
    }
    _run_overlay(ov, results)

    for t in ("OV_POS", "OV_NEG"):
        e = results[t]
        assert e["fct_llm"] == "demoted"
        assert e["fct_band_llm"] == "pass"
        assert 0.0 <= e["fct_percentile_llm"] <= 69.0


def test_overvalued_low_conviction_from_overlay_row_vetoes():
    ov = {
        "LOW_CONV": {"direction": "overvalued", "actionable": True, "mos_vs_base_pct": -10.0,
                     "conviction_score": 5.0},
    }
    results = {"LOW_CONV": {"fct_band": "watchlist", "fct_percentile": 80.0}}
    _run_overlay(ov, results)

    assert results["LOW_CONV"]["fct_llm_veto"] == "llm_reject"


def test_overvalued_conviction_falls_back_to_prose_parser_when_field_is_none(monkeypatch):
    ov = {
        "PARSED": {"direction": "overvalued", "actionable": True, "mos_vs_base_pct": -10.0},
        # no conviction_score field at all
    }
    results = {"PARSED": {"fct_band": "watchlist", "fct_percentile": 80.0}}
    monkeypatch.setattr(sfdd.depth_conviction, "load_conviction_map", lambda *a, **k: {"PARSED": 4.0})
    _run_overlay(ov, results)

    assert results["PARSED"]["fct_llm_veto"] == "llm_reject"


def test_thesis_breached_blocks_promotion_even_when_floors_pass():
    ov = {
        "BREACHED": {
            "direction": "undervalued", "actionable": True,
            "mos_vs_base_pct": 25.0, "thesis_status": "breached",
        },
    }
    results = {"BREACHED": {"fct_band": "watchlist", "fct_percentile": 90.0}}
    _run_overlay(ov, results)

    e = results["BREACHED"]
    assert e["fct_llm"] == "promoted_partial"
    assert e["fct_band_llm"] != "research_now"
    assert e["fct_llm_note"] == "thesis_breached"


def test_quant_vetoed_row_is_never_touched():
    ov = {"VETOED": {"direction": "undervalued", "actionable": True, "mos_vs_base_pct": 25.0}}
    results = {"VETOED": {"fct_band": "vetoed", "fct_veto": "NOT_TRADABLE", "fct_percentile": 0.0}}
    applied = _run_overlay(ov, results)

    assert applied == 0
    assert "fct_llm_verdict" not in results["VETOED"]


def _run_overlay(overlay_tickers, results):
    """Write a depth_overlay.json fixture to a fresh temp dir and run apply_llm_overlay
    against it, without needing the tmp_path/monkeypatch pytest fixtures in every caller."""
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        tmp_path = Path(td)
        _write_overlay(tmp_path, overlay_tickers)
        orig_data = sfdd.DATA
        sfdd.DATA = tmp_path
        try:
            return sfdd.apply_llm_overlay(results)
        finally:
            sfdd.DATA = orig_data

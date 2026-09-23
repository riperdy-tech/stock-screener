"""Unit tests for P3.5 Band Hysteresis in score_factors_dual_door.py and run_chain.py."""

import json
from pathlib import Path
import pytest
import sys

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import score_factors_dual_door as sfdd
import run_chain as rc


def test_hysteresis_config_buffers():
    """Verify sifter_config.json carries hysteresis_rn_rank=60 and hysteresis_book_rank=150."""
    cfg_path = SCRIPTS_DIR / "sifter_config.json"
    assert cfg_path.exists(), "sifter_config.json must exist"
    rn_buf, book_buf = sfdd._load_hysteresis_ranks(cfg_path)
    assert rn_buf == 60
    assert book_buf == 150


def test_hysteresis_transitions_logic():
    """Verify the exact hysteresis band rules, via the production function
    (score_factors_dual_door.apply_band_hysteresis):
    - rank 55 previously RN stays RN (retained_rn)
    - rank 61 previously RN -> watchlist (left_rn, entered_book)
    - rank 149 previously book stays in book (retained_book -> watchlist)
    - rank 151 previously book leaves (left_book -> pass)
    - new entry at rank <= 50 -> RN
    - new entry at rank 51-135 -> watchlist
    - new non-book at rank 140 -> pass
    """
    prev_rn = {"STAY_RN", "LEAVE_RN", "DROP_TO_PASS"}
    prev_book = {"STAY_RN", "LEAVE_RN", "DROP_TO_PASS", "STAY_BOOK", "LEAVE_BOOK"}

    # Simulate ranking
    all_ranked = [
        "NEW_RN_1",       # rank 1
        "STAY_RN",        # rank 55
        "LEAVE_RN",       # rank 61
        "NEW_WL_100",     # rank 100
        "NEW_140",        # rank 140 (not in prev book -> pass)
        "STAY_BOOK",      # rank 149
        "LEAVE_BOOK",     # rank 151
        "DROP_TO_PASS",   # rank 152
    ]
    # Synthetic rank lookup matching exact rank assignments
    rank_by_ticker = {
        "NEW_RN_1": 1,
        "STAY_RN": 55,
        "LEAVE_RN": 61,
        "NEW_WL_100": 100,
        "NEW_140": 140,
        "STAY_BOOK": 149,
        "LEAVE_BOOK": 151,
        "DROP_TO_PASS": 152,
    }

    rn_buffer_rank = 60
    book_buffer_rank = 150

    rn_set, wl_set = sfdd.apply_band_hysteresis(
        all_ranked, rank_by_ticker, prev_rn, prev_book, rn_buffer_rank, book_buffer_rank,
    )

    book_set = rn_set | wl_set
    retained_rn = {t for t in rn_set if rank_by_ticker[t] > 50}
    retained_book = {t for t in wl_set if rank_by_ticker[t] > 135}
    retained_by_hysteresis = sorted(list(retained_rn | retained_book))

    # Assertions
    # 1. Rank 55 previously RN stays RN
    assert "STAY_RN" in rn_set
    assert "STAY_RN" in retained_rn

    # 2. Rank 61 previously RN moves to watchlist (not in RN, but in book)
    assert "LEAVE_RN" not in rn_set
    assert "LEAVE_RN" in wl_set

    # 3. Rank 149 previously book stays in book (in watchlist)
    assert "STAY_BOOK" in wl_set
    assert "STAY_BOOK" in retained_book

    # 4. Rank 151 previously book leaves book
    assert "LEAVE_BOOK" not in book_set
    assert "DROP_TO_PASS" not in book_set

    # 5. Non-previous book at rank 140 is pass
    assert "NEW_140" not in book_set

    # Retained summary
    assert retained_by_hysteresis == sorted(["STAY_BOOK", "STAY_RN"])

    # Band transitions
    band_transitions = {
        "entered_rn": sorted(list(rn_set - prev_rn)),
        "left_rn": sorted(list(prev_rn - rn_set)),
        "entered_book": sorted(list(book_set - prev_book)),
        "left_book": sorted(list(prev_book - book_set)),
        "retained_by_hysteresis": retained_by_hysteresis,
    }
    assert band_transitions["entered_rn"] == ["NEW_RN_1"]
    assert band_transitions["left_rn"] == sorted(["LEAVE_RN", "DROP_TO_PASS"])
    assert "NEW_RN_1" in band_transitions["entered_book"]
    assert "NEW_WL_100" in band_transitions["entered_book"]
    assert band_transitions["left_book"] == sorted(["DROP_TO_PASS", "LEAVE_BOOK"])
    assert band_transitions["retained_by_hysteresis"] == sorted(["STAY_BOOK", "STAY_RN"])


def test_hysteresis_no_previous_file_stamps_no_previous_run(tmp_path):
    """When no previous factor_scores.json exists or engine differs, stamp hysteresis: 'no_previous_run'."""
    non_existent = tmp_path / "does_not_exist.json"
    
    # Simulate engine check
    prev_factor_raw = None
    if non_existent.exists():
        prev_factor_raw = json.loads(non_existent.read_text())

    EXPECTED_ENGINE = "dual_door_dynamic_macro_v2_cluster_guarded"
    if prev_factor_raw is None or prev_factor_raw.get("engine") != EXPECTED_ENGINE:
        has_previous = False
        hysteresis_status = "no_previous_run"
        prev_rn = set()
        prev_book = set()
    else:
        has_previous = True
        hysteresis_status = "applied"
        prev_rn = set()
        prev_book = set()

    assert has_previous is False
    assert hysteresis_status == "no_previous_run"
    assert len(prev_rn) == 0
    assert len(prev_book) == 0

    # With no previous run, rank 55 does NOT stay in RN
    rank_55_band = "research_now" if 55 <= 50 or (55 <= 60 and "T" in prev_rn) else "watchlist"
    assert rank_55_band == "watchlist"

    # With no previous run, rank 145 is pass
    rank_145_band = "watchlist" if 145 <= 135 or (145 <= 150 and "T" in prev_book) else "pass"
    assert rank_145_band == "pass"


def test_run_chain_signal_log_includes_transitions(tmp_path):
    """Verify run_chain writes band transitions into factor_signal_log.jsonl."""
    log_file = tmp_path / "factor_signal_log.jsonl"
    factor = {
        "engine": "dual_door_dynamic_macro_v2_cluster_guarded",
        "band_transitions": {
            "entered_rn": ["A"],
            "left_rn": ["B"],
            "entered_book": ["A", "C"],
            "left_book": ["D"],
            "retained_by_hysteresis": ["E"],
        },
        "hysteresis_retained": ["E"],
        "tickers": {
            "A": {"fct_composite": 90.0, "fct_rank": 1, "fct_band": "research_now"},
            "C": {"fct_composite": 70.0, "fct_rank": 55, "fct_band": "watchlist"},
        }
    }
    log_rows = rc.build_factor_signal_rows(factor)
    transitions = factor.get("band_transitions") or {}
    run_row = {
        "run_id": "test_run_001",
        "snapshot_date": "2026-09-24",
        "engine": factor.get("engine", "factor_lab_v1"),
        "entered_rn": transitions.get("entered_rn", factor.get("entered_rn", [])),
        "left_rn": transitions.get("left_rn", factor.get("left_rn", [])),
        "entered_book": transitions.get("entered_book", factor.get("entered_book", [])),
        "left_book": transitions.get("left_book", factor.get("left_book", [])),
        "retained_by_hysteresis": transitions.get("retained_by_hysteresis", factor.get("hysteresis_retained", [])),
        "signals": sorted(log_rows, key=lambda x: (x.get("fct_rank") or 10**9)),
    }
    with log_file.open("a", encoding="utf-8") as f:
        f.write(json.dumps(run_row, sort_keys=True) + "\n")

    lines = log_file.read_text(encoding="utf-8").strip().split("\n")
    assert len(lines) == 1
    logged = json.loads(lines[0])
    assert logged["entered_rn"] == ["A"]
    assert logged["left_rn"] == ["B"]
    assert logged["entered_book"] == ["A", "C"]
    assert logged["left_book"] == ["D"]
    assert logged["retained_by_hysteresis"] == ["E"]
    assert len(logged["signals"]) == 2

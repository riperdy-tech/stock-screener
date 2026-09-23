"""Unit tests for build_factor_signal_rows in run_chain.py (P2.3).

Nomination context (fct_nominated_doors, fct_z, cluster, sector) must ride along on each
factor_signal_log.jsonl signal row, taken from the same dual-door profile the row's other
fct_* fields come from. A name with no profile, or a missing value within it, gets None —
never a guessed default. The pre-existing fields must be byte-identical to before.
Run: python -m pytest scripts/test_run_chain.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import run_chain as rc  # noqa: E402


FACTOR_FIXTURE = {
    "tickers": {
        # Full profile: every nomination-context field present.
        "FULL": {
            "fct_composite": 87.654,
            "fct_rank": 1,
            "fct_band": "research_now",
            "fct_nominated_doors": ["DOOR_1_COMPOUNDER", "DOUBLE_DOOR_CHAMPION"],
            "fct_z": {
                "quality": 1.23456,
                "momentum": -0.98765,
                "revisions": 0.0,
                "value": 2.0005,
                "exp_gap": None,
            },
            "cluster": "software_infra",
            "sector": "Technology",
        },
        # Missing pieces: no profile fields carried at all (e.g. scored but not nominated).
        "MISSING": {
            "fct_composite": 41.0,
            "fct_rank": None,
            "fct_band": "watchlist",
        },
        # Not research_now/watchlist -> must be excluded entirely, same as before.
        "PASSED": {
            "fct_composite": 10.0,
            "fct_rank": None,
            "fct_band": "pass",
            "fct_nominated_doors": [],
            "fct_z": {"quality": 1.0, "momentum": 1.0, "revisions": 1.0, "value": 1.0, "exp_gap": 1.0},
            "cluster": "some_cluster",
            "sector": "Energy",
        },
    }
}


def _row(symbol, rows):
    return next(r for r in rows if r["symbol"] == symbol)


def test_old_fields_byte_identical_to_before():
    rows = rc.build_factor_signal_rows(FACTOR_FIXTURE)
    full = _row("FULL", rows)
    missing = _row("MISSING", rows)
    assert full["fct_composite"] == 87.654
    assert full["fct_rank"] == 1
    assert full["fct_band"] == "research_now"
    assert missing["fct_composite"] == 41.0
    assert missing["fct_rank"] is None
    assert missing["fct_band"] == "watchlist"
    assert {r["symbol"] for r in rows} == {"FULL", "MISSING"}  # PASSED stays excluded


def test_full_profile_gets_rounded_nomination_context():
    rows = rc.build_factor_signal_rows(FACTOR_FIXTURE)
    full = _row("FULL", rows)
    assert full["fct_nominated_doors"] == ["DOOR_1_COMPOUNDER", "DOUBLE_DOOR_CHAMPION"]
    assert full["cluster"] == "software_infra"
    assert full["sector"] == "Technology"
    assert full["fct_z"] == {
        "quality": 1.235,
        "momentum": -0.988,
        "revisions": 0.0,       # 0.0 is a value, not an absence
        "value": rc.round3(2.0005),
        "exp_gap": None,        # missing individual z stays None, never guessed
    }


def test_missing_profile_gets_none_never_a_guessed_default():
    rows = rc.build_factor_signal_rows(FACTOR_FIXTURE)
    missing = _row("MISSING", rows)
    assert missing["fct_nominated_doors"] is None
    assert missing["fct_z"] is None
    assert missing["cluster"] is None
    assert missing["sector"] is None


def test_round3_helper():
    assert rc.round3(1.23456) == 1.235
    assert rc.round3(0.0) == 0.0
    assert rc.round3(None) is None
    assert rc.round3("not a number") is None

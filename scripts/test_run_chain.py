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


# ── SF4 items 1-2: the chain reads the run's own record (F5, F6) ─────────────────────────
from datetime import datetime, timezone  # noqa: E402

NOW = datetime(2026, 11, 12, 12, 0, tzinfo=timezone.utc)


def _log(tmp_path, lines):
    p = tmp_path / "scan.log"
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return p


def test_scan_log_takes_the_last_summary_and_bulk_history(tmp_path):
    p = _log(tmp_path, [
        "2026-09-11 15:44:39,970 - INFO - defeatbeta loaded: 6543 priced symbols, max price date 2026-09-10.",
        "2026-09-11 18:00:00,000 - INFO - Scan Complete. Processed 6559. Passed 3. Skipped 0.",
        "2026-09-17 23:38:45,726 - WARNING - defeatbeta load failed (HTTP Error 404: Not Found) — using legacy yfinance path.",
        "2026-11-06 18:00:34,762 - INFO - Scan Complete. Processed 6554. Passed 1. Skipped 5501.",
    ])
    s = rc.read_scan_log(p)
    assert (s["processed"], s["skipped"], s["at"]) == (6554, 5501, "2026-11-06 18:00:34")


def test_scan_log_missing_or_empty_is_none_not_zero(tmp_path):
    assert rc.read_scan_log(tmp_path / "nope.log") is None
    assert rc.read_scan_log(_log(tmp_path, ["nothing here"]))["processed"] is None


def test_age_comes_from_rows_last_updated_not_file_mtime():
    stocks = [{"Last_Updated": "2026-11-10 12:00"}, {"Last_Updated": "2026-11-02 00:00"}, {}]
    assert rc.newest_last_updated_age_days(stocks, NOW) == 2.0
    assert rc.newest_last_updated_age_days([{}], NOW) is None      # absence stays absence


def _inv(invs, name):
    return next(i for i in invs if i["name"] == name)


def test_mostly_failed_run_fails_hard():
    invs = []
    scan = {"processed": 6554, "skipped": 5501, "at": "2026-11-06 18:00:34"}
    counts = rc.add_fetch_invariants(invs, [{"Last_Updated": "2026-11-12 11:00"}], scan, NOW)
    inv = _inv(invs, "fetch_skipped_share")
    assert inv["level"] == "hard" and inv["ok"] is False
    assert counts["refreshed"] == 1053 and counts["skipped"] == 5501


def test_normal_run_passes_and_zero_skipped_is_a_value():
    invs = []
    scan = {"processed": 6550, "skipped": 0, "at": "x"}
    rc.add_fetch_invariants(invs, [{"Last_Updated": "2026-11-12 11:00"}], scan, NOW)
    assert _inv(invs, "fetch_skipped_share")["ok"] is True


def test_no_summary_is_flagged_not_passed():
    invs = []
    rc.add_fetch_invariants(invs, [{"Last_Updated": "2026-11-12 11:00"}], None, NOW)
    inv = _inv(invs, "fetch_skipped_share")
    assert inv["level"] == "soft" and inv["ok"] is False


def test_stale_rows_fail_freshness():
    invs = []
    scan = {"processed": 100, "skipped": 0, "at": "x"}
    rc.add_fetch_invariants(invs, [{"Last_Updated": "2026-10-01 00:00"}], scan, NOW)
    assert _inv(invs, "stocks_json_fresh")["ok"] is False

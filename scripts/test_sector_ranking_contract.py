"""Unit tests for the MRI -> screener sector-quota contract (MRI-11).

Covers scripts/score_factors_dual_door.py's load_sector_ranking() (resolution order, the
45-day age gate, the operator-approved validation gate) and scripts/mri_sync.py's
sync_mri_snapshot(). See stocks-workspace/docs/review_2026-09-22/PHASE_0_MRI_UNFREEZE_AND_CONTRACT.md
(P0.6) and P0_0_MRI_TARGET_ARCHITECTURE.md §7.1/§7.2.
"""
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import score_factors_dual_door as sfdd  # noqa: E402
import mri_sync  # noqa: E402


def _iso_date(days_ago: int = 0) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).strftime("%Y-%m-%d")


PASSING_VALIDATION = {"horizon_3m": {"rank_ic": 0.05, "t_overlap_corrected": 2.4, "n": 30}}


def _sector_row(sector_id: str, tilt_score: float) -> dict:
    return {
        "sector_id": sector_id, "rank": 1, "label": sector_id,
        "tilt_score": tilt_score, "confidence_adjusted_score": tilt_score,
        "raw_sector_score": tilt_score,
    }


def _v2_ranking(date_str, validation=None, valid=True, rows=None) -> dict:
    return {
        "schema_version": 2,
        "date": date_str,
        "valid": valid,
        "reported_macro_regime": "tightening",
        "macro_confidence": 0.03,
        "validation": validation,
        "sector_ranking": rows if rows is not None else [_sector_row("energy", 0.5)],
    }


@pytest.fixture()
def _wired(tmp_path, monkeypatch):
    """Point the loader at an isolated MRI outputs dir and snapshot path, both empty."""
    outputs_dir = tmp_path / "mri_outputs"
    snapshot_path = tmp_path / "snapshot" / "current_sector_ranking.json"
    monkeypatch.setattr(sfdd.peer_paths, "mri_outputs_dir", lambda: outputs_dir)
    monkeypatch.setattr(sfdd, "MRI_SNAPSHOT_SECTOR_RANKING_JSON", snapshot_path)
    return outputs_dir, snapshot_path


def _write(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")


# ── Resolution order ─────────────────────────────────────────────────────────

def test_fresh_mri_file_with_validated_edge_yields_mri_source(_wired):
    outputs_dir, _ = _wired
    _write(outputs_dir / "current_sector_ranking.json",
           _v2_ranking(_iso_date(0), validation=PASSING_VALIDATION,
                       rows=[_sector_row("energy", 0.5)]))

    scores, regime, meta = sfdd.load_sector_ranking()

    assert meta["sector_quota_source"] == "mri"
    assert meta["reason"] == "validated_edge"
    assert scores["energy"] == 0.5
    assert regime == "tightening"


def test_falls_back_to_snapshot_when_mri_dir_absent(_wired):
    _, snapshot_path = _wired
    _write(snapshot_path, _v2_ranking(_iso_date(0), validation=PASSING_VALIDATION,
                                       rows=[_sector_row("energy", 0.3)]))

    scores, _, meta = sfdd.load_sector_ranking()

    assert meta["sector_quota_source"] == "mri_snapshot"
    assert scores["energy"] == 0.3


def test_missing_file_is_neutral_fallback(_wired):
    scores, regime, meta = sfdd.load_sector_ranking()

    assert scores == {}
    assert regime == "neutral"
    assert meta["sector_quota_source"] == "neutral_fallback"
    assert meta["date"] is None


# ── Age gate ──────────────────────────────────────────────────────────────────

def test_stale_beyond_45_days_is_neutral_fallback_with_reason(_wired):
    outputs_dir, _ = _wired
    _write(outputs_dir / "current_sector_ranking.json",
           _v2_ranking(_iso_date(46), validation=PASSING_VALIDATION,
                       rows=[_sector_row("energy", 0.9)]))

    scores, _, meta = sfdd.load_sector_ranking()

    assert scores == {}
    assert meta["sector_quota_source"] == "neutral_fallback"
    assert meta["reason"].startswith("stale_")


def test_future_dated_is_rejected(_wired):
    outputs_dir, _ = _wired
    _write(outputs_dir / "current_sector_ranking.json",
           _v2_ranking(_iso_date(-5), validation=PASSING_VALIDATION))

    scores, _, meta = sfdd.load_sector_ranking()

    assert scores == {}
    assert meta["sector_quota_source"] == "neutral_fallback"
    assert meta["reason"] == "future_dated"


# ── Validation gate (operator-approved, §7.1) ─────────────────────────────────

def test_missing_validation_block_fails_closed(_wired):
    outputs_dir, _ = _wired
    _write(outputs_dir / "current_sector_ranking.json",
           _v2_ranking(_iso_date(0), validation=None))

    scores, _, meta = sfdd.load_sector_ranking()

    assert scores == {}
    assert meta["sector_quota_source"] == "neutral_no_validated_edge"
    assert meta["reason"] == "validation_block_missing"


def test_positive_ic_but_t_below_2_fails_closed(_wired):
    outputs_dir, _ = _wired
    _write(outputs_dir / "current_sector_ranking.json",
           _v2_ranking(_iso_date(0),
                       validation={"horizon_3m": {"rank_ic": 0.05, "t_overlap_corrected": 1.2}}))

    scores, _, meta = sfdd.load_sector_ranking()

    assert scores == {}
    assert meta["sector_quota_source"] == "neutral_no_validated_edge"
    assert meta["reason"] == "t_below_threshold"


def test_negative_ic_fails_closed_even_with_high_t(_wired):
    outputs_dir, _ = _wired
    _write(outputs_dir / "current_sector_ranking.json",
           _v2_ranking(_iso_date(0),
                       validation={"horizon_3m": {"rank_ic": -0.0087, "t_overlap_corrected": -0.23}}))

    scores, _, meta = sfdd.load_sector_ranking()

    assert scores == {}
    assert meta["sector_quota_source"] == "neutral_no_validated_edge"
    assert meta["reason"] == "ic_not_positive"


def test_positive_ic_and_t_at_least_2_applies_tilt(_wired):
    outputs_dir, _ = _wired
    _write(outputs_dir / "current_sector_ranking.json",
           _v2_ranking(_iso_date(0), validation=PASSING_VALIDATION,
                       rows=[_sector_row("energy", 0.7), _sector_row("financials", -0.2)]))

    scores, _, meta = sfdd.load_sector_ranking()

    assert meta["sector_quota_source"] == "mri"
    assert scores == {"energy": 0.7, "financials": -0.2}


# ── Schema mapping and the `:613` 0.0 bug ────────────────────────────────────

def test_a_true_zero_score_is_not_dropped_to_the_raw_score():
    item = {"sector_id": "energy", "confidence_adjusted_score": 0.0, "raw_sector_score": 5.0}
    assert sfdd._sector_tilt_score(item) == 0.0


def test_score_missing_entirely_returns_none():
    assert sfdd._sector_tilt_score({"sector_id": "energy"}) is None


def test_schema_v2_prefers_tilt_score():
    item = {"sector_id": "energy", "tilt_score": 0.42, "confidence_adjusted_score": 0.10}
    assert sfdd._sector_tilt_score(item) == 0.42


def test_schema_v1_row_parses_via_confidence_adjusted_score(_wired):
    """Schema 1 rows carry no tilt_score at all."""
    outputs_dir, _ = _wired
    v1_row = {"sector_id": "energy", "rank": 1, "label": "Energy",
              "raw_sector_score": 0.59, "confidence_adjusted_score": 0.41}
    ranking = {
        "date": _iso_date(0), "reported_macro_regime": "reflation", "macro_confidence": 0.14,
        "validation": PASSING_VALIDATION,
        "sector_ranking": [v1_row],
    }
    _write(outputs_dir / "current_sector_ranking.json", ranking)

    scores, regime, meta = sfdd.load_sector_ranking()

    assert scores["energy"] == 0.41
    assert regime == "reflation"
    assert meta["sector_quota_source"] == "mri"


# ── mri_sync.sync_mri_snapshot ────────────────────────────────────────────────

def test_sync_writes_manifest_with_copied_files(tmp_path, monkeypatch):
    outputs_dir = tmp_path / "mri_outputs"
    outputs_dir.mkdir()
    (outputs_dir / "current_sector_ranking.json").write_text(
        json.dumps({"date": "2026-09-01"}), encoding="utf-8")
    (outputs_dir / "current_regime.json").write_text(
        json.dumps({"date": "2026-09-01"}), encoding="utf-8")

    snapshot_dir = tmp_path / "snapshot"
    monkeypatch.setattr(mri_sync.peer_paths, "mri_outputs_dir", lambda: outputs_dir)
    monkeypatch.setattr(mri_sync, "SNAPSHOT_DIR", snapshot_dir)
    monkeypatch.setattr(mri_sync, "MANIFEST_JSON", snapshot_dir / "manifest.json")

    result = mri_sync.sync_mri_snapshot()

    assert result is not None
    assert "current_sector_ranking.json" in result["files"]
    assert result["files"]["current_sector_ranking.json"]["mri_date"] == "2026-09-01"
    assert (snapshot_dir / "current_sector_ranking.json").exists()
    assert (snapshot_dir / "manifest.json").exists()
    manifest_on_disk = json.loads((snapshot_dir / "manifest.json").read_text(encoding="utf-8"))
    assert manifest_on_disk == result


def test_sync_is_a_noop_when_mri_outputs_dir_unresolved(tmp_path, monkeypatch):
    monkeypatch.setattr(mri_sync.peer_paths, "mri_outputs_dir", lambda: None)
    monkeypatch.setattr(mri_sync, "SNAPSHOT_DIR", tmp_path / "snapshot")
    monkeypatch.setattr(mri_sync, "MANIFEST_JSON", tmp_path / "snapshot" / "manifest.json")

    assert mri_sync.sync_mri_snapshot() is None
    assert not (tmp_path / "snapshot").exists()

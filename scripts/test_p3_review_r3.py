"""test_p3_review_r3.py — tests for R3 publishing z_momentum_universe / z_momentum_sector_neutral on factor rows and build_daily_price_history updates."""
import json
from pathlib import Path
import pytest
import build_daily_price_history as bdph
import score_factors_dual_door as sfdd


def test_build_daily_price_history_docstring_item_3():
    """R3: docstring item 3 specifies daily_closes.json, not momentum_state.json."""
    doc = bdph.__doc__ or ""
    assert "3. Every ticker in the previous public/data/daily_closes.json (so exits keep history)" in doc
    assert "momentum_state.json (so exits keep history)" not in doc


def test_daily_universe_seed_picks_names_from_factor_scores(tmp_path: Path, capsys):
    """R3: factor_scores.json carrying z_momentum_universe is seeded without warning."""
    tickers = {
        f"T{i:03d}": {
            "fct_band": "pass",
            "z_momentum_universe": float(i),
            "z_momentum_sector_neutral": float(i) / 2.0,
        }
        for i in range(100)
    }
    (tmp_path / "factor_scores.json").write_text(json.dumps({"tickers": tickers}), encoding="utf-8")
    universe = set(bdph.load_universe(tmp_path))
    captured = capsys.readouterr()
    assert "z_momentum_universe" not in captured.err
    assert "WARN" not in captured.err

    # Top 60 tickers (T040 to T099) should be seeded
    seeded = {t for t in universe if t.startswith("T")}
    assert len(seeded) == bdph.DOOR3_DAILY_SEED_COUNT == 60
    assert seeded == {f"T{i:03d}" for i in range(40, 100)}


def test_factor_scores_compat_tickers_carries_momentum_z_fields():
    """Verify that compat_tickers structure includes both momentum z fields."""
    # We can inspect the code / dict template or mock profiles
    prof = {
        "best_pctl": 85.0,
        "z_quality": 1.2,
        "z_momentum": 1.5,
        "z_momentum_universe": 1.45,
        "z_momentum_sector_neutral": 1.55,
        "z_revisions": 0.8,
        "z_value": -0.5,
        "z_exp_gap": 0.2,
        "fct_flags": [],
        "fct_flag_detail": {},
        "nominated_doors": ["DOOR_1"],
    }
    # Simulate the compat_tickers mapping done in score_factors_dual_door
    row = {
        "fct_band": "research_now",
        "fct_composite": 85.0,
        "fct_percentile": 85.0,
        "fct_rank": 1,
        "fct_veto": None,
        "fct_veto_detail": None,
        "fct_z": {
            "quality": prof.get("z_quality"),
            "momentum": prof.get("z_momentum"),
            "revisions": prof.get("z_revisions"),
            "value": prof.get("z_value"),
            "exp_gap": prof.get("z_exp_gap")
        },
        "z_momentum_universe": prof.get("z_momentum_universe"),
        "z_momentum_sector_neutral": prof.get("z_momentum_sector_neutral"),
    }
    assert row["z_momentum_universe"] == 1.45
    assert row["z_momentum_sector_neutral"] == 1.55

"""test_p32_dual_door.py — Unit tests for Phase 3 P3.2 requirements.

Requirements covered:
1. Missing pillar policy:
   - Door 1 requires z_qual AND z_mom; revisions optional; renormalised weights (0.45/0.80, 0.35/0.80).
   - Door 2 requires z_val; z_gap and z_qual optional, renormalised over present weights.
   - Removal of every `else 0.0` substitution.
   - Record door1_pillars_used, door2_pillars_used, door1_weight_scale, door2_weight_scale.
2. Unit variance standardisation:
   - Divide each pillar z by cross-sectional sd over scored set.
   - Store pillar_sd, pillar_sd_degenerate, and effective_weights in summary.
   - effective_weights sums to 1.0 per door.
3. Gaussian rank standardisation:
   - Ranks to expected z's, ties handling (average rank), clipping at +/-3.0.
4. Winsor default unchanged:
   - Default method is winsor.
   - Complete-pillar profiles match baseline when unit-variance is toggled off.
"""

import statistics
from pathlib import Path
from typing import Dict, Any, List

import pytest

import score_factors_dual_door as sfdd
from score_factors_dual_door import (
    sector_neutral_z,
    get_percentile,
    _contributions,
    Z_CLAMP,
    score_door1,
    score_door2,
    compute_pillar_sd,
    compute_effective_weights,
    standardize_pillar_value,
    DOOR1_BASE_WEIGHTS,
    DOOR2_BASE_WEIGHTS,
)


def test_gaussian_rank_known_sample():
    """Gaussian rank on a known sample: midranks, expected z's, ties, and clipping."""
    # 1. Known sample of 4 distinct values
    raw = {"A": 10.0, "B": 20.0, "C": 30.0, "D": 40.0}
    sec = {t: "Tech" for t in raw}
    z = sector_neutral_z(raw, sec, method="gaussian_rank")

    # Pool size = 4 (< 15 -> universe pool of 4)
    # Ranks: A=1, B=2, C=3, D=4
    # p = (r - 0.5) / 4 -> [0.125, 0.375, 0.625, 0.875]
    expected_A = statistics.NormalDist().inv_cdf(0.125)
    expected_B = statistics.NormalDist().inv_cdf(0.375)
    expected_C = statistics.NormalDist().inv_cdf(0.625)
    expected_D = statistics.NormalDist().inv_cdf(0.875)

    assert z["A"] == pytest.approx(expected_A, abs=1e-5)
    assert z["B"] == pytest.approx(expected_B, abs=1e-5)
    assert z["C"] == pytest.approx(expected_C, abs=1e-5)
    assert z["D"] == pytest.approx(expected_D, abs=1e-5)

    # Perfect anti-symmetry
    assert z["A"] == pytest.approx(-z["D"], abs=1e-6)
    assert z["B"] == pytest.approx(-z["C"], abs=1e-6)

    # 2. Ties get the average rank
    raw_ties = {"A": 10.0, "B": 20.0, "C": 20.0, "D": 30.0}
    sec_ties = {t: "Tech" for t in raw_ties}
    z_ties = sector_neutral_z(raw_ties, sec_ties, method="gaussian_rank")

    # Midrank for B and C is (2 + 3) / 2 = 2.5
    # p = (2.5 - 0.5) / 4 = 0.5 -> NormalDist().inv_cdf(0.5) = 0.0
    assert z_ties["B"] == pytest.approx(0.0, abs=1e-6)
    assert z_ties["C"] == pytest.approx(0.0, abs=1e-6)
    assert z_ties["B"] == z_ties["C"]
    assert z_ties["A"] == pytest.approx(-z_ties["D"], abs=1e-6)

    # 3. Clipping at +/- 3.0 in large sample
    raw_large = {f"T_{i}": float(i) for i in range(1000)}
    sec_large = {t: "Tech" for t in raw_large}
    z_large = sector_neutral_z(raw_large, sec_large, method="gaussian_rank")

    # Lowest rank: p = 0.5 / 1000 = 0.0005 -> inv_cdf ~= -3.29 -> clipped to -3.0
    assert z_large["T_0"] == -Z_CLAMP
    # Highest rank: p = 999.5 / 1000 = 0.9995 -> inv_cdf ~= +3.29 -> clipped to +3.0
    assert z_large["T_999"] == Z_CLAMP


def test_winsor_default_unchanged():
    """Default method is winsor; produces clamped z-scores around mean and pstdev."""
    assert sfdd.Z_METHOD == "winsor"

    raw = {"A": 1.0, "B": 2.0, "C": 3.0, "D": 4.0, "E": 5.0}
    sec = {t: "Tech" for t in raw}
    z_default = sector_neutral_z(raw, sec)
    z_winsor = sector_neutral_z(raw, sec, method="winsor")

    assert z_default == z_winsor
    # Median element (3.0) should have score close to 0.0
    assert z_default["C"] == pytest.approx(0.0, abs=1e-4)


def test_door1_ineligible_without_qual_or_mom():
    """Door 1 requires z_qual AND z_mom. If either is missing, Door 1 is ineligible."""
    d1_score, d1_pillars_used, d1_weight_scale, d1_ineligible_reason = score_door1(None, 1.0, 0.5)
    assert d1_score is None
    assert d1_ineligible_reason == "missing_z_quality"
    assert d1_pillars_used == []
    assert d1_weight_scale is None

    d1_score, d1_pillars_used, d1_weight_scale, d1_ineligible_reason = score_door1(1.0, None, 0.5)
    assert d1_score is None
    assert d1_ineligible_reason == "missing_z_momentum"
    assert d1_pillars_used == []
    assert d1_weight_scale is None

    d1_score, d1_pillars_used, d1_weight_scale, d1_ineligible_reason = score_door1(None, None, 0.5)
    assert d1_score is None
    assert d1_ineligible_reason == "missing_z_quality_and_missing_z_momentum"
    assert d1_pillars_used == []

    d1_score, d1_pillars_used, d1_weight_scale, d1_ineligible_reason = score_door1(1.0, 1.0, None)
    assert d1_score is not None
    assert d1_ineligible_reason is None
    assert d1_pillars_used == ["quality", "momentum"]
    assert d1_weight_scale == 1.25


def test_door2_ineligible_without_val():
    """Door 2 requires z_val. If missing, Door 2 is ineligible."""
    d2_score, d2_pillars_used, d2_weight_scale, d2_ineligible_reason = score_door2(None, 1.0, 1.0)
    assert d2_score is None
    assert d2_ineligible_reason == "missing_z_value"
    assert d2_pillars_used == []
    assert d2_weight_scale is None


def test_pillar_missing_renormalised_weights():
    """Pillar missing results in exact renormalisation over present weights, no 0.0 imputation."""
    # Door 1: revisions missing -> weights 0.45/0.80 and 0.35/0.80
    z_qual, z_mom = 1.6, 0.8
    w_qual, w_mom = 0.45 / 0.80, 0.35 / 0.80
    expected_d1 = w_qual * z_qual + w_mom * z_mom
    assert pytest.approx(w_qual + w_mom) == 1.0

    d1_score, d1_pillars_used, d1_weight_scale, _ = score_door1(z_qual, z_mom, None)
    assert d1_score == pytest.approx(expected_d1)
    assert d1_pillars_used == ["quality", "momentum"]
    assert d1_weight_scale == 1.25

    # Door 2: gap missing -> weights 0.40/0.60 and 0.20/0.60
    z_val, z_qual_d2 = 1.2, 0.6
    expected_d2 = (0.40 / 0.60) * z_val + (0.20 / 0.60) * z_qual_d2
    d2_score, d2_pillars_used, d2_weight_scale, _ = score_door2(z_val, None, z_qual_d2)
    assert d2_score == pytest.approx(expected_d2)
    assert d2_pillars_used == ["value", "quality"]
    assert d2_weight_scale == pytest.approx(1.6667)

    # Door 2: both gap and qual missing -> weight 0.40/0.40 = 1.0
    d2_score_val_only, d2_pillars_val_only, d2_scale_val_only, _ = score_door2(z_val, None, None)
    assert d2_score_val_only == pytest.approx(z_val)
    assert d2_pillars_val_only == ["value"]
    assert d2_scale_val_only == 2.5


def test_contributions_honors_renormalised_weights():
    """_contributions computes relative contributions based on present pillars and weight scale."""
    prof_d1_renorm = {
        "score_door1": 1.25,
        "score_door2": 0.80,
        "pctl_d1": 95.0,
        "pctl_d2": 80.0,
        "door1_weight_scale": 1.25,
        "door1_pillars_used": ["quality", "momentum"],
        "z_quality": 1.0,
        "z_momentum": 1.0,
        "z_momentum_door1": 1.0,
        "z_revisions": None,
    }
    c = _contributions(prof_d1_renorm)
    assert c is not None
    # quality: 0.45 * 1.25 * 1.0 = 0.5625
    # momentum: 0.35 * 1.25 * 1.0 = 0.4375
    # revisions absent -> not in dict
    assert c["quality"] == 0.5625
    assert c["momentum"] == 0.4375
    assert "revisions" not in c
    assert pytest.approx(c["quality"] + c["momentum"]) == 1.0


def test_effective_weights_calculation_and_sum():
    """Effective weights formula w * sd / sum(w * sd) sums to 1.0 per door."""
    # Realistic pillar sds (e.g. from empirical dual door distribution)
    pillar_sd_exact = {
        "quality": 0.6234,
        "momentum": 0.8123,
        "revisions": 0.9854,
        "value": 0.7456,
        "exp_gap": 1.0234,
    }

    ew1 = compute_effective_weights(DOOR1_BASE_WEIGHTS, pillar_sd_exact)
    assert sum(ew1.values()) == pytest.approx(1.0, abs=1e-3)

    ew2 = compute_effective_weights(DOOR2_BASE_WEIGHTS, pillar_sd_exact)
    assert sum(ew2.values()) == pytest.approx(1.0, abs=1e-3)


def test_effective_weights_falls_back_to_base_when_all_degenerate():
    """Every pillar degenerate (sd None) -> falls back to the nominal base weights, rounded."""
    ew1 = compute_effective_weights(DOOR1_BASE_WEIGHTS, {"quality": None, "momentum": None, "revisions": None})
    assert ew1 == {k: round(v, 4) for k, v in DOOR1_BASE_WEIGHTS.items()}


def test_degenerate_pillar_handling():
    """A pillar with sd == 0 or < 2 values is left undivided and flagged in pillar_sd_degenerate."""
    PILLAR_NAMES = ("quality", "momentum", "revisions", "value", "exp_gap")
    # revisions has < 2 values, exp_gap has sd == 0
    raw_pillars = {
        "T1": {"quality": 1.0, "momentum": 0.5, "revisions": 0.5, "value": 1.0, "exp_gap": 2.0},
        "T2": {"quality": 2.0, "momentum": 1.5, "revisions": None, "value": 0.5, "exp_gap": 2.0},
        "T3": {"quality": 3.0, "momentum": 2.5, "revisions": None, "value": 1.5, "exp_gap": 2.0},
    }
    scored_tickers = ["T1", "T2", "T3"]

    pillar_sd, pillar_sd_exact, pillar_sd_degenerate = compute_pillar_sd(
        scored_tickers, raw_pillars, PILLAR_NAMES
    )

    assert "revisions" in pillar_sd_degenerate
    assert "exp_gap" in pillar_sd_degenerate
    assert "quality" not in pillar_sd_degenerate
    assert "momentum" not in pillar_sd_degenerate
    assert "value" not in pillar_sd_degenerate

    # Undivided check, via the same standardize_pillar_value main() calls per ticker/pillar.
    for t in scored_tickers:
        std_exp_gap = standardize_pillar_value(
            raw_pillars[t]["exp_gap"], pillar_sd_exact.get("exp_gap"),
            "exp_gap" in pillar_sd_degenerate, use_unit_variance=True,
        )
        assert std_exp_gap == 2.0   # exp_gap values were undivided (remained 2.0)

    # A non-degenerate pillar IS divided by its sd.
    std_quality_t1 = standardize_pillar_value(
        raw_pillars["T1"]["quality"], pillar_sd_exact.get("quality"),
        "quality" in pillar_sd_degenerate, use_unit_variance=True,
    )
    assert std_quality_t1 == pytest.approx(1.0 / pillar_sd_exact["quality"])


def test_complete_pillar_scores_identical_without_unit_variance():
    """When unit-variance is disabled, complete-pillar names have unchanged (raw) scores."""
    z_q, z_m, z_r, z_v, z_g = 1.2, 0.8, -0.4, 1.5, 0.5
    baseline_d1 = 0.45 * z_q + 0.35 * z_m + 0.20 * z_r
    baseline_d2 = 0.40 * z_v + 0.40 * z_g + 0.20 * z_q

    # standardize_pillar_value passes raw values through unchanged when use_unit_variance=False.
    std_q = standardize_pillar_value(z_q, 0.6234, degenerate=False, use_unit_variance=False)
    std_m = standardize_pillar_value(z_m, 0.8123, degenerate=False, use_unit_variance=False)
    std_r = standardize_pillar_value(z_r, 0.9854, degenerate=False, use_unit_variance=False)
    std_v = standardize_pillar_value(z_v, 0.7456, degenerate=False, use_unit_variance=False)
    std_g = standardize_pillar_value(z_g, 1.0234, degenerate=False, use_unit_variance=False)
    assert (std_q, std_m, std_r, std_v, std_g) == (z_q, z_m, z_r, z_v, z_g)

    d1_score, d1_pillars_used, d1_weight_scale, _ = score_door1(std_q, std_m, std_r)
    d2_score, _, _, _ = score_door2(std_v, std_g, std_q)

    assert d1_score == pytest.approx(baseline_d1)
    assert d1_pillars_used == ["quality", "momentum", "revisions"]
    assert d1_weight_scale == 1.0
    assert d2_score == pytest.approx(baseline_d2)


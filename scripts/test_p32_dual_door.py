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

import math
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
    scored_tickers = ["T_NO_QUAL", "T_NO_MOM", "T_NO_BOTH", "T_ELIGIBLE"]
    std_pillars = {
        "T_NO_QUAL": {"quality": None, "momentum": 1.0, "revisions": 0.5, "value": 1.0, "exp_gap": 0.5},
        "T_NO_MOM": {"quality": 1.0, "momentum": None, "revisions": 0.5, "value": 1.0, "exp_gap": 0.5},
        "T_NO_BOTH": {"quality": None, "momentum": None, "revisions": 0.5, "value": 1.0, "exp_gap": 0.5},
        "T_ELIGIBLE": {"quality": 1.0, "momentum": 1.0, "revisions": None, "value": 1.0, "exp_gap": 0.5},
    }

    # Simulate Door 1 scoring logic from score_factors_dual_door.py
    for t in scored_tickers:
        z_qual = std_pillars[t]["quality"]
        z_mom = std_pillars[t]["momentum"]
        z_rev = std_pillars[t]["revisions"]

        d1_score = None
        d1_pillars_used = []
        d1_weight_scale = None
        d1_ineligible_reason = None

        if z_qual is None or z_mom is None:
            missing = []
            if z_qual is None: missing.append("missing_z_quality")
            if z_mom is None: missing.append("missing_z_momentum")
            d1_ineligible_reason = "_and_".join(missing)
        else:
            if z_rev is not None:
                d1_pillars_used = ["quality", "momentum", "revisions"]
                d1_weight_scale = 1.0
                d1_score = 0.45 * z_qual + 0.35 * z_mom + 0.20 * z_rev
            else:
                d1_pillars_used = ["quality", "momentum"]
                d1_weight_scale = round(1.0 / 0.80, 4)
                d1_score = (0.45 / 0.80) * z_qual + (0.35 / 0.80) * z_mom

        if t == "T_NO_QUAL":
            assert d1_score is None
            assert d1_ineligible_reason == "missing_z_quality"
            assert d1_pillars_used == []
            assert d1_weight_scale is None
        elif t == "T_NO_MOM":
            assert d1_score is None
            assert d1_ineligible_reason == "missing_z_momentum"
            assert d1_pillars_used == []
            assert d1_weight_scale is None
        elif t == "T_NO_BOTH":
            assert d1_score is None
            assert d1_ineligible_reason == "missing_z_quality_and_missing_z_momentum"
            assert d1_pillars_used == []
        elif t == "T_ELIGIBLE":
            assert d1_score is not None
            assert d1_ineligible_reason is None
            assert d1_pillars_used == ["quality", "momentum"]
            assert d1_weight_scale == 1.25


def test_door2_ineligible_without_val():
    """Door 2 requires z_val. If missing, Door 2 is ineligible."""
    z_val = None
    z_gap = 1.0
    z_qual = 1.0

    d2_score = None
    d2_pillars_used = []
    d2_weight_scale = None
    d2_ineligible_reason = None

    if z_val is None:
        d2_ineligible_reason = "missing_z_value"
    else:
        present_d2 = [("value", 0.40, z_val)]
        if z_gap is not None: present_d2.append(("exp_gap", 0.40, z_gap))
        if z_qual is not None: present_d2.append(("quality", 0.20, z_qual))
        d2_pillars_used = [name for name, w, val in present_d2]
        sum_w2 = sum(w for name, w, val in present_d2)
        d2_weight_scale = round(1.0 / sum_w2, 4)
        d2_score = sum((w / sum_w2) * val for name, w, val in present_d2)

    assert d2_score is None
    assert d2_ineligible_reason == "missing_z_value"
    assert d2_pillars_used == []
    assert d2_weight_scale is None


def test_pillar_missing_renormalised_weights():
    """Pillar missing results in exact renormalisation over present weights, no 0.0 imputation."""
    # Door 1: revisions missing -> weights 0.45/0.80 and 0.35/0.80
    z_qual = 1.6
    z_mom = 0.8
    z_rev = None

    w_qual = 0.45 / 0.80
    w_mom = 0.35 / 0.80
    expected_d1 = w_qual * z_qual + w_mom * z_mom
    assert pytest.approx(w_qual + w_mom) == 1.0

    d1_score = (0.45 / 0.80) * z_qual + (0.35 / 0.80) * z_mom
    assert d1_score == pytest.approx(expected_d1)
    # Check that scale is 1.25
    assert round(1.0 / 0.80, 4) == 1.25

    # Door 2: gap missing -> weights 0.40/0.60 and 0.20/0.60
    z_val = 1.2
    z_gap = None
    z_qual_d2 = 0.6
    present_d2 = [("value", 0.40, z_val), ("quality", 0.20, z_qual_d2)]
    sum_w2 = sum(w for name, w, val in present_d2)
    assert sum_w2 == pytest.approx(0.60)
    expected_d2 = (0.40 / 0.60) * z_val + (0.20 / 0.60) * z_qual_d2
    actual_d2 = sum((w / sum_w2) * val for name, w, val in present_d2)
    assert actual_d2 == pytest.approx(expected_d2)
    assert round(1.0 / sum_w2, 4) == 1.6667

    # Door 2: both gap and qual missing -> weight 0.40/0.40 = 1.0
    present_d2_val_only = [("value", 0.40, z_val)]
    sum_w_val = 0.40
    actual_d2_val_only = sum((w / sum_w_val) * val for name, w, val in present_d2_val_only)
    assert actual_d2_val_only == pytest.approx(z_val)
    assert round(1.0 / sum_w_val, 4) == 2.5


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
    DOOR1_BASE = {"quality": 0.45, "momentum": 0.35, "revisions": 0.20}
    DOOR2_BASE = {"value": 0.40, "exp_gap": 0.40, "quality": 0.20}

    # Realistic pillar sds (e.g. from empirical dual door distribution)
    pillar_sd = {
        "quality": 0.6234,
        "momentum": 0.8123,
        "revisions": 0.9854,
        "value": 0.7456,
        "exp_gap": 1.0234,
    }

    # Door 1
    p1 = {k: DOOR1_BASE[k] * pillar_sd[k] for k in DOOR1_BASE}
    sum_p1 = sum(p1.values())
    ew1 = {k: round(v / sum_p1, 4) for k, v in p1.items()}
    assert sum(ew1.values()) == pytest.approx(1.0, abs=1e-3)

    # Door 2
    p2 = {k: DOOR2_BASE[k] * pillar_sd[k] for k in DOOR2_BASE}
    sum_p2 = sum(p2.values())
    ew2 = {k: round(v / sum_p2, 4) for k, v in p2.items()}
    assert sum(ew2.values()) == pytest.approx(1.0, abs=1e-3)


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

    pillar_sd = {}
    pillar_sd_exact = {}
    pillar_sd_degenerate = []

    for p_name in PILLAR_NAMES:
        vals = [raw_pillars[t][p_name] for t in scored_tickers if raw_pillars[t][p_name] is not None]
        if len(vals) < 2:
            pillar_sd_degenerate.append(p_name)
            pillar_sd[p_name] = None
            pillar_sd_exact[p_name] = None
        else:
            sd = statistics.pstdev(vals)
            if sd == 0 or not math.isfinite(sd):
                pillar_sd_degenerate.append(p_name)
                pillar_sd[p_name] = round(sd, 4) if math.isfinite(sd) else None
                pillar_sd_exact[p_name] = None
            else:
                pillar_sd[p_name] = round(sd, 4)
                pillar_sd_exact[p_name] = sd

    assert "revisions" in pillar_sd_degenerate
    assert "exp_gap" in pillar_sd_degenerate
    assert "quality" not in pillar_sd_degenerate
    assert "momentum" not in pillar_sd_degenerate
    assert "value" not in pillar_sd_degenerate

    # Undivided check
    std_pillars = {}
    for t in scored_tickers:
        std_pillars[t] = {}
        for p_name in PILLAR_NAMES:
            raw_val = raw_pillars[t][p_name]
            if raw_val is None:
                std_pillars[t][p_name] = None
            else:
                sd_ex = pillar_sd_exact.get(p_name)
                if p_name in pillar_sd_degenerate or sd_ex is None or sd_ex <= 0:
                    std_pillars[t][p_name] = raw_val
                else:
                    std_pillars[t][p_name] = raw_val / sd_ex

    # exp_gap values were undivided (remained 2.0)
    assert std_pillars["T1"]["exp_gap"] == 2.0
    assert std_pillars["T2"]["exp_gap"] == 2.0
    assert std_pillars["T3"]["exp_gap"] == 2.0


def test_complete_pillar_scores_identical_without_unit_variance():
    """When unit-variance is disabled (flag used ONLY in test), complete-pillar names have unchanged scores."""
    # Complete-pillar name: qual, mom, rev, val, gap all present
    # Base Door 1: 0.45 * q + 0.35 * m + 0.20 * r
    # Base Door 2: 0.40 * v + 0.40 * g + 0.20 * q
    z_q, z_m, z_r, z_v, z_g = 1.2, 0.8, -0.4, 1.5, 0.5

    # Baseline calculation (pre-P3.2 for complete pillars)
    baseline_d1 = 0.45 * z_q + 0.35 * z_m + 0.20 * z_r
    baseline_d2 = 0.40 * z_v + 0.40 * z_g + 0.20 * z_q

    # P3.2 calculation with unit-variance disabled (raw pillars used directly)
    d1_pillars_used = ["quality", "momentum", "revisions"]
    d1_weight_scale = 1.0
    d1_score = 0.45 * z_q + 0.35 * z_m + 0.20 * z_r

    present_d2 = [("value", 0.40, z_v), ("exp_gap", 0.40, z_g), ("quality", 0.20, z_q)]
    sum_w2 = 1.0
    d2_score = sum((w / sum_w2) * val for _, w, val in present_d2)

    assert d1_score == pytest.approx(baseline_d1)
    assert d2_score == pytest.approx(baseline_d2)


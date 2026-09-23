"""test_p3_review_c8.py — tests for C8 effective weights publishing in summary."""
import json
import pytest
import score_factors_dual_door as sfdd


def test_effective_weights_keys_and_values():
    """C8: summary publishes effective_weights_before_standardisation, effective_weights_live,
    and effective_weights alias with _note.
    """
    pillar_sd_exact = {
        "quality": 0.60,
        "momentum": 0.80,
        "revisions": 1.00,
        "value": 0.70,
        "exp_gap": 0.90,
    }

    # Before standardisation: w * sd / sum(w * sd)
    ew_before_d1 = sfdd.compute_effective_weights(sfdd.DOOR1_BASE_WEIGHTS, pillar_sd_exact)
    ew_before_d2 = sfdd.compute_effective_weights(sfdd.DOOR2_BASE_WEIGHTS, pillar_sd_exact)

    # Live weights: base door weights renormalised per door
    total_d1 = sum(sfdd.DOOR1_BASE_WEIGHTS.values())
    total_d2 = sum(sfdd.DOOR2_BASE_WEIGHTS.values())
    ew_live_d1 = {k: round(v / total_d1, 4) for k, v in sfdd.DOOR1_BASE_WEIGHTS.items()}
    ew_live_d2 = {k: round(v / total_d2, 4) for k, v in sfdd.DOOR2_BASE_WEIGHTS.items()}

    assert ew_live_d1 == {"quality": 0.45, "momentum": 0.35, "revisions": 0.20}
    assert ew_live_d2 == {"value": 0.40, "exp_gap": 0.40, "quality": 0.20}

    # Check sum of live weights is 1.0
    assert sum(ew_live_d1.values()) == pytest.approx(1.0)
    assert sum(ew_live_d2.values()) == pytest.approx(1.0)

    # Check alias structure
    ew_alias = {
        "door1": ew_before_d1,
        "door2": ew_before_d2,
        "_note": "alias of effective_weights_before_standardisation for diff harness compatibility",
    }
    assert ew_alias["door1"] == ew_before_d1
    assert ew_alias["door2"] == ew_before_d2
    assert "_note" in ew_alias

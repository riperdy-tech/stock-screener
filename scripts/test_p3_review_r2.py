"""test_p3_review_r2.py — tests for R2 Door-3 profitability floor: raw roic_proxy > 0 AND sector-neutral z >= 25th pct."""
import pytest
import score_factors_dual_door as sfdd


def _base_elig(**kw):
    base = dict(
        mcap=5e9,
        falling_knife=False,
        mom_break=False,
        z_revisions=0.5,
        roic_proxy_z=1.0,
        roic_proxy_pctl25=0.0,
        adv_usd=1_000_000.0,
        min_mcap=2e9,
        usable_months=11,
        jump_share=0.3,
        max_jump_share=0.75,
        mom_12_1=0.60,
        jump_rule_min_return=0.50,
        raw_roic_proxy=0.10,
    )
    base.update(kw)
    return sfdd.door3_eligibility(**base)


def test_r2_eligible_positive_roic_and_above_pctl25():
    """Both raw roic_proxy > 0 and z >= pctl25 -> passes."""
    eligible, reason, _ = _base_elig(raw_roic_proxy=0.15, roic_proxy_z=0.5, roic_proxy_pctl25=0.0)
    assert eligible is True
    assert reason is None


def test_r2_ineligible_negative_raw_roic():
    """raw roic_proxy < 0 -> ineligible, reason unprofitable (even if sector z is high)."""
    eligible, reason, _ = _base_elig(raw_roic_proxy=-0.02, roic_proxy_z=2.0, roic_proxy_pctl25=0.0)
    assert eligible is False
    assert reason == "unprofitable"


def test_r2_ineligible_zero_raw_roic():
    """raw roic_proxy == 0 -> ineligible, reason unprofitable."""
    eligible, reason, _ = _base_elig(raw_roic_proxy=0.0, roic_proxy_z=1.5, roic_proxy_pctl25=0.0)
    assert eligible is False
    assert reason == "unprofitable"


def test_r2_ineligible_raw_roic_none():
    """raw roic_proxy is None -> ineligible, reason no_profitability_data."""
    eligible, reason, _ = _base_elig(raw_roic_proxy=None, roic_proxy_z=1.0, roic_proxy_pctl25=0.0)
    assert eligible is False
    assert reason == "no_profitability_data"


def test_r2_ineligible_roic_z_below_pctl25():
    """raw roic_proxy > 0, but sector-neutral z < pctl25 -> ineligible, reason profitability_below_pctl25."""
    eligible, reason, _ = _base_elig(raw_roic_proxy=0.05, roic_proxy_z=-0.5, roic_proxy_pctl25=0.0)
    assert eligible is False
    assert reason == "profitability_below_pctl25"

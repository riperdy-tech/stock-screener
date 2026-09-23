"""test_p3_review_r1.py — tests for R1 jump rule minimum return threshold (12-1 >= 0.50)."""
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
        jump_share=0.795,  # Above 0.75 ceiling
        max_jump_share=0.75,
        mom_12_1=0.18,  # NVDA case: +18% gain
        jump_rule_min_return=0.50,
        raw_roic_proxy=0.10,
    )
    base.update(kw)
    return sfdd.door3_eligibility(**base)


def test_jump_rule_exempt_when_mom_12_1_below_threshold():
    """R1: NVDA case (+18% return, jump_share 0.795) is exempt from the jump rule."""
    eligible, reason, _ = _base_elig(mom_12_1=0.18, jump_share=0.795)
    assert eligible is True
    assert reason is None


def test_jump_rule_applies_when_mom_12_1_at_or_above_threshold():
    """R1: At or above 0.50 gain, jump_share > 0.75 still triggers jump_driven rejection."""
    # Exactly at threshold 0.50
    eligible, reason, _ = _base_elig(mom_12_1=0.50, jump_share=0.795)
    assert eligible is False
    assert reason == "jump_driven"

    # Well above threshold (e.g. PACS / IBRX case)
    eligible, reason, _ = _base_elig(mom_12_1=1.50, jump_share=0.795)
    assert eligible is False
    assert reason == "jump_driven"


def test_jump_rule_passes_when_jump_share_below_ceiling():
    """A name with 12-1 >= 0.50 and jump_share <= 0.75 is eligible."""
    eligible, reason, _ = _base_elig(mom_12_1=0.80, jump_share=0.50)
    assert eligible is True
    assert reason is None


def test_sifter_config_loads_door3_jump_rule_min_return():
    """Verify that sifter_config.json's DOOR3_JUMP_RULE_MIN_RETURN loads correctly."""
    cfg = sfdd._load_door3_config()
    assert cfg.get("DOOR3_JUMP_RULE_MIN_RETURN") == 0.50

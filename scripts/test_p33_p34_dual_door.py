"""test_p33_p34_dual_door.py — Unit tests for Phase 3 P3.3 and P3.4 requirements.

Requirements covered:
P3.3 Falling-knife floor:
1. Floor boundary:
   - z_momentum == -1.5 is exactly eligible (d2_eligible=True, no falling_knife flag).
   - z_momentum == -1.501 is NOT eligible (d2_eligible=False, falling_knife flag, falling_knife_detail populated).
2. Regime shift down:
   - "regime_shift_down" in fct_momentum_state trips it even if z_momentum >= -1.5 (d2_eligible=False).
   - key absent or False does not trip it.
3. Missing momentum:
   - z_momentum is None -> eligible (d2_eligible=True), flagged "momentum_missing", no falling_knife.
4. Score preservation vs best_pctl:
   - A falling knife keeps score_door2 and pctl_d2 for display.
   - best_pctl uses pctl_d1 only.
   - If score_door1 is None, best_pctl is 0.0.
5. Door won and contributions:
   - A knife cannot win Door 2. Wins Door 1 if score_door1 is present, else NONE.
   - _contributions honors d2_eligible (won_d1 = True if d2_eligible is False and score_door1 present).
6. Config and summary:
   - scripts/momentum_config.json has DOOR2_MOMENTUM_FLOOR == -1.5.
"""

import json
from pathlib import Path
from typing import Dict, Any, List

import pytest

import score_factors_dual_door as sfdd
from score_factors_dual_door import (
    DOOR2_MOMENTUM_FLOOR,
    _contributions,
    _load_door2_momentum_floor,
    _resolve_regime_shift_down,
    evaluate_falling_knife,
    is_double_door_champion,
    champion_bonus,
    priority_sort_key_for_profile,
)


def _eval_knife(z_mom: float | None, fct_mom: Dict[str, Any] | None = None, flags: List[str] | None = None, floor: float = -1.5):
    """Thin wrapper around the production functions (_resolve_regime_shift_down,
    evaluate_falling_knife) reproducing the same flag-list bookkeeping main() does around them,
    so the tests below can assert on (d2_eligible, cur_flags, falling_knife_detail) as before."""
    fct_mom = fct_mom or {}
    cur_flags = list(flags or [])
    regime_shift_down = _resolve_regime_shift_down(fct_mom, cur_flags)
    d2_eligible, knife_flag, falling_knife_detail = evaluate_falling_knife(z_mom, floor, regime_shift_down)
    if knife_flag is not None and knife_flag not in cur_flags:
        cur_flags.append(knife_flag)
    return d2_eligible, cur_flags, falling_knife_detail


def test_momentum_config_has_floor():
    """scripts/sifter_config.json carries DOOR2_MOMENTUM_FLOOR = -1.5."""
    cfg_path = Path(__file__).resolve().parent / "sifter_config.json"
    if not cfg_path.exists():
        cfg_path = Path(__file__).resolve().parent / "momentum_config.json"
    assert cfg_path.exists(), "sifter_config.json (or momentum_config.json) must exist"
    data = json.loads(cfg_path.read_text(encoding="utf-8"))
    val = data.get("door2_momentum_floor", data.get("DOOR2_MOMENTUM_FLOOR"))
    assert val == -1.5
    assert _load_door2_momentum_floor(cfg_path) == -1.5
    assert sfdd.DOOR2_MOMENTUM_FLOOR == -1.5


def test_floor_boundary_exact():
    """Floor boundary: -1.5 is exactly eligible; -1.501 is not eligible."""
    # Boundary: -1.5 exactly
    d2_ok, flags, detail = _eval_knife(-1.5)
    assert d2_ok is True
    assert "falling_knife" not in flags
    assert detail is None

    # Slightly above: -1.499
    d2_ok_above, flags_above, detail_above = _eval_knife(-1.499)
    assert d2_ok_above is True
    assert "falling_knife" not in flags_above
    assert detail_above is None

    # Boundary: -1.501 (below floor)
    d2_ok_below, flags_below, detail_below = _eval_knife(-1.501)
    assert d2_ok_below is False
    assert "falling_knife" in flags_below
    assert detail_below == {
        "z_momentum": -1.501,
        "floor": -1.5,
        "regime_shift_down": False,
    }


def test_regime_shift_down_trips_floor():
    """regime_shift_down trips falling_knife even if z_momentum is positive / above floor."""
    # z_momentum = +1.0, but regime_shift_down is True
    d2_ok, flags, detail = _eval_knife(1.0, fct_mom={"regime_shift_down": True})
    assert d2_ok is False
    assert "falling_knife" in flags
    assert detail == {
        "z_momentum": 1.0,
        "floor": -1.5,
        "regime_shift_down": True,
    }

    # regime_shift_down is False -> eligible
    d2_ok_f, flags_f, detail_f = _eval_knife(1.0, fct_mom={"regime_shift_down": False})
    assert d2_ok_f is True
    assert "falling_knife" not in flags_f
    assert detail_f is None

    # regime_shift_down absent from fct_momentum_state -> eligible (does not trip)
    d2_ok_absent, flags_absent, detail_absent = _eval_knife(1.0, fct_mom={})
    assert d2_ok_absent is True
    assert "falling_knife" not in flags_absent
    assert detail_absent is None


def test_momentum_missing_when_none():
    """z_momentum is None -> eligible, flag momentum_missing, no falling_knife."""
    d2_ok, flags, detail = _eval_knife(None, fct_mom={})
    assert d2_ok is True
    assert "momentum_missing" in flags
    assert "falling_knife" not in flags
    assert detail is None


def test_knife_keeps_door2_score_and_pctl_but_best_pctl_is_pctl_d1():
    """A falling knife keeps score_door2 and pctl_d2 for display, but best_pctl uses pctl_d1 only."""
    p = {"score_door1": 0.50, "score_door2": 2.50, "pctl_d1": 65.0, "pctl_d2": 95.0, "d2_eligible": False}
    p["best_pctl"] = sfdd.compute_best_pctl(p["score_door1"], p["score_door2"], p["pctl_d1"], p["pctl_d2"], p["d2_eligible"])

    # Door 2 score and pctl are kept for display
    assert p["score_door2"] == 2.50
    assert p["pctl_d2"] == 95.0
    # But best_pctl uses Door 1 only (65.0, NOT 95.0)
    assert p["best_pctl"] == 65.0

    # If score_door1 is None and d2_eligible is False: best_pctl is 0.0 (Door 2 is disqualified
    # by the knife, so its score can never rescue best_pctl either).
    best_pctl_no_d1 = sfdd.compute_best_pctl(None, 2.50, 0.0, 95.0, False)
    assert best_pctl_no_d1 == 0.0


def test_contributions_honors_d2_eligible():
    """_contributions won_d1 is True when d2_eligible is False, even if pctl_d2 > pctl_d1."""
    prof = {
        "score_door1": 0.40,
        "score_door2": 1.20,
        "pctl_d1": 50.0,
        "pctl_d2": 95.0,
        "z_quality": 1.0,
        "z_momentum": -2.0,
        "z_momentum_door1": -2.0,
        "z_value": 2.0,
        "d2_eligible": False,
        "door1_pillars_used": ["quality", "momentum"],
        "door2_pillars_used": ["value", "quality"],
    }
    contrib = _contributions(prof)
    assert contrib is not None
    # Won Door 1 because Door 2 is ineligible: contributions reflect Door 1 (quality and momentum)
    assert "value" not in contrib
    assert "quality" in contrib
    assert "momentum" in contrib


def test_champion_requires_pctl_gte_90_and_d2_eligible():
    """DOUBLE_DOOR_CHAMPION requires pctl_d1 >= 90 AND pctl_d2 >= 90 AND d2_eligible.
    Raw score > 0.40 rule is deleted.
    """
    # 1. Both percentiles >= 90 and d2_eligible -> Champion
    assert is_double_door_champion(91.0, 93.0, True) is True

    # 2. Both percentiles >= 90 but falling knife (d2_eligible=False) -> NOT Champion
    assert is_double_door_champion(95.0, 96.0, False) is False

    # 3. pctl_d1 < 90 -> NOT Champion
    assert is_double_door_champion(89.9, 95.0, True) is False

    # 4. pctl_d2 < 90 -> NOT Champion
    assert is_double_door_champion(95.0, 89.9, True) is False

    # 5. Raw scores > 0.40 but percentiles < 90 -> NOT Champion (raw score rule deleted; a raw
    # score is not even a parameter of is_double_door_champion any more).
    assert is_double_door_champion(85.0, 85.0, True) is False


def test_champion_bonus_2_0_ordering():
    """bonus 2.0 ordering: a champion at best_pctl 95 does not jump a non-champion at 98."""
    # Champion at best_pctl = 95.0
    champ = {
        "ticker": "CHAMP",
        "best_pctl": 95.0,
        "nominated_doors": ["DOOR_1_COMPOUNDER", "DOUBLE_DOOR_CHAMPION"],
    }
    # Non-champion at best_pctl = 98.0
    non_champ = {
        "ticker": "HIGH_NON_CHAMP",
        "best_pctl": 98.0,
        "nominated_doors": ["DOOR_1_COMPOUNDER"],
    }
    # Non-champion at best_pctl = 96.0
    close_non_champ = {
        "ticker": "CLOSE_NON_CHAMP",
        "best_pctl": 96.0,
        "nominated_doors": ["DOOR_1_COMPOUNDER"],
    }

    assert champion_bonus(champ["nominated_doors"]) == 2.0
    assert champion_bonus(non_champ["nominated_doors"]) == 0.0

    key_champ = priority_sort_key_for_profile(champ)
    key_non_champ = priority_sort_key_for_profile(non_champ)
    key_close = priority_sort_key_for_profile(close_non_champ)

    # 95.0 + 2.0 = 97.0
    assert key_champ == 97.0
    assert key_non_champ == 98.0
    assert key_close == 96.0

    # Champion at 95 (key 97) DOES NOT jump non-champion at 98 (key 98)
    assert key_champ < key_non_champ

    # But champion at 95 (key 97) DOES jump non-champion at 96 (key 96)
    assert key_champ > key_close

    # Sort descending
    pool = [champ, non_champ, close_non_champ]
    ranked = sorted(pool, key=priority_sort_key_for_profile, reverse=True)
    assert [p["ticker"] for p in ranked] == ["HIGH_NON_CHAMP", "CHAMP", "CLOSE_NON_CHAMP"]

    # Contrast with old 10.0 bonus where champ would have scored 105 and jumped non_champ at 98
    old_key_champ = champ["best_pctl"] + 10.0
    assert old_key_champ == 105.0
    assert old_key_champ > key_non_champ

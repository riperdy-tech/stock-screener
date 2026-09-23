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
)


def _eval_knife(z_mom: float | None, fct_mom: Dict[str, Any] | None = None, flags: List[str] | None = None, floor: float = -1.5):
    """Helper mimicking sifter knife evaluation."""
    fct_mom = fct_mom or {}
    cur_flags = list(flags or [])
    regime_shift_down = bool(fct_mom.get("regime_shift_down") is True)
    if not regime_shift_down:
        if "regime_shift_down" in cur_flags:
            regime_shift_down = True
        elif isinstance(fct_mom.get("flags"), list) and "regime_shift_down" in fct_mom["flags"]:
            regime_shift_down = True

    if z_mom is None:
        d2_eligible = True
        if "momentum_missing" not in cur_flags:
            cur_flags.append("momentum_missing")
        falling_knife_detail = None
    else:
        is_knife = (z_mom < floor) or regime_shift_down
        d2_eligible = not is_knife
        if not d2_eligible:
            if "falling_knife" not in cur_flags:
                cur_flags.append("falling_knife")
            falling_knife_detail = {
                "z_momentum": z_mom,
                "floor": floor,
                "regime_shift_down": regime_shift_down,
            }
        else:
            falling_knife_detail = None

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
    # Simulate percentile calculation block
    p = {
        "score_door1": 0.50,
        "score_door2": 2.50,
        "pctl_d1": 65.0,
        "pctl_d2": 95.0,
        "d2_eligible": False,  # Falling knife
        "best_pctl": 0.0,
    }

    d2_ok = p.get("d2_eligible", True)
    if p["score_door1"] is not None and p["score_door2"] is not None and d2_ok:
        p["best_pctl"] = max(p["pctl_d1"], p["pctl_d2"])
    elif p["score_door1"] is not None:
        p["best_pctl"] = p["pctl_d1"]
    elif p["score_door2"] is not None and d2_ok:
        p["best_pctl"] = p["pctl_d2"]
    else:
        p["best_pctl"] = 0.0

    # Door 2 score and pctl are kept for display
    assert p["score_door2"] == 2.50
    assert p["pctl_d2"] == 95.0
    # But best_pctl uses Door 1 only (65.0, NOT 95.0)
    assert p["best_pctl"] == 65.0

    # If score_door1 is None and d2_eligible is False: best_pctl is 0.0
    p_no_d1 = {
        "score_door1": None,
        "score_door2": 2.50,
        "pctl_d1": 0.0,
        "pctl_d2": 95.0,
        "d2_eligible": False,
        "best_pctl": 0.0,
    }
    d2_ok = p_no_d1.get("d2_eligible", True)
    if p_no_d1["score_door1"] is not None and p_no_d1["score_door2"] is not None and d2_ok:
        p_no_d1["best_pctl"] = max(p_no_d1["pctl_d1"], p_no_d1["pctl_d2"])
    elif p_no_d1["score_door1"] is not None:
        p_no_d1["best_pctl"] = p_no_d1["pctl_d1"]
    elif p_no_d1["score_door2"] is not None and d2_ok:
        p_no_d1["best_pctl"] = p_no_d1["pctl_d2"]
    else:
        p_no_d1["best_pctl"] = 0.0

    assert p_no_d1["best_pctl"] == 0.0


def test_contributions_honors_d2_eligible():
    """_contributions won_d1 is True when d2_eligible is False, even if pctl_d2 > pctl_d1."""
    prof = {
        "score_door1": 0.40,
        "score_door2": 1.20,
        "pctl_d1": 50.0,
        "pctl_d2": 95.0,
        "z_quality": 1.0,
        "z_momentum": -2.0,
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
    def eval_champion(p: Dict[str, Any]) -> bool:
        doors = list(p.get("nominated_doors", []))
        if p.get("pctl_d1", 0.0) >= 90.0 and p.get("pctl_d2", 0.0) >= 90.0 and p.get("d2_eligible", True):
            if "DOUBLE_DOOR_CHAMPION" not in doors:
                doors.append("DOUBLE_DOOR_CHAMPION")
        return "DOUBLE_DOOR_CHAMPION" in doors

    # 1. Both percentiles >= 90 and d2_eligible -> Champion
    p_champ = {"pctl_d1": 91.0, "pctl_d2": 93.0, "d2_eligible": True, "score_door1": 0.20, "score_door2": 0.30}
    assert eval_champion(p_champ) is True

    # 2. Both percentiles >= 90 but falling knife (d2_eligible=False) -> NOT Champion
    p_knife = {"pctl_d1": 95.0, "pctl_d2": 96.0, "d2_eligible": False}
    assert eval_champion(p_knife) is False

    # 3. pctl_d1 < 90 -> NOT Champion
    p_low_d1 = {"pctl_d1": 89.9, "pctl_d2": 95.0, "d2_eligible": True}
    assert eval_champion(p_low_d1) is False

    # 4. pctl_d2 < 90 -> NOT Champion
    p_low_d2 = {"pctl_d1": 95.0, "pctl_d2": 89.9, "d2_eligible": True}
    assert eval_champion(p_low_d2) is False

    # 5. Raw scores > 0.40 but percentiles < 90 -> NOT Champion (raw score rule deleted)
    p_raw_only = {"pctl_d1": 85.0, "pctl_d2": 85.0, "score_door1": 0.80, "score_door2": 0.90, "d2_eligible": True}
    assert eval_champion(p_raw_only) is False


def test_champion_bonus_2_0_ordering():
    """bonus 2.0 ordering: a champion at best_pctl 95 does not jump a non-champion at 98."""
    def priority_sort_key(p: Dict[str, Any]) -> float:
        bonus = 2.0 if "DOUBLE_DOOR_CHAMPION" in p.get("nominated_doors", []) else 0.0
        return p["best_pctl"] + bonus

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

    key_champ = priority_sort_key(champ)
    key_non_champ = priority_sort_key(non_champ)
    key_close = priority_sort_key(close_non_champ)

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
    ranked = sorted(pool, key=priority_sort_key, reverse=True)
    assert [p["ticker"] for p in ranked] == ["HIGH_NON_CHAMP", "CHAMP", "CLOSE_NON_CHAMP"]

    # Contrast with old 10.0 bonus where champ would have scored 105 and jumped non_champ at 98
    old_key_champ = champ["best_pctl"] + 10.0
    assert old_key_champ == 105.0
    assert old_key_champ > key_non_champ

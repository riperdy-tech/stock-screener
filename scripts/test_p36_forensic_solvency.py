"""test_p36_forensic_solvency.py — Unit tests for Phase 3 P3.6 forensic and solvency gates.

Requirements covered (PHASE_3_QUANT_BOOK.md P3.6; all three new vetoes are flag-only in this
commit — every switch in sifter_config.json veto_switches is False):

1. Altman: read from stocks[t].metrics.zScore (not the battery), threshold from
   reverse_config.json thresholds.stage1.sector_altman_z_min / altman_z_min (default 1.8).
   Switch off -> flag "insolvency_distress_altman_z", no veto. Switch on -> veto
   "INSOLVENCY_DISTRESS_ALTMAN_Z".
2. Beneish standalone: veto when m_score > -1.78 AND m_score_inputs_missing == [] (all inputs
   present). Switch off -> flag "beneish_manipulation_risk", no veto. Switch on -> veto
   "BENEISH_MANIPULATION_RISK". Inputs missing -> flag "beneish_unverifiable" regardless of the
   switch, never vetoes.
3. Sloan accruals flag: accruals_ratio > 0.20 -> flag "heavy_accruals" (flag only, no veto in
   this phase).
4. Issuance flag: net_issuance_1y > 0.10 -> flag "heavy_issuance" (flag only).
5. ADV via scripts/hygiene_thresholds.py: adv_20d_usd from SCR-10 used when present; else
   snapshot vol*price flagged "adv_single_day"; neither present -> switch off flags
   "no_liquidity_data" (no veto), switch on -> veto "NO_LIQUIDITY_DATA".
6. sifter_config.json carries veto_switches, all False in this commit.
7. hygiene_thresholds.py is the single source for MIN_MARKET_CAP / MIN_SHARE_PRICE /
   MIN_ADV_DOLLAR, imported by both filter_tier1_hygiene.py and score_factors_dual_door.py.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest

import score_factors_dual_door as sfdd
import filter_tier1_hygiene as fth
import hygiene_thresholds as ht

SCRIPTS_DIR = Path(__file__).resolve().parent


def num(v):
    return sfdd.num(v)


def _eval_forensic_gates(
    bat: Dict[str, Any],
    altman_z: Optional[float],
    sector: str,
    switch_altman: bool,
    switch_beneish: bool,
    default_altman_min: float = 1.8,
    sector_altman_map: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """Mirrors score_factors_dual_door.py's inline P3.6 forensic block (main(), ~lines 812-864)."""
    sector_altman_map = sector_altman_map or {}
    cur_flags: List[str] = []
    veto = None

    acc = num(bat.get("accruals_ratio"))
    m_score = num(bat.get("m_score"))
    net_iss_1y = num(bat.get("net_issuance_1y"))

    # Existing combined forensic veto stays as is for now
    if m_score is not None and m_score > -1.78 and acc is not None and acc > 0.10:
        return {"veto": "FORENSIC_MANIPULATION_RISK", "flags": cur_flags}

    # Beneish standalone
    m_inputs_missing = bat.get("m_score_inputs_missing")
    beneish_inputs_complete = (isinstance(m_inputs_missing, list) and len(m_inputs_missing) == 0) or (
        isinstance(m_inputs_missing, (int, float)) and m_inputs_missing == 0
    )
    if m_score is not None and beneish_inputs_complete and m_score > -1.78:
        if switch_beneish:
            return {"veto": "BENEISH_MANIPULATION_RISK", "flags": cur_flags}
        else:
            if "beneish_manipulation_risk" not in cur_flags:
                cur_flags.append("beneish_manipulation_risk")
    elif not beneish_inputs_complete:
        if "beneish_unverifiable" not in cur_flags:
            cur_flags.append("beneish_unverifiable")

    # Altman Z
    z_min = sector_altman_map.get(sector, default_altman_min)
    if altman_z is not None and altman_z < z_min:
        if switch_altman:
            return {"veto": "INSOLVENCY_DISTRESS_ALTMAN_Z", "flags": cur_flags}
        else:
            if "insolvency_distress_altman_z" not in cur_flags:
                cur_flags.append("insolvency_distress_altman_z")

    # Sloan accruals flag
    if acc is not None and acc > 0.20:
        if "heavy_accruals" not in cur_flags:
            cur_flags.append("heavy_accruals")

    # Issuance flag
    if net_iss_1y is not None and net_iss_1y > 0.10:
        if "heavy_issuance" not in cur_flags:
            cur_flags.append("heavy_issuance")

    return {"veto": veto, "flags": cur_flags}


def _eval_adv(
    fct_mom: Dict[str, Any], vol: Optional[float], price: Optional[float], switch_no_liquidity_data: bool
) -> Dict[str, Any]:
    """Mirrors score_factors_dual_door.py's inline ADV block (main(), ~lines 783-806)."""
    cur_flags: List[str] = []
    adv_20d = num(fct_mom.get("adv_20d_usd"))
    if adv_20d is not None:
        adv = adv_20d
    elif vol is not None and price is not None:
        adv = vol * price
        if "adv_single_day" not in cur_flags:
            cur_flags.append("adv_single_day")
    else:
        adv = None

    veto = None
    if adv is None:
        if switch_no_liquidity_data:
            veto = "NO_LIQUIDITY_DATA"
        else:
            if "no_liquidity_data" not in cur_flags:
                cur_flags.append("no_liquidity_data")
    elif adv < ht.MIN_ADV_DOLLAR:
        veto = "ILLIQUID_ADV_BELOW_300K"

    return {"veto": veto, "flags": cur_flags, "adv": adv}


# ── Config ────────────────────────────────────────────────────────────────

def test_veto_switches_all_false_in_this_commit():
    cfg_path = SCRIPTS_DIR / "sifter_config.json"
    assert cfg_path.exists(), "sifter_config.json must exist"
    switches = sfdd._load_veto_switches(cfg_path)
    assert switches == {"altman_z": False, "beneish_standalone": False, "no_liquidity_data": False}


def test_altman_thresholds_loaded_from_reverse_config():
    default_min, sec_map = sfdd._load_altman_thresholds()
    assert default_min == 1.8
    assert sec_map.get("Financial Services") == 0.0
    assert sec_map.get("Real Estate") == 0.0
    assert sec_map.get("Technology") == 1.2
    assert "_comment" not in sec_map


def test_hygiene_thresholds_shared_by_tier1_and_sifter():
    assert ht.MIN_MARKET_CAP == 300_000_000.0
    assert ht.MIN_SHARE_PRICE == 3.00
    assert ht.MIN_ADV_DOLLAR == 300_000.0
    # Both modules import the same constants (not re-declared with drifted values)
    assert fth.MIN_MARKET_CAP == ht.MIN_MARKET_CAP
    assert fth.MIN_SHARE_PRICE == ht.MIN_SHARE_PRICE
    assert fth.MIN_ADV_DOLLAR == ht.MIN_ADV_DOLLAR
    assert sfdd.MIN_MARKET_CAP == ht.MIN_MARKET_CAP
    assert sfdd.MIN_SHARE_PRICE == ht.MIN_SHARE_PRICE
    assert sfdd.MIN_ADV_DOLLAR == ht.MIN_ADV_DOLLAR


# ── Altman ───────────────────────────────────────────────────────────────

def test_altman_switch_off_flags_not_vetoes():
    bat = {}
    res = _eval_forensic_gates(bat, altman_z=1.0, sector="Technology", switch_altman=False, switch_beneish=False,
                                sector_altman_map={"Technology": 1.2})
    assert res["veto"] is None
    assert "insolvency_distress_altman_z" in res["flags"]


def test_altman_switch_on_vetoes():
    bat = {}
    res = _eval_forensic_gates(bat, altman_z=1.0, sector="Technology", switch_altman=True, switch_beneish=False,
                                sector_altman_map={"Technology": 1.2})
    assert res["veto"] == "INSOLVENCY_DISTRESS_ALTMAN_Z"


def test_altman_above_sector_threshold_no_flag():
    bat = {}
    res = _eval_forensic_gates(bat, altman_z=2.0, sector="Technology", switch_altman=False, switch_beneish=False,
                                sector_altman_map={"Technology": 1.2})
    assert res["veto"] is None
    assert "insolvency_distress_altman_z" not in res["flags"]


def test_altman_uses_sector_default_when_sector_unmapped():
    # Sector not in sector_altman_map -> falls back to default_altman_min (1.8)
    bat = {}
    res = _eval_forensic_gates(bat, altman_z=1.5, sector="Industrials", switch_altman=False, switch_beneish=False,
                                default_altman_min=1.8, sector_altman_map={"Technology": 1.2})
    assert "insolvency_distress_altman_z" in res["flags"]  # 1.5 < 1.8 default


def test_altman_none_never_flags_or_vetoes():
    bat = {}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", switch_altman=True, switch_beneish=False,
                                sector_altman_map={"Technology": 1.2})
    assert res["veto"] is None
    assert "insolvency_distress_altman_z" not in res["flags"]


# ── Beneish standalone ───────────────────────────────────────────────────

def test_beneish_switch_off_flags_not_vetoes():
    bat = {"m_score": -1.0, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", switch_altman=False, switch_beneish=False)
    assert res["veto"] is None
    assert "beneish_manipulation_risk" in res["flags"]


def test_beneish_switch_on_vetoes():
    bat = {"m_score": -1.0, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", switch_altman=False, switch_beneish=True)
    assert res["veto"] == "BENEISH_MANIPULATION_RISK"


def test_beneish_inputs_missing_flags_unverifiable_never_vetoes():
    bat = {"m_score": -1.0, "m_score_inputs_missing": ["GMI", "DSRI"]}
    res_off = _eval_forensic_gates(bat, altman_z=None, sector="Technology", switch_altman=False, switch_beneish=False)
    res_on = _eval_forensic_gates(bat, altman_z=None, sector="Technology", switch_altman=False, switch_beneish=True)
    assert res_off["veto"] is None and "beneish_unverifiable" in res_off["flags"]
    assert res_on["veto"] is None and "beneish_unverifiable" in res_on["flags"]
    assert "beneish_manipulation_risk" not in res_off["flags"]


def test_beneish_below_threshold_no_flag_no_veto():
    bat = {"m_score": -2.482, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", switch_altman=False, switch_beneish=True)
    assert res["veto"] is None
    assert res["flags"] == []


def test_beneish_combined_forensic_veto_unchanged():
    # m_score > -1.78 AND accruals > 0.10 -> existing combined veto fires regardless of switches
    bat = {"m_score": -1.0, "accruals_ratio": 0.15, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", switch_altman=True, switch_beneish=False)
    assert res["veto"] == "FORENSIC_MANIPULATION_RISK"


# ── Sloan accruals flag ──────────────────────────────────────────────────

def test_accruals_flag_above_threshold():
    bat = {"accruals_ratio": 0.25}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", switch_altman=False, switch_beneish=False)
    assert res["veto"] is None
    assert "heavy_accruals" in res["flags"]


def test_accruals_flag_below_threshold_not_set():
    bat = {"accruals_ratio": 0.20}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", switch_altman=False, switch_beneish=False)
    assert "heavy_accruals" not in res["flags"]  # exactly 0.20 is not > 0.20


def test_accruals_zero_is_a_value_not_absence():
    bat = {"accruals_ratio": 0.0}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", switch_altman=False, switch_beneish=False)
    assert "heavy_accruals" not in res["flags"]
    assert num(bat.get("accruals_ratio")) == 0.0


# ── Issuance flag ────────────────────────────────────────────────────────

def test_issuance_flag_above_threshold():
    bat = {"net_issuance_1y": 0.15}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", switch_altman=False, switch_beneish=False)
    assert "heavy_issuance" in res["flags"]


def test_issuance_flag_at_threshold_not_set():
    bat = {"net_issuance_1y": 0.10}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", switch_altman=False, switch_beneish=False)
    assert "heavy_issuance" not in res["flags"]


def test_issuance_none_is_absence_not_flagged():
    bat = {"net_issuance_1y": None}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", switch_altman=False, switch_beneish=False)
    assert "heavy_issuance" not in res["flags"]


# ── ADV / liquidity ──────────────────────────────────────────────────────

def test_adv_uses_scr10_adv_20d_when_present():
    res = _eval_adv({"adv_20d_usd": 500_000.0}, vol=None, price=None, switch_no_liquidity_data=False)
    assert res["adv"] == 500_000.0
    assert res["flags"] == []
    assert res["veto"] is None


def test_adv_falls_back_to_snapshot_and_flags_adv_single_day():
    res = _eval_adv({}, vol=200_000.0, price=5.0, switch_no_liquidity_data=False)
    assert res["adv"] == 1_000_000.0
    assert "adv_single_day" in res["flags"]
    assert res["veto"] is None


def test_adv_neither_present_switch_off_flags_no_liquidity_data():
    res = _eval_adv({}, vol=None, price=None, switch_no_liquidity_data=False)
    assert res["adv"] is None
    assert res["veto"] is None
    assert "no_liquidity_data" in res["flags"]


def test_adv_neither_present_switch_on_vetoes_no_liquidity_data():
    res = _eval_adv({}, vol=None, price=None, switch_no_liquidity_data=True)
    assert res["veto"] == "NO_LIQUIDITY_DATA"


def test_adv_below_threshold_still_vetoes_illiquid_regardless_of_switch():
    res = _eval_adv({"adv_20d_usd": 100_000.0}, vol=None, price=None, switch_no_liquidity_data=True)
    assert res["veto"] == "ILLIQUID_ADV_BELOW_300K"


def test_adv_scr10_value_takes_priority_over_snapshot():
    # adv_20d_usd present -> snapshot vol*price ignored, no adv_single_day flag even if vol/price present
    res = _eval_adv({"adv_20d_usd": 400_000.0}, vol=1.0, price=1.0, switch_no_liquidity_data=False)
    assert res["adv"] == 400_000.0
    assert "adv_single_day" not in res["flags"]

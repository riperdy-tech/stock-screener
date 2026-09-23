"""test_p36_forensic_solvency.py — Unit tests for Phase 3 P3.6 / P3.6b forensic and solvency
gates.

P3.6b (PHASE_3_QUANT_BOOK.md P3.6b) supersedes P3.6's flag-only-pending-measurement design:
Altman and Beneish standalone are now PERMANENTLY flag-only (never a veto, regardless of the
sifter_config.json switch); the combined FORENSIC_MANIPULATION_RISK veto and
CHRONIC_OPERATING_LOSS_LEVERAGE are narrowed to a large-cap flag-only rule (veto only below
hygiene_thresholds.LARGE_CAP_FLAG_ONLY_USD, $10B) with sector exemptions for the forensic veto
(Financial Services, Real Estate — accrual ratios are structurally uninformative there).

Requirements covered:
1. Altman: read from stocks[t].metrics.zScore (not the battery), threshold from
   reverse_config.json thresholds.stage1.sector_altman_z_min / altman_z_min (default 1.8),
   layered with sifter_config.json's altman_sector_overrides (Utilities: 0.0). Always flags
   "insolvency_distress_altman_z" with a detail dict {altman_z, z_min, sector, _note}; never
   vetoes, regardless of the (now-unused) switch.
2. Beneish standalone: always flags "beneish_flag" with a detail dict {m_score, _note} when
   m_score > -1.78 and inputs are complete; never vetoes. Inputs missing -> flag
   "beneish_unverifiable" regardless, never vetoes.
3. FORENSIC_MANIPULATION_RISK: vetoes only when accruals_ratio > 0.20 AND m_score > -1.78 AND
   sector not in {Financial Services, Real Estate} AND market cap < LARGE_CAP_FLAG_ONLY_USD.
   Otherwise, when accruals > 0.20 (any sector) or the old combined rule (m_score > -1.78 AND
   accruals > 0.10) would have fired, flags "forensic_red_flag" with {accruals, m_score,
   reason} instead. Sloan accruals > 0.20 alone (no m_score condition) is the separate
   "heavy_accruals" flag, unaffected by any of this.
4. CHRONIC_OPERATING_LOSS_LEVERAGE: same large-cap rule — veto only when market cap <
   LARGE_CAP_FLAG_ONLY_USD; at or above it, flags "loss_making_leveraged" with {fcf,
   operating_income, lt_debt}, no veto.
5. Issuance flag: net_issuance_1y > 0.10 -> flag "heavy_issuance" (flag only, unchanged).
6. ADV via scripts/hygiene_thresholds.py: adv_20d_usd from SCR-10 used when present; else
   snapshot vol*price flagged "adv_single_day"; neither present -> switch off flags
   "no_liquidity_data" (no veto), switch on -> veto "NO_LIQUIDITY_DATA" (unchanged by P3.6b).
7. sifter_config.json carries veto_switches, all False; hygiene_thresholds.py is the single
   source for MIN_MARKET_CAP / MIN_SHARE_PRICE / MIN_ADV_DOLLAR / LARGE_CAP_FLAG_ONLY_USD.
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
    mcap: float,
    default_altman_min: float = 1.8,
    sector_altman_map: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """Mirrors score_factors_dual_door.py's inline P3.6b forensic block (main(), the "2. Hard
    Forensic & Insolvency Vetoes" section). No switches: P3.6b made Altman and Beneish
    standalone permanently flag-only, so they are no longer parameters here."""
    sector_altman_map = sector_altman_map or {}
    cur_flags: List[str] = []
    detail: Dict[str, Any] = {}
    veto = None

    acc = num(bat.get("accruals_ratio"))
    m_score = num(bat.get("m_score"))
    net_iss_1y = num(bat.get("net_issuance_1y"))

    # FORENSIC_MANIPULATION_RISK
    forensic_accruals_over_20 = acc is not None and acc > 0.20
    forensic_m_score_elevated = m_score is not None and m_score > -1.78
    forensic_old_rule_fired = forensic_m_score_elevated and acc is not None and acc > 0.10
    forensic_sector_exempt = sector in sfdd.FORENSIC_VETO_EXEMPT_SECTORS
    forensic_large_cap_exempt = mcap >= ht.LARGE_CAP_FLAG_ONLY_USD
    if (forensic_accruals_over_20 and forensic_m_score_elevated
            and not forensic_sector_exempt and not forensic_large_cap_exempt):
        return {"veto": "FORENSIC_MANIPULATION_RISK", "flags": cur_flags, "detail": detail}
    if forensic_accruals_over_20 or forensic_old_rule_fired:
        if "forensic_red_flag" not in cur_flags:
            cur_flags.append("forensic_red_flag")
        if forensic_accruals_over_20 and forensic_m_score_elevated and forensic_sector_exempt:
            reason = "sector_exempt"
        elif forensic_accruals_over_20 and forensic_m_score_elevated and forensic_large_cap_exempt:
            reason = "large_cap_flag_only"
        elif forensic_accruals_over_20:
            reason = "accruals_over_0.20"
        else:
            reason = "legacy_combined_rule_accruals_over_0.10"
        detail["forensic_red_flag"] = {"accruals": acc, "m_score": m_score, "reason": reason}

    # Beneish standalone — always a flag, never a veto
    m_inputs_missing = bat.get("m_score_inputs_missing")
    beneish_inputs_complete = (isinstance(m_inputs_missing, list) and len(m_inputs_missing) == 0) or (
        isinstance(m_inputs_missing, (int, float)) and m_inputs_missing == 0
    )
    if m_score is not None and beneish_inputs_complete and m_score > -1.78:
        if "beneish_flag" not in cur_flags:
            cur_flags.append("beneish_flag")
        detail["beneish_flag"] = {"m_score": m_score, "_note": "growth bias"}
    elif not beneish_inputs_complete:
        if "beneish_unverifiable" not in cur_flags:
            cur_flags.append("beneish_unverifiable")

    # Altman Z — always a flag, never a veto
    z_min = sector_altman_map.get(sector, default_altman_min)
    if altman_z is not None and altman_z < z_min:
        if "insolvency_distress_altman_z" not in cur_flags:
            cur_flags.append("insolvency_distress_altman_z")
        detail["insolvency_distress_altman_z"] = {
            "altman_z": altman_z, "z_min": z_min, "sector": sector, "_note": "warning only",
        }

    # Sloan accruals flag (unchanged)
    if acc is not None and acc > 0.20:
        if "heavy_accruals" not in cur_flags:
            cur_flags.append("heavy_accruals")

    # Issuance flag (unchanged)
    if net_iss_1y is not None and net_iss_1y > 0.10:
        if "heavy_issuance" not in cur_flags:
            cur_flags.append("heavy_issuance")

    return {"veto": veto, "flags": cur_flags, "detail": detail}


def _eval_chronic_loss(fcf, op, lt_debt, mcap) -> Dict[str, Any]:
    """Mirrors score_factors_dual_door.py's inline CHRONIC_OPERATING_LOSS_LEVERAGE block."""
    if fcf is not None and fcf < 0 and op is not None and op < 0 and lt_debt > 1e9:
        if mcap < ht.LARGE_CAP_FLAG_ONLY_USD:
            return {"veto": "CHRONIC_OPERATING_LOSS_LEVERAGE", "flags": [], "detail": {}}
        return {
            "veto": None,
            "flags": ["loss_making_leveraged"],
            "detail": {"loss_making_leveraged": {"fcf": fcf, "operating_income": op, "lt_debt": lt_debt}},
        }
    return {"veto": None, "flags": [], "detail": {}}


def _eval_adv(
    fct_mom: Dict[str, Any], vol: Optional[float], price: Optional[float], switch_no_liquidity_data: bool
) -> Dict[str, Any]:
    """Mirrors score_factors_dual_door.py's inline ADV block (unchanged by P3.6b)."""
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


LARGE = ht.LARGE_CAP_FLAG_ONLY_USD
SMALL_CAP = LARGE - 1.0
AT_FLOOR = LARGE


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


def test_altman_sector_overrides_add_utilities_from_sifter_not_reverse_config():
    cfg_path = SCRIPTS_DIR / "sifter_config.json"
    overrides = sfdd._load_altman_sector_overrides(cfg_path)
    assert overrides.get("Utilities") == 0.0
    assert "_note" not in overrides
    # reverse_config.json itself is untouched — it is score_reverse.py's table
    default_min, reverse_sec_map = sfdd._load_altman_thresholds()
    assert "Utilities" not in reverse_sec_map


def test_hygiene_thresholds_shared_by_tier1_and_sifter():
    assert ht.MIN_MARKET_CAP == 300_000_000.0
    assert ht.MIN_SHARE_PRICE == 3.00
    assert ht.MIN_ADV_DOLLAR == 300_000.0
    assert ht.LARGE_CAP_FLAG_ONLY_USD == 10_000_000_000.0
    # Both modules import the same constants (not re-declared with drifted values)
    assert fth.MIN_MARKET_CAP == ht.MIN_MARKET_CAP
    assert fth.MIN_SHARE_PRICE == ht.MIN_SHARE_PRICE
    assert fth.MIN_ADV_DOLLAR == ht.MIN_ADV_DOLLAR
    assert sfdd.MIN_MARKET_CAP == ht.MIN_MARKET_CAP
    assert sfdd.MIN_SHARE_PRICE == ht.MIN_SHARE_PRICE
    assert sfdd.MIN_ADV_DOLLAR == ht.MIN_ADV_DOLLAR
    assert sfdd.LARGE_CAP_FLAG_ONLY_USD == ht.LARGE_CAP_FLAG_ONLY_USD


def test_forensic_veto_exempt_sectors():
    assert sfdd.FORENSIC_VETO_EXEMPT_SECTORS == {"Financial Services", "Real Estate"}


# ── Altman: always a flag, never a veto ─────────────────────────────────────

def test_altman_always_flags_never_vetoes():
    bat = {}
    res = _eval_forensic_gates(bat, altman_z=1.0, sector="Technology", mcap=SMALL_CAP,
                                sector_altman_map={"Technology": 1.2})
    assert res["veto"] is None
    assert "insolvency_distress_altman_z" in res["flags"]
    d = res["detail"]["insolvency_distress_altman_z"]
    assert d["altman_z"] == 1.0 and d["z_min"] == 1.2 and d["sector"] == "Technology"


def test_altman_never_vetoes_even_for_a_large_cap():
    bat = {}
    res = _eval_forensic_gates(bat, altman_z=1.0, sector="Technology", mcap=LARGE * 10,
                                sector_altman_map={"Technology": 1.2})
    assert res["veto"] is None
    assert "insolvency_distress_altman_z" in res["flags"]


def test_altman_above_sector_threshold_no_flag():
    bat = {}
    res = _eval_forensic_gates(bat, altman_z=2.0, sector="Technology", mcap=SMALL_CAP,
                                sector_altman_map={"Technology": 1.2})
    assert res["veto"] is None
    assert "insolvency_distress_altman_z" not in res["flags"]


def test_altman_uses_sector_default_when_sector_unmapped():
    bat = {}
    res = _eval_forensic_gates(bat, altman_z=1.5, sector="Industrials", mcap=SMALL_CAP,
                                default_altman_min=1.8, sector_altman_map={"Technology": 1.2})
    assert "insolvency_distress_altman_z" in res["flags"]  # 1.5 < 1.8 default


def test_altman_utilities_override_exempts_structurally_leveraged_sector():
    bat = {}
    res = _eval_forensic_gates(bat, altman_z=0.5, sector="Utilities", mcap=SMALL_CAP,
                                default_altman_min=1.8, sector_altman_map={"Utilities": 0.0})
    assert "insolvency_distress_altman_z" not in res["flags"]  # 0.5 >= 0.0 override


def test_altman_none_never_flags_or_vetoes():
    bat = {}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", mcap=SMALL_CAP,
                                sector_altman_map={"Technology": 1.2})
    assert res["veto"] is None
    assert "insolvency_distress_altman_z" not in res["flags"]


# ── Beneish standalone: always a flag, never a veto ─────────────────────────

def test_beneish_always_flags_never_vetoes_with_m_score_value():
    bat = {"m_score": -1.0, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert res["veto"] is None
    assert "beneish_flag" in res["flags"]
    assert res["detail"]["beneish_flag"]["m_score"] == -1.0


def test_beneish_never_vetoes_even_for_a_large_cap():
    bat = {"m_score": -1.0, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", mcap=LARGE * 10)
    assert res["veto"] is None
    assert "beneish_flag" in res["flags"]


def test_beneish_inputs_missing_flags_unverifiable_never_beneish_flag():
    bat = {"m_score": -1.0, "m_score_inputs_missing": ["GMI", "DSRI"]}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert res["veto"] is None
    assert "beneish_unverifiable" in res["flags"]
    assert "beneish_flag" not in res["flags"]


def test_beneish_below_threshold_no_flag_no_veto():
    bat = {"m_score": -2.482, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert res["veto"] is None
    assert res["flags"] == []


# ── FORENSIC_MANIPULATION_RISK: narrow veto, wide flag ──────────────────────

def test_forensic_vetoes_small_cap_over_020_accruals_elevated_mscore():
    bat = {"m_score": -1.0, "accruals_ratio": 0.25, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert res["veto"] == "FORENSIC_MANIPULATION_RISK"


def test_forensic_does_not_veto_at_the_large_cap_floor():
    # mcap == LARGE_CAP_FLAG_ONLY_USD is NOT "< LARGE_CAP_FLAG_ONLY_USD" -> exempt
    bat = {"m_score": -1.0, "accruals_ratio": 0.25, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", mcap=AT_FLOOR)
    assert res["veto"] is None
    assert "forensic_red_flag" in res["flags"]
    assert res["detail"]["forensic_red_flag"]["reason"] == "large_cap_flag_only"


def test_forensic_vetoes_just_under_the_large_cap_floor():
    bat = {"m_score": -1.0, "accruals_ratio": 0.25, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", mcap=LARGE - 1.0)
    assert res["veto"] == "FORENSIC_MANIPULATION_RISK"


def test_forensic_large_cap_flags_instead_of_vetoing_nvda_style():
    # NVDA-shaped case: hypergrowth working capital (accruals 0.109, between the old 0.10
    # cutoff and the new 0.20 one) trips the legacy combined rule but never vetoes anymore —
    # it's a mega-cap besides, so even the accruals > 0.20 path would have been exempt.
    bat = {"m_score": -1.16, "accruals_ratio": 0.109, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", mcap=LARGE * 300)
    assert res["veto"] is None
    assert "forensic_red_flag" in res["flags"]
    assert res["detail"]["forensic_red_flag"]["reason"] == "legacy_combined_rule_accruals_over_0.10"


def test_forensic_sector_exempt_financial_services_flags_not_vetoes():
    bat = {"m_score": -1.0, "accruals_ratio": 0.30, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Financial Services", mcap=SMALL_CAP)
    assert res["veto"] is None
    assert res["detail"]["forensic_red_flag"]["reason"] == "sector_exempt"


def test_forensic_sector_exempt_real_estate_flags_not_vetoes():
    bat = {"m_score": -1.0, "accruals_ratio": 0.30, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Real Estate", mcap=SMALL_CAP)
    assert res["veto"] is None
    assert res["detail"]["forensic_red_flag"]["reason"] == "sector_exempt"


def test_forensic_accruals_over_020_any_sector_flags_even_without_elevated_mscore():
    # accruals > 0.20 alone (m_score not elevated, or absent) never vetoes but always flags.
    bat = {"m_score": -3.0, "accruals_ratio": 0.35, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert res["veto"] is None
    assert res["detail"]["forensic_red_flag"]["reason"] == "accruals_over_0.20"


def test_forensic_legacy_combined_rule_still_flags_below_020():
    # accruals in (0.10, 0.20] with elevated m_score: the OLD rule would have vetoed. It's a
    # flag now, never a veto, and never reaches "heavy_accruals" (that needs > 0.20).
    bat = {"m_score": -1.0, "accruals_ratio": 0.15, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert res["veto"] is None
    assert res["detail"]["forensic_red_flag"]["reason"] == "legacy_combined_rule_accruals_over_0.10"
    assert "heavy_accruals" not in res["flags"]


def test_forensic_accruals_at_010_no_flag_no_veto():
    # exactly 0.10 is not "> 0.10" -> no forensic_red_flag (m_score alone still trips the
    # separate, always-on beneish_flag — unrelated to this decision).
    bat = {"m_score": -1.0, "accruals_ratio": 0.10, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert res["veto"] is None
    assert "forensic_red_flag" not in res["flags"]


def test_forensic_accruals_at_020_boundary_not_over():
    # exactly 0.20 is not "> 0.20" -> no forensic_red_flag from the accruals-alone path;
    # legacy combined rule (> 0.10) still fires if m_score is elevated.
    bat = {"m_score": -1.0, "accruals_ratio": 0.20, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert res["veto"] is None
    assert res["detail"]["forensic_red_flag"]["reason"] == "legacy_combined_rule_accruals_over_0.10"


def test_forensic_m_score_not_elevated_no_veto_at_all():
    bat = {"m_score": -2.0, "accruals_ratio": 0.30, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert res["veto"] is None


# ── Sloan accruals flag (unchanged) ──────────────────────────────────────

def test_accruals_flag_above_threshold():
    bat = {"accruals_ratio": 0.25}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert res["veto"] is None
    assert "heavy_accruals" in res["flags"]


def test_accruals_flag_below_threshold_not_set():
    bat = {"accruals_ratio": 0.20}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert "heavy_accruals" not in res["flags"]  # exactly 0.20 is not > 0.20


def test_accruals_zero_is_a_value_not_absence():
    bat = {"accruals_ratio": 0.0}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert "heavy_accruals" not in res["flags"]
    assert num(bat.get("accruals_ratio")) == 0.0


# ── Issuance flag (unchanged) ────────────────────────────────────────────

def test_issuance_flag_above_threshold():
    bat = {"net_issuance_1y": 0.15}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert "heavy_issuance" in res["flags"]


def test_issuance_flag_at_threshold_not_set():
    bat = {"net_issuance_1y": 0.10}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert "heavy_issuance" not in res["flags"]


def test_issuance_none_is_absence_not_flagged():
    bat = {"net_issuance_1y": None}
    res = _eval_forensic_gates(bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert "heavy_issuance" not in res["flags"]


# ── CHRONIC_OPERATING_LOSS_LEVERAGE: same large-cap rule ─────────────────

def test_chronic_loss_vetoes_small_cap():
    res = _eval_chronic_loss(fcf=-100.0, op=-50.0, lt_debt=2e9, mcap=SMALL_CAP)
    assert res["veto"] == "CHRONIC_OPERATING_LOSS_LEVERAGE"


def test_chronic_loss_flags_large_cap_instead_of_vetoing():
    # CRWV/NBIS/IREN/CIFR-shaped case: one year of AI-buildout losses on a leveraged
    # balance sheet, but the name is a large cap -> flag, not a cull.
    res = _eval_chronic_loss(fcf=-500.0, op=-300.0, lt_debt=3e9, mcap=LARGE * 4)
    assert res["veto"] is None
    assert res["flags"] == ["loss_making_leveraged"]
    d = res["detail"]["loss_making_leveraged"]
    assert d == {"fcf": -500.0, "operating_income": -300.0, "lt_debt": 3e9}


def test_chronic_loss_does_not_veto_at_the_large_cap_floor():
    res = _eval_chronic_loss(fcf=-100.0, op=-50.0, lt_debt=2e9, mcap=AT_FLOOR)
    assert res["veto"] is None
    assert res["flags"] == ["loss_making_leveraged"]


def test_chronic_loss_vetoes_just_under_the_large_cap_floor():
    res = _eval_chronic_loss(fcf=-100.0, op=-50.0, lt_debt=2e9, mcap=LARGE - 1.0)
    assert res["veto"] == "CHRONIC_OPERATING_LOSS_LEVERAGE"


def test_chronic_loss_condition_not_met_no_flag_no_veto():
    res = _eval_chronic_loss(fcf=100.0, op=-50.0, lt_debt=2e9, mcap=SMALL_CAP)
    assert res["veto"] is None
    assert res["flags"] == []


def test_chronic_loss_debt_at_exactly_1bn_not_over():
    # lt_debt > 1e9 strictly -> exactly 1e9 does not qualify
    res = _eval_chronic_loss(fcf=-100.0, op=-50.0, lt_debt=1e9, mcap=SMALL_CAP)
    assert res["veto"] is None
    assert res["flags"] == []


# ── ADV / liquidity (unchanged by P3.6b) ─────────────────────────────────

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
    res = _eval_adv({"adv_20d_usd": 400_000.0}, vol=1.0, price=1.0, switch_no_liquidity_data=False)
    assert res["adv"] == 400_000.0
    assert "adv_single_day" not in res["flags"]

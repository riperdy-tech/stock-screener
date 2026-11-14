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
6. ADV via scripts/hygiene_thresholds.py resolve_adv_usd() (P3.6c order): stocks[t].metrics.
   adv_20d_usd (universe-wide, from the daily fetch) used when present; else adv_20d_usd from
   SCR-10 momentum_state; else snapshot vol*price flagged "adv_single_day"; neither present ->
   switch off flags "no_liquidity_data" (no veto), switch on -> veto "NO_LIQUIDITY_DATA".
7. sifter_config.json carries veto_switches, all False; hygiene_thresholds.py is the single
   source for MIN_MARKET_CAP / MIN_SHARE_PRICE / MIN_ADV_DOLLAR / LARGE_CAP_FLAG_ONLY_USD.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest

import score_factors_dual_door as sfdd
from live_sifter_fixture import run_live_sifter
import filter_tier1_hygiene as fth
import hygiene_thresholds as ht

SCRIPTS_DIR = Path(__file__).resolve().parent


def num(v):
    return sfdd.num(v)


FORENSIC_FLAGS = {"forensic_red_flag", "beneish_flag", "beneish_unverifiable", "insolvency_distress_altman_z",
                  "heavy_accruals", "heavy_issuance"}
ADV_FLAGS = {"adv_single_day", "no_liquidity_data", "below_min_adv"}


def _run_one_name(tmp_path, monkeypatch, *, mcap=5e9, sector="Technology", altman_z=None, price=50.0, volume=2e6,
                  stocks_adv=1e8, bat=None, latest=None, mom=None, altman=None, switches=None):
    """Runs the live sifter's main() on a single synthetic name and returns its published row, plus
    what resolve_adv_usd (the live function main() calls) returned for it."""
    metrics = {}
    if stocks_adv is not None:
        metrics["adv_20d_usd"] = stocks_adv
    if altman_z is not None:
        metrics["zScore"] = altman_z
    stocks = {"X": {"symbol": "X", "sector": sector, "industry": "Software-Application", "marketCap": mcap,
                    "price": price, "volume": volume, "metrics": metrics}}
    year = {"revenue": 1000.0, "operating_income": 100.0, "net_income": 80.0, "fcf": 50.0,
            "debt_lt_noncurrent": 0.0, "debt_current": 0.0, "cash": 10.0}
    year.update(latest or {})
    if altman is not None:
        monkeypatch.setattr(sfdd, "_load_altman_thresholds", lambda *a, **k: altman)
        monkeypatch.setattr(sfdd, "_load_altman_sector_overrides", lambda *a, **k: {})
    if switches is not None:
        monkeypatch.setattr(sfdd, "VETO_SWITCHES", switches, raising=False)
    adv_calls = []
    real_resolve = sfdd.resolve_adv_usd

    def spy(*args, **kwargs):
        out = real_resolve(*args, **kwargs)
        adv_calls.append(out)
        return out

    monkeypatch.setattr(sfdd, "resolve_adv_usd", spy)
    compat, _ = run_live_sifter(tmp_path, monkeypatch, stocks, {"X": {"2024": year}}, {"X": bat or {}},
                                {"X": mom or {}})
    return compat["tickers"]["X"], adv_calls


def _eval_forensic_gates(
    tmp_path, monkeypatch,
    bat: Dict[str, Any],
    altman_z: Optional[float],
    sector: str,
    mcap: float,
    default_altman_min: float = 1.8,
    sector_altman_map: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """Runs the live sifter on one name and returns its veto and the forensic gates' flags and detail
    (the row also carries flags from other parts of the scorer, which are not under test here)."""
    row, _ = _run_one_name(tmp_path, monkeypatch, mcap=mcap, sector=sector, altman_z=altman_z, bat=bat,
                           altman=(default_altman_min, sector_altman_map or {}))
    return {"veto": row["fct_veto"], "flags": [f for f in row["fct_flags"] if f in FORENSIC_FLAGS],
            "detail": {k: v for k, v in row["fct_flag_detail"].items() if k in FORENSIC_FLAGS}}


def _eval_chronic_loss(tmp_path, monkeypatch, fcf, op, lt_debt, mcap) -> Dict[str, Any]:
    """Runs the live sifter on one name whose latest year carries these figures."""
    row, _ = _run_one_name(tmp_path, monkeypatch, mcap=mcap,
                           latest={"fcf": fcf, "operating_income": op, "debt_lt_noncurrent": lt_debt})
    return {"veto": row["fct_veto"], "flags": [f for f in row["fct_flags"] if f == "loss_making_leveraged"],
            "detail": {k: v for k, v in row["fct_flag_detail"].items() if k == "loss_making_leveraged"}}


def _eval_adv(
    tmp_path, monkeypatch,
    fct_mom: Dict[str, Any],
    vol: Optional[float],
    price: Optional[float],
    switch_no_liquidity_data: bool,
    stocks_adv_20d_usd: Optional[float] = None,
) -> Dict[str, Any]:
    """Runs the live sifter on one name. price=None means the snapshot has no usable pair (the live
    scorer vetoes a price below 3 before it reaches liquidity, so the price stays 50 and volume is None)."""
    row, adv_calls = _run_one_name(
        tmp_path, monkeypatch, price=50.0 if price is None else price, volume=None if price is None else vol,
        stocks_adv=stocks_adv_20d_usd, mom=fct_mom,
        switches={"altman_z": False, "beneish_standalone": False, "no_liquidity_data": switch_no_liquidity_data})
    return {"veto": row["fct_veto"], "flags": [f for f in row["fct_flags"] if f in ADV_FLAGS],
            "adv": adv_calls[0][0] if adv_calls else None}


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

def test_altman_always_flags_never_vetoes(tmp_path, monkeypatch):
    bat = {}
    res = _eval_forensic_gates(tmp_path, monkeypatch, bat, altman_z=1.0, sector="Technology", mcap=SMALL_CAP,
                                sector_altman_map={"Technology": 1.2})
    assert res["veto"] is None
    assert "insolvency_distress_altman_z" in res["flags"]
    d = res["detail"]["insolvency_distress_altman_z"]
    assert d["altman_z"] == 1.0 and d["z_min"] == 1.2 and d["sector"] == "Technology"


def test_altman_never_vetoes_even_for_a_large_cap(tmp_path, monkeypatch):
    bat = {}
    res = _eval_forensic_gates(tmp_path, monkeypatch, bat, altman_z=1.0, sector="Technology", mcap=LARGE * 10,
                                sector_altman_map={"Technology": 1.2})
    assert res["veto"] is None
    assert "insolvency_distress_altman_z" in res["flags"]


def test_altman_above_sector_threshold_no_flag(tmp_path, monkeypatch):
    bat = {}
    res = _eval_forensic_gates(tmp_path, monkeypatch, bat, altman_z=2.0, sector="Technology", mcap=SMALL_CAP,
                                sector_altman_map={"Technology": 1.2})
    assert res["veto"] is None
    assert "insolvency_distress_altman_z" not in res["flags"]


def test_altman_uses_sector_default_when_sector_unmapped(tmp_path, monkeypatch):
    bat = {}
    res = _eval_forensic_gates(tmp_path, monkeypatch, bat, altman_z=1.5, sector="Industrials", mcap=SMALL_CAP,
                                default_altman_min=1.8, sector_altman_map={"Technology": 1.2})
    assert "insolvency_distress_altman_z" in res["flags"]  # 1.5 < 1.8 default


def test_altman_utilities_override_exempts_structurally_leveraged_sector(tmp_path, monkeypatch):
    bat = {}
    res = _eval_forensic_gates(tmp_path, monkeypatch, bat, altman_z=0.5, sector="Utilities", mcap=SMALL_CAP,
                                default_altman_min=1.8, sector_altman_map={"Utilities": 0.0})
    assert "insolvency_distress_altman_z" not in res["flags"]  # 0.5 >= 0.0 override


def test_altman_none_never_flags_or_vetoes(tmp_path, monkeypatch):
    bat = {}
    res = _eval_forensic_gates(tmp_path, monkeypatch, bat, altman_z=None, sector="Technology", mcap=SMALL_CAP,
                                sector_altman_map={"Technology": 1.2})
    assert res["veto"] is None
    assert "insolvency_distress_altman_z" not in res["flags"]


# ── Beneish standalone: always a flag, never a veto ─────────────────────────

def test_beneish_always_flags_never_vetoes_with_m_score_value(tmp_path, monkeypatch):
    bat = {"m_score": -1.0, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(tmp_path, monkeypatch, bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert res["veto"] is None
    assert "beneish_flag" in res["flags"]
    assert res["detail"]["beneish_flag"]["m_score"] == -1.0


def test_beneish_never_vetoes_even_for_a_large_cap(tmp_path, monkeypatch):
    bat = {"m_score": -1.0, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(tmp_path, monkeypatch, bat, altman_z=None, sector="Technology", mcap=LARGE * 10)
    assert res["veto"] is None
    assert "beneish_flag" in res["flags"]


def test_beneish_inputs_missing_flags_unverifiable_never_beneish_flag(tmp_path, monkeypatch):
    bat = {"m_score": -1.0, "m_score_inputs_missing": ["GMI", "DSRI"]}
    res = _eval_forensic_gates(tmp_path, monkeypatch, bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert res["veto"] is None
    assert "beneish_unverifiable" in res["flags"]
    assert "beneish_flag" not in res["flags"]


def test_beneish_below_threshold_no_flag_no_veto(tmp_path, monkeypatch):
    bat = {"m_score": -2.482, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(tmp_path, monkeypatch, bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert res["veto"] is None
    assert res["flags"] == []


# ── FORENSIC_MANIPULATION_RISK: narrow veto, wide flag ──────────────────────

def test_forensic_vetoes_small_cap_over_020_accruals_elevated_mscore(tmp_path, monkeypatch):
    bat = {"m_score": -1.0, "accruals_ratio": 0.25, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(tmp_path, monkeypatch, bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert res["veto"] == "FORENSIC_MANIPULATION_RISK"


def test_forensic_does_not_veto_at_the_large_cap_floor(tmp_path, monkeypatch):
    # mcap == LARGE_CAP_FLAG_ONLY_USD is NOT "< LARGE_CAP_FLAG_ONLY_USD" -> exempt
    bat = {"m_score": -1.0, "accruals_ratio": 0.25, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(tmp_path, monkeypatch, bat, altman_z=None, sector="Technology", mcap=AT_FLOOR)
    assert res["veto"] is None
    assert "forensic_red_flag" in res["flags"]
    assert res["detail"]["forensic_red_flag"]["reason"] == "large_cap_flag_only"


def test_forensic_vetoes_just_under_the_large_cap_floor(tmp_path, monkeypatch):
    bat = {"m_score": -1.0, "accruals_ratio": 0.25, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(tmp_path, monkeypatch, bat, altman_z=None, sector="Technology", mcap=LARGE - 1.0)
    assert res["veto"] == "FORENSIC_MANIPULATION_RISK"


def test_forensic_large_cap_flags_instead_of_vetoing_nvda_style(tmp_path, monkeypatch):
    # NVDA-shaped case: hypergrowth working capital (accruals 0.109, between the old 0.10
    # cutoff and the new 0.20 one) trips the legacy combined rule but never vetoes anymore —
    # it's a mega-cap besides, so even the accruals > 0.20 path would have been exempt.
    bat = {"m_score": -1.16, "accruals_ratio": 0.109, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(tmp_path, monkeypatch, bat, altman_z=None, sector="Technology", mcap=LARGE * 300)
    assert res["veto"] is None
    assert "forensic_red_flag" in res["flags"]
    assert res["detail"]["forensic_red_flag"]["reason"] == "legacy_combined_rule_accruals_over_0.10"


def test_forensic_sector_exempt_financial_services_flags_not_vetoes(tmp_path, monkeypatch):
    bat = {"m_score": -1.0, "accruals_ratio": 0.30, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(tmp_path, monkeypatch, bat, altman_z=None, sector="Financial Services", mcap=SMALL_CAP)
    assert res["veto"] is None
    assert res["detail"]["forensic_red_flag"]["reason"] == "sector_exempt"


def test_forensic_sector_exempt_real_estate_flags_not_vetoes(tmp_path, monkeypatch):
    bat = {"m_score": -1.0, "accruals_ratio": 0.30, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(tmp_path, monkeypatch, bat, altman_z=None, sector="Real Estate", mcap=SMALL_CAP)
    assert res["veto"] is None
    assert res["detail"]["forensic_red_flag"]["reason"] == "sector_exempt"


def test_forensic_accruals_over_020_any_sector_flags_even_without_elevated_mscore(tmp_path, monkeypatch):
    # accruals > 0.20 alone (m_score not elevated, or absent) never vetoes but always flags.
    bat = {"m_score": -3.0, "accruals_ratio": 0.35, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(tmp_path, monkeypatch, bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert res["veto"] is None
    assert res["detail"]["forensic_red_flag"]["reason"] == "accruals_over_0.20"


def test_forensic_legacy_combined_rule_still_flags_below_020(tmp_path, monkeypatch):
    # accruals in (0.10, 0.20] with elevated m_score: the OLD rule would have vetoed. It's a
    # flag now, never a veto, and never reaches "heavy_accruals" (that needs > 0.20).
    bat = {"m_score": -1.0, "accruals_ratio": 0.15, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(tmp_path, monkeypatch, bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert res["veto"] is None
    assert res["detail"]["forensic_red_flag"]["reason"] == "legacy_combined_rule_accruals_over_0.10"
    assert "heavy_accruals" not in res["flags"]


def test_forensic_accruals_at_010_no_flag_no_veto(tmp_path, monkeypatch):
    # exactly 0.10 is not "> 0.10" -> no forensic_red_flag (m_score alone still trips the
    # separate, always-on beneish_flag — unrelated to this decision).
    bat = {"m_score": -1.0, "accruals_ratio": 0.10, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(tmp_path, monkeypatch, bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert res["veto"] is None
    assert "forensic_red_flag" not in res["flags"]


def test_forensic_accruals_at_020_boundary_not_over(tmp_path, monkeypatch):
    # exactly 0.20 is not "> 0.20" -> no forensic_red_flag from the accruals-alone path;
    # legacy combined rule (> 0.10) still fires if m_score is elevated.
    bat = {"m_score": -1.0, "accruals_ratio": 0.20, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(tmp_path, monkeypatch, bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert res["veto"] is None
    assert res["detail"]["forensic_red_flag"]["reason"] == "legacy_combined_rule_accruals_over_0.10"


def test_forensic_m_score_not_elevated_no_veto_at_all(tmp_path, monkeypatch):
    bat = {"m_score": -2.0, "accruals_ratio": 0.30, "m_score_inputs_missing": []}
    res = _eval_forensic_gates(tmp_path, monkeypatch, bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert res["veto"] is None


# ── Sloan accruals flag (unchanged) ──────────────────────────────────────

def test_accruals_flag_above_threshold(tmp_path, monkeypatch):
    bat = {"accruals_ratio": 0.25}
    res = _eval_forensic_gates(tmp_path, monkeypatch, bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert res["veto"] is None
    assert "heavy_accruals" in res["flags"]


def test_accruals_flag_below_threshold_not_set(tmp_path, monkeypatch):
    bat = {"accruals_ratio": 0.20}
    res = _eval_forensic_gates(tmp_path, monkeypatch, bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert "heavy_accruals" not in res["flags"]  # exactly 0.20 is not > 0.20


def test_accruals_zero_is_a_value_not_absence(tmp_path, monkeypatch):
    bat = {"accruals_ratio": 0.0}
    res = _eval_forensic_gates(tmp_path, monkeypatch, bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert "heavy_accruals" not in res["flags"]
    assert num(bat.get("accruals_ratio")) == 0.0


# ── Issuance flag (unchanged) ────────────────────────────────────────────

def test_issuance_flag_above_threshold(tmp_path, monkeypatch):
    bat = {"net_issuance_1y": 0.15}
    res = _eval_forensic_gates(tmp_path, monkeypatch, bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert "heavy_issuance" in res["flags"]


def test_issuance_flag_at_threshold_not_set(tmp_path, monkeypatch):
    bat = {"net_issuance_1y": 0.10}
    res = _eval_forensic_gates(tmp_path, monkeypatch, bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert "heavy_issuance" not in res["flags"]


def test_issuance_none_is_absence_not_flagged(tmp_path, monkeypatch):
    bat = {"net_issuance_1y": None}
    res = _eval_forensic_gates(tmp_path, monkeypatch, bat, altman_z=None, sector="Technology", mcap=SMALL_CAP)
    assert "heavy_issuance" not in res["flags"]


# ── CHRONIC_OPERATING_LOSS_LEVERAGE: same large-cap rule ─────────────────

def test_chronic_loss_vetoes_small_cap(tmp_path, monkeypatch):
    res = _eval_chronic_loss(tmp_path, monkeypatch, fcf=-100.0, op=-50.0, lt_debt=2e9, mcap=SMALL_CAP)
    assert res["veto"] == "CHRONIC_OPERATING_LOSS_LEVERAGE"


@pytest.mark.xfail(strict=True, reason="live detail names the debt key `total_debt` (WO_SF1 F1: debt now "
                   "debt_lt_noncurrent + debt_current); the old copy asserted `lt_debt`. The scorer is not changed here.")
def test_chronic_loss_flags_large_cap_instead_of_vetoing(tmp_path, monkeypatch):
    # CRWV/NBIS/IREN/CIFR-shaped case: one year of AI-buildout losses on a leveraged
    # balance sheet, but the name is a large cap -> flag, not a cull.
    res = _eval_chronic_loss(tmp_path, monkeypatch, fcf=-500.0, op=-300.0, lt_debt=3e9, mcap=LARGE * 4)
    assert res["veto"] is None
    assert res["flags"] == ["loss_making_leveraged"]
    d = res["detail"]["loss_making_leveraged"]
    assert d == {"fcf": -500.0, "operating_income": -300.0, "lt_debt": 3e9}



def test_chronic_loss_large_cap_flag_detail_as_the_live_scorer_writes_it(tmp_path, monkeypatch):
    # The same case as above with the live key name (`total_debt`), so the veto, flag and figures stay covered.
    res = _eval_chronic_loss(tmp_path, monkeypatch, fcf=-500.0, op=-300.0, lt_debt=3e9, mcap=LARGE * 4)
    assert res["veto"] is None
    assert res["flags"] == ["loss_making_leveraged"]
    assert res["detail"]["loss_making_leveraged"] == {"fcf": -500.0, "operating_income": -300.0, "total_debt": 3e9}

def test_chronic_loss_does_not_veto_at_the_large_cap_floor(tmp_path, monkeypatch):
    res = _eval_chronic_loss(tmp_path, monkeypatch, fcf=-100.0, op=-50.0, lt_debt=2e9, mcap=AT_FLOOR)
    assert res["veto"] is None
    assert res["flags"] == ["loss_making_leveraged"]


def test_chronic_loss_vetoes_just_under_the_large_cap_floor(tmp_path, monkeypatch):
    res = _eval_chronic_loss(tmp_path, monkeypatch, fcf=-100.0, op=-50.0, lt_debt=2e9, mcap=LARGE - 1.0)
    assert res["veto"] == "CHRONIC_OPERATING_LOSS_LEVERAGE"


def test_chronic_loss_condition_not_met_no_flag_no_veto(tmp_path, monkeypatch):
    res = _eval_chronic_loss(tmp_path, monkeypatch, fcf=100.0, op=-50.0, lt_debt=2e9, mcap=SMALL_CAP)
    assert res["veto"] is None
    assert res["flags"] == []


def test_chronic_loss_debt_at_exactly_1bn_not_over(tmp_path, monkeypatch):
    # lt_debt > 1e9 strictly -> exactly 1e9 does not qualify
    res = _eval_chronic_loss(tmp_path, monkeypatch, fcf=-100.0, op=-50.0, lt_debt=1e9, mcap=SMALL_CAP)
    assert res["veto"] is None
    assert res["flags"] == []


# ── ADV / liquidity (unchanged by P3.6b) ─────────────────────────────────

def test_adv_uses_scr10_adv_20d_when_present(tmp_path, monkeypatch):
    res = _eval_adv(tmp_path, monkeypatch, {"adv_20d_usd": 500_000.0}, vol=None, price=None, switch_no_liquidity_data=False)
    assert res["adv"] == 500_000.0
    assert res["flags"] == []
    assert res["veto"] is None


def test_adv_falls_back_to_snapshot_and_flags_adv_single_day(tmp_path, monkeypatch):
    res = _eval_adv(tmp_path, monkeypatch, {}, vol=200_000.0, price=5.0, switch_no_liquidity_data=False)
    assert res["adv"] == 1_000_000.0
    assert "adv_single_day" in res["flags"]
    assert res["veto"] is None


def test_adv_neither_present_switch_off_flags_no_liquidity_data(tmp_path, monkeypatch):
    res = _eval_adv(tmp_path, monkeypatch, {}, vol=None, price=None, switch_no_liquidity_data=False)
    assert res["adv"] is None
    assert res["veto"] is None
    assert "no_liquidity_data" in res["flags"]


def test_adv_neither_present_switch_on_vetoes_no_liquidity_data(tmp_path, monkeypatch):
    res = _eval_adv(tmp_path, monkeypatch, {}, vol=None, price=None, switch_no_liquidity_data=True)
    assert res["veto"] == "NO_LIQUIDITY_DATA"


def test_adv_below_threshold_still_vetoes_illiquid_regardless_of_switch(tmp_path, monkeypatch):
    res = _eval_adv(tmp_path, monkeypatch, {"adv_20d_usd": 100_000.0}, vol=None, price=None, switch_no_liquidity_data=True)
    assert res["veto"] == "ILLIQUID_ADV_BELOW_300K"


def test_adv_scr10_value_takes_priority_over_snapshot(tmp_path, monkeypatch):
    res = _eval_adv(tmp_path, monkeypatch, {"adv_20d_usd": 400_000.0}, vol=1.0, price=5.0, switch_no_liquidity_data=False)
    assert res["adv"] == 400_000.0
    assert "adv_single_day" not in res["flags"]


# ── P3.6c: stocks[t].metrics.adv_20d_usd (universe-wide daily fetch) is now the top source ──

def test_adv_stocks_metrics_value_takes_priority_over_momentum_state_and_snapshot(tmp_path, monkeypatch):
    res = _eval_adv(
        tmp_path, monkeypatch, {"adv_20d_usd": 400_000.0}, vol=1.0, price=5.0, switch_no_liquidity_data=False,
        stocks_adv_20d_usd=900_000.0,
    )
    assert res["adv"] == 900_000.0
    assert res["flags"] == []
    assert res["veto"] is None


def test_adv_falls_back_to_momentum_state_when_stocks_metrics_value_absent(tmp_path, monkeypatch):
    res = _eval_adv(
        tmp_path, monkeypatch, {"adv_20d_usd": 400_000.0}, vol=1.0, price=5.0, switch_no_liquidity_data=False,
        stocks_adv_20d_usd=None,
    )
    assert res["adv"] == 400_000.0
    assert "adv_single_day" not in res["flags"]

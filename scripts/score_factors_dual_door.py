"""score_factors_dual_door.py — Production Dual-Door Sifter for Tier 2.

Core Pillars:
1. Institutional Retail Hygiene & 15-Month SEC Statutory Integrity.
2. Tailored Corporate Finance Archetypes (145 canonical industries mapped to 6 archetypes).
   - Banks/Insurance: Earnings Yield, ROE, Gordon Growth Gap (no EV/FCF).
   - REITs: Price/FFO, OCF/MCap (GAAP depreciation bypassed).
   - Commodity Cyclicals: 3-year normalized mid-cycle cash flow (peak trap prevention).
   - Tech/Industrial Compounders: ROIC, Gross Margin Stability, FCF Conversion.
3. Intra-Sector Anti-Cannibalism Guardrails: Max 35% per sub-industry cluster.
4. Dynamic Percentile-Merit Selection:
   - Rank-percentile normalization (0-100) eliminates raw score skew.
   - 25% safety style floor per door within each sector.
   - 50% competitive merit based on highest empirical percentile.
5. Core-Satellite 70/30 Macro Architecture:
   - 70% Core Floor (~90 stocks across 11 sectors guided by MGI macro rankings).
   - 30% Global Wildcards (~45 unconstrained slots for superstar compounders).
   - Hard 18% Sector Ceiling (max 24 stocks per sector) guarantees zero sector crowding.

Usage: python scripts/score_factors_dual_door.py
Output: public/data/factor_scores_dual_door.json, public/data/factor_scores.json
"""

import bisect
import json
import math
import os
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Set

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"

sys.path.append(str(Path(__file__).resolve().parent))
from industry_taxonomy import get_taxonomy_profile, normalize_industry
from score_paradigm import compute_skip_month_return, compute_high_proximity
from hygiene_thresholds import MIN_MARKET_CAP, MIN_SHARE_PRICE, MIN_ADV_DOLLAR, LARGE_CAP_FLAG_ONLY_USD, resolve_adv_usd
import depth_conviction
import tradability
import peer_paths
from mri_sync import sync_mri_snapshot

STOCKS_JSON = DATA / "stocks.json"
PRICE_HISTORY_JSON = DATA / "price_history.json"
MOMENTUM_STATE_JSON = DATA / "momentum_state.json"
SIFTER_CONFIG_PATH = Path(__file__).resolve().parent / "sifter_config.json"
if not SIFTER_CONFIG_PATH.exists():
    SIFTER_CONFIG_PATH = Path(__file__).resolve().parent / "momentum_config.json"
MOMENTUM_CONFIG_PATH = SIFTER_CONFIG_PATH
FUNDAMENTALS_HISTORY_JSON = DATA / "fundamentals_history.json"
BATTERY_JSON = DATA / "fundamentals_battery.json"
EPS_TRAJECTORY_JSON = DATA / "eps_trajectory.json"
TIER1_SURVIVORS_JSON = DATA / "tier1_hygiene_survivors.json"
MRI_SNAPSHOT_SECTOR_RANKING_JSON = DATA / "mri" / "current_sector_ranking.json"
COST_OF_CAPITAL_ANCHOR_JSON = DATA / "mri" / "cost_of_capital_anchor.json"
OUT_JSON = DATA / "factor_scores_dual_door.json"
FACTOR_SCORES_COMPAT_JSON = DATA / "factor_scores.json"

# MRI-11: matches MRI's own CURRENT_REGIME_MAX_AGE_DAYS (regime_status.py:18).
SECTOR_RANKING_MAX_AGE_DAYS = 45
# P3.9 (SCR-05): the cost-of-capital anchor uses the same 45-day freshness window.
COST_OF_CAPITAL_ANCHOR_MAX_AGE_DAYS = 45
# P3.9: the reverse-DCF discount rate before the anchor existed — kept as the fallback constant.
CONSTANT_FALLBACK_DISCOUNT_RATE = 10.0

Z_CLAMP = 3.0
# Default stays "winsor": under gaussian_rank z_exp_gap ties do not disappear (they stem from raw gap clamping), failing pre-registered adoption rule.
Z_METHOD = os.environ.get("Z_METHOD", "winsor")
UNIT_VARIANCE = True
TOTAL_NOMINATION_TARGET = 135
CORE_RATIO = 0.70 # 70% Core Sector Floor (~90 stocks)
WILDCARD_RATIO = 0.30 # 30% Global Wildcards (~45 stocks)
MAX_SECTOR_PCT = 0.18 # Hard 18% ceiling (max 24 stocks per sector)
MAX_SECTOR_CEILING = int(TOTAL_NOMINATION_TARGET * MAX_SECTOR_PCT)

GICS_TO_MACRO_ID = {
    "Basic Materials": "materials",
    "Communication Services": "communication_services",
    "Consumer Cyclical": "consumer_discretionary",
    "Consumer Defensive": "consumer_staples",
    "Energy": "energy",
    "Financial Services": "financials",
    "Healthcare": "health_care",
    "Industrials": "industrials",
    "Real Estate": "real_estate",
    "Technology": "information_technology",
    "Utilities": "utilities",
}


def load_json(path: Path, default=None):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _load_sifter_config(config_path: Optional[Path] = None) -> Dict[str, Any]:
    p = config_path or globals().get("SIFTER_CONFIG_PATH", Path(__file__).resolve().parent / "sifter_config.json")
    if not p.exists():
        p = globals().get("MOMENTUM_CONFIG_PATH", Path(__file__).resolve().parent / "momentum_config.json")
    return load_json(p, {}) if p.exists() else {}


def _load_door2_momentum_floor(config_path: Optional[Path] = None) -> float:
    cfg = _load_sifter_config(config_path)
    val = cfg.get("door2_momentum_floor", cfg.get("DOOR2_MOMENTUM_FLOOR", -1.5))
    return float(val)


def _load_momentum_universe_weight(config_path: Optional[Path] = None) -> float:
    """P3.13: weight given to the pooled-universe momentum z vs. the sector-neutral one when
    combining the momentum pillar. Accepts either a flat top-level key or the nested
    {"momentum_universe_weight": {"MOMENTUM_UNIVERSE_WEIGHT": ...}} shape used elsewhere in
    this file for judgement constants that carry a `_note`."""
    cfg = _load_sifter_config(config_path)
    nested = cfg.get("momentum_universe_weight", {})
    val = nested.get("MOMENTUM_UNIVERSE_WEIGHT", cfg.get("MOMENTUM_UNIVERSE_WEIGHT", 0.5))
    return float(val)


def _load_hysteresis_ranks(config_path: Optional[Path] = None) -> Tuple[int, int]:
    cfg = _load_sifter_config(config_path)
    rn_buf = cfg.get("hysteresis_rn_rank", cfg.get("hysteresis_rn_buffer", 60))
    book_buf = cfg.get("hysteresis_book_rank", cfg.get("hysteresis_book_buffer", 150))
    return int(rn_buf), int(book_buf)


def _load_mid_cycle_config(config_path: Optional[Path] = None) -> Tuple[int, Dict[str, int]]:
    cfg = _load_sifter_config(config_path)
    mc = cfg.get("mid_cycle_window", {})
    def_yrs = int(mc.get("default_years", 3))
    cl_yrs = mc.get("cluster_years", {
        "energy_upstream": 8,
        "energy_services": 8,
        "energy_midstream_refining": 8,
        "mat_metals_mining": 8,
    })
    return def_yrs, {k: int(v) for k, v in cl_yrs.items()}


def _load_door3_config(config_path: Optional[Path] = None) -> Dict[str, float]:
    """P3.14 (PHASE_3_ADDENDUM.md): Door 3 'trend leaders' constants."""
    cfg = _load_sifter_config(config_path)
    d3 = cfg.get("door3", {})
    return {
        "DOOR3_SLOTS": int(d3.get("DOOR3_SLOTS", 20)),
        "DOOR3_RN_SLOTS": int(d3.get("DOOR3_RN_SLOTS", 5)),
        "DOOR3_CLUSTER_CAP": int(d3.get("DOOR3_CLUSTER_CAP", 5)),
        "DOOR3_MIN_MCAP": float(d3.get("DOOR3_MIN_MCAP", 2_000_000_000.0)),
        # C10 (PHASE_3_APPROVAL.md): renamed from DOOR3_QUALITY_MIN_PCTL — the quality pillar
        # penalises hypergrowth (accruals, margin instability) and excluded NVDA/SNDK/WDC/COHR;
        # Door 3's floor is now profitability (sector-neutral roic_proxy z) only.
        "DOOR3_PROFITABILITY_MIN_PCTL": float(d3.get("DOOR3_PROFITABILITY_MIN_PCTL", 25.0)),
        "DOOR3_MAX_JUMP_SHARE": float(d3.get("DOOR3_MAX_JUMP_SHARE", 0.75)),
    }


# P3.14b: fewer usable monthly returns than this in the 12-1 window and a name's trend can't be
# judged at all (PHASE_3_ADDENDUM.md P3.14b, orchestrator measurement 2026-09-24).
DOOR3_MIN_USABLE_MONTHS = 9

# B3 (PHASE_3_APPROVAL.md): fewer monthly closes than this in the same window and the monthly
# trend fallback (compute_monthly_trend_ok) can't compute its 10-month average either.
DOOR3_MONTHLY_TREND_MIN_MONTHS = 10


def compute_monthly_trend_ok(
    closes: Optional[List[float]],
    regime_shift_down: bool,
) -> Tuple[Optional[bool], str]:
    """B3 (PHASE_3_APPROVAL.md): when a Door-3 candidate's `fct_momentum_state` carries no
    `mom_break` (no daily series to compute it), `door3_eligibility` falls back to this monthly
    trend test instead of treating the absence as a pass. Uses the same monthly-close window as
    `compute_trend_continuity` / `score_paradigm.compute_skip_month_return`: closes[-13:-1], the
    12 monthly closes preceding the current (skipped) month.

    Not ok when `regime_shift_down` is true, OR the latest of those monthly closes is below the
    10-month simple average of the same monthly closes. Fewer than
    `DOOR3_MONTHLY_TREND_MIN_MONTHS` usable closes in that window -> (None, "short_history") —
    not enough data to judge at all, not a pass.

    Returns (ok_or_None, field_used) — field_used names what decided it (for the audit trail:
    `fct_flag_detail["mom_break_unverified_monthly_trend_ok"]`).
    """
    if regime_shift_down:
        return False, "regime_shift_down"
    if not isinstance(closes, list):
        return None, "short_history"
    window = [c for c in closes[-13:-1] if isinstance(c, (int, float)) and math.isfinite(c)]
    if len(window) < DOOR3_MONTHLY_TREND_MIN_MONTHS:
        return None, "short_history"
    latest_close = window[-1]
    avg_10m = sum(window[-10:]) / 10.0
    return (latest_close >= avg_10m), "latest_monthly_close_vs_10m_average"


def compute_trend_continuity(
    closes: Optional[List[float]],
    mom_12_1: Optional[float],
) -> Dict[str, Optional[int]]:
    """P3.14b: trend-continuity metrics for Door 3, from the same monthly-close window
    score_paradigm.compute_skip_month_return uses for 12-1 momentum — prices[-13] .. prices[-2],
    the 11 monthly returns spanning t-12 .. t-2 (closes[-13:-1], 12 closes -> 11 consecutive
    monthly returns).

    Momentum research (Da, Gurun & Warachka 2014, "Attention, Trading, and the Momentum
    Effect" / the "frog in the pan" result) finds that momentum from many small, continuous
    monthly gains persists, while momentum concentrated in a few discrete jumps does not. Door
    3's first live run picked PACS (one month = 90% of its 12-1 log gain, +177%) and IBRX (98%,
    +216%, only 5 of 11 months up) — event jumps, not trends.

    jump_share = ln(1 + largest single-month return) / ln(1 + 12-1 return), only defined when
    the 12-1 return is positive (the ratio of logs is meaningless otherwise) and at least
    DOOR3_MIN_USABLE_MONTHS of the 11 window months are usable (both endpoints present, finite,
    non-zero prior close). up_months is the count of positive months among the usable ones.

    Returns {"jump_share": float|None, "up_months": int|None, "usable_months": int}."""
    if not isinstance(closes, list) or len(closes) < 13:
        return {"jump_share": None, "up_months": None, "usable_months": 0}
    window = closes[-13:-1]  # 12 closes -> 11 consecutive monthly returns (t-12 .. t-2)
    monthly_returns: List[float] = []
    for i in range(1, len(window)):
        p0, p1 = window[i - 1], window[i]
        if p0 is None or p1 is None:
            continue
        if not math.isfinite(p0) or not math.isfinite(p1) or p0 == 0:
            continue
        r = (p1 / p0) - 1.0
        if math.isfinite(r):
            monthly_returns.append(r)
    usable = len(monthly_returns)
    if usable < DOOR3_MIN_USABLE_MONTHS:
        return {"jump_share": None, "up_months": None, "usable_months": usable}
    up_months = sum(1 for r in monthly_returns if r > 0)
    jump_share = None
    if mom_12_1 is not None and mom_12_1 > 0:
        largest = max(monthly_returns)
        denom = math.log(1 + mom_12_1)
        if denom > 0 and (1 + largest) > 0:
            jump_share = math.log(1 + largest) / denom
    return {"jump_share": jump_share, "up_months": up_months, "usable_months": usable}


def door3_eligibility(
    mcap: Optional[float],
    falling_knife: bool,
    mom_break: Optional[bool],
    z_revisions: Optional[float],
    roic_proxy_z: Optional[float],
    roic_proxy_pctl25: Optional[float],
    adv_usd: Optional[float],
    min_mcap: float,
    min_adv: float = 300_000.0,
    usable_months: Optional[int] = None,
    jump_share: Optional[float] = None,
    min_usable_months: int = DOOR3_MIN_USABLE_MONTHS,
    max_jump_share: float = 0.75,
    monthly_trend_ok: Optional[bool] = None,
) -> Tuple[bool, Optional[str], List[str]]:
    """P3.14 Door 3 eligibility (PHASE_3_ADDENDUM.md, all required), plus the P3.14b
    trend-continuity rule (PHASE_3_ADDENDUM.md P3.14b, orchestrator measurement 2026-09-24):
    fewer than `min_usable_months` usable monthly returns in the 12-1 window -> not eligible
    (reason `short_history`); jump_share > `max_jump_share` -> not eligible (reason
    `jump_driven`). Returns (eligible, ineligible_reason, extra_flags) — extra_flags carries
    revisions_missing / adv_missing even when the name is otherwise eligible (an absence rides
    as a flag, never silently gated).

    B3 (PHASE_3_APPROVAL.md): `mom_break is None` (no daily data to compute it) is no longer a
    silent pass. The caller runs `compute_monthly_trend_ok` (the monthly-close fallback check)
    and passes its result in as `monthly_trend_ok`: None -> not enough monthly history to judge
    at all (`short_history`); False -> the monthly trend itself says no (`
    mom_break_unverified_monthly_trend_failed`); True -> eligible, flagged
    `mom_break_unverified_monthly_trend_ok` so the name is never mistaken for a verified pass.

    C10 (PHASE_3_APPROVAL.md): the old quality-pillar floor is replaced, for Door 3 only, by a
    PROFITABILITY floor — the quality pillar's accruals/margin-stability terms penalise
    hypergrowth and excluded NVDA/SNDK/WDC/COHR while admitting unprofitable biotechs.
    `roic_proxy_z` is the sector-neutral z of roic_proxy alone; eligible only when it is >=
    `roic_proxy_pctl25` (the scored universe's 25th percentile of that z). Either missing ->
    not eligible (reason `no_profitability_data`).
    """
    extra_flags: List[str] = []
    if mcap is None or mcap < min_mcap:
        return False, "mcap_below_door3_floor", extra_flags
    if falling_knife:
        return False, "falling_knife_or_mom_break", extra_flags
    if mom_break is True:
        return False, "falling_knife_or_mom_break", extra_flags
    if mom_break is None:
        if monthly_trend_ok is None:
            return False, "short_history", extra_flags
        if not monthly_trend_ok:
            return False, "mom_break_unverified_monthly_trend_failed", extra_flags
        extra_flags.append("mom_break_unverified_monthly_trend_ok")
    if usable_months is None or usable_months < min_usable_months:
        return False, "short_history", extra_flags
    if jump_share is not None and jump_share > max_jump_share:
        return False, "jump_driven", extra_flags
    if z_revisions is None:
        extra_flags.append("revisions_missing")
    elif z_revisions < 0:
        return False, "revisions_negative", extra_flags
    if roic_proxy_z is None or roic_proxy_pctl25 is None:
        return False, "no_profitability_data", extra_flags
    if roic_proxy_z < roic_proxy_pctl25:
        return False, "profitability_below_pctl25", extra_flags
    if adv_usd is None:
        extra_flags.append("adv_missing")
    elif adv_usd < min_adv:
        return False, "adv_below_300k", extra_flags
    return True, None, extra_flags


def _door3_rank_key(c: Dict[str, Any]) -> Tuple[float, float, str]:
    """P3.14b: rank among Door-3 (eligible) names by universe momentum score descending, ties
    broken by raw mom_12_1 descending, then ticker — deterministic even when universe z is
    clipped and several names tie (PHASE_3_ADDENDUM.md P3.14b, orchestrator measurement
    2026-09-24). A missing mom_12_1 sorts after every present value on the tie-break."""
    mom_12_1 = c.get("mom_12_1")
    mom_12_1_key = -mom_12_1 if mom_12_1 is not None else float("inf")
    return (-c["universe_momentum"], mom_12_1_key, c["ticker"])


def select_door3(
    candidates: List[Dict[str, Any]],
    already_nominated: Set[str],
    slots: int = 20,
    cluster_cap: int = 5,
    retained_tickers: Optional[Set[str]] = None,
    retained_cluster_counts: Optional[Dict[str, int]] = None,
) -> Dict[str, Any]:
    """P3.14 Door 3 selection. `candidates` are already ELIGIBLE names, each a dict with at
    least {"ticker", "cluster", "universe_momentum"} (optionally "mom_12_1" for the P3.14b
    tie-break). Ranked by universe_momentum descending, ties broken by raw mom_12_1 descending
    then ticker (see `_door3_rank_key`). A name already nominated by Door 1 or Door 2 is
    skipped for a Door 3 slot but tagged `also_trend_leader`; at most `cluster_cap` per cluster;
    stops once `slots` new names are selected.

    C1 (PHASE_3_APPROVAL.md): `retained_tickers` are previous Door-3 names the caller already
    decided to keep via hysteresis (door3_hysteresis_retain) — this function never selects them
    fresh (the caller owns them), but their clusters, via `retained_cluster_counts`, seed this
    call's cluster accounting so a fresh entrant from a cluster already full of retained names
    is correctly blocked. `slots` here is the number of NEW (non-retained) names still wanted —
    the caller has already reduced it by len(retained_tickers)."""
    retained_tickers = retained_tickers or set()
    ordered = sorted(candidates, key=_door3_rank_key)
    selected: List[str] = []
    also_trend_leader: List[str] = []
    cluster_counts: Dict[str, int] = dict(retained_cluster_counts or {})
    for c in ordered:
        if len(selected) >= slots:
            break
        t = c["ticker"]
        if t in retained_tickers:
            continue
        if t in already_nominated:
            also_trend_leader.append(t)
            continue
        cl = c["cluster"]
        if cluster_counts.get(cl, 0) >= cluster_cap:
            continue
        selected.append(t)
        cluster_counts[cl] = cluster_counts.get(cl, 0) + 1
    return {"selected": selected, "also_trend_leader": also_trend_leader, "cluster_counts": cluster_counts}


def door3_hysteresis_retain(
    prev_door3: Set[str],
    fresh_selected: List[str],
    eligible_ranked: List[str],
    already_nominated: Set[str],
    max_rank: int,
) -> List[str]:
    """P3.14: 'Hysteresis (P3.5) applies to Door-3 names like any other' — a previous Door-3
    name not re-selected fresh stays while its current universe-momentum rank among ELIGIBLE
    names is <= max_rank (DOOR3_SLOTS + 5). `eligible_ranked` is every eligible ticker ordered
    by universe momentum descending (rank 1 = index 0). Already-nominated names are excluded —
    they get `also_trend_leader` instead, handled by the caller."""
    rank_by_ticker = {t: i + 1 for i, t in enumerate(eligible_ranked)}
    fresh_set = set(fresh_selected)
    retained = []
    for t in sorted(prev_door3):
        if t in fresh_set or t in already_nominated:
            continue
        r = rank_by_ticker.get(t)
        if r is not None and r <= max_rank:
            retained.append(t)
    return retained


def _load_veto_switches(config_path: Optional[Path] = None) -> Dict[str, bool]:
    cfg = _load_sifter_config(config_path)
    sw = cfg.get("veto_switches", {})
    return {
        "altman_z": bool(sw.get("altman_z", cfg.get("enable_veto_altman_z", False))),
        "beneish_standalone": bool(sw.get("beneish_standalone", cfg.get("enable_veto_beneish_standalone", False))),
        "no_liquidity_data": bool(sw.get("no_liquidity_data", cfg.get("enable_veto_no_liquidity_data", False))),
    }


def _load_altman_thresholds(config_path: Optional[Path] = None) -> Tuple[float, Dict[str, float]]:
    p = config_path or Path(__file__).resolve().parent / "reverse_config.json"
    cfg = load_json(p, {}) if p.exists() else {}
    st1 = cfg.get("thresholds", {}).get("stage1", {})
    default_min = float(st1.get("altman_z_min", 1.8))
    sec_map = {k: float(v) for k, v in st1.get("sector_altman_z_min", {}).items() if not k.startswith("_")}
    return default_min, sec_map


def _load_altman_sector_overrides(config_path: Optional[Path] = None) -> Dict[str, float]:
    """P3.6b: sector Altman-Z overrides layered on top of reverse_config.json's table (owned
    by score_reverse.py and not edited here) — e.g. Utilities, structurally leveraged like
    Financials/Real Estate, which reverse_config.json doesn't carry yet."""
    cfg = _load_sifter_config(config_path)
    overrides = cfg.get("altman_sector_overrides", {})
    return {k: float(v) for k, v in overrides.items() if not k.startswith("_")}


# P3.6b: sectors where accrual/manipulation ratios are structurally uninformative (asset
# managers, BDCs, mortgage REITs, a physical-gold trust) — same exemption Altman already uses.
FORENSIC_VETO_EXEMPT_SECTORS = {"Financial Services", "Real Estate"}


def _resolve_regime_shift_down(fct_mom: Dict[str, Any], flags_list: List[str]) -> bool:
    """Whether this name's momentum state reports a 10-month-MA regime shift down (the field
    build_momentum_state.py writes) — the same resolution both the P3.3 falling-knife floor and
    B3's monthly-trend fallback use: the `regime_shift_down` field, this ticker's own flags
    list, or the momentum payload's own `flags` list, in that order."""
    if fct_mom.get("regime_shift_down") is True:
        return True
    if "regime_shift_down" in flags_list:
        return True
    if isinstance(fct_mom.get("flags"), list) and "regime_shift_down" in fct_mom["flags"]:
        return True
    return False


DOOR2_MOMENTUM_FLOOR = _load_door2_momentum_floor()
MOMENTUM_UNIVERSE_WEIGHT = _load_momentum_universe_weight()


def _parse_mri_date(raw: Optional[str]) -> Optional[datetime]:
    """MRI writes `date` as `YYYY-MM-DD` (sector ranking) or `YYYY-MM-DD HH:MM:SS`
    (current_regime.json's older shape); accept both. None when absent or unparseable."""
    if not raw:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _sector_tilt_score(item: Dict[str, Any]) -> Optional[float]:
    """Schema 2 publishes `tilt_score`; schema 1 published `confidence_adjusted_score`, falling
    back to `raw_sector_score`. A true 0.0 in any of these is a value and must not fall through
    to the next key — only a missing (None) key does. None means the sector carries no score."""
    for key in ("tilt_score", "confidence_adjusted_score", "raw_sector_score"):
        val = item.get(key)
        if val is not None:
            return float(val)
    return None


def _validation_gate_open(macro_data: Dict[str, Any]) -> Tuple[bool, str]:
    """The operator-approved validation gate (P0_0_MRI_TARGET_ARCHITECTURE.md §7.1): a non-zero
    sector tilt is applied only when the ranking artifact's validation.horizon_3m shows a
    positive rank IC with overlap-corrected t >= 2. A missing or null validation block — which is
    what MRI publishes today — fails closed to neutral; it is never treated as a pass."""
    validation = macro_data.get("validation")
    horizon = validation.get("horizon_3m") if isinstance(validation, dict) else None
    if not isinstance(horizon, dict):
        return False, "validation_block_missing"
    rank_ic = horizon.get("rank_ic")
    t_stat = horizon.get("t_overlap_corrected")
    if rank_ic is None or t_stat is None:
        return False, "validation_block_missing"
    if rank_ic <= 0:
        return False, "ic_not_positive"
    if t_stat < 2:
        return False, "t_below_threshold"
    return True, "validated_edge"


def load_sector_ranking() -> Tuple[Dict[str, float], str, Dict[str, Any]]:
    """Resolve the MRI -> screener sector-quota contract (MRI-11).

    Resolution order: (1) peer_paths.mri_outputs_dir(), the live MRI checkout (operator's PC,
    self-hosted runner); (2) the committed snapshot at public/data/mri/, refreshed by
    mri_sync.sync_mri_snapshot(); (3) neutral fallback with a stated reason — never a silent
    constant.

    Returns (macro_scores_by_id, reported_regime, meta). macro_scores_by_id maps sector_id ->
    tilt_score and is populated only when the validation gate (below) is open; otherwise it is
    empty and every sector quota falls back to the base via the caller's .get(id, 0.0).

    meta.sector_quota_source is one of:
      "mri"                      - read from the live MRI checkout, validation gate open
      "mri_snapshot"              - read from the committed snapshot, validation gate open
      "neutral_fallback"          - no usable ranking found (missing/unparseable/invalid/stale/
                                     future-dated); quotas are neutral because there is no data
      "neutral_no_validated_edge" - a usable, fresh ranking was found but the validation gate is
                                     closed; quotas are neutral because the tilt is not trusted
    """
    candidates = []
    outputs_dir = peer_paths.mri_outputs_dir()
    if outputs_dir is not None and outputs_dir.exists():
        candidates.append(("mri", outputs_dir / "current_sector_ranking.json"))
    candidates.append(("mri_snapshot", MRI_SNAPSHOT_SECTOR_RANKING_JSON))

    macro_data, source, path, load_reason = None, None, None, "no_source_found"
    for candidate_source, candidate_path in candidates:
        if not candidate_path.exists():
            continue
        try:
            macro_data = json.loads(candidate_path.read_text(encoding="utf-8"))
        except Exception as exc:
            load_reason = f"unparseable:{exc}"
            continue
        source, path = candidate_source, candidate_path
        break

    if macro_data is None:
        meta = {
            "sector_quota_source": "neutral_fallback", "reason": load_reason,
            "path": None, "date": None, "age_days": None,
            "macro_confidence": None, "n_sectors": 0,
        }
        return {}, "neutral", meta

    reported_regime = macro_data.get("reported_macro_regime") or macro_data.get("reported_regime") or "neutral"
    macro_confidence = macro_data.get("macro_confidence")
    sector_rows = macro_data.get("sector_ranking") or []
    n_sectors = len(sector_rows)
    date_raw = macro_data.get("date")
    parsed_date = _parse_mri_date(date_raw)
    now = datetime.now(timezone.utc)
    age_days = (now - parsed_date).days if parsed_date is not None else None

    fallback_reason = None
    if macro_data.get("valid") is False:
        fallback_reason = "invalid_flag_false"
    elif parsed_date is None:
        fallback_reason = "date_missing_or_unparseable"
    elif parsed_date > now:
        fallback_reason = "future_dated"
    elif age_days > SECTOR_RANKING_MAX_AGE_DAYS:
        fallback_reason = f"stale_{age_days}d"

    if fallback_reason is not None:
        meta = {
            "sector_quota_source": "neutral_fallback", "reason": fallback_reason,
            "path": str(path), "date": date_raw, "age_days": age_days,
            "macro_confidence": macro_confidence, "n_sectors": n_sectors,
        }
        return {}, reported_regime, meta

    gate_open, gate_reason = _validation_gate_open(macro_data)

    macro_scores_by_id: Dict[str, float] = {}
    if gate_open:
        for item in sector_rows:
            sid = item.get("sector_id")
            if not sid:
                continue
            score = _sector_tilt_score(item)
            if score is None:
                print(f"  [sector ranking] {sid}: no score field present, skipped (base quota applies)")
                continue
            macro_scores_by_id[sid] = score

    meta = {
        "sector_quota_source": source if gate_open else "neutral_no_validated_edge",
        "reason": gate_reason,
        "path": str(path), "date": date_raw, "age_days": age_days,
        "macro_confidence": macro_confidence, "n_sectors": n_sectors,
    }
    return macro_scores_by_id, reported_regime, meta


def load_coe_anchor() -> Tuple[Optional[Dict[str, Any]], Dict[str, Any]]:
    """MRI's cost-of-capital anchor (P3.9, SCR-05): public/data/mri/cost_of_capital_anchor.json,
    the committed snapshot mri_sync.py refreshes. Used only when `degraded == false` and `asof`
    is at most COST_OF_CAPITAL_ANCHOR_MAX_AGE_DAYS old; any other case is a fallback to the
    constant discount rate, with a reason, never a silent one.

    Returns (anchor_dict_or_None, meta). meta["discount_rate_source"] is "anchor" when the
    anchor dict is usable, else "constant_fallback".
    """
    path = COST_OF_CAPITAL_ANCHOR_JSON
    if not path.exists():
        return None, {"discount_rate_source": "constant_fallback", "reason": "anchor_missing",
                       "path": None, "asof": None, "age_days": None}
    try:
        anchor = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return None, {"discount_rate_source": "constant_fallback", "reason": f"unparseable:{exc}",
                       "path": str(path), "asof": None, "age_days": None}

    asof_raw = anchor.get("asof")
    parsed = _parse_mri_date(asof_raw)
    now = datetime.now(timezone.utc)
    age_days = (now - parsed).days if parsed is not None else None

    if anchor.get("degraded") is not False:
        return None, {"discount_rate_source": "constant_fallback", "reason": "degraded",
                       "path": str(path), "asof": asof_raw, "age_days": age_days}
    if parsed is None:
        return None, {"discount_rate_source": "constant_fallback", "reason": "asof_missing_or_unparseable",
                       "path": str(path), "asof": asof_raw, "age_days": age_days}
    if parsed > now:
        return None, {"discount_rate_source": "constant_fallback", "reason": "future_dated",
                       "path": str(path), "asof": asof_raw, "age_days": age_days}
    if age_days > COST_OF_CAPITAL_ANCHOR_MAX_AGE_DAYS:
        return None, {"discount_rate_source": "constant_fallback", "reason": f"stale_{age_days}d",
                       "path": str(path), "asof": asof_raw, "age_days": age_days}

    return anchor, {"discount_rate_source": "anchor", "reason": "ok",
                     "path": str(path), "asof": asof_raw, "age_days": age_days}


def resolve_coe_pct(anchor: Optional[Dict[str, Any]], mgi_subindustry_id: Optional[str],
                     sector: str) -> Tuple[float, Optional[str]]:
    """Per-name cost of equity (%), P3.9: risk_free.nominal_10y + sector_loading * implied_erp,
    from the anchor's own field names. sector_loadings is keyed by both the finer
    mgi_subindustry_id (e.g. "semiconductors") and the coarser GICS_TO_MACRO_ID id (e.g.
    "information_technology") — try the finer id first, then the coarser one, then default to
    a loading of 1.0 and flag it ("coe_default_loading") rather than silently guessing.

    anchor is None (unusable, see load_coe_anchor) -> the constant fallback rate, no flag.
    """
    if anchor is None:
        return CONSTANT_FALLBACK_DISCOUNT_RATE, None
    risk_free = (anchor.get("risk_free") or {}).get("nominal_10y")
    implied_erp = anchor.get("implied_erp")
    sector_loadings = anchor.get("sector_loadings") or {}
    if risk_free is None or implied_erp is None:
        return CONSTANT_FALLBACK_DISCOUNT_RATE, None

    loading = sector_loadings.get(mgi_subindustry_id) if mgi_subindustry_id else None
    if loading is None:
        loading = sector_loadings.get(GICS_TO_MACRO_ID.get(sector))
    flag = None
    if loading is None:
        loading = 1.0
        flag = "coe_default_loading"
    return (risk_free + loading * implied_erp) * 100.0, flag


def owner_cf_cagr_5y(ydata: Dict[str, Any], years: List[int]) -> Optional[float]:
    """Demonstrated 5-year CAGR of the owner-earnings base (P3.9, SCR-05): ni + da - capex per
    fiscal year, falling back to that year's fcf when any of the three is missing. Mirrors
    build_valuation_models.py's growth_evidence() (up to 6 fiscal years, >= 4 positive points
    required) applied to this series instead of revenue. None ("undefined CAGR") when there
    aren't enough positive points or the span/endpoints don't support one.
    """
    pts: List[Tuple[int, float]] = []
    for y in years:
        row = ydata.get(str(y), {})
        ni_y, da_y, capex_y = num(row.get("net_income")), num(row.get("da")), num(row.get("capex"))
        v = (ni_y + da_y - capex_y) if None not in (ni_y, da_y, capex_y) else num(row.get("fcf"))
        if v is not None and v > 0:
            pts.append((y, v))
    if len(pts) < 4:
        return None
    (ya, va), (yb, vb) = pts[max(0, len(pts) - 6)], pts[-1]
    if yb <= ya or va <= 0 or vb <= 0:
        return None
    return (vb / va) ** (1.0 / (yb - ya)) - 1.0


def num(v) -> Optional[float]:
    return float(v) if isinstance(v, (int, float)) and math.isfinite(v) else None


def pctl(sorted_vals: List[float], q: float) -> Optional[float]:
    n = len(sorted_vals)
    if n == 0: return None
    if n == 1: return sorted_vals[0]
    pos = (q / 100.0) * (n - 1)
    lo = int(math.floor(pos))
    hi = min(lo + 1, n - 1)
    frac = pos - lo
    return sorted_vals[lo] * (1.0 - frac) + sorted_vals[hi] * frac


def sector_neutral_z(
    raw_by_ticker: Dict[str, Optional[float]],
    sector_by_ticker: Dict[str, str],
    method: Optional[str] = None,
) -> Dict[str, Optional[float]]:
    method = method or globals().get("Z_METHOD", "winsor")
    by_sector: Dict[str, List[Tuple[str, float]]] = {}
    universe: List[Tuple[str, float]] = []
    for t, v in raw_by_ticker.items():
        if v is not None:
            sec = sector_by_ticker.get(t) or "Unknown"
            universe.append((t, v))
            by_sector.setdefault(sec, []).append((t, v))
            
    if len(universe) < 2:
        return {t: None for t in raw_by_ticker}

    if method == "gaussian_rank":
        z_scores: Dict[str, Optional[float]] = {}
        for t, v in raw_by_ticker.items():
            if v is None:
                z_scores[t] = None

        def _rank_pool(ticker_val_list: List[Tuple[str, float]]) -> Dict[str, float]:
            n = len(ticker_val_list)
            if n == 0:
                return {}
            if n == 1:
                return {ticker_val_list[0][0]: 0.0}
            sorted_items = sorted(ticker_val_list, key=lambda x: x[1])
            res: Dict[str, float] = {}
            i = 0
            while i < n:
                j = i
                while j < n - 1 and sorted_items[j + 1][1] == sorted_items[j][1]:
                    j += 1
                midrank = (i + 1 + j + 1) / 2.0
                p = (midrank - 0.5) / n
                p_clamped = max(1e-6, min(1.0 - 1e-6, p))
                z_val = statistics.NormalDist().inv_cdf(p_clamped)
                z_clamped = max(-Z_CLAMP, min(Z_CLAMP, z_val))
                for k in range(i, j + 1):
                    res[sorted_items[k][0]] = z_clamped
                i = j + 1
            return res

        u_ranks = _rank_pool(universe)
        for sec, items in by_sector.items():
            if len(items) >= 15:
                sec_ranks = _rank_pool(items)
                for t, _ in items:
                    z_scores[t] = sec_ranks[t]
            else:
                for t, _ in items:
                    z_scores[t] = u_ranks[t]

        return z_scores

    # Default "winsor"
    def stats_for(vals: List[float]) -> Tuple[float, float, float, Optional[float]]:
        s = sorted(vals)
        lo, hi = pctl(s, 1.0), pctl(s, 99.0)
        w = [min(max(v, lo), hi) for v in vals]
        mean = sum(w) / len(w)
        sd = statistics.pstdev(w)
        return mean, sd, lo, hi

    u_vals = [v for _, v in universe]
    u_mean, u_sd, u_lo, u_hi = stats_for(u_vals)
    sec_stats = {}
    for sec, items in by_sector.items():
        vals = [v for _, v in items]
        if len(vals) >= 15:
            sec_stats[sec] = stats_for(vals)
        else:
            sec_stats[sec] = (u_mean, u_sd, u_lo, u_hi)

    z_scores: Dict[str, Optional[float]] = {}
    for t, v in raw_by_ticker.items():
        if v is None:
            z_scores[t] = None
            continue
        sec = sector_by_ticker.get(t) or "Unknown"
        mean, sd, lo, hi = sec_stats.get(sec, (u_mean, u_sd, u_lo, u_hi))
        if sd == 0 or not math.isfinite(sd):
            z_scores[t] = 0.0
            continue
        v_clamped = min(max(v, lo), hi)
        score = (v_clamped - mean) / sd
        z_scores[t] = max(-Z_CLAMP, min(Z_CLAMP, score))

    return z_scores


def universe_z(
    raw_by_ticker: Dict[str, Optional[float]],
    method: Optional[str] = None,
) -> Dict[str, Optional[float]]:
    """Same standardisation as sector_neutral_z (winsor or gaussian_rank; same winsor/clip
    rules) but pooled across the whole scored universe — no sector grouping. Putting every
    ticker in one sector name reuses sector_neutral_z's own pooled-universe fallback path
    (already exercised when a sector has fewer than 15 members), so this is exactly that
    computation rather than a re-derivation of it. None stays None.

    P3.13: the momentum pillar is otherwise 100% sector-neutral, which makes a sector-wide
    boom invisible. This lets the momentum pillar also see the un-neutralised, universe-wide
    move.
    """
    pooled_sector = {t: "__universe__" for t in raw_by_ticker}
    return sector_neutral_z(raw_by_ticker, pooled_sector, method=method)


def solve_reverse_dcf_gap(owner_earnings: float, mcap: float, discount_rate: float, historical_cagr: float) -> Optional[float]:
    if owner_earnings <= 0 or mcap <= 0:
        return None
    r = discount_rate / 100.0
    g_terminal = 0.025
    if mcap <= owner_earnings:
        implied_g = -0.50
    else:
        lo, hi = -0.40, 0.40
        implied_g = 0.05
        for _ in range(30):
            mid = (lo + hi) / 2.0
            pv = sum(owner_earnings * ((1.0 + mid) ** i) / ((1.0 + r) ** i) for i in range(1, 11))
            cf_10 = owner_earnings * ((1.0 + mid) ** 10)
            tv = (cf_10 * (1.0 + g_terminal)) / (r - g_terminal) if r > g_terminal else 0.0
            pv += tv / ((1.0 + r) ** 10)
            if pv > mcap:
                hi = mid
            else:
                lo = mid
        implied_g = (lo + hi) / 2.0

    gap = (historical_cagr - implied_g) * 100.0
    return max(-30.0, min(30.0, gap))


def get_percentile(val: Optional[float], sorted_vals: List[float]) -> float:
    if val is None or not sorted_vals:
        return 0.0
    idx = bisect.bisect_left(sorted_vals, val)
    return (idx / len(sorted_vals)) * 100.0


def _contributions(prof):
    """Per-pillar contribution to the score of the door this name actually won on.

    The site renders this as the factor-mix bar. It is the DECOMPOSITION OF THE WINNING DOOR,
    not an average of both — a value name and a compounder are scored by different formulas, and
    blending their mixes would describe neither. Magnitudes only: the bar shows relative weight,
    and a negative z is still a real contribution to how the name ranked.

    There is deliberately no `lowvol` key. The equal-weight engine carried a low-volatility
    pillar; the dual-door model does not, so the bar's lowvol segment is absent rather than
    fabricated at zero-as-if-measured.
    """
    if not prof:
        return None
    s1, s2 = prof.get("score_door1"), prof.get("score_door2")
    if s1 is None and s2 is None:
        return None
    d1, d2 = prof.get("pctl_d1", 0.0), prof.get("pctl_d2", 0.0)
    d2_ok = prof.get("d2_eligible", True)

    if s1 is not None and (s2 is None or not d2_ok):
        won_d1 = True
    elif s2 is not None and d2_ok and s1 is None:
        won_d1 = False
    elif s1 is not None and s2 is not None and d2_ok:
        won_d1 = (d1 >= d2)
    else:
        return None

    parts = {}
    if won_d1:
        scale = prof.get("door1_weight_scale") if prof.get("door1_weight_scale") is not None else 1.0
        used = prof.get("door1_pillars_used") or ["quality", "momentum", "revisions"]
        if "quality" in used and prof.get("z_quality") is not None:
            parts["quality"] = 0.45 * scale * abs(prof["z_quality"])
        # P3.14: the momentum contribution uses z_momentum_door1 (sector-neutral only — what
        # actually fed Door 1's score), not the published z_momentum (the P3.13 blend, which
        # only backs the P3.3 falling-knife floor since P3.14).
        if "momentum" in used and prof.get("z_momentum_door1") is not None:
            parts["momentum"] = 0.35 * scale * abs(prof["z_momentum_door1"])
        if "revisions" in used and prof.get("z_revisions") is not None:
            parts["revisions"] = 0.20 * scale * abs(prof["z_revisions"])
    else:
        scale = prof.get("door2_weight_scale") if prof.get("door2_weight_scale") is not None else 1.0
        used = prof.get("door2_pillars_used") or ["value", "exp_gap", "quality"]
        if "value" in used and prof.get("z_value") is not None:
            parts["value"] = 0.40 * scale * abs(prof["z_value"])
        if "exp_gap" in used and prof.get("z_exp_gap") is not None:
            parts["exp_gap"] = 0.40 * scale * abs(prof["z_exp_gap"])
        if "quality" in used and prof.get("z_quality") is not None:
            parts["quality"] = 0.20 * scale * abs(prof["z_quality"])

    return {k: round(v, 4) for k, v in parts.items() if v > 0} or None


# Percentile cuts for the DEPTH lane's own band (fct_band_llm). Independent of the quant
# nomination, which is rank-based (top 50 research_now, next 85 watchlist) — this scale exists
# so the site can order the depth view against a stable axis.
LLM_BANDS = {"research_now": 97, "watchlist": 90, "monitor": 70}


def _reband(p):
    if p >= LLM_BANDS["research_now"]:
        return "research_now"
    if p >= LLM_BANDS["watchlist"]:
        return "watchlist"
    if p >= LLM_BANDS["monitor"]:
        return "monitor"
    return "pass"


FCT_LLM_GATE_VERSION = "p3.12"   # SCR-04 mapping version — bump when the mapping rules change.


def apply_llm_overlay(results):
    """The Divergence Engine — direction-PRIMARY / quant-GUARDRAIL.

    Reads the depth verdicts (public/data/depth_overlay.json) and writes the fct_*_llm family
    onto the factor rows: the depth `direction` sets the band (undervalued -> research_now,
    hold -> monitor, overvalued -> demoted), and a low-quality-overvalued name is hard-vetoed
    (fct_llm_veto='llm_reject' when direction == overvalued AND conviction < CONV_VETO).

    The quant engine stays a hard GUARDRAIL: a quant-vetoed name (not tradable, forensic,
    insolvency, chronic loss) is skipped, so the depth lane can never pull a red-flagged name
    in. Names with no depth verdict, or a NOT_USABLE one, keep no band — silence, never a
    fabricated depth call. STRICT NO-OP when depth_overlay.json is absent.

    P3.12 (SCR-04 mapping made honest):
      - Promotion to research_now (fct_llm="promoted") requires actionable == true AND
        fct_percentile >= 70 (the monitor floor) AND m >= 10 (mos_vs_base_pct, falling back to
        mos_vs_median_pct with fct_llm_note="mos_median_fallback") AND thesis_status is not
        "breached". An undervalued verdict that fails any of those floors is NOT skipped — it
        lands in watchlist (pctl 90-96.9, fct_llm="promoted_partial"); a row with NO actionable
        field is one of the floors it can fail (the P1.3 fail-open ends here — C8 of the Phase
        1 review). A row that carries actionable: false is still skipped entirely, unchanged.
      - m cannot be resolved (both mos_vs_base_pct and mos_vs_median_pct absent) -> no
        promotion at all, fct_llm_note="no_mos". m is NEVER defaulted to 0.0.
      - hold -> monitor always: pctl = clamp(75 + m*0.2, 70, 89).
      - overvalued -> pass always: pctl = clamp(35 + m*0.5, 0, 69), fct_llm="demoted".
      - Conviction for the low-quality-overvalued veto reads the overlay row's own
        conviction_score first; the depth_reports/{T}.json prose parser
        (scripts/depth_conviction.py) is used only when that field is None.
      - thesis_status == "breached" (when present) blocks promotion, fct_llm_note=
        "thesis_breached".

    There is NO live-price MoS recompute — `direction` is the frozen producer verdict, so no
    daily cliff exists for prices to churn across.

    Preserves the fct_percentile_llm / fct_llm_veto / fct_band_llm / fct_llm / fct_llm_verdict
    output names that lib/desk/rankings.ts reads; adds fct_llm_note and fct_llm_gate_version.
    """
    try:
        ov = (json.loads((DATA / "depth_overlay.json").read_text(encoding="utf-8")) or {}).get("tickers", {})
    except Exception:
        return 0
    if not ov:
        return 0
    conv_map = depth_conviction.load_conviction_map(DATA / "depth_reports", ov.keys())
    CONV_VETO = 8.0   # operator decision 2026-08-26: reject overvalued names below this /15 quality
    clamp = lambda x, lo, hi: max(lo, min(hi, x))
    applied = 0
    for t, v in ov.items():
        e = results.get(t)
        if not e or e.get("fct_veto") is not None:
            continue
        direction = v.get("direction")
        # NOT_USABLE / missing = a malfunction, not a verdict: read as silence.
        if direction not in ("undervalued", "hold", "overvalued"):
            continue
        if v.get("actionable") is False:
            continue
        actionable_true = v.get("actionable") is True

        # m: mos_vs_base_pct first, mos_vs_median_pct as a noted fallback. Never defaulted —
        # 0.0 is a value, an absent MoS is an absence and blocks any band assignment below.
        mos_base = v.get("mos_vs_base_pct")
        mos_median = v.get("mos_vs_median_pct")
        if isinstance(mos_base, (int, float)):
            m = mos_base
            mos_note = None
        elif isinstance(mos_median, (int, float)):
            m = mos_median
            mos_note = "mos_median_fallback"
        else:
            m = None
            mos_note = "no_mos"

        conv = v.get("conviction_score")
        if not isinstance(conv, (int, float)):
            conv = conv_map.get(t)

        e["fct_llm_verdict"] = {"direction": direction, "size_hint": v.get("size_hint"),
                                "mos_vs_base_pct": mos_base, "mos_vs_median_pct": mos_median,
                                "conviction": conv, "thesis_status": v.get("thesis_status"),
                                "median_iv": v.get("median_iv"), "iv_band_low": v.get("iv_band_low"),
                                "iv_band_high": v.get("iv_band_high"), "spread_pct": v.get("spread_pct"),
                                "date": v.get("date"), "scheme": v.get("scheme")}
        e["fct_llm"] = "none"
        e["fct_llm_veto"] = None
        e["fct_llm_note"] = mos_note
        e["fct_llm_gate_version"] = FCT_LLM_GATE_VERSION

        if m is None:
            applied += 1
            continue   # no_mos: no promotion, no band — never a guessed m.

        # DIRECTION drives the band; m only orders WITHIN a band so the site's percentile-delta
        # stays monotonic. Conviction is NOT in the band — it gates only the veto below.
        if direction == "undervalued":
            thesis_breached = v.get("thesis_status") == "breached"
            fct_pctl = e.get("fct_percentile")
            floors_ok = (
                actionable_true
                and isinstance(fct_pctl, (int, float)) and fct_pctl >= 70.0
                and m >= 10.0
                and not thesis_breached
            )
            if floors_ok:
                pctl_val = clamp(97.0 + m * 0.05, 97.0, 100.0)   # deeper discount ranks higher
                if e.get("fct_band") != "research_now":
                    e["fct_llm"] = "promoted"
            else:
                pctl_val = clamp(90.0 + m * 0.05, 90.0, 96.9)
                e["fct_llm"] = "promoted_partial"
                if thesis_breached:
                    e["fct_llm_note"] = "thesis_breached"
                elif mos_note:
                    e["fct_llm_note"] = mos_note
        elif direction == "overvalued":
            pctl_val = clamp(35.0 + m * 0.5, 0.0, 69.0)
            e["fct_llm"] = "demoted"
            # Hard-reject ONLY the low-quality overvalued: no value edge AND no quality edge. A
            # high-conviction overvalued name is a pullback candidate -> watchlist, not a reject.
            # Missing conviction never vetoes (cannot confirm low quality).
            if conv is not None and conv < CONV_VETO:
                e["fct_llm_veto"] = "llm_reject"
        else:  # hold — price inside the model's band, no directional edge
            pctl_val = clamp(75.0 + m * 0.2, 70.0, 89.0)
        e["fct_percentile_llm"] = round(pctl_val, 1)
        e["fct_band_llm"] = _reband(pctl_val)
        applied += 1
    return applied


# ── C12 (PHASE_3_APPROVAL.md): door formulas, the falling-knife floor, the champion rule and
# band hysteresis, extracted out of main() so tests call this production code directly instead
# of re-implementing the logic inline. ───────────────────────────────────────────────────────

DOOR1_BASE_WEIGHTS = {"quality": 0.45, "momentum": 0.35, "revisions": 0.20}
DOOR2_BASE_WEIGHTS = {"value": 0.40, "exp_gap": 0.40, "quality": 0.20}


def score_door1(
    z_qual: Optional[float], z_mom: Optional[float], z_rev: Optional[float],
) -> Tuple[Optional[float], List[str], Optional[float], Optional[str]]:
    """Door 1 (Secular Compounders): requires z_qual AND z_mom; revisions optional, and the
    weights renormalise over whichever pillars are present (no `else 0.0` imputation). Returns
    (score, pillars_used, weight_scale, ineligible_reason)."""
    if z_qual is None or z_mom is None:
        missing = []
        if z_qual is None:
            missing.append("missing_z_quality")
        if z_mom is None:
            missing.append("missing_z_momentum")
        return None, [], None, "_and_".join(missing)
    if z_rev is not None:
        score = (DOOR1_BASE_WEIGHTS["quality"] * z_qual + DOOR1_BASE_WEIGHTS["momentum"] * z_mom
                 + DOOR1_BASE_WEIGHTS["revisions"] * z_rev)
        return score, ["quality", "momentum", "revisions"], 1.0, None
    present_w = DOOR1_BASE_WEIGHTS["quality"] + DOOR1_BASE_WEIGHTS["momentum"]
    scale = round(1.0 / present_w, 4)
    score = (DOOR1_BASE_WEIGHTS["quality"] / present_w) * z_qual + (DOOR1_BASE_WEIGHTS["momentum"] / present_w) * z_mom
    return score, ["quality", "momentum"], scale, None


def score_door2(
    z_val: Optional[float], z_gap: Optional[float], z_qual: Optional[float],
) -> Tuple[Optional[float], List[str], Optional[float], Optional[str]]:
    """Door 2 (Value / Expectations Gap): requires z_val; z_gap and z_qual optional, weights
    renormalise over whichever pillars are present. Returns (score, pillars_used, weight_scale,
    ineligible_reason)."""
    if z_val is None:
        return None, [], None, "missing_z_value"
    present = [("value", DOOR2_BASE_WEIGHTS["value"], z_val)]
    if z_gap is not None:
        present.append(("exp_gap", DOOR2_BASE_WEIGHTS["exp_gap"], z_gap))
    if z_qual is not None:
        present.append(("quality", DOOR2_BASE_WEIGHTS["quality"], z_qual))
    pillars_used = [name for name, _, _ in present]
    sum_w = sum(w for _, w, _ in present)
    scale = round(1.0 / sum_w, 4)
    score = sum((w / sum_w) * val for _, w, val in present)
    return score, pillars_used, scale, None


def compute_pillar_sd(
    scored_tickers: List[str], raw_pillars: Dict[str, Dict[str, Optional[float]]],
    pillar_names: Tuple[str, ...],
) -> Tuple[Dict[str, Optional[float]], Dict[str, Optional[float]], List[str]]:
    """Cross-sectional sd of each pillar over the scored set. A pillar with fewer than 2 values,
    or sd == 0 / non-finite, is degenerate (left undivided downstream, excluded from
    effective_weights). Returns (pillar_sd_rounded, pillar_sd_exact, pillar_sd_degenerate)."""
    pillar_sd: Dict[str, Optional[float]] = {}
    pillar_sd_exact: Dict[str, Optional[float]] = {}
    pillar_sd_degenerate: List[str] = []
    for p_name in pillar_names:
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
    return pillar_sd, pillar_sd_exact, pillar_sd_degenerate


def compute_effective_weights(
    base_weights: Dict[str, float], pillar_sd_exact: Dict[str, Optional[float]],
) -> Dict[str, float]:
    """Effective weights: {pillar: w * sd / sum(w * sd)}, falling back to the nominal base
    weights (rounded) when every present pillar is degenerate (sum <= 0)."""
    weighted = {
        k: base_weights[k] * (pillar_sd_exact[k] if pillar_sd_exact.get(k) is not None else 0.0)
        for k in base_weights
    }
    total = sum(weighted.values())
    if total > 0:
        return {k: round(v / total, 4) for k, v in weighted.items()}
    return {k: round(base_weights[k], 4) for k in base_weights}


def standardize_pillar_value(
    raw_val: Optional[float], sd_exact: Optional[float], degenerate: bool, use_unit_variance: bool,
) -> Optional[float]:
    """Unit-variance standardisation of one pillar value: divide by its cross-sectional sd
    unless the pillar is degenerate, sd is unusable, or unit-variance is disabled — in which
    case the raw value passes through undivided. None stays None."""
    if raw_val is None:
        return None
    if not use_unit_variance:
        return raw_val
    if degenerate or sd_exact is None or sd_exact <= 0:
        return raw_val
    return raw_val / sd_exact


def evaluate_falling_knife(
    z_mom_pub: Optional[float], floor: float, regime_shift_down: bool,
) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """P3.3 Door-2 falling-knife floor: a name is a knife when its published z_momentum (the
    P3.13 blend) is below `floor`, OR `regime_shift_down` is true — checked on the PUBLISHED z,
    never Door 1's own sector-neutral-only feed (P3.14). A missing z_momentum is eligible
    (never silently gated) and flagged `momentum_missing` instead.

    Returns (d2_eligible, flag_to_add, falling_knife_detail) — flag_to_add is
    "momentum_missing", "falling_knife", or None."""
    if z_mom_pub is None:
        return True, "momentum_missing", None
    is_knife = (z_mom_pub < floor) or regime_shift_down
    if is_knife:
        detail = {"z_momentum": z_mom_pub, "floor": floor, "regime_shift_down": regime_shift_down}
        return False, "falling_knife", detail
    return True, None, None


def compute_best_pctl(
    score_door1_val: Optional[float], score_door2_val: Optional[float],
    pctl_d1: Optional[float], pctl_d2: Optional[float], d2_eligible: bool,
) -> Optional[float]:
    """A falling knife (d2_eligible=False) keeps score_door2/pctl_d2 for display, but best_pctl
    never uses them — it is pctl_d1 alone (or None if Door 1 didn't score it either).
    Returns None if no eligible door scored the name (C2: present door percentiles only)."""
    candidates = []
    if score_door1_val is not None and pctl_d1 is not None:
        candidates.append(pctl_d1)
    if score_door2_val is not None and pctl_d2 is not None and d2_eligible:
        candidates.append(pctl_d2)
    return max(candidates) if candidates else None


def is_double_door_champion(pctl_d1: Optional[float], pctl_d2: Optional[float], d2_eligible: bool) -> bool:
    """P3.4: DOUBLE_DOOR_CHAMPION requires both percentiles >= 90 AND d2_eligible (a falling
    knife can never be a champion, even at high raw scores)."""
    if pctl_d1 is None or pctl_d2 is None:
        return False
    return pctl_d1 >= 90.0 and pctl_d2 >= 90.0 and d2_eligible


def champion_bonus(nominated_doors: List[str]) -> float:
    """P3.4: the priority-queue ranking bonus for a DOUBLE_DOOR_CHAMPION."""
    return 2.0 if "DOUBLE_DOOR_CHAMPION" in nominated_doors else 0.0


def priority_sort_key_for_profile(p: Dict[str, Any]) -> float:
    """RS2 priority-queue ranking key: best_pctl plus the champion bonus."""
    best = p.get("best_pctl")
    val = best if best is not None else -1.0
    return val + champion_bonus(p.get("nominated_doors", []))


def apply_band_hysteresis(
    all_ranked: List[str], rank_by_ticker: Dict[str, int], prev_rn: Set[str], prev_book: Set[str],
    rn_buffer_rank: int, book_buffer_rank: int, rn_cutoff: int = 50, book_cutoff: int = 135,
) -> Tuple[Set[str], Set[str]]:
    """P3.5 band hysteresis: rank <= rn_cutoff -> research_now; rank <= rn_buffer_rank AND
    previously research_now -> stays research_now; rank <= book_cutoff -> watchlist; rank <=
    book_buffer_rank AND previously in the book -> stays watchlist. Returns (rn_set, wl_set)."""
    rn_set: Set[str] = set()
    wl_set: Set[str] = set()
    for t in all_ranked:
        r = rank_by_ticker[t]
        if r <= rn_cutoff:
            rn_set.add(t)
        elif r <= rn_buffer_rank and t in prev_rn:
            rn_set.add(t)
        elif r <= book_cutoff:
            wl_set.add(t)
        elif r <= book_buffer_rank and t in prev_book:
            wl_set.add(t)
    return rn_set, wl_set


def main():
    print("=" * 80)
    print("TIER 2 DUAL-DOOR SIFTER (PROD V2 - CLUSTER GUARDRAILS & CORE/SATELLITE)")
    print("=" * 80)

    sifter_cfg_path = globals().get("SIFTER_CONFIG_PATH", Path(__file__).resolve().parent / "sifter_config.json")
    if not sifter_cfg_path.exists():
        sifter_cfg_path = globals().get("MOMENTUM_CONFIG_PATH", Path(__file__).resolve().parent / "momentum_config.json")
    door2_momentum_floor = float(globals().get("DOOR2_MOMENTUM_FLOOR", _load_door2_momentum_floor(sifter_cfg_path)))
    momentum_universe_weight = float(globals().get("MOMENTUM_UNIVERSE_WEIGHT", _load_momentum_universe_weight(sifter_cfg_path)))
    rn_buffer_rank, book_buffer_rank = _load_hysteresis_ranks(sifter_cfg_path)
    default_cycle_window, cluster_cycle_windows = _load_mid_cycle_config(sifter_cfg_path)
    veto_switches = globals().get("VETO_SWITCHES", _load_veto_switches(sifter_cfg_path))
    default_altman_min, sector_altman_map = _load_altman_thresholds()
    sector_altman_map = {**sector_altman_map, **_load_altman_sector_overrides(sifter_cfg_path)}
    # P3.6b: altman_z and beneish_standalone are permanently flag-only (never read the switch
    # below — see the forensic block). no_liquidity_data is untouched by P3.6b.
    switch_no_liquidity_data = bool(veto_switches.get("no_liquidity_data", False))

    # Read previous factor_scores.json before anything overwrites it (P3.5 band hysteresis)
    prev_factor_raw = None
    prev_factor_path = globals().get("PREVIOUS_FACTOR_SCORES_PATH")
    if prev_factor_path is None:
        if FACTOR_SCORES_COMPAT_JSON.exists():
            prev_factor_path = FACTOR_SCORES_COMPAT_JSON
        elif (DATA / "factor_scores.json").exists():
            prev_factor_path = DATA / "factor_scores.json"

    if prev_factor_path and Path(prev_factor_path).exists():
        try:
            prev_factor_raw = json.loads(Path(prev_factor_path).read_text(encoding="utf-8"))
        except Exception:
            prev_factor_raw = None

    EXPECTED_ENGINE = "dual_door_dynamic_macro_v2_cluster_guarded"
    if prev_factor_raw is None or prev_factor_raw.get("engine") != EXPECTED_ENGINE:
        has_previous = False
        hysteresis_status = "no_previous_run"
        prev_rn = set()
        prev_book = set()
        prev_door3: Set[str] = set()
    else:
        has_previous = True
        hysteresis_status = "applied"
        prev_tickers = prev_factor_raw.get("tickers", {})
        prev_rn = {t for t, d in prev_tickers.items() if d.get("fct_band") == "research_now"}
        prev_book = {t for t, d in prev_tickers.items() if d.get("fct_band") in ("research_now", "watchlist")}
        # P3.14: previous Door-3 names, for the Door-3 hysteresis rule below.
        prev_door3 = {t for t, d in prev_tickers.items()
                      if "DOOR_3_TREND_LEADER" in (d.get("fct_nominated_doors") or [])}

    sync_result = sync_mri_snapshot()
    if sync_result is None:
        print("MRI snapshot sync: MRI outputs directory not found, snapshot left as-is.")
    else:
        print(f"MRI snapshot sync: {len(sync_result['files'])} files copied from {sync_result['source_dir']}")

    stocks_raw = load_json(STOCKS_JSON, {})
    if isinstance(stocks_raw, list):
        stocks = {s.get("symbol"): s for s in stocks_raw if s.get("symbol")}
    else:
        stocks = stocks_raw

    prices_raw = load_json(PRICE_HISTORY_JSON, {})
    prices = prices_raw.get("prices", prices_raw.get("tickers", prices_raw)) if isinstance(prices_raw, dict) else {}

    fundamentals_raw = load_json(FUNDAMENTALS_HISTORY_JSON, {})
    fundamentals = fundamentals_raw.get("tickers", fundamentals_raw.get("fundamentals", fundamentals_raw)) if isinstance(fundamentals_raw, dict) else {}

    battery_raw = load_json(BATTERY_JSON, {})
    battery = battery_raw.get("tickers", battery_raw.get("battery", battery_raw)) if isinstance(battery_raw, dict) else {}

    eps_traj = load_json(EPS_TRAJECTORY_JSON, {})
    if isinstance(eps_traj, dict) and "tickers" in eps_traj and isinstance(eps_traj["tickers"], dict):
        eps_traj = eps_traj["tickers"]

    # Load Tier 1 hygiene survivors if present
    survivor_tickers: Optional[Set[str]] = None
    # P3.10: names Tier 1 flagged ALTERNATE_REPORTING (foreign issuer, no US XBRL) so the
    # NO_FUNDAMENTAL_HISTORY veto below can say why instead of looking like a data hole.
    alternate_reporting_tickers: Set[str] = set()
    # P3.10b: survivors whose latest annual period-end is > 16 months old — Tier 1 no longer
    # vetoes these (our fundamentals_history lag, not proof of SEC delinquency); it flags them
    # instead, and that flag rides through here onto fct_flags (SCR-03b).
    stale_annual_data_map: Dict[str, Dict[str, Any]] = {}
    if TIER1_SURVIVORS_JSON.exists():
        surv_data = load_json(TIER1_SURVIVORS_JSON, {})
        survivor_tickers = set(surv_data.get("survivor_tickers", []))
        alternate_reporting_tickers = set(surv_data.get("alternate_reporting", []))
        stale_annual_data_map = surv_data.get("stale_annual_data", {}) or {}
        print(f"Loaded {len(survivor_tickers)} clean survivors from Tier 1 Hygiene filter.")

    all_tickers = sorted(stocks.keys())
    sector_by_ticker = {t: stocks[t].get("sector") or "Unknown" for t in all_tickers}

    # Taxonomy enrichment
    taxonomy_by_ticker = {}
    for t in all_tickers:
        s = stocks[t]
        raw_ind = s.get("industry")
        sec = s.get("sector") or "Unknown"
        taxonomy_by_ticker[t] = get_taxonomy_profile(raw_ind, sec)

    raw: Dict[str, Dict[str, Optional[float]]] = {
        # Quality
        "roic_proxy": {}, "gm_stability": {}, "neg_accruals": {}, "f_score": {},
        # Momentum
        "skip_12_1": {}, "high_52w": {},
        # Revisions
        "eps_slope": {},
        # Value
        "fcf_yield": {}, "owner_yield": {}, "ebit_yield": {},
        # Expectations Gap
        "exp_gap": {}
    }

    # Load momentum state (SCR-10) with freshness check and fallback
    momentum_state_path = globals().get("MOMENTUM_STATE_JSON", DATA / "momentum_state.json")
    if not momentum_state_path.exists() and (DATA / "momentum_state.json").exists():
        momentum_state_path = DATA / "momentum_state.json"

    momentum_source = "momentum_state"
    momentum_data: Dict[str, Any] = {}
    is_fresh = False

    if momentum_state_path.exists():
        try:
            mom_payload = json.loads(momentum_state_path.read_text(encoding="utf-8"))
            asof_str = mom_payload.get("asof")
            mtime = momentum_state_path.stat().st_mtime
            age_days = (datetime.now(timezone.utc).timestamp() - mtime) / 86400.0
            if asof_str:
                for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
                    try:
                        asof_dt = datetime.strptime(asof_str.split(".")[0].rstrip("Z"), fmt.rstrip("Z")).replace(tzinfo=timezone.utc)
                        age_days = (datetime.now(timezone.utc) - asof_dt).total_seconds() / 86400.0
                        break
                    except ValueError:
                        continue
            if age_days <= 3.0:
                is_fresh = True
                momentum_data = mom_payload.get("tickers", {})
                print(f"Loaded fresh momentum state ({len(momentum_data)} tickers, age {age_days:.1f} days)")
            else:
                print(f"WARN: momentum_state.json is stale ({age_days:.1f} days old > 3 days) — triggering fallback!", file=sys.stderr)
        except Exception as exc:
            print(f"WARN: failed to load momentum_state.json: {exc} — triggering fallback!", file=sys.stderr)

    if not is_fresh:
        momentum_source = "inline_fallback"
        print("MOMENTUM WARNING: Using inline fallback from price_history.json (loud notice)!", file=sys.stderr)

    ticker_mom_state: Dict[str, Dict[str, Any]] = {}
    ticker_flags: Dict[str, List[str]] = {}

    for t in all_tickers:
        t_flags: List[str] = []
        t_mom: Dict[str, Any] = {}
        if momentum_source == "momentum_state":
            entry = momentum_data.get(t, {})
            t_mom = dict(entry)
            if "pct_from_52w_high" not in entry and "high_52w_proxy" in entry:
                t_flags.append("momentum_proxy_monthly")
        else:
            closes = prices.get(t)
            if isinstance(closes, list) and len(closes) >= 2:
                m121 = compute_skip_month_return(closes)
                if m121 is not None:
                    t_mom["mom_12_1"] = round(m121, 4)
                prox = compute_high_proximity(closes)
                if prox is not None:
                    t_mom["high_52w_proxy"] = round(prox - 1.0, 4)
                    t_flags.append("momentum_proxy_monthly")
        # P3.14b: trend-continuity, from price_history's own monthly closes — the same window
        # score_paradigm uses for 12-1 — regardless of momentum_source, since momentum_state.json
        # does not carry the underlying monthly closes (PHASE_3_ADDENDUM.md P3.14b).
        trend = compute_trend_continuity(prices.get(t), t_mom.get("mom_12_1"))
        t_mom["jump_share"] = trend["jump_share"]
        t_mom["up_months"] = trend["up_months"]
        t_mom["usable_months"] = trend["usable_months"]
        ticker_mom_state[t] = t_mom
        ticker_flags[t] = t_flags

    ticker_mid_cycle: Dict[str, Dict[str, Any]] = {}
    vetoes: Dict[str, str] = {}
    veto_detail: Dict[str, str] = {}
    # P3.6b: values for the new flag-only forensic/solvency flags, keyed ticker -> flag name ->
    # detail dict, so the analyst pack can print what tripped the flag (fct_flags itself stays
    # a plain list of names, same shape every other consumer already expects).
    ticker_flag_detail: Dict[str, Dict[str, Any]] = {}
    # P3.14: market cap and resolved ADV per scored ticker, kept for the Door 3 eligibility
    # check (marketCap >= DOOR3_MIN_MCAP; ADV >= 300k when resolved) without recomputing them.
    ticker_mcap: Dict[str, Optional[float]] = {}
    ticker_adv: Dict[str, Optional[float]] = {}
    eligible_count = 0

    # Names the engine is not ALLOWED to trade, regardless of how they score: gone from the
    # exchange listing (stamped last_listed by fetch_data.py) or declared by hand in
    # not_tradable.json. stocks.json carries records forward and never prunes, so without this
    # a delisted name keeps its last good record and keeps getting nominated — CPRX sat at #6
    # in the universe for 25 days until the broker refused the order.
    untradable, untradable_note = tradability.scan(stocks)
    print(f"Tradability: {untradable_note}")

    # P3.9 (SCR-05): the reverse-DCF discount rate — MRI cost-of-capital anchor when fresh and
    # non-degraded, else the constant fallback (loud, stamped on every row and in the summary).
    coe_anchor, coe_anchor_meta = load_coe_anchor()
    print(f"Cost-of-capital anchor: {coe_anchor_meta['discount_rate_source']} "
          f"(reason={coe_anchor_meta['reason']}, asof={coe_anchor_meta['asof']}, "
          f"age_days={coe_anchor_meta['age_days']})")
    if coe_anchor is None:
        print(f"  WARNING: reverse-DCF discount rate falling back to the "
              f"{CONSTANT_FALLBACK_DISCOUNT_RATE:.0f}% constant — MRI cost-of-capital anchor "
              f"unavailable ({coe_anchor_meta['reason']}).", file=sys.stderr)
    ticker_gap_basis: Dict[str, str] = {}
    ticker_discount_rate_pct: Dict[str, float] = {}

    for t in all_tickers:
        s = stocks[t]
        tax = taxonomy_by_ticker[t]
        archetype = tax["archetype"]
        ind = tax["canonical_industry"]

        # 0. Tradability — checked FIRST so the real reason is reported rather than being
        #    masked by whichever scoring veto happens to fire next.
        if t in untradable:
            vetoes[t] = "NOT_TRADABLE"
            veto_detail[t] = untradable[t]
            continue

        # 1. Tier 1 Pre-condition
        if survivor_tickers is not None and t not in survivor_tickers:
            vetoes[t] = "FAILED_TIER1_HYGIENE"
            continue

        # P3.10b: Tier 1's stale_annual_data flag (data lag, not a statutory veto) rides
        # through onto this name's fct_flags with its detail.
        if t in stale_annual_data_map:
            cur_flags = ticker_flags.setdefault(t, [])
            if "stale_annual_data" not in cur_flags:
                cur_flags.append("stale_annual_data")
            ticker_flag_detail.setdefault(t, {})["stale_annual_data"] = stale_annual_data_map[t]

        mcap = num(s.get("marketCap"))
        price = num(s.get("price"))
        vol = num(s.get("volume"))
        ticker_mcap[t] = mcap

        if not mcap or mcap < MIN_MARKET_CAP:
            vetoes[t] = "MARKET_CAP_BELOW_300M"
            continue
        if not price or price < MIN_SHARE_PRICE:
            vetoes[t] = "PRICE_BELOW_3"
            continue

        # ADV via hygiene_thresholds.py (P3.6c): stocks[t].metrics.adv_20d_usd (new,
        # universe-wide, from the daily fetch) -> momentum_state adv_20d_usd (SCR-10) ->
        # snapshot vol*price (flag adv_single_day) -> none -> NO_LIQUIDITY_DATA (switch-gated).
        fct_mom = ticker_mom_state.get(t, {})
        stocks_adv_20d = num((s.get("metrics") or {}).get("adv_20d_usd"))
        mom_adv_20d = num(fct_mom.get("adv_20d_usd"))
        adv, adv_flag = resolve_adv_usd(stocks_adv_20d, mom_adv_20d, vol, price)
        ticker_adv[t] = adv
        if adv_flag is not None:
            cur_flags = ticker_flags.setdefault(t, [])
            if adv_flag not in cur_flags:
                cur_flags.append(adv_flag)

        if adv is None:
            if switch_no_liquidity_data:
                vetoes[t] = "NO_LIQUIDITY_DATA"
                continue
            else:
                cur_flags = ticker_flags.setdefault(t, [])
                if "no_liquidity_data" not in cur_flags:
                    cur_flags.append("no_liquidity_data")
        elif adv < MIN_ADV_DOLLAR:
            vetoes[t] = "ILLIQUID_ADV_BELOW_300K"
            continue

        if ind in ("Shell Companies", "Blank Check"):
            vetoes[t] = "NON_OPERATING_SHELL_SPAC"
            continue

        # 2. Hard Forensic & Insolvency Vetoes (P3.6b — flag large caps instead of culling)
        bat = battery.get(t, {})
        acc = num(bat.get("accruals_ratio"))
        m_score = num(bat.get("m_score"))
        f_score = num(bat.get("f_score"))
        net_iss_1y = num(bat.get("net_issuance_1y"))
        sector = s.get("sector") or "Unknown"

        # FORENSIC_MANIPULATION_RISK (P3.6b): the old combined rule (m_score > -1.78 AND
        # accruals > 0.10) culled NVDA and every large-cap AI/semi name with hypergrowth
        # working capital — Beneish's sales-growth index is known to flag fast growers, not
        # just manipulators. Now it vetoes only the tight case: accruals > 0.20 AND
        # m_score > -1.78 AND sector isn't structurally accrual-heavy (Financials/Real
        # Estate) AND market cap is below the large-cap flag-only floor. Everything the old
        # rule would have caught, and every accruals > 0.20 name (any sector), is a flag —
        # never silently gated for a name an analyst can look at directly.
        forensic_accruals_over_20 = acc is not None and acc > 0.20
        forensic_m_score_elevated = m_score is not None and m_score > -1.78
        forensic_old_rule_fired = forensic_m_score_elevated and acc is not None and acc > 0.10
        forensic_sector_exempt = sector in FORENSIC_VETO_EXEMPT_SECTORS
        forensic_large_cap_exempt = mcap >= LARGE_CAP_FLAG_ONLY_USD
        if (forensic_accruals_over_20 and forensic_m_score_elevated
                and not forensic_sector_exempt and not forensic_large_cap_exempt):
            vetoes[t] = "FORENSIC_MANIPULATION_RISK"
            continue
        if forensic_accruals_over_20 or forensic_old_rule_fired:
            cur_flags = ticker_flags.setdefault(t, [])
            if "forensic_red_flag" not in cur_flags:
                cur_flags.append("forensic_red_flag")
            if forensic_accruals_over_20 and forensic_m_score_elevated and forensic_sector_exempt:
                forensic_reason = "sector_exempt"
            elif forensic_accruals_over_20 and forensic_m_score_elevated and forensic_large_cap_exempt:
                forensic_reason = "large_cap_flag_only"
            elif forensic_accruals_over_20:
                forensic_reason = "accruals_over_0.20"
            else:
                forensic_reason = "legacy_combined_rule_accruals_over_0.10"
            ticker_flag_detail.setdefault(t, {})["forensic_red_flag"] = {
                "accruals": acc, "m_score": m_score, "reason": forensic_reason,
            }

        # Beneish standalone (P3.6b): never a veto — the M-score's sales-growth index (SGI) is
        # biased toward fast organic growers, not just manipulators. Flag only, with the
        # M-score value attached for the analyst. beneish_unverifiable (inputs missing) is
        # unchanged.
        m_inputs_missing = bat.get("m_score_inputs_missing")
        beneish_inputs_complete = (isinstance(m_inputs_missing, list) and len(m_inputs_missing) == 0) or (isinstance(m_inputs_missing, (int, float)) and m_inputs_missing == 0)
        if m_score is not None and beneish_inputs_complete and m_score > -1.78:
            cur_flags = ticker_flags.setdefault(t, [])
            if "beneish_flag" not in cur_flags:
                cur_flags.append("beneish_flag")
            ticker_flag_detail.setdefault(t, {})["beneish_flag"] = {
                "m_score": m_score,
                "_note": "Beneish M-score standalone is flag-only, never a veto: the sales-growth index is biased toward fast organic growers.",
            }
        elif not beneish_inputs_complete:
            cur_flags = ticker_flags.setdefault(t, [])
            if "beneish_unverifiable" not in cur_flags:
                cur_flags.append("beneish_unverifiable")

        # Altman Z from stocks[t].metrics.zScore with reverse_config sector_altman_z_min /
        # altman_z_min 1.8, plus the sifter's own Utilities override (P3.6b). Warning flag
        # only, never a veto: the discriminant model isn't a valid solvency test for every
        # sector and a >5%-of-survivors veto rate was the P3.6 STOP condition.
        metrics = s.get("metrics") or {}
        altman_z = num(metrics.get("zScore"))
        z_min = sector_altman_map.get(sector, default_altman_min)
        if altman_z is not None and altman_z < z_min:
            cur_flags = ticker_flags.setdefault(t, [])
            if "insolvency_distress_altman_z" not in cur_flags:
                cur_flags.append("insolvency_distress_altman_z")
            ticker_flag_detail.setdefault(t, {})["insolvency_distress_altman_z"] = {
                "altman_z": altman_z, "z_min": z_min, "sector": sector,
                "_note": "Altman Z is a warning flag only, never a veto.",
            }

        # Sloan accruals flag (> 0.20)
        if acc is not None and acc > 0.20:
            cur_flags = ticker_flags.setdefault(t, [])
            if "heavy_accruals" not in cur_flags:
                cur_flags.append("heavy_accruals")

        # Issuance flag: net_issuance_1y > 0.10
        if net_iss_1y is not None and net_iss_1y > 0.10:
            cur_flags = ticker_flags.setdefault(t, [])
            if "heavy_issuance" not in cur_flags:
                cur_flags.append("heavy_issuance")

        ydata = fundamentals.get(t, {})
        years = sorted([int(y) for y in ydata.keys()])
        if not years:
            vetoes[t] = "NO_FUNDAMENTAL_HISTORY"
            if t in alternate_reporting_tickers:
                veto_detail[t] = "alternate_reporting_unverified"
            continue

        latest_y = str(years[-1])
        latest = ydata[latest_y]
        rev = num(latest.get("revenue"))
        op = num(latest.get("operating_income"))
        ni = num(latest.get("net_income"))
        da = num(latest.get("da"))
        capex = num(latest.get("capex"))
        ocf = num(latest.get("ocf")) or ((ni + da) if ni is not None and da is not None else None)
        fcf = num(latest.get("fcf")) or ((ocf - capex) if ocf is not None and capex is not None else None)
        lt_debt = num(latest.get("lt_debt")) or 0.0
        cash = num(latest.get("cash")) or 0.0
        equity = num(latest.get("equity"))
        ev = mcap + lt_debt - cash

        # CHRONIC_OPERATING_LOSS_LEVERAGE (P3.6b): a single fiscal year's numbers shouldn't cull
        # a large cap outright — CRWV/NBIS/IREN/CIFR were vetoed on one year of AI-buildout
        # capex. Same large-cap rule as the forensic vetoes: veto only below the flag-only
        # floor; at or above it, flag with the raw numbers for the analyst.
        if fcf is not None and fcf < 0 and op is not None and op < 0 and lt_debt > 1e9:
            if mcap < LARGE_CAP_FLAG_ONLY_USD:
                vetoes[t] = "CHRONIC_OPERATING_LOSS_LEVERAGE"
                continue
            cur_flags = ticker_flags.setdefault(t, [])
            if "loss_making_leveraged" not in cur_flags:
                cur_flags.append("loss_making_leveraged")
            ticker_flag_detail.setdefault(t, {})["loss_making_leveraged"] = {
                "fcf": fcf, "operating_income": op, "lt_debt": lt_debt,
            }

        eligible_count += 1

        # ── 3. Tailored Corporate Finance Archetype Metrics ──
        if archetype in ("commercial_bank", "insurance_lending"):
            # Commercial Banks & Insurance: Earnings Yield & ROE (Deposits are operating liabilities)
            if ni is not None and mcap > 0:
                raw["fcf_yield"][t] = ni / mcap
                raw["owner_yield"][t] = ni / mcap
            raw["ebit_yield"][t] = None
            if ni is not None and equity and equity > 0:
                raw["roic_proxy"][t] = ni / equity
            else:
                raw["roic_proxy"][t] = None

        elif archetype == "real_estate_reit":
            # Real Estate (REITs): Funds from Operations (OCF / MCap) bypassing building depreciation
            if ocf is not None and mcap > 0:
                raw["fcf_yield"][t] = ocf / mcap
                raw["owner_yield"][t] = ocf / mcap
            raw["ebit_yield"][t] = None
            if ocf is not None and equity and equity > 0:
                raw["roic_proxy"][t] = ocf / equity
            else:
                raw["roic_proxy"][t] = None

        elif archetype == "commodity_cyclical":
            # Commodity Cyclicals: Normalized Mid-Cycle Cash Flow by Cluster (P3.7)
            cluster = tax["cluster"]
            target_window = cluster_cycle_windows.get(cluster, default_cycle_window)
            window_years = years[-target_window:]
            past_fcfs = []
            for y in window_years:
                y_row = ydata.get(str(y), {})
                y_fcf = num(y_row.get("fcf"))
                if y_fcf is not None:
                    past_fcfs.append(y_fcf)

            years_used = len(past_fcfs)
            if past_fcfs:
                mid_cycle_fcf = sum(past_fcfs) / len(past_fcfs)
            else:
                mid_cycle_fcf = fcf
                years_used = 1 if fcf is not None else 0

            cur_flags = ticker_flags.setdefault(t, [])
            if target_window == 8 and years_used < 5:
                if "mid_cycle_short_history" not in cur_flags:
                    cur_flags.append("mid_cycle_short_history")

            ticker_mid_cycle[t] = {
                "window_years": target_window,
                "years_used": years_used,
            }

            if mid_cycle_fcf is not None and mcap > 0:
                raw["fcf_yield"][t] = mid_cycle_fcf / mcap
                raw["owner_yield"][t] = mid_cycle_fcf / mcap
            if op is not None and ev > 0:
                raw["ebit_yield"][t] = op / ev
                raw["roic_proxy"][t] = op / ev

        else:
            # Standard Industrial / Tech Compounders
            if fcf is not None and mcap > 0:
                raw["fcf_yield"][t] = fcf / mcap
            if None not in (ni, da, capex) and mcap > 0:
                raw["owner_yield"][t] = (ni + da - capex) / mcap
            if op is not None and ev > 0:
                raw["ebit_yield"][t] = op / ev
                raw["roic_proxy"][t] = op / ev

        if acc is not None:
            raw["neg_accruals"][t] = -acc
        if f_score is not None:
            raw["f_score"][t] = f_score

        if len(years) >= 4:
            margins = []
            for y in years:
                row = ydata[str(y)]
                gp_y, rev_y = num(row.get("gross_profit")), num(row.get("revenue"))
                if gp_y and rev_y and rev_y > 0:
                    margins.append(gp_y / rev_y)
            if len(margins) >= 4:
                raw["gm_stability"][t] = -statistics.pstdev(margins)

        # Momentum (SCR-10)
        mom_entry = ticker_mom_state.get(t, {})
        raw["skip_12_1"][t] = mom_entry.get("mom_12_1")
        if "pct_from_52w_high" in mom_entry and mom_entry["pct_from_52w_high"] is not None:
            raw["high_52w"][t] = mom_entry["pct_from_52w_high"]
        elif "high_52w_proxy" in mom_entry and mom_entry["high_52w_proxy"] is not None:
            raw["high_52w"][t] = mom_entry["high_52w_proxy"]
        else:
            raw["high_52w"][t] = None

        # EPS Revisions Slope
        traj = eps_traj.get(t, {})
        slope = num(traj.get("trajectory_slope"))
        if slope is not None:
            raw["eps_slope"][t] = slope

        # Expectations Gap Calculation
        num_years = max(1, years[-1] - years[0])
        oldest = ydata[str(years[0])]
        rev_old = num(oldest.get("revenue"))
        if rev and rev_old and rev_old > 0 and num_years >= 3:
            hist_cagr = (rev / rev_old) ** (1.0 / num_years) - 1.0
            if archetype in ("commercial_bank", "insurance_lending"):
                if ni and ni > 0 and mcap > 0:
                    implied_g = 0.10 - (ni / mcap)
                    gap = (hist_cagr - implied_g) * 100.0
                    raw["exp_gap"][t] = max(-15.0, min(15.0, gap))
            elif archetype == "real_estate_reit":
                if ocf and ocf > 0 and mcap > 0:
                    implied_g = 0.08 - (ocf / mcap)
                    gap = (hist_cagr - implied_g) * 100.0
                    raw["exp_gap"][t] = max(-15.0, min(15.0, gap))
            else:
                # C2: None in (ni, da, capex) -> owner_earn falls back to fcf, matching owner_cf_cagr_5y
                owner_earn = (ni + da - capex) if None not in (ni, da, capex) else fcf
                if owner_earn and owner_earn > 0:
                    # P3.9 (SCR-05): gap on one basis — implied growth of the owner-earnings
                    # base vs. the demonstrated 5-year CAGR of that same base; only when that
                    # CAGR is undefined (negative base, too few points) does the comparison fall
                    # back to the revenue CAGR already computed above.
                    owner_cagr = owner_cf_cagr_5y(ydata, years)
                    if owner_cagr is not None:
                        used_cagr, gap_basis = owner_cagr, "owner_cf"
                    else:
                        used_cagr, gap_basis = hist_cagr, "revenue_fallback"
                    coe_pct, coe_flag = resolve_coe_pct(coe_anchor, tax["mgi_subindustry_id"], sector)
                    if coe_flag:
                        cur_flags = ticker_flags.setdefault(t, [])
                        if coe_flag not in cur_flags:
                            cur_flags.append(coe_flag)
                    gap = solve_reverse_dcf_gap(owner_earn, mcap, coe_pct, used_cagr)
                    raw["exp_gap"][t] = gap
                    ticker_gap_basis[t] = gap_basis
                    ticker_discount_rate_pct[t] = coe_pct

    # Standardize All Features via Sector-Neutral Z
    z_method_chosen = globals().get("Z_METHOD", "winsor")
    z = {metric: sector_neutral_z(vals, sector_by_ticker, method=z_method_chosen) for metric, vals in raw.items()}

    # P3.13: pooled-universe z's for the momentum inputs only — sector-neutral z throws away a
    # sector-wide move, so the momentum pillar also gets to see the un-neutralised version.
    z_universe_momentum = {
        metric: universe_z(raw[metric], method=z_method_chosen)
        for metric in ("skip_12_1", "high_52w")
    }

    def mean_of_available(*values) -> Optional[float]:
        valid = [v for v in values if v is not None]
        return (sum(valid) / len(valid)) if valid else None

    def weighted_mean_of_available(pairs: List[Tuple[Optional[float], float]]) -> Optional[float]:
        """Like mean_of_available, but each present value carries its own weight. Absent
        values drop out entirely (taking their weight with them), so a single present value is
        returned unchanged regardless of its weight — same None handling as mean_of_available."""
        valid = [(v, w) for v, w in pairs if v is not None]
        if not valid:
            return None
        total_w = sum(w for _, w in valid)
        if total_w == 0:
            return mean_of_available(*(v for v, _ in valid))
        return sum(v * w for v, w in valid) / total_w

    # Compute raw pillar z's for scored set (not vetoed)
    scored_tickers = [t for t in all_tickers if t not in vetoes]
    raw_pillars: Dict[str, Dict[str, Optional[float]]] = {}
    # P3.13: sector-neutral / universe momentum parts before the 50/50 blend, kept for the
    # profile fields (z_momentum_sector_neutral, z_momentum_universe) — before unit variance.
    momentum_parts: Dict[str, Tuple[Optional[float], Optional[float]]] = {}
    for t in scored_tickers:
        sn_mom = mean_of_available(z["skip_12_1"].get(t), z["high_52w"].get(t))
        univ_mom = mean_of_available(z_universe_momentum["skip_12_1"].get(t), z_universe_momentum["high_52w"].get(t))
        momentum_parts[t] = (sn_mom, univ_mom)
        raw_pillars[t] = {
            "quality": mean_of_available(z["roic_proxy"].get(t), z["gm_stability"].get(t),
                                         z["neg_accruals"].get(t), z["f_score"].get(t)),
            # P3.14: Door 1's momentum pillar reverts to sector-neutral only — "best in its
            # sector" — so a sector-wide boom no longer feeds Door 1 (that job now belongs to
            # Door 3 alone; see PHASE_3_ADDENDUM.md P3.14, "no concept duplication").
            "momentum": sn_mom,
            # P3.13 blend, kept only for the PUBLISHED z_momentum (P3.3 falling-knife floor) —
            # does not feed Door 1 or Door 2 scoring.
            "momentum_published": weighted_mean_of_available([
                (sn_mom, 1.0 - momentum_universe_weight),
                (univ_mom, momentum_universe_weight),
            ]),
            "revisions": z["eps_slope"].get(t),
            "value": mean_of_available(z["fcf_yield"].get(t), z["owner_yield"].get(t), z["ebit_yield"].get(t)),
            "exp_gap": z["exp_gap"].get(t),
        }

    # Cross-sectional standard deviation over the SCORED set (not vetoed). momentum_published
    # rides the same unit-variance treatment as the rest so the P3.3 floor stays on a
    # comparable scale; it is not one of DOOR1_BASE_WEIGHTS/DOOR2_BASE_WEIGHTS's keys, so it
    # never enters effective_weights or either door's score.
    PILLAR_NAMES = ("quality", "momentum", "momentum_published", "revisions", "value", "exp_gap")
    pillar_sd, pillar_sd_exact, pillar_sd_degenerate = compute_pillar_sd(
        scored_tickers, raw_pillars, PILLAR_NAMES
    )

    effective_weights = {
        "door1": compute_effective_weights(DOOR1_BASE_WEIGHTS, pillar_sd_exact),
        "door2": compute_effective_weights(DOOR2_BASE_WEIGHTS, pillar_sd_exact),
    }

    # Unit variance standardization: divide each pillar by its sd (if not degenerate and UNIT_VARIANCE enabled)
    std_pillars: Dict[str, Dict[str, Optional[float]]] = {}
    use_unit_variance = globals().get("UNIT_VARIANCE", True)
    for t in scored_tickers:
        std_pillars[t] = {}
        for p_name in PILLAR_NAMES:
            std_pillars[t][p_name] = standardize_pillar_value(
                raw_pillars[t][p_name], pillar_sd_exact.get(p_name),
                p_name in pillar_sd_degenerate, use_unit_variance,
            )

    # Compute Door 1 and Door 2 Scores
    scored_profiles: Dict[str, Dict[str, Any]] = {}

    for t in scored_tickers:
        z_qual = std_pillars[t]["quality"]
        z_mom = std_pillars[t]["momentum"]
        z_rev = std_pillars[t]["revisions"]
        z_val = std_pillars[t]["value"]
        z_gap = std_pillars[t]["exp_gap"]

        tax = taxonomy_by_ticker[t]
        sec = tax["sector"]
        cluster = tax["cluster"]

        # Door 1: Secular Compounders (requires z_qual AND z_mom; revisions optional)
        d1_score, d1_pillars_used, d1_weight_scale, d1_ineligible_reason = score_door1(z_qual, z_mom, z_rev)

        # Door 2: Value / Expectations Gap (requires z_val; z_gap and z_qual optional)
        d2_score, d2_pillars_used, d2_weight_scale, d2_ineligible_reason = score_door2(z_val, z_gap, z_qual)

        # P3.14: the PUBLISHED z_momentum (P3.3's falling-knife floor reads this) stays the
        # P3.13 blend even though Door 1's own z_mom above reverted to sector-neutral only.
        z_mom_published = std_pillars[t]["momentum_published"]
        z_mom_pub = round(z_mom_published, 3) if z_mom_published is not None else None

        # P3.3 Door-2 falling-knife floor
        fct_mom = ticker_mom_state.get(t, {})
        regime_shift_down = _resolve_regime_shift_down(fct_mom, ticker_flags.get(t, []))

        cur_flags = list(ticker_flags.get(t, []))
        d2_eligible, knife_flag, falling_knife_detail = evaluate_falling_knife(
            z_mom_pub, door2_momentum_floor, regime_shift_down
        )
        if knife_flag is not None and knife_flag not in cur_flags:
            cur_flags.append(knife_flag)
        if not d2_eligible and d2_ineligible_reason is None:
            d2_ineligible_reason = "falling_knife"

        cand_data = {
            "ticker": t,
            "sector": sec,
            "industry": tax["canonical_industry"],
            "cluster": cluster,
            "archetype": tax["archetype"],
            "mgi_subindustry_id": tax["mgi_subindustry_id"],
            "z_quality": round(z_qual, 3) if z_qual is not None else None,
            "z_momentum": z_mom_pub,
            # P3.14: the value that actually fed Door 1's score (sector-neutral only, unit-
            # variance normalized) — distinct from the published z_momentum above (P3.13 blend).
            "z_momentum_door1": round(z_mom, 3) if z_mom is not None else None,
            "z_momentum_sector_neutral": round(momentum_parts[t][0], 3) if momentum_parts[t][0] is not None else None,
            "z_momentum_universe": round(momentum_parts[t][1], 3) if momentum_parts[t][1] is not None else None,
            # P3.14b: trend-continuity for Door 3 (PHASE_3_ADDENDUM.md P3.14b) — jump_share and
            # up_months from the same 12-1 monthly-close window, also carried in
            # fct_momentum_state.
            "jump_share": ticker_mom_state.get(t, {}).get("jump_share"),
            "up_months": ticker_mom_state.get(t, {}).get("up_months"),
            "z_revisions": round(z_rev, 3) if z_rev is not None else None,
            "z_value": round(z_val, 3) if z_val is not None else None,
            "z_exp_gap": round(z_gap, 3) if z_gap is not None else None,
            # P3.9 (SCR-05): stamped only for names whose exp_gap went through the reverse-DCF
            # branch (banks/REITs are unchanged and never carry these); None is absence, not 0.0.
            "gap_basis": ticker_gap_basis.get(t),
            "discount_rate_pct": ticker_discount_rate_pct.get(t),
            "discount_rate_source": coe_anchor_meta["discount_rate_source"] if t in ticker_discount_rate_pct else None,
            "score_door1": round(d1_score, 3) if d1_score is not None else None,
            "score_door2": round(d2_score, 3) if d2_score is not None else None,
            "door1_pillars_used": d1_pillars_used,
            "door2_pillars_used": d2_pillars_used,
            "door1_weight_scale": d1_weight_scale,
            "door2_weight_scale": d2_weight_scale,
            "door1_ineligible_reason": d1_ineligible_reason,
            "door2_ineligible_reason": d2_ineligible_reason,
            "d2_eligible": d2_eligible,
            "falling_knife_detail": falling_knife_detail,
            "pctl_d1": None,
            "pctl_d2": None,
            "best_pctl": None,
            "nominated_doors": [],
            "fct_momentum_state": ticker_mom_state.get(t, {}),
            "fct_flags": cur_flags,
            "fct_flag_detail": ticker_flag_detail.get(t, {}),
            "mid_cycle_window_years": ticker_mid_cycle.get(t, {}).get("window_years") if t in ticker_mid_cycle else None,
            "mid_cycle_years_used": ticker_mid_cycle.get(t, {}).get("years_used") if t in ticker_mid_cycle else None,
        }
        scored_profiles[t] = cand_data

    # Empirical Percentile Conversion
    all_d1 = sorted([p["score_door1"] for p in scored_profiles.values() if p["score_door1"] is not None])
    all_d2 = sorted([p["score_door2"] for p in scored_profiles.values() if p["score_door2"] is not None])

    for p in scored_profiles.values():
        p["pctl_d1"] = round(get_percentile(p["score_door1"], all_d1), 1) if p["score_door1"] is not None else None
        p["pctl_d2"] = round(get_percentile(p["score_door2"], all_d2), 1) if p["score_door2"] is not None else None
        d2_ok = p.get("d2_eligible", True)
        p["best_pctl"] = compute_best_pctl(p["score_door1"], p["score_door2"], p["pctl_d1"], p["pctl_d2"], d2_ok)

    # ── 4. Macro Sector Budgeting via MGI (MRI-11 contract) ──────────────────
    macro_scores_by_id, reported_regime, sector_ranking_meta = load_sector_ranking()
    print(f"Sector ranking source: {sector_ranking_meta['sector_quota_source']} "
          f"(reason={sector_ranking_meta['reason']}, date={sector_ranking_meta['date']}, "
          f"age_days={sector_ranking_meta['age_days']}, n_sectors={sector_ranking_meta['n_sectors']})")

    BASE_CORE_PER_SECTOR = 8
    MIN_CORE_PER_SECTOR = 5
    MAX_CORE_PER_SECTOR = 12

    core_sector_quotas = {}
    for gics_sec, macro_id in sorted(GICS_TO_MACRO_ID.items()):
        m_score = macro_scores_by_id.get(macro_id, 0.0)
        tilt = int(round(m_score * 4.0))
        quota = max(MIN_CORE_PER_SECTOR, min(MAX_CORE_PER_SECTOR, BASE_CORE_PER_SECTOR + tilt))
        core_sector_quotas[gics_sec] = quota
    core_quota_total = sum(core_sector_quotas.values())

    # Sub-industry cluster score (MRI-11 §8): MRI v2 publishes the 6 sub-industries in their own
    # `subindustry_ranking` list, separate from the 11-row `sector_ranking` above. Stored on each
    # profile via mgi_subindustry_id for Phase 5; no behavioural change here.
    subindustry_scores_by_id: Dict[str, float] = {}
    if sector_ranking_meta["path"]:
        try:
            _mri_raw = json.loads(Path(sector_ranking_meta["path"]).read_text(encoding="utf-8"))
            for row in _mri_raw.get("subindustry_ranking") or []:
                sid = row.get("sector_id")
                score = _sector_tilt_score(row)
                if sid and score is not None:
                    subindustry_scores_by_id[sid] = score
        except Exception as exc:
            print(f"  [sub-industry ranking] could not read {sector_ranking_meta['path']}: {exc}")

    for p in scored_profiles.values():
        p["cluster_macro_score"] = subindustry_scores_by_id.get(p.get("mgi_subindustry_id"))

    # ── 5. Nomination Step A: Core Sector Floor with Intra-Sector Guardrails ──
    by_sec: Dict[str, List[Dict[str, Any]]] = {}
    for p in scored_profiles.values():
        by_sec.setdefault(p["sector"], []).append(p)

    core_nominated: Dict[str, Dict[str, Any]] = {}
    sector_running_counts: Dict[str, int] = {sec: 0 for sec in GICS_TO_MACRO_ID}

    def _door_won(p: Dict[str, Any]) -> str:
        s1, s2 = p.get("score_door1"), p.get("score_door2")
        d2_ok = p.get("d2_eligible", True)
        if s1 is not None and s2 is not None and d2_ok:
            p1 = p.get("pctl_d1")
            p2 = p.get("pctl_d2")
            if p1 is not None and p2 is not None:
                return "DOOR_1_COMPOUNDER" if p1 >= p2 else "DOOR_2_VALUE_GAP"
            elif p1 is not None:
                return "DOOR_1_COMPOUNDER"
            elif p2 is not None:
                return "DOOR_2_VALUE_GAP"
            return "NONE"
        elif s1 is not None:
            return "DOOR_1_COMPOUNDER"
        elif s2 is not None and d2_ok:
            return "DOOR_2_VALUE_GAP"
        return "NONE"

    for sec, core_quota in core_sector_quotas.items():
        sec_cand = by_sec.get(sec, [])
        if not sec_cand: continue

        # Intra-Sector Cluster Guardrail: max 35% per cluster
        max_per_cluster = max(2, int(math.ceil(core_quota * 0.35)))
        cluster_counts: Dict[str, int] = {}
        current_sec_picks: Dict[str, Dict[str, Any]] = {}

        # Round 1: Cluster Diversification Pass
        # Guarantee that distinct strategic clusters with qualified candidates (>= 75th pctl) get 1 slot
        c_by_cluster: Dict[str, List[Dict[str, Any]]] = {}
        for c in sec_cand:
            c_by_cluster.setdefault(c["cluster"], []).append(c)
        for cl, cl_list in c_by_cluster.items():
            cl_list.sort(key=lambda x: -(x["best_pctl"] if x.get("best_pctl") is not None else -1.0))

        sorted_clusters = sorted(c_by_cluster.keys(), key=lambda cl: -(c_by_cluster[cl][0]["best_pctl"] if c_by_cluster[cl][0].get("best_pctl") is not None else -1.0))
        for cl in sorted_clusters:
            if len(current_sec_picks) >= core_quota:
                break
            best_in_cl = c_by_cluster[cl][0]
            if best_in_cl.get("best_pctl") is not None and best_in_cl["best_pctl"] >= 75.0:
                door_won = _door_won(best_in_cl)
                best_in_cl["nominated_doors"].append(door_won)
                current_sec_picks[best_in_cl["ticker"]] = best_in_cl
                cluster_counts[cl] = cluster_counts.get(cl, 0) + 1

        # Round 2: Fill remaining core slots by pure competitive merit under cluster cap
        remaining_slots = core_quota - len(current_sec_picks)
        merit_pool = [c for c in sec_cand if c["ticker"] not in current_sec_picks]
        merit_pool.sort(key=lambda x: -(x["best_pctl"] if x.get("best_pctl") is not None else -1.0))

        for c in merit_pool:
            if remaining_slots <= 0: break
            cl = c["cluster"]
            if cluster_counts.get(cl, 0) < max_per_cluster:
                door_won = _door_won(c)
                c["nominated_doors"].append(door_won)
                current_sec_picks[c["ticker"]] = c
                cluster_counts[cl] = cluster_counts.get(cl, 0) + 1
                remaining_slots -= 1

        for t, c in current_sec_picks.items():
            core_nominated[t] = c
            sector_running_counts[sec] = sector_running_counts.get(sec, 0) + 1

    # ── 6. Nomination Step B: Global Wildcards with Hard 18% Ceiling ─────────
    wildcard_target = TOTAL_NOMINATION_TARGET - len(core_nominated)
    unnominated = [p for p in scored_profiles.values() if p["ticker"] not in core_nominated]
    unnominated.sort(key=lambda x: -(x["best_pctl"] if x.get("best_pctl") is not None else -1.0))

    wildcard_nominated: Dict[str, Dict[str, Any]] = {}
    for p in unnominated:
        if len(wildcard_nominated) >= wildcard_target:
            break
        sec = p["sector"]
        if sector_running_counts.get(sec, 0) < MAX_SECTOR_CEILING:
            door_won = _door_won(p)
            p["nominated_doors"].append(door_won)
            p["nominated_doors"].append("GLOBAL_WILDCARD")
            wildcard_nominated[p["ticker"]] = p
            sector_running_counts[sec] = sector_running_counts.get(sec, 0) + 1

    # Mark Double-Door Overlap Champions (P3.4: percentiles >= 90 and d2_eligible)
    all_nominated_map = {**core_nominated, **wildcard_nominated}
    for p in all_nominated_map.values():
        if is_double_door_champion(p.get("pctl_d1", 0.0), p.get("pctl_d2", 0.0), p.get("d2_eligible", True)):
            if "DOUBLE_DOOR_CHAMPION" not in p["nominated_doors"]:
                p["nominated_doors"].append("DOUBLE_DOOR_CHAMPION")

    # B1 (PHASE_3_APPROVAL.md): Door 1/2's own nomination, captured before Door 3 is merged in
    # below. Door 1/2 must be ranked and banded on THIS map alone — exactly as if Door 3 did
    # not exist — so a Door-3 name can never push a Door-1/2 nominee out of its rank or band.
    door12_nominated_map: Dict[str, Dict[str, Any]] = dict(all_nominated_map)

    # ── P3.14: Door 3 "trend leaders" (PHASE_3_ADDENDUM.md) ──────────────────
    door3_cfg = _load_door3_config(sifter_cfg_path)
    already_nominated_set: Set[str] = set(all_nominated_map.keys())

    # C10 (PHASE_3_APPROVAL.md): Door 3's floor is profitability (sector-neutral roic_proxy z)
    # only, not the composite quality pillar — see door3_eligibility's docstring.
    roic_proxy_vals_sorted = sorted(
        v for v in (z["roic_proxy"].get(t) for t in scored_tickers) if v is not None
    )
    door3_roic_proxy_pctl25 = pctl(roic_proxy_vals_sorted, door3_cfg["DOOR3_PROFITABILITY_MIN_PCTL"])

    door3_ineligible_reasons: Dict[str, int] = {}
    door3_candidates: List[Dict[str, Any]] = []
    for t in scored_tickers:
        p = scored_profiles[t]
        univ_mom = momentum_parts[t][1]
        if univ_mom is None:
            door3_ineligible_reasons["universe_momentum_missing"] = \
                door3_ineligible_reasons.get("universe_momentum_missing", 0) + 1
            continue
        fct_mom = p.get("fct_momentum_state") or {}
        mom_break = fct_mom.get("mom_break")
        # B3 (PHASE_3_APPROVAL.md): no daily data to verify mom_break -> the monthly trend
        # fallback, not a silent pass.
        monthly_trend_ok, monthly_trend_field = None, None
        if mom_break is None:
            rsd = _resolve_regime_shift_down(fct_mom, p.get("fct_flags", []))
            monthly_trend_ok, monthly_trend_field = compute_monthly_trend_ok(prices.get(t), rsd)
        eligible, reason, extra_flags = door3_eligibility(
            mcap=ticker_mcap.get(t),
            falling_knife="falling_knife" in p.get("fct_flags", []),
            mom_break=mom_break,
            z_revisions=p.get("z_revisions"),
            roic_proxy_z=z["roic_proxy"].get(t),
            roic_proxy_pctl25=door3_roic_proxy_pctl25,
            adv_usd=ticker_adv.get(t),
            min_mcap=door3_cfg["DOOR3_MIN_MCAP"],
            usable_months=fct_mom.get("usable_months"),
            jump_share=fct_mom.get("jump_share"),
            max_jump_share=door3_cfg["DOOR3_MAX_JUMP_SHARE"],
            monthly_trend_ok=monthly_trend_ok,
        )
        if not eligible:
            door3_ineligible_reasons[reason] = door3_ineligible_reasons.get(reason, 0) + 1
            continue
        for fl in extra_flags:
            if fl not in p["fct_flags"]:
                p["fct_flags"].append(fl)
        if "mom_break_unverified_monthly_trend_ok" in extra_flags:
            p["fct_flag_detail"]["mom_break_unverified_monthly_trend_ok"] = {
                "field_used": monthly_trend_field,
            }
        door3_candidates.append({
            "ticker": t, "cluster": p["cluster"], "universe_momentum": univ_mom,
            "mom_12_1": fct_mom.get("mom_12_1"),
        })

    # C1 (PHASE_3_APPROVAL.md): the Door-3 hysteresis rank excludes Door-1/2 nominees — a
    # nominee already has its own door and isn't a Door-3 candidate, so it must not occupy a
    # rank in the list that decides which previous Door-3 name survives. Retention is decided
    # BEFORE fresh selection (not after, as before), so retained names get first claim on their
    # cluster's cap and fresh selection only fills what's left.
    door3_rank_pool = [c for c in door3_candidates if c["ticker"] not in already_nominated_set]
    door3_eligible_ranked = [c["ticker"] for c in sorted(door3_rank_pool, key=_door3_rank_key)]
    door3_candidates_by_ticker = {c["ticker"]: c for c in door3_candidates}
    door3_retained = door3_hysteresis_retain(
        prev_door3, [], door3_eligible_ranked, already_nominated_set,
        door3_cfg["DOOR3_SLOTS"] + 5,
    )
    door3_retained_cluster_counts: Dict[str, int] = {}
    for t in door3_retained:
        cl = door3_candidates_by_ticker[t]["cluster"]
        door3_retained_cluster_counts[cl] = door3_retained_cluster_counts.get(cl, 0) + 1

    door3_select_result = select_door3(
        door3_candidates, already_nominated_set,
        slots=max(0, door3_cfg["DOOR3_SLOTS"] - len(door3_retained)),
        cluster_cap=door3_cfg["DOOR3_CLUSTER_CAP"],
        retained_tickers=set(door3_retained),
        retained_cluster_counts=door3_retained_cluster_counts,
    )
    door3_fresh = door3_select_result["selected"]
    door3_also_trend_leader = door3_select_result["also_trend_leader"]
    for t in door3_also_trend_leader:
        p = scored_profiles[t]
        if "also_trend_leader" not in p["fct_flags"]:
            p["fct_flags"].append("also_trend_leader")

    for t in door3_fresh:
        p = scored_profiles[t]
        if "DOOR_3_TREND_LEADER" not in p["nominated_doors"]:
            p["nominated_doors"].append("DOOR_3_TREND_LEADER")
        all_nominated_map[t] = p
    for t in door3_retained:
        p = scored_profiles[t]
        if "DOOR_3_TREND_LEADER" not in p["nominated_doors"]:
            p["nominated_doors"].append("DOOR_3_TREND_LEADER")
        if "HYSTERESIS_RETAINED" not in p["nominated_doors"]:
            p["nominated_doors"].append("HYSTERESIS_RETAINED")
        all_nominated_map[t] = p

    door3_final = door3_fresh + [t for t in door3_retained if t not in door3_fresh]
    # P3.14b: same rank order as selection/hysteresis (_door3_rank_key) for the research_now /
    # watchlist split, so the band boundary agrees with the ranking that put a name in the door.
    door3_final_ranked = sorted(
        door3_final,
        key=lambda t: _door3_rank_key({
            "universe_momentum": momentum_parts[t][1] if momentum_parts[t][1] is not None else float("-inf"),
            "mom_12_1": ticker_mom_state.get(t, {}).get("mom_12_1"),
            "ticker": t,
        }),
    )
    door3_rn_names = door3_final_ranked[:door3_cfg["DOOR3_RN_SLOTS"]]
    door3_wl_names = door3_final_ranked[door3_cfg["DOOR3_RN_SLOTS"]:]

    door3_by_cluster: Dict[str, int] = {}
    for t in door3_final:
        cl = scored_profiles[t].get("cluster") or "Unknown"
        door3_by_cluster[cl] = door3_by_cluster.get(cl, 0) + 1

    nominated_pool = sorted(all_nominated_map.keys())

    # ── 7. Output Results & Backward-Compatible factor_scores.json ───────────
    d1_count = sum(1 for t in nominated_pool if any("DOOR_1" in d for d in all_nominated_map[t]["nominated_doors"]))
    d2_count = sum(1 for t in nominated_pool if any("DOOR_2" in d for d in all_nominated_map[t]["nominated_doors"]))
    overlap_count = sum(1 for t in nominated_pool if "DOUBLE_DOOR_CHAMPION" in all_nominated_map[t]["nominated_doors"])

    momentum_coverage = sum(
        1 for t in all_tickers
        if t not in vetoes and ticker_mom_state.get(t, {}).get("mom_12_1") is not None
    )

    d1_eligible_count = sum(1 for p in scored_profiles.values() if p["score_door1"] is not None)
    d1_ineligible_count = len(scored_profiles) - d1_eligible_count
    d1_renormalised_count = sum(1 for p in scored_profiles.values() if p["door1_weight_scale"] is not None and p["door1_weight_scale"] != 1.0)
    d1_ineligible_reasons: Dict[str, int] = {}
    d1_pillars_counts: Dict[str, int] = {}
    for p in scored_profiles.values():
        if p["door1_ineligible_reason"]:
            r = p["door1_ineligible_reason"]
            d1_ineligible_reasons[r] = d1_ineligible_reasons.get(r, 0) + 1
        if p["door1_pillars_used"]:
            k = ",".join(p["door1_pillars_used"])
            d1_pillars_counts[k] = d1_pillars_counts.get(k, 0) + 1

    d2_eligible_count = sum(1 for p in scored_profiles.values() if p["score_door2"] is not None and p.get("d2_eligible", True))
    d2_ineligible_count = len(scored_profiles) - d2_eligible_count
    d2_renormalised_count = sum(1 for p in scored_profiles.values() if p["door2_weight_scale"] is not None and p["door2_weight_scale"] != 1.0)
    d2_ineligible_reasons: Dict[str, int] = {}
    d2_pillars_counts: Dict[str, int] = {}
    for p in scored_profiles.values():
        if p["door2_ineligible_reason"]:
            r = p["door2_ineligible_reason"]
            d2_ineligible_reasons[r] = d2_ineligible_reasons.get(r, 0) + 1
        if p["door2_pillars_used"]:
            k = ",".join(p["door2_pillars_used"])
            d2_pillars_counts[k] = d2_pillars_counts.get(k, 0) + 1

    falling_knife_count_scored = sum(1 for p in scored_profiles.values() if "falling_knife" in p.get("fct_flags", []))
    falling_knife_count_nominated = sum(1 for p in all_nominated_map.values() if "falling_knife" in p.get("fct_flags", []))

    summary = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "reported_macro_regime": reported_regime,
        "total_universe": len(all_tickers),
        "eligible_scored": eligible_count,
        "vetoed_count": len(vetoes),
        "nominated_count": len(nominated_pool),
        "core_nominated_count": len(core_nominated),
        "wildcard_nominated_count": len(wildcard_nominated),
        "door1_compounders_count": d1_count,
        "door2_value_gaps_count": d2_count,
        "overlap_both_doors_count": overlap_count,
        "core_sector_quotas": core_sector_quotas,
        "core_quota_total": core_quota_total,
        "sector_ceiling_max": MAX_SECTOR_CEILING,
        "sector_ranking_meta": sector_ranking_meta,
        # P3.9 (SCR-05): "anchor" or "constant_fallback" — the P3.11 soft invariant reads this.
        "discount_rate_source": coe_anchor_meta["discount_rate_source"],
        "discount_rate_meta": coe_anchor_meta,
        "momentum_source": momentum_source,
        "momentum_coverage": momentum_coverage,
        "z_method": z_method_chosen,
        "door2_momentum_floor": door2_momentum_floor,
        "falling_knife_count_scored": falling_knife_count_scored,
        "falling_knife_count_nominated": falling_knife_count_nominated,
        "pillar_sd": pillar_sd,
        "pillar_sd_degenerate": pillar_sd_degenerate,
        "effective_weights": effective_weights,
        "door1_eligibility": {
            "eligible_count": d1_eligible_count,
            "ineligible_count": d1_ineligible_count,
            "renormalised_count": d1_renormalised_count,
            "ineligible_reasons": d1_ineligible_reasons,
            "pillars_used_counts": d1_pillars_counts,
        },
        "door2_eligibility": {
            "floor": door2_momentum_floor,
            "eligible_count": d2_eligible_count,
            "ineligible_count": d2_ineligible_count,
            "renormalised_count": d2_renormalised_count,
            "ineligible_reasons": d2_ineligible_reasons,
            "pillars_used_counts": d2_pillars_counts,
            "falling_knife_count": falling_knife_count_scored,
        },
        "door1_eligible_count": d1_eligible_count,
        "door1_ineligible_count": d1_ineligible_count,
        "door1_renormalised_count": d1_renormalised_count,
        "door2_eligible_count": d2_eligible_count,
        "door2_ineligible_count": d2_ineligible_count,
        "door2_renormalised_count": d2_renormalised_count,
        "veto_breakdown": {v: sum(1 for x in vetoes.values() if x == v) for v in set(vetoes.values())},
        # P3.14: Door 3 "trend leaders" (PHASE_3_ADDENDUM.md).
        "door3_count": len(door3_final),
        "door3_rn_count": len(door3_rn_names),
        "door3_by_cluster": door3_by_cluster,
        "door3_eligible_count": len(door3_candidates),
        "door3_ineligible_reasons": door3_ineligible_reasons,
        "door3_also_trend_leader": sorted(door3_also_trend_leader),
        "door3_hysteresis_retained": sorted(door3_retained),
    }

    # Priority Queue Ranking for RS2 Local (P3.4: bonus 2.0)
    def priority_sort_key(t: str) -> float:
        p = all_nominated_map.get(t, scored_profiles[t])
        return priority_sort_key_for_profile(p)

    # B1 (PHASE_3_APPROVAL.md): rank and band Door 1/2 on their OWN nomination
    # (door12_nominated_map, captured above before Door 3 was merged in) — exactly as before
    # Door 3 existed. Nominees ranked by priority_sort_key (1 to 135).
    door12_pool = sorted(door12_nominated_map.keys())
    ranked_nominated = sorted(door12_pool, key=priority_sort_key, reverse=True)

    # Extend ranking beyond the Door-1/2 nominees by ranking remaining scored profiles by
    # best_pctl (this tail includes Door-3 candidates too — same as before Door 3 existed).
    unnominated_scored = [t for t in scored_tickers if t not in door12_nominated_map]
    ranked_unnominated = sorted(unnominated_scored, key=lambda t: (-(scored_profiles[t]["best_pctl"] if scored_profiles[t].get("best_pctl") is not None else -1.0), t))
    all_ranked = ranked_nominated + ranked_unnominated
    rank_by_ticker = {t: i + 1 for i, t in enumerate(all_ranked)}

    # P3.5: Band Hysteresis — Door 1/2 only.
    rn_set, wl_set = apply_band_hysteresis(
        all_ranked, rank_by_ticker, prev_rn, prev_book, rn_buffer_rank, book_buffer_rank,
    )

    retained_rn = {t for t in rn_set if rank_by_ticker[t] > 50}
    retained_book = {t for t in wl_set if rank_by_ticker[t] > 135}
    retained_by_hysteresis = sorted(list(retained_rn | retained_book))

    # P3.14: Door 3 bands are added ON TOP as extra slots (PHASE_3_ADDENDUM.md), never by
    # displacing a Door-1/2 name from its band — rn_set/wl_set above are already final for
    # Door 1/2. Door 3 has its own hysteresis rule (door3_hysteresis_retain, already applied to
    # door3_retained). A name is never in both rn_set and wl_set: research_now wins.
    rn_set |= set(door3_rn_names)
    wl_set |= set(door3_wl_names)
    wl_set -= rn_set

    book_set = rn_set | wl_set

    # Ensure any ticker retained into the book is present in all_nominated_map
    for t in book_set:
        if t not in all_nominated_map:
            p = dict(scored_profiles[t])
            door_won = _door_won(p)
            p["nominated_doors"] = [door_won, "HYSTERESIS_RETAINED"]
            all_nominated_map[t] = p

    # Update nominated pool to reflect the final book (may exceed 135 with hysteresis)
    nominated_pool = sorted(list(book_set))

    band_transitions = {
        "entered_rn": sorted(list(rn_set - prev_rn)) if has_previous else [],
        "left_rn": sorted(list(prev_rn - rn_set)) if has_previous else [],
        "entered_book": sorted(list(book_set - prev_book)) if has_previous else [],
        "left_book": sorted(list(prev_book - book_set)) if has_previous else [],
        "retained_by_hysteresis": retained_by_hysteresis,
    }

    summary["hysteresis"] = hysteresis_status
    summary["hysteresis_retained"] = retained_by_hysteresis
    summary["hysteresis_rn_buffer_rank"] = rn_buffer_rank
    summary["hysteresis_book_buffer_rank"] = book_buffer_rank
    summary["band_transitions"] = band_transitions
    summary["nominated_count"] = len(nominated_pool)
    summary["nominated_tickers"] = nominated_pool
    summary["profiles"] = {t: all_nominated_map[t] for t in nominated_pool}

    OUT_JSON.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    compat_tickers = {}
    for t in all_tickers:
        if t in rn_set:
            band = "research_now"
        elif t in wl_set:
            band = "watchlist"
        elif t in vetoes:
            band = "vetoed"
        else:
            band = "pass"

        prof = all_nominated_map.get(t, scored_profiles.get(t, {}))
        # C2: vetoed rows have fct_percentile = None (not 50.0); unvetoed rows without a door score also None
        if band == "vetoed":
            pctl_out = None
        else:
            raw_pctl = prof.get("best_pctl")
            pctl_out = round(raw_pctl, 2) if raw_pctl is not None else None
        compat_tickers[t] = {
            "fct_band": band,
            "fct_composite": pctl_out,
            "fct_percentile": pctl_out,
            "fct_rank": rank_by_ticker.get(t),
            "fct_veto": vetoes.get(t),
            "fct_veto_detail": veto_detail.get(t),
            "fct_z": {
                "quality": prof.get("z_quality"),
                "momentum": prof.get("z_momentum"),
                "revisions": prof.get("z_revisions"),
                "value": prof.get("z_value"),
                "exp_gap": prof.get("z_exp_gap")
            },
            "fct_contributions": _contributions(prof),
            # P3.9 (SCR-05): None on rows the reverse-DCF exp_gap branch never touched (banks,
            # REITs, no fundamentals) — not a fabricated 0.0.
            "gap_basis": prof.get("gap_basis"),
            "discount_rate_pct": prof.get("discount_rate_pct"),
            "fct_haircuts": None,
            "fct_vol": None,
            "fct_nominated_doors": prof.get("nominated_doors", []),
            "fct_momentum_state": prof.get("fct_momentum_state", ticker_mom_state.get(t, {})),
            "fct_flags": prof.get("fct_flags", list(ticker_flags.get(t, []))),
            "fct_flag_detail": prof.get("fct_flag_detail", ticker_flag_detail.get(t, {})),
            "falling_knife_detail": prof.get("falling_knife_detail"),
            "d2_eligible": prof.get("d2_eligible", True),
            "door1_pillars_used": prof.get("door1_pillars_used", []),
            "door2_pillars_used": prof.get("door2_pillars_used", []),
            "door1_weight_scale": prof.get("door1_weight_scale"),
            "sector": prof.get("sector", sector_by_ticker.get(t)),
            "cluster": prof.get("cluster"),
            "archetype": prof.get("archetype"),
            "mid_cycle_window_years": prof.get("mid_cycle_window_years"),
            "mid_cycle_years_used": prof.get("mid_cycle_years_used"),
        }

    # Stage 4 of the charter: the depth lane's own view, written alongside the quant bands.
    llm_applied = apply_llm_overlay(compat_tickers)
    print(f"Divergence overlay: {llm_applied} names carry a depth verdict")

    compat_payload = {
        "engine": "dual_door_dynamic_macro_v2_cluster_guarded",
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "reported_macro_regime": reported_regime,
        "sector_quota_source": sector_ranking_meta["sector_quota_source"],
        "sector_ranking_date": sector_ranking_meta["date"],
        "sector_ranking_age_days": sector_ranking_meta["age_days"],
        "macro_confidence": sector_ranking_meta["macro_confidence"],
        # P3.9 (SCR-05): the P3.11 soft invariant (run_chain.py) reads this flat field.
        "discount_rate_source": coe_anchor_meta["discount_rate_source"],
        "discount_rate_reason": coe_anchor_meta["reason"],
        "discount_rate_asof": coe_anchor_meta["asof"],
        "discount_rate_age_days": coe_anchor_meta["age_days"],
        "momentum_source": momentum_source,
        "momentum_coverage": momentum_coverage,
        "z_method": z_method_chosen,
        "door2_momentum_floor": door2_momentum_floor,
        "scored_count": eligible_count,
        "hysteresis": hysteresis_status,
        "hysteresis_retained": retained_by_hysteresis,
        "band_transitions": band_transitions,
        "band_counts": {
            "research_now": len(rn_set),
            "watchlist": len(wl_set),
            "pass": sum(1 for x in compat_tickers.values() if x["fct_band"] == "pass"),
            "vetoed": len(vetoes)
        },
        "tickers": compat_tickers
    }
    FACTOR_SCORES_COMPAT_JSON.write_text(json.dumps(compat_payload, indent=2), encoding="utf-8")

    print(f"\nScored: {eligible_count} | Vetoed: {len(vetoes)} | Nominated: {len(nominated_pool)}")
    print(f"  - Core Floor: {len(core_nominated)} | Global Wildcards: {len(wildcard_nominated)}")
    print(f"  - Door 1 (Compounders): {d1_count} picks")
    print(f"  - Door 2 (Value Gaps):  {d2_count} picks")
    print(f"  - Double-Door Champions: {overlap_count} picks")
    print(f"  - Door 3 (Trend Leaders): {len(door3_final)} picks ({len(door3_rn_names)} research_now) | eligible {len(door3_candidates)}")
    print(f"  - Priority Queue: {len(rn_set)} research_now | {len(wl_set)} watchlist")
    print(f"Saved Dual-Door scores to: {OUT_JSON}")
    print(f"Saved compatible factor_scores to: {FACTOR_SCORES_COMPAT_JSON}")

    # Sector Breakdown of Nominated Pool
    sec_counts = {}
    for t in nominated_pool:
        s = all_nominated_map[t].get("sector") or "Unknown"
        sec_counts[s] = sec_counts.get(s, 0) + 1
    print("\nNominated Pool Sector Distribution:")
    for s, c in sorted(sec_counts.items(), key=lambda x: -x[1]):
        pct = c / len(nominated_pool) * 100.0
        print(f"  {s:<24}: {c:>2} picks ({pct:4.1f}%) [Max Ceiling: {MAX_SECTOR_CEILING}]")


if __name__ == "__main__":
    main()

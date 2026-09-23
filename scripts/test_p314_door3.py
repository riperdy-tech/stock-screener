"""test_p314_door3.py — Unit tests for Phase 3 P3.14 (Door 3 "trend leaders").

Requirements covered (PHASE_3_ADDENDUM.md P3.14):
1. Door 1's momentum pillar reverts to sector-neutral only; the published z_momentum (used by
   the P3.3 falling-knife floor) stays the P3.13 blend.
2. Door 3 eligibility (all required): not vetoed; marketCap >= 2e9; not falling_knife and
   mom_break is not True; revisions z >= 0 when present (absent -> eligible, flag
   revisions_missing); quality pillar >= the scored universe's 25th percentile (None quality
   -> not eligible); ADV >= 300k when resolved (absent -> eligible, flag adv_missing).
3. Selection: ranked by universe momentum score; a name already nominated by Door 1 or Door 2
   is skipped for Door 3 but tagged also_trend_leader; cap 5 per cluster; takes 20.
4. Bands: top DOOR3_RN_SLOTS -> research_now, the rest -> watchlist.
5. Hysteresis: a previous Door-3 name not re-selected fresh stays while its current
   universe-momentum rank among eligible names is <= DOOR3_SLOTS + 5.
6. sifter_config.json carries the door3 constants.

Requirements covered (PHASE_3_ADDENDUM.md P3.14b, orchestrator measurement 2026-09-24):
7. Trend-continuity eligibility: jump_share = ln(1 + largest single-month return) / ln(1 +
   12-1 return), computed only when 12-1 > 0, from the 11 monthly returns in the t-12 .. t-2
   window (closes[-13:-1], same data score_paradigm.compute_skip_month_return uses). A name
   with jump_share > DOOR3_MAX_JUMP_SHARE (0.75) is not eligible (reason jump_driven). Fewer
   than 9 usable monthly returns -> not eligible (reason short_history).
8. Ranking among eligible names: universe momentum score, ties broken by raw mom_12_1
   descending, then ticker.
"""

from pathlib import Path

import pytest

import score_factors_dual_door as sfdd
from score_factors_dual_door import (
    door3_eligibility,
    select_door3,
    door3_hysteresis_retain,
    compute_trend_continuity,
    sector_neutral_z,
    universe_z,
)


# ── Config ────────────────────────────────────────────────────────────────────

def test_door3_config_defaults():
    cfg_path = Path(__file__).resolve().parent / "sifter_config.json"
    assert cfg_path.exists()
    cfg = sfdd._load_door3_config(cfg_path)
    assert cfg == {
        "DOOR3_SLOTS": 20,
        "DOOR3_RN_SLOTS": 5,
        "DOOR3_CLUSTER_CAP": 5,
        "DOOR3_MIN_MCAP": 2_000_000_000.0,
        "DOOR3_PROFITABILITY_MIN_PCTL": 25.0,
        "DOOR3_MAX_JUMP_SHARE": 0.75,
        "DOOR3_JUMP_RULE_MIN_RETURN": 0.50,
    }


# ── Eligibility — one rule at a time ─────────────────────────────────────────

def _elig(**kw):
    base = dict(
        mcap=5e9, falling_knife=False, mom_break=False, z_revisions=0.5, roic_proxy_z=1.0,
        roic_proxy_pctl25=0.0, adv_usd=1_000_000.0, min_mcap=2e9,
        # P3.14b: valid trend-continuity data by default, so tests above this section keep
        # exercising only their own rule in isolation.
        usable_months=11, jump_share=0.3,
        raw_roic_proxy=0.10,
    )
    base.update(kw)
    return door3_eligibility(**base)


def test_eligible_when_all_rules_pass():
    eligible, reason, flags = _elig()
    assert eligible is True and reason is None and flags == []


def test_ineligible_mcap_below_floor():
    eligible, reason, _ = _elig(mcap=1.9e9)
    assert eligible is False and reason == "mcap_below_door3_floor"


def test_ineligible_mcap_none():
    eligible, reason, _ = _elig(mcap=None)
    assert eligible is False and reason == "mcap_below_door3_floor"


def test_ineligible_falling_knife():
    eligible, reason, _ = _elig(falling_knife=True)
    assert eligible is False and reason == "falling_knife_or_mom_break"


def test_ineligible_mom_break_true():
    eligible, reason, _ = _elig(mom_break=True)
    assert eligible is False and reason == "falling_knife_or_mom_break"


def test_mom_break_false_does_not_block():
    assert _elig(mom_break=False)[0] is True


# ── B3 (PHASE_3_APPROVAL.md): mom_break is None -> the monthly-trend fallback, not a silent
# pass. The caller (main()) resolves monthly_trend_ok via compute_monthly_trend_ok and passes
# it in; _elig's default (monthly_trend_ok=None, meaning "no monthly data either") is
# overridden per test below. ──────────────────────────────────────────────────────────────────

def test_mom_break_none_with_monthly_trend_ok_is_eligible_with_flag():
    eligible, reason, flags = _elig(mom_break=None, monthly_trend_ok=True)
    assert eligible is True and reason is None
    assert "mom_break_unverified_monthly_trend_ok" in flags


def test_mom_break_none_with_monthly_trend_failed_is_ineligible():
    eligible, reason, _ = _elig(mom_break=None, monthly_trend_ok=False)
    assert eligible is False and reason == "mom_break_unverified_monthly_trend_failed"


def test_mom_break_none_with_monthly_trend_unknown_is_ineligible_short_history():
    """No mom_break AND not enough monthly closes to fall back on either -> not a silent pass."""
    eligible, reason, _ = _elig(mom_break=None, monthly_trend_ok=None)
    assert eligible is False and reason == "short_history"


# ── B3: compute_monthly_trend_ok — the monthly-close fallback for a missing mom_break ───────

def test_monthly_trend_ok_regime_shift_down_blocks_regardless_of_closes():
    ok, field = sfdd.compute_monthly_trend_ok(closes=None, regime_shift_down=True)
    assert ok is False and field == "regime_shift_down"


def test_monthly_trend_ok_short_history_below_10_closes():
    closes = [100.0] * 8 + [None, None] + [999.0]  # window closes[-13:-1] has only 8 usable
    ok, field = sfdd.compute_monthly_trend_ok(closes, regime_shift_down=False)
    assert ok is None and field == "short_history"


def test_monthly_trend_ok_none_closes_is_short_history():
    ok, field = sfdd.compute_monthly_trend_ok(None, regime_shift_down=False)
    assert ok is None and field == "short_history"


def test_monthly_trend_ok_latest_close_above_10m_average_is_ok():
    # 12 closes, flat at 100 except the latest (window[-1]) at 110 -> above the 10m average.
    closes = [100.0] * 11 + [110.0] + [999.0]  # window = closes[-13:-1] = first 12 entries
    ok, field = sfdd.compute_monthly_trend_ok(closes, regime_shift_down=False)
    assert ok is True and field == "latest_monthly_close_vs_10m_average"


def test_monthly_trend_ok_latest_close_below_10m_average_is_not_ok():
    closes = [100.0] * 11 + [50.0] + [999.0]
    ok, field = sfdd.compute_monthly_trend_ok(closes, regime_shift_down=False)
    assert ok is False and field == "latest_monthly_close_vs_10m_average"


def test_monthly_trend_ok_uses_only_the_last_10_of_the_12_window_closes():
    """The 10-month average is over the LAST 10 of the 12 window closes, not all 12 -- an old,
    very different close at the front of the window must not skew it."""
    window12 = [1.0, 1.0] + [100.0] * 10  # last 10 are all 100.0
    closes = window12 + [999.0]  # 13th entry (skipped month) is inert
    ok, field = sfdd.compute_monthly_trend_ok(closes, regime_shift_down=False)
    assert ok is True   # latest (100.0) == avg of the last 10 (100.0) -> ok (>=)
    assert field == "latest_monthly_close_vs_10m_average"


def test_ineligible_revisions_negative():
    eligible, reason, _ = _elig(z_revisions=-0.01)
    assert eligible is False and reason == "revisions_negative"


def test_eligible_revisions_zero_is_not_negative():
    eligible, reason, _ = _elig(z_revisions=0.0)
    assert eligible is True and reason is None


def test_revisions_missing_is_eligible_with_flag():
    eligible, reason, flags = _elig(z_revisions=None)
    assert eligible is True and reason is None
    assert "revisions_missing" in flags


# ── C10 (PHASE_3_APPROVAL.md): profitability (roic_proxy) floor, replacing the old quality
# floor for Door 3 only — the quality pillar's accruals/margin-stability terms penalise
# hypergrowth and excluded NVDA/SNDK/WDC/COHR while admitting unprofitable biotechs. ──────────

def test_ineligible_profitability_below_pctl25():
    eligible, reason, _ = _elig(roic_proxy_z=-0.5, roic_proxy_pctl25=0.0)
    assert eligible is False and reason == "profitability_below_pctl25"


def test_eligible_profitability_exactly_at_pctl25():
    eligible, reason, _ = _elig(roic_proxy_z=0.0, roic_proxy_pctl25=0.0)
    assert eligible is True and reason is None


def test_ineligible_roic_proxy_z_none():
    eligible, reason, _ = _elig(roic_proxy_z=None)
    assert eligible is False and reason == "no_profitability_data"


def test_ineligible_roic_proxy_pctl25_none():
    """No usable roic_proxy distribution at all -> nobody can clear it."""
    eligible, reason, _ = _elig(roic_proxy_pctl25=None)
    assert eligible is False and reason == "no_profitability_data"


def test_ineligible_unprofitable_negative():
    """R2: raw roic_proxy <= 0 -> ineligible, reason unprofitable."""
    eligible, reason, _ = _elig(raw_roic_proxy=-0.05)
    assert eligible is False and reason == "unprofitable"


def test_ineligible_unprofitable_zero():
    """R2: raw roic_proxy == 0 -> ineligible, reason unprofitable."""
    eligible, reason, _ = _elig(raw_roic_proxy=0.0)
    assert eligible is False and reason == "unprofitable"


def test_ineligible_raw_roic_proxy_none():
    """R2: raw roic_proxy missing -> ineligible, reason no_profitability_data."""
    eligible, reason, _ = _elig(raw_roic_proxy=None)
    assert eligible is False and reason == "no_profitability_data"


def test_adv_missing_is_eligible_with_flag():
    eligible, reason, flags = _elig(adv_usd=None)
    assert eligible is True and reason is None
    assert "adv_missing" in flags


def test_ineligible_adv_below_300k():
    eligible, reason, _ = _elig(adv_usd=299_999.0)
    assert eligible is False and reason == "adv_below_300k"


def test_eligible_adv_exactly_300k():
    eligible, reason, _ = _elig(adv_usd=300_000.0)
    assert eligible is True and reason is None


def test_revisions_missing_and_adv_missing_both_flagged():
    eligible, reason, flags = _elig(z_revisions=None, adv_usd=None)
    assert eligible is True and reason is None
    assert set(flags) == {"revisions_missing", "adv_missing"}


# ── P3.14b: trend-continuity eligibility (jump_share / short_history) ───────
# PHASE_3_ADDENDUM.md P3.14b, orchestrator measurement 2026-09-24: Door 3's first run picked
# PACS (one month = 90% of its 12-1 log gain, +177%) and IBRX (98%, +216%, only 5/11 months
# up) — event jumps, not trends (Da, Gurun & Warachka 2014, "frog in the pan").

def test_eligible_jump_share_exactly_at_threshold():
    eligible, reason, _ = _elig(jump_share=0.75)
    assert eligible is True and reason is None


def test_ineligible_jump_share_just_above_threshold():
    eligible, reason, _ = _elig(jump_share=0.7501)
    assert eligible is False and reason == "jump_driven"


def test_jump_share_none_does_not_block():
    """jump_share is None whenever the 12-1 return isn't positive (the rule doesn't apply
    then) — a present, adequate usable_months still lets the name through."""
    eligible, reason, _ = _elig(jump_share=None)
    assert eligible is True and reason is None


def test_ineligible_short_history_below_9_usable_months():
    eligible, reason, _ = _elig(usable_months=8)
    assert eligible is False and reason == "short_history"


def test_eligible_short_history_exactly_9_usable_months():
    eligible, reason, _ = _elig(usable_months=9)
    assert eligible is True and reason is None


def test_ineligible_usable_months_none():
    eligible, reason, _ = _elig(usable_months=None)
    assert eligible is False and reason == "short_history"


def test_short_history_checked_before_jump_share():
    """Both rules would fail on this input; short_history (checked first) is the reason."""
    eligible, reason, _ = _elig(usable_months=5, jump_share=0.9)
    assert eligible is False and reason == "short_history"


# ── P3.14b: compute_trend_continuity — jump_share / up_months from monthly closes ────────────

def test_trend_continuity_continuous_gain_has_low_jump_share():
    """11 equal 5%-per-month gains (geometric): no single month dominates the 12-1 log gain,
    and every month is up."""
    closes = [100.0 * (1.05 ** i) for i in range(12)] + [999.0]  # 13th (skipped month) is inert
    m121 = sfdd.compute_skip_month_return(closes)
    result = compute_trend_continuity(closes, m121)
    assert result["usable_months"] == 11
    assert result["up_months"] == 11
    assert result["jump_share"] == pytest.approx(1.0 / 11.0, abs=0.005)


def test_trend_continuity_single_event_jump_has_high_jump_share():
    """PACS-shaped: ten flat months, then one large jump — mirrors the +177% orchestrator
    measurement where one month was 90% of the 12-1 log gain."""
    closes = [100.0] * 11 + [277.0, 300.0]  # window = closes[-13:-1] = the first 12 entries
    m121 = sfdd.compute_skip_month_return(closes)
    assert m121 == pytest.approx(1.77, abs=0.01)
    result = compute_trend_continuity(closes, m121)
    assert result["usable_months"] == 11
    assert result["up_months"] == 1
    assert result["jump_share"] == pytest.approx(1.0, abs=1e-9)
    assert result["jump_share"] > 0.75


def test_trend_continuity_short_history_below_13_closes():
    result = compute_trend_continuity([100.0] * 10, 0.1)
    assert result == {"jump_share": None, "up_months": None, "usable_months": 0}


def test_trend_continuity_short_history_gaps_below_9_usable():
    """A None in the window drops the two returns that touch it; one gap out of 11 possible
    returns leaves exactly 9 usable (at the short_history boundary, still eligible-shaped)."""
    closes = [100.0] * 5 + [None] + [100.0] * 6 + [999.0]  # 13 entries, one gap in the window
    result = compute_trend_continuity(closes, 0.0)
    assert result["usable_months"] == 9


def test_trend_continuity_jump_share_none_when_12_1_not_positive():
    closes = [100.0 * (0.98 ** i) for i in range(12)] + [50.0]
    m121 = sfdd.compute_skip_month_return(closes)
    assert m121 is not None and m121 <= 0
    result = compute_trend_continuity(closes, m121)
    assert result["jump_share"] is None


# ── Selection: ranking, dedup/also_trend_leader, cluster cap, slot cap ───────

def _cand(ticker, cluster, mom):
    return {"ticker": ticker, "cluster": cluster, "universe_momentum": mom}


def test_selection_ranks_by_universe_momentum_descending():
    cands = [_cand("LOW", "c1", 0.5), _cand("HIGH", "c2", 3.0), _cand("MID", "c3", 1.5)]
    res = select_door3(cands, already_nominated=set(), slots=20, cluster_cap=5)
    assert res["selected"] == ["HIGH", "MID", "LOW"]


def test_dedup_already_nominated_is_skipped_and_tagged():
    cands = [_cand("DOOR1_NAME", "c1", 5.0), _cand("FRESH", "c2", 1.0)]
    res = select_door3(cands, already_nominated={"DOOR1_NAME"}, slots=20, cluster_cap=5)
    assert "DOOR1_NAME" not in res["selected"]
    assert res["also_trend_leader"] == ["DOOR1_NAME"]
    assert res["selected"] == ["FRESH"]


def test_cluster_cap_enforced():
    cands = [_cand(f"SEMI_{i}", "tech_semiconductors", 10.0 - i) for i in range(8)]
    cands += [_cand("SOFT_1", "tech_software", 1.0)]
    res = select_door3(cands, already_nominated=set(), slots=20, cluster_cap=5)
    assert res["cluster_counts"]["tech_semiconductors"] == 5
    assert sum(1 for t in res["selected"] if t.startswith("SEMI_")) == 5
    # the 6th/7th/8th-ranked semis are skipped by the cap, but SOFT_1 (lower momentum, ranked
    # last overall) still gets in since the cluster cap only blocks its own cluster.
    assert "SOFT_1" in res["selected"]


def test_selection_stops_at_slots():
    cands = [_cand(f"T{i}", f"cl{i}", float(50 - i)) for i in range(30)]
    res = select_door3(cands, already_nominated=set(), slots=20, cluster_cap=5)
    assert len(res["selected"]) == 20
    assert res["selected"] == [f"T{i}" for i in range(20)]


def test_ties_broken_by_ticker_for_determinism():
    cands = [_cand("B", "c1", 1.0), _cand("A", "c2", 1.0)]
    res = select_door3(cands, already_nominated=set(), slots=20, cluster_cap=5)
    assert res["selected"] == ["A", "B"]


# ── P3.14b: ties broken by raw mom_12_1 descending, then ticker (universe z is clipped, so the
# top names can tie exactly — this is what makes their order deterministic) ──────────────────

def test_ties_broken_by_mom_12_1_before_ticker():
    cands = [
        {"ticker": "Z", "cluster": "c1", "universe_momentum": 2.053, "mom_12_1": 0.50},
        {"ticker": "A", "cluster": "c2", "universe_momentum": 2.053, "mom_12_1": 0.90},
        {"ticker": "M", "cluster": "c3", "universe_momentum": 2.053, "mom_12_1": 0.90},
    ]
    res = select_door3(cands, already_nominated=set(), slots=20, cluster_cap=5)
    # A and M tie on both universe_momentum and mom_12_1 (0.90) -> ticker decides (A before M).
    # Z shares the universe_momentum tie but has a lower raw mom_12_1 -> ranks behind both.
    assert res["selected"] == ["A", "M", "Z"]


def test_ties_missing_mom_12_1_sorts_after_present_values():
    cands = [
        {"ticker": "HAS", "cluster": "c1", "universe_momentum": 1.0, "mom_12_1": 0.01},
        {"ticker": "MISSING", "cluster": "c2", "universe_momentum": 1.0},  # no mom_12_1 key
    ]
    res = select_door3(cands, already_nominated=set(), slots=20, cluster_cap=5)
    assert res["selected"] == ["HAS", "MISSING"]


# ── RN / watchlist split (top DOOR3_RN_SLOTS -> research_now, rest -> watchlist) ─────────────

def test_rn_split_top_slots_only():
    """Mirrors the main()-level slicing: door3_final_ranked[:RN_SLOTS] -> RN, rest -> WL."""
    momentum_by_ticker = {f"T{i}": float(20 - i) for i in range(8)}
    door3_final = list(momentum_by_ticker.keys())
    ranked = sorted(door3_final, key=lambda t: (-momentum_by_ticker[t], t))
    rn_slots = 5
    rn_names = ranked[:rn_slots]
    wl_names = ranked[rn_slots:]
    assert rn_names == ["T0", "T1", "T2", "T3", "T4"]
    assert wl_names == ["T5", "T6", "T7"]
    assert set(rn_names) & set(wl_names) == set()


# ── Hysteresis: rank <= DOOR3_SLOTS + 5 retains a previous Door-3 name ───────

def test_hysteresis_retains_previous_name_within_rank_25():
    eligible_ranked = [f"T{i}" for i in range(30)]   # T0 is rank 1 ... T29 is rank 30
    retained = door3_hysteresis_retain(
        prev_door3={"T24"}, fresh_selected=[f"T{i}" for i in range(20)],
        eligible_ranked=eligible_ranked, already_nominated=set(), max_rank=25,
    )
    # T24 -> rank 25 (index 24), exactly at the boundary -> retained
    assert retained == ["T24"]


def test_hysteresis_drops_previous_name_beyond_rank_25():
    eligible_ranked = [f"T{i}" for i in range(30)]
    retained = door3_hysteresis_retain(
        prev_door3={"T25"}, fresh_selected=[f"T{i}" for i in range(20)],
        eligible_ranked=eligible_ranked, already_nominated=set(), max_rank=25,
    )
    # T25 -> rank 26, just past the boundary -> not retained
    assert retained == []


def test_hysteresis_skips_names_no_longer_eligible():
    """A previous Door-3 name absent from eligible_ranked (now ineligible) is not retained."""
    eligible_ranked = [f"T{i}" for i in range(10)]
    retained = door3_hysteresis_retain(
        prev_door3={"GONE"}, fresh_selected=[], eligible_ranked=eligible_ranked,
        already_nominated=set(), max_rank=25,
    )
    assert retained == []


def test_hysteresis_skips_names_already_fresh_selected():
    eligible_ranked = ["T0", "T1"]
    retained = door3_hysteresis_retain(
        prev_door3={"T0"}, fresh_selected=["T0"], eligible_ranked=eligible_ranked,
        already_nominated=set(), max_rank=25,
    )
    assert retained == []


def test_hysteresis_skips_already_nominated_names():
    """A previous Door-3 name now nominated by Door 1/2 gets also_trend_leader elsewhere, not
    a Door-3 hysteresis slot."""
    eligible_ranked = ["T0", "T1"]
    retained = door3_hysteresis_retain(
        prev_door3={"T0"}, fresh_selected=[], eligible_ranked=eligible_ranked,
        already_nominated={"T0"}, max_rank=25,
    )
    assert retained == []


# ── Door 1's momentum pillar reverts to sector-neutral only ─────────────────

def _weighted_mean_of_available(pairs):
    valid = [(v, w) for v, w in pairs if v is not None]
    if not valid:
        return None
    total_w = sum(w for _, w in valid)
    if total_w == 0:
        return sum(v for v, _ in valid) / len(valid)
    return sum(v * w for v, w in valid) / total_w


def test_door1_momentum_is_sector_neutral_only_published_stays_blend():
    """Same synthetic sector-boom universe as P3.13's own test: a whole-sector +300% move is
    invisible to sector-neutral z (degenerate sd -> 0.0) but visible to the universe-pooled z.
    Door 1's momentum feed (raw_pillars["momentum"] == sn_mom, per score_factors_dual_door.py)
    must stay 0.0 for the boom names — Door 1 must not see the boom. The published/floor value
    (the P3.13 50/50 blend) must still see it."""
    boom_tickers = [f"BOOM_{i}" for i in range(15)]
    flat_tickers = [f"FLAT_{i}" for i in range(15)]

    raw_skip_12_1 = {}
    for t in boom_tickers:
        raw_skip_12_1[t] = 3.0  # +300%, identical across the sector -> degenerate sector sd
    for i, t in enumerate(flat_tickers):
        raw_skip_12_1[t] = i * 0.01

    sector_by_ticker = {t: "Boom" for t in boom_tickers}
    sector_by_ticker.update({t: "Flat" for t in flat_tickers})

    sn = sector_neutral_z(raw_skip_12_1, sector_by_ticker)
    uz = universe_z(raw_skip_12_1)
    w = sfdd.MOMENTUM_UNIVERSE_WEIGHT

    # Door 1's momentum feed == sn only (raw_pillars["momentum"] in main()).
    door1_momentum_boom = sn[boom_tickers[0]]
    assert door1_momentum_boom == 0.0

    # The published/floor value (raw_pillars["momentum_published"]) is the blend and DOES see
    # the boom.
    published_momentum_boom = _weighted_mean_of_available([(sn[boom_tickers[0]], 1.0 - w), (uz[boom_tickers[0]], w)])
    assert published_momentum_boom > 0.0
    assert published_momentum_boom != door1_momentum_boom

    # A flat-sector name's Door 1 feed is unaffected by the boom (still its own sector-neutral
    # value, same as before P3.13 ever existed) — and, sector-neutral only, it still outranks
    # the (degenerate, zeroed-out) boom name on Door 1's own momentum feed.
    best_flat = max(flat_tickers, key=lambda t: sn[t])
    assert sn[best_flat] > sn[boom_tickers[0]]

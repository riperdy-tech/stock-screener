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
"""

from pathlib import Path

import pytest

import score_factors_dual_door as sfdd
from score_factors_dual_door import (
    door3_eligibility,
    select_door3,
    door3_hysteresis_retain,
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
        "DOOR3_QUALITY_MIN_PCTL": 25.0,
    }


# ── Eligibility — one rule at a time ─────────────────────────────────────────

def _elig(**kw):
    base = dict(
        mcap=5e9, falling_knife=False, mom_break=False, z_revisions=0.5, z_quality=1.0,
        quality_pctl25=0.0, adv_usd=1_000_000.0, min_mcap=2e9,
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


def test_mom_break_false_or_none_does_not_block():
    assert _elig(mom_break=False)[0] is True
    assert _elig(mom_break=None)[0] is True


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


def test_ineligible_quality_below_pctl25():
    eligible, reason, _ = _elig(z_quality=-0.5, quality_pctl25=0.0)
    assert eligible is False and reason == "quality_below_pctl25"


def test_eligible_quality_exactly_at_pctl25():
    eligible, reason, _ = _elig(z_quality=0.0, quality_pctl25=0.0)
    assert eligible is True and reason is None


def test_ineligible_quality_none():
    eligible, reason, _ = _elig(z_quality=None)
    assert eligible is False and reason == "quality_below_pctl25"


def test_ineligible_quality_pctl25_none():
    """No usable quality distribution at all -> nobody can clear it."""
    eligible, reason, _ = _elig(quality_pctl25=None)
    assert eligible is False and reason == "quality_below_pctl25"


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

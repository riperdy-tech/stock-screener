"""test_p3_review_c1.py — Regression tests for Phase 3 approval review finding C1.

PHASE_3_APPROVAL.md C1: `door3_hysteresis_retain` ranked a previous Door-3 name among ALL
eligible names, including names already nominated by Door 1/2 -- so its rank-<=25 buffer sat
inside the fresh cut-off and only rescued cluster-capped names, bypassing the cluster cap
entirely (retained names never counted toward it).

Fix (score_factors_dual_door.py):
1. The ranking used for retention now excludes Door-1/2 nominees (a nominee already has its
   own door and isn't a Door-3 candidate for ranking purposes).
2. Retention is decided BEFORE fresh selection. `select_door3` gained `retained_tickers` /
   `retained_cluster_counts` so retained names count toward their cluster's cap and a fresh
   entrant from an already-full cluster is correctly blocked.

Both tests call the production functions directly (door3_hysteresis_retain, select_door3) --
no re-implementation of the ranking or selection logic.
"""
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from score_factors_dual_door import select_door3, door3_hysteresis_retain, _door3_rank_key  # noqa: E402


def _cand(ticker, cluster, mom):
    return {"ticker": ticker, "cluster": cluster, "universe_momentum": mom}


# ── The retention ranking must exclude Door-1/2 nominees ────────────────────

def test_retention_ranking_excludes_door12_nominees_from_rank():
    """5 Door-1/2 nominees have higher universe momentum than a previously-Door-3 name (PREV).
    Ranking PREV among ALL eligible names (the pre-fix behaviour) pushes it to rank 6 -- past a
    max_rank of 5 it would otherwise clear. Ranking PREV only among names that are NOT
    Door-1/2 nominees (the fix) puts it at rank 1, comfortably retained."""
    nominees = [_cand(f"NOM_{i}", "c1", 10.0 - i) for i in range(5)]  # momentum 10.0 .. 6.0
    prev = _cand("PREV", "c2", 5.0)
    other = [_cand(f"OTH_{i}", "c3", 1.0 - i * 0.1) for i in range(3)]
    all_candidates = nominees + [prev] + other
    already_nominated = {c["ticker"] for c in nominees}

    # Pre-fix behaviour: rank over ALL eligible candidates, nominees included.
    unfiltered_ranked = [c["ticker"] for c in sorted(all_candidates, key=_door3_rank_key)]
    unfiltered_retained = door3_hysteresis_retain(
        prev_door3={"PREV"}, fresh_selected=[], eligible_ranked=unfiltered_ranked,
        already_nominated=already_nominated, max_rank=5,
    )
    assert unfiltered_retained == []  # PREV sits at rank 6 -- just past the cutoff

    # C1 fix: rank only over eligible names that are NOT already Door-1/2 nominees (what
    # score_factors_dual_door.py's main() now builds as door3_eligible_ranked).
    filtered_pool = [c for c in all_candidates if c["ticker"] not in already_nominated]
    filtered_ranked = [c["ticker"] for c in sorted(filtered_pool, key=_door3_rank_key)]
    filtered_retained = door3_hysteresis_retain(
        prev_door3={"PREV"}, fresh_selected=[], eligible_ranked=filtered_ranked,
        already_nominated=already_nominated, max_rank=5,
    )
    assert filtered_retained == ["PREV"]  # PREV is rank 1 once nominees are excluded


def test_retention_rank_boundary_still_25_when_pool_is_clean():
    """Sanity check: with no nominees mixed in, DOOR3_SLOTS + 5 == 25 behaves as documented."""
    eligible_ranked = [f"T{i}" for i in range(30)]
    retained = door3_hysteresis_retain(
        prev_door3={"T24"}, fresh_selected=[], eligible_ranked=eligible_ranked,
        already_nominated=set(), max_rank=25,
    )
    assert retained == ["T24"]  # rank 25 (index 24) -- exactly at the boundary


# ── select_door3: retained names count toward their cluster's cap ───────────

def test_retained_names_block_a_new_entrant_from_a_full_cluster():
    retained = {"RET_1", "RET_2"}
    retained_cluster_counts = {"tech_semiconductors": 2}
    candidates = [
        _cand("NEW_SEMI", "tech_semiconductors", 5.0),  # would be picked if the cap weren't full
        _cand("NEW_SOFT", "tech_software", 4.0),
    ]
    res = select_door3(
        candidates, already_nominated=set(), slots=5, cluster_cap=2,
        retained_tickers=retained, retained_cluster_counts=retained_cluster_counts,
    )
    assert "NEW_SEMI" not in res["selected"]
    assert res["selected"] == ["NEW_SOFT"]
    assert res["cluster_counts"]["tech_semiconductors"] == 2
    assert res["cluster_counts"]["tech_software"] == 1


def test_retained_names_are_never_reselected_or_double_counted():
    retained = {"RET_1"}
    candidates = [_cand("RET_1", "c1", 9.0), _cand("FRESH", "c2", 5.0)]
    res = select_door3(candidates, already_nominated=set(), slots=5, cluster_cap=5,
                        retained_tickers=retained)
    assert "RET_1" not in res["selected"]
    assert res["selected"] == ["FRESH"]


def test_slots_param_is_new_entrants_only_caller_reduces_by_retained_count():
    """The caller passes slots = DOOR3_SLOTS - len(retained); select_door3 fills exactly that
    many NEW names on top of whatever the caller already retained."""
    retained = {f"RET_{i}" for i in range(3)}
    candidates = [_cand(f"NEW_{i}", f"cl{i}", 10.0 - i) for i in range(5)]
    res = select_door3(candidates, already_nominated=set(), slots=2, cluster_cap=5,
                        retained_tickers=retained)
    assert len(res["selected"]) == 2
    assert res["selected"] == ["NEW_0", "NEW_1"]


def test_retained_ticker_in_candidates_but_not_in_cluster_counts_still_skipped():
    """A retained ticker present in `candidates` (it usually is -- still Door-3-eligible this
    run) is never re-selected as a fresh entrant even if retained_cluster_counts wasn't given."""
    candidates = [_cand("RET_1", "c1", 9.0), _cand("FRESH", "c2", 5.0)]
    res = select_door3(candidates, already_nominated=set(), slots=5, cluster_cap=5,
                        retained_tickers={"RET_1"})
    assert res["selected"] == ["FRESH"]


def test_no_retained_names_behaves_exactly_as_before():
    cands = [_cand("LOW", "c1", 0.5), _cand("HIGH", "c2", 3.0)]
    res = select_door3(cands, already_nominated=set(), slots=20, cluster_cap=5)
    assert res["selected"] == ["HIGH", "LOW"]

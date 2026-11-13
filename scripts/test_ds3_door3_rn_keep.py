"""test_ds3_door3_rn_keep.py — WO_DS3 item 2: a keep band on Door 3's five research_now slots.

Door 3's research_now names were the top five of its 20 by universe momentum at every run, with
no keep band. Measured on the 87 stored runs of 2026-10-05 to 2026-11-12: 90 day-level changes of
those five, 50 of 74 reversed within 5 trading days; the 5th and the 8th name differ by a median
of 0.064 of universe momentum z. The rule: a Door-3 name that was research_now on the previous
published list keeps its slot while it ranks within DOOR3_RN_KEEP_RANK (8) of Door 3's names; the
remaining slots fill from the top. A kept name that is no longer one of Door 3's names leaves at
once (it is not in the ranked list). A first run with no previous list is the top five, as before.

The unit tests call the production function; the last two run the real sifter (main(), through
scripts/tools/dual_door_diff.py's run_sifter) with a previous list in the place it reads it from.
"""
import json
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
TOOLS_DIR = SCRIPTS_DIR / "tools"
for p in (str(SCRIPTS_DIR), str(TOOLS_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

import score_factors_dual_door as sfdd  # noqa: E402
from dual_door_diff import load_sifter_module, run_sifter, DEFAULT_SIFTER_PATH  # noqa: E402
from test_p3_review_b1 import _build_fixture  # noqa: E402

RANKED = [f"T{i}" for i in range(1, 13)]     # T1 is Door 3's best by universe momentum


def test_no_previous_list_is_the_top_five():
    rn, wl = sfdd.split_door3_bands(RANKED, set(), rn_slots=5, keep_rank=8)
    assert rn == ["T1", "T2", "T3", "T4", "T5"]
    assert wl == RANKED[5:]


def test_previous_name_within_keep_rank_keeps_its_slot():
    """T8 was research_now and ranks 8th: it stays, and the last free slot (T5's) is not filled."""
    rn, wl = sfdd.split_door3_bands(RANKED, {"T1", "T2", "T3", "T4", "T8"}, rn_slots=5, keep_rank=8)
    assert rn == ["T1", "T2", "T3", "T4", "T8"]
    assert wl == ["T5", "T6", "T7", "T9", "T10", "T11", "T12"]


def test_previous_name_beyond_keep_rank_loses_its_slot():
    rn, _ = sfdd.split_door3_bands(RANKED, {"T1", "T2", "T3", "T4", "T9"}, rn_slots=5, keep_rank=8)
    assert rn == ["T1", "T2", "T3", "T4", "T5"]


def test_previous_name_no_longer_in_door3_leaves_at_once():
    rn, wl = sfdd.split_door3_bands(RANKED, {"T1", "T2", "T3", "T4", "GONE"}, rn_slots=5, keep_rank=8)
    assert rn == ["T1", "T2", "T3", "T4", "T5"]
    assert "GONE" not in rn and "GONE" not in wl


def test_always_five_and_free_slots_fill_from_the_top():
    """Two kept names from below the top five leave three free slots: they go to T1, T2, T3."""
    rn, wl = sfdd.split_door3_bands(RANKED, {"T6", "T7", "T10", "T11", "T12"}, rn_slots=5, keep_rank=8)
    assert rn == ["T1", "T2", "T3", "T6", "T7"]
    assert len(rn) == 5 and set(rn).isdisjoint(wl) and sorted(rn + wl) == sorted(RANKED)


def test_keep_rank_equal_to_slots_is_no_band():
    rn, _ = sfdd.split_door3_bands(RANKED, {"T6", "T7", "T8"}, rn_slots=5, keep_rank=5)
    assert rn == ["T1", "T2", "T3", "T4", "T5"]


def test_config_carries_the_keep_rank():
    cfg = sfdd._load_door3_config(SCRIPTS_DIR / "sifter_config.json")
    assert cfg["DOOR3_RN_KEEP_RANK"] == 8
    assert cfg["DOOR3_RN_SLOTS"] == 5


def _door3_order(compat):
    """Door 3's names in the scorer's own order (universe momentum, then 12-1 return, ticker)."""
    names = [t for t, p in compat["tickers"].items() if "DOOR_3_TREND_LEADER" in p["fct_nominated_doors"]]
    return sorted(names, key=lambda t: sfdd._door3_rank_key({
        "universe_momentum": compat["tickers"][t]["z_momentum_universe"],
        "mom_12_1": compat["tickers"][t]["fct_momentum_state"].get("mom_12_1"),
        "ticker": t,
    }))


def _run(data_dir, out_dir, name):
    mod = load_sifter_module(DEFAULT_SIFTER_PATH.read_text(encoding="utf-8"), name, DEFAULT_SIFTER_PATH)
    return run_sifter(mod, out_dir, data_dir=data_dir, quiet=True)


def test_main_keeps_a_previous_door3_research_now_name_ranked_sixth_to_eighth(tmp_path):
    data_dir = _build_fixture(tmp_path)
    _, first = _run(data_dir, tmp_path / "out1", "sifter_ds3_keep_first")
    order = _door3_order(first)
    assert len(order) >= 10
    rn1 = {t for t in order if first["tickers"][t]["fct_band"] == "research_now"}
    assert rn1 == set(order[:5])                                  # first run: the top five

    # The previous published list, where the scorer reads it: the 7th name held a slot, the 5th
    # did not; the 10th held one too (beyond the keep rank).
    prev = json.loads(json.dumps(first))
    prev["tickers"][order[4]]["fct_band"] = "watchlist"
    prev["tickers"][order[6]]["fct_band"] = "research_now"
    prev["tickers"][order[3]]["fct_band"] = "watchlist"
    prev["tickers"][order[9]]["fct_band"] = "research_now"
    (data_dir / "factor_scores.json").write_text(json.dumps(prev), encoding="utf-8")

    summary, second = _run(data_dir, tmp_path / "out2", "sifter_ds3_keep_second")
    order2 = _door3_order(second)
    assert order2 == order                                        # same inputs, same Door 3
    rn2 = {t for t in order2 if second["tickers"][t]["fct_band"] == "research_now"}
    # kept: the first three (previous and top five) and the 7th; the 10th is beyond the keep rank,
    # so the free slot goes to the best name without one, the 4th.
    assert rn2 == {order[0], order[1], order[2], order[6], order[3]}
    assert second["tickers"][order[4]]["fct_band"] == "watchlist"
    assert second["tickers"][order[9]]["fct_band"] == "watchlist"
    assert summary["door3_rn_count"] == 5
    assert summary["door3_rn_kept"] == [order[6]]


def test_main_first_run_without_a_previous_list_is_unchanged(tmp_path):
    data_dir = _build_fixture(tmp_path)
    summary, first = _run(data_dir, tmp_path / "out", "sifter_ds3_keep_noprev")
    order = _door3_order(first)
    assert {t for t in order if first["tickers"][t]["fct_band"] == "research_now"} == set(order[:5])
    assert summary["door3_rn_kept"] == []

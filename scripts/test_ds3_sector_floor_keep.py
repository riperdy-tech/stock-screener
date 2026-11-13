"""test_ds3_sector_floor_keep.py — WO_DS3 item 4: a sector-floor fill keeps its slot within a
tolerance.

Each sector's core quota nominates names whose best percentile is below the wildcard cut (a
median of 25 of the 135 on the 87 stored runs of 2026-10-05 to 2026-11-12). They swap with a
sector-mate on a hair: 213 run-level exits, 209 of them with another fill of the same sector
entering at the same run; 211 of the Door 1/2 list's 426 day-level changes, 104 of 154 reversed
within 5 trading days. The rank band (keep to 150) cannot hold them: the name that loses the slot
ranks far below 150.

The rule: in its sector's core pass, a name that was a floor fill on the previous published list
sorts as if its best percentile were `sector_floor_keep_points` (3.0) higher. It keeps the slot
while it is within 3 points of the sector-mate that would take it. Nothing else changes: the
ranking, the wildcards, the champion tag and the bands use the plain key.

Unit tests call the production functions; the last two run the real sifter (main(), through
scripts/tools/dual_door_diff.py's run_sifter) with a previous list where it reads it from.
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
from test_p3_review_b1 import _build_fixture, _add_ticker, OTHER_SECTORS  # noqa: E402


def _p(ticker, best, cluster="c1"):
    return {"ticker": ticker, "cluster": cluster, "best_pctl": round(best, 1), "best_pctl_raw": best,
            "score_door1": best / 10.0, "score_door2": None, "d2_eligible": True, "nominated_doors": []}


def _names(picks):
    return [c["ticker"] for c in picks]


# ── previous_floor_fills: who was a floor fill on the previous published list ────────────────

def _prev(doors, pctl, band="watchlist"):
    return {"fct_nominated_doors": doors, "fct_percentile": pctl, "fct_band": band}


def test_previous_floor_fills_are_core_names_below_the_wildcard_cut():
    prev = {
        "WILD_HI": _prev(["DOOR_1_COMPOUNDER", "GLOBAL_WILDCARD"], 99.0),
        "WILD_CUT": _prev(["DOOR_2_VALUE_GAP", "GLOBAL_WILDCARD"], 97.0),          # the cut
        "CORE_MERIT": _prev(["DOOR_1_COMPOUNDER", "DOUBLE_DOOR_CHAMPION"], 98.5),   # core, above the cut
        "CORE_AT_CUT": _prev(["DOOR_1_COMPOUNDER"], 97.0),                          # not below it
        "FILL_A": _prev(["DOOR_1_COMPOUNDER"], 96.9),
        "FILL_B": _prev(["DOOR_2_VALUE_GAP"], 80.0),
        "HELD_OVER": _prev(["DOOR_1_COMPOUNDER", "HYSTERESIS_RETAINED"], 96.0),     # band-retained, not nominated
        "DOOR3": _prev(["DOOR_3_TREND_LEADER"], 70.0),
        "PASS": _prev([], 95.0, band="pass"),
        "NO_PCTL": _prev(["DOOR_1_COMPOUNDER"], None),
    }
    assert sfdd.previous_floor_fills(prev) == {"FILL_A", "FILL_B"}


def test_previous_floor_fills_empty_without_wildcards_or_list():
    assert sfdd.previous_floor_fills({}) == set()
    assert sfdd.previous_floor_fills({"A": _prev(["DOOR_1_COMPOUNDER"], 90.0)}) == set()


# ── core_slot_key: the tolerance is a sort allowance for a previous fill, nothing else ───────

def test_core_slot_key_is_the_plain_key_for_everyone_else():
    p = _p("AAA", 90.0)
    assert sfdd.core_slot_key(p, set(), 3.0) == sfdd.rank_key_for_profile(p)
    assert sfdd.core_slot_key(p, {"OTHER"}, 3.0) == sfdd.rank_key_for_profile(p)
    assert sfdd.core_slot_key(p, {"AAA"}, 0.0) == sfdd.rank_key_for_profile(p)


def test_core_slot_key_previous_fill_sorts_as_if_three_points_higher():
    inc, ch = _p("INC", 90.0), _p("CHALLENGER", 92.9)
    assert sfdd.core_slot_key(inc, {"INC"}, 3.0) < sfdd.core_slot_key(ch, {"INC"}, 3.0)
    far = _p("FAR", 93.1)
    assert sfdd.core_slot_key(far, {"INC"}, 3.0) < sfdd.core_slot_key(inc, {"INC"}, 3.0)


# ── select_sector_core: the sector's core picks (cluster pass, then merit under the cluster cap)

def _sector():
    # two clusters; quota 3 -> max 2 per cluster
    return [_p("A1", 99.0, "a"), _p("A2", 95.0, "a"), _p("A3", 94.0, "a"),
            _p("B1", 93.0, "b"), _p("B2", 91.0, "b"), _p("B3", 70.0, "b")]


def test_select_sector_core_plain_key_is_cluster_pass_then_merit_under_the_cap():
    picks = sfdd.select_sector_core(_sector(), 3, sfdd.rank_key_for_profile)
    assert _names(picks) == ["A1", "B1", "A2"]          # one per cluster first, then merit


def test_select_sector_core_cluster_cap_blocks_a_third_name_of_one_cluster():
    picks = sfdd.select_sector_core(_sector(), 4, sfdd.rank_key_for_profile)
    assert _names(picks) == ["A1", "B1", "A2", "B2"]    # A3 (94.0) is the cluster's third: capped at 2


def test_select_sector_core_cluster_pass_needs_the_75th_percentile():
    cand = [_p("A1", 99.0, "a"), _p("A2", 98.0, "a"), _p("B1", 74.9, "b")]
    assert _names(sfdd.select_sector_core(cand, 2, sfdd.rank_key_for_profile)) == ["A1", "A2"]


def test_previous_fill_keeps_the_slot_within_three_points():
    """Quota 3 picks A1 and B1 (one per cluster), then the best of the rest. A2 (95.0) would take
    that slot on merit; B2 (a previous fill, 92.5) is within 3 points of it and keeps it."""
    cand = [_p("A1", 99.0, "a"), _p("A2", 95.0, "a"), _p("B1", 96.0, "b"), _p("B2", 92.5, "b")]
    plain = sfdd.select_sector_core(cand, 3, sfdd.rank_key_for_profile)
    assert _names(plain) == ["A1", "B1", "A2"]
    kept = sfdd.select_sector_core(cand, 3, lambda c: sfdd.core_slot_key(c, {"B2"}, 3.0))
    assert _names(kept) == ["A1", "B1", "B2"]


def test_previous_fill_loses_the_slot_beyond_three_points():
    cand = [_p("A1", 99.0, "a"), _p("A2", 95.0, "a"), _p("B1", 96.0, "b"), _p("B2", 91.9, "b")]
    kept = sfdd.select_sector_core(cand, 3, lambda c: sfdd.core_slot_key(c, {"B2"}, 3.0))
    assert _names(kept) == ["A1", "B1", "A2"]


def test_config_carries_the_tolerance():
    assert sfdd._load_sector_floor_keep_points(SCRIPTS_DIR / "sifter_config.json") == 3.0


# ── the real sifter ─────────────────────────────────────────────────────────────────────────

def _run(data_dir, out_dir, name, keep_points=None):
    mod = load_sifter_module(DEFAULT_SIFTER_PATH.read_text(encoding="utf-8"), name, DEFAULT_SIFTER_PATH)
    if keep_points is not None:
        mod._load_sector_floor_keep_points = lambda *a, **k: keep_points
    return run_sifter(mod, out_dir, data_dir=data_dir, quiet=True)


FILES = ("stocks", "fundamentals_history", "fundamentals_battery", "eps_trajectory", "price_history",
         "momentum_state")


def _fixture_with_floor_fills(tmp_path):
    """The B1 fixture plus 30 strong names in each of five of its ten mediocre sectors. The 135
    slots then go to Technology and those five sectors, the wildcard cut sits among the strong
    names, and the other five sectors are on the list only through their core quota: floor fills,
    each with unnominated sector-mates."""
    data_dir = _build_fixture(tmp_path)
    d = {n: json.loads((data_dir / f"{n}.json").read_text(encoding="utf-8")) for n in FILES}
    for si in range(5):
        sector, industry = OTHER_SECTORS[si]
        for i in range(30):
            _add_ticker(d["stocks"], d["fundamentals_history"], d["fundamentals_battery"],
                        d["eps_trajectory"], d["price_history"], d["momentum_state"],
                        f"BIG_{si}_{i}", sector, industry,
                        rank01=0.80 + 0.006 * i, mom_12_1=0.10 + 0.002 * i)
    for n in FILES:
        (data_dir / f"{n}.json").write_text(json.dumps(d[n]), encoding="utf-8")
    return data_dir


def _book(compat):
    return {t for t, p in compat["tickers"].items() if p["fct_band"] in ("research_now", "watchlist")}


def test_main_first_run_and_an_unchanged_second_run_hold_nobody(tmp_path):
    data_dir = _fixture_with_floor_fills(tmp_path)
    s1, c1 = _run(data_dir, tmp_path / "out1", "sifter_ds3_floor_first")
    assert s1["sector_floor_kept"] == []
    assert s1["sector_floor_keep_points"] == 3.0
    assert len(sfdd.previous_floor_fills(c1["tickers"])) >= 5        # the fixture has floor fills
    (data_dir / "factor_scores.json").write_text(json.dumps(c1), encoding="utf-8")
    s2, c2 = _run(data_dir, tmp_path / "out2", "sifter_ds3_floor_second")
    assert s2["sector_floor_kept"] == []                 # same inputs: no slot is contested
    assert _book(c2) == _book(c1)
    assert {t: p["fct_rank"] for t, p in c2["tickers"].items()} == {t: p["fct_rank"] for t, p in c1["tickers"].items()}


def test_main_reads_the_previous_fills_and_holds_the_slot(tmp_path):
    """The mechanism end to end, with the tolerance set wide so the fixture's spacing cannot
    decide it: the previous list says the sector's slot belonged to Y (the best name of the sector
    that the first run left out), not to X (the sector's weakest floor fill). On the same inputs Y
    keeps the slot and X is out; the summary names Y as held."""
    data_dir = _fixture_with_floor_fills(tmp_path)
    s1, c1 = _run(data_dir, tmp_path / "out1", "sifter_ds3_floor_a")
    tk = c1["tickers"]
    fills = sfdd.previous_floor_fills(tk)
    assert fills, "the fixture must have floor fills"
    by_sector = {}
    for t in fills:
        by_sector.setdefault(tk[t]["sector"], []).append(t)
    chosen = None
    for sec, names in sorted(by_sector.items()):
        left_out = sorted((t for t, p in tk.items() if p["sector"] == sec and p["fct_rank"] > 135
                           and p["cluster"] == tk[names[0]]["cluster"]),
                          key=lambda t: tk[t]["fct_rank"])
        if left_out:
            x = max(names, key=lambda t: tk[t]["fct_rank"])        # the sector's weakest fill
            chosen = (x, left_out[0])
            break
    assert chosen, "the fixture must leave a sector-mate of a floor fill off the list"
    x, y = chosen

    prev = json.loads(json.dumps(c1))
    prev["tickers"][y]["fct_nominated_doors"] = list(tk[x]["fct_nominated_doors"])
    prev["tickers"][y]["fct_percentile"] = tk[x]["fct_percentile"]
    prev["tickers"][y]["fct_band"] = "watchlist"
    prev["tickers"][x]["fct_nominated_doors"] = []
    prev["tickers"][x]["fct_band"] = "pass"
    (data_dir / "factor_scores.json").write_text(json.dumps(prev), encoding="utf-8")

    s2, c2 = _run(data_dir, tmp_path / "out2", "sifter_ds3_floor_b", keep_points=100.0)
    assert c2["tickers"][y]["fct_rank"] <= 135
    assert c2["tickers"][x]["fct_rank"] > 135
    assert y in s2["sector_floor_kept"]
    # with no tolerance the same previous list changes nothing: X has the slot on merit
    s3, c3 = _run(data_dir, tmp_path / "out3", "sifter_ds3_floor_c", keep_points=0.0)
    assert c3["tickers"][x]["fct_rank"] <= 135 and c3["tickers"][y]["fct_rank"] > 135
    assert s3["sector_floor_kept"] == []

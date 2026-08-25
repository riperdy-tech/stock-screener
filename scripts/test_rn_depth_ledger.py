"""depth_targets(): the rn_depth ledger's target set.

Pins the gate to lib/desk/rankings.ts:139-143 (aiSections). If these fail, the
ledger is trading a different book than RESEARCH NOW displays.

No network, no files. Run: python scripts/test_rn_depth_ledger.py
"""

import importlib.util
import sys
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "tp", str(Path(__file__).resolve().parent / "track_paper_portfolios.py"))
tp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tp)


def fct(rank=1, veto=None, llm_veto=None, band="research_now"):
    return {"fct_rank": rank, "fct_band": band, "fct_veto": veto, "fct_llm_veto": llm_veto}


def dep(direction="undervalued", size="full"):
    return {"direction": direction, "size_hint": size}


def test_every_name_gets_an_equal_slot():
    f = {t: fct(i) for i, t in enumerate("ABCDEFGHIJ", 1)}
    d = {t: dep() for t in f}
    w = tp.depth_targets(f, d)
    assert len(w) == 10
    assert len(set(w.values())) == 1, "slots are not equal"
    assert round(sum(w.values()), 6) == 100.0
    assert round(w["A"], 4) == 10.0


def test_size_hint_does_not_affect_weight():
    """full/half/quarter is display-only — it must not size the book."""
    f = {"A": fct(1), "B": fct(2), "C": fct(3)}
    d = {"A": dep(size="full"), "B": dep(size="half"), "C": dep(size="quarter")}
    w = tp.depth_targets(f, d)
    assert w["A"] == w["B"] == w["C"]


def test_missing_size_hint_still_gets_a_slot():
    f = {"A": fct(1), "B": fct(2)}
    d = {"A": dep(size="full"), "B": dep(size=None)}
    w = tp.depth_targets(f, d)
    assert set(w) == {"A", "B"} and w["A"] == w["B"]


def test_concentration_floor_leaves_cash_when_few_names():
    """Below MIN_EQUAL_NAMES the book must not concentrate — weights sum < 100."""
    f = {"A": fct(1), "B": fct(2)}
    w = tp.depth_targets(f, {"A": dep(), "B": dep()})
    assert round(w["A"], 6) == round(100.0 / tp.MIN_EQUAL_NAMES, 6)
    assert sum(w.values()) < 100.0


def test_only_undervalued_verdicts_are_included():
    f = {"A": fct(1), "B": fct(2), "C": fct(3)}
    d = {"A": dep("undervalued"), "B": dep("hold"), "C": dep("overvalued")}
    assert set(tp.depth_targets(f, d)) == {"A"}


def test_name_without_a_depth_verdict_is_not_a_target():
    """The quant shortlist alone never enters — the panel shows those as awaiting."""
    assert set(tp.depth_targets({"A": fct(1), "B": fct(2)}, {"A": dep()})) == {"A"}


def test_vetoed_name_is_excluded_even_when_undervalued():
    f = {"A": fct(1), "B": fct(2, veto="forensic"), "C": fct(3, llm_veto="llm_reject")}
    d = {"A": dep(), "B": dep(), "C": dep()}
    assert set(tp.depth_targets(f, d)) == {"A"}


def test_band_is_ignored_so_watchlist_names_still_qualify():
    """aiSections gates on the depth verdict only — NOT on fct_band."""
    f = {"A": fct(1, band="research_now"), "B": fct(2, band="watchlist"),
         "C": fct(3, band="monitor")}
    d = {"A": dep(), "B": dep(), "C": dep()}
    assert set(tp.depth_targets(f, d)) == {"A", "B", "C"}


def test_unranked_row_is_skipped():
    """rankings.ts builds rows only from tickers carrying fct_rank."""
    f = {"A": fct(1), "B": {"fct_rank": None, "fct_band": "research_now"}}
    assert set(tp.depth_targets(f, {"A": dep(), "B": dep()})) == {"A"}


def test_no_undervalued_names_yields_empty_targets():
    """Empty targets hand off to targets_healthy, which HOLDS a book that has
    positions rather than liquidating it."""
    t = tp.depth_targets({"A": fct(1)}, {"A": dep("overvalued")})
    assert t == {}
    led = tp.empty_ledger()
    tp.run_target_ledger(led, {"A": 100.0}, {"A": 10.0}, "2026-07-01", "rank")
    ok, reason = tp.targets_healthy("rn_depth", t, led)
    assert not ok and "empty while holding" in reason


def test_empty_inputs_are_safe():
    assert tp.depth_targets({}, {}) == {}


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"  ok    {fn.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"  FAIL  {fn.__name__}: {e}")
    print(f"{len(fns) - failed}/{len(fns)} passed")
    sys.exit(1 if failed else 0)

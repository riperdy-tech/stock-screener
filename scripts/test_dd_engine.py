"""Unit tests for the drawdown governor (scripts/kis/dd_engine.py). Pure logic,
no I/O. Run: python -m pytest scripts/test_dd_engine.py -q"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kis.dd_engine import decide, initial_state, rebase, resume  # noqa: E402


def run_path(navs, state=None):
    state = state or initial_state(navs[0])
    decisions = []
    for nav in navs:
        state, d = decide(state, nav)
        decisions.append(d)
    return state, decisions


def test_new_highs_keep_full_gross_and_raise_peak():
    state, ds = run_path([100, 105, 110])
    assert state["peak_nav"] == 110
    assert state["gross"] == 1.0
    assert all(d["action"] in ("none",) for d in ds)


def test_small_dip_no_action():
    state, ds = run_path([100, 96, 93])          # -7% — above the -8% tier
    assert state["gross"] == 1.0
    assert ds[-1]["action"] == "none"


def test_tier1_derisk_at_8pct():
    state, ds = run_path([100, 91.9])            # -8.1%
    assert state["gross"] == 0.5
    assert ds[-1]["action"] == "derisk"


def test_hysteresis_no_rerisk_inside_band():
    # enter tier at -8.1%, bounce to -7% (inside the -6% recovery line): stay
    state, ds = run_path([100, 91.9, 93.0])
    assert state["gross"] == 0.5
    assert ds[-1]["action"] == "none"


def test_rerisk_above_hysteresis():
    state, ds = run_path([100, 91.9, 94.5])      # recover to -5.5% > -6%
    assert state["gross"] == 1.0
    assert ds[-1]["action"] == "rerisk"


def test_tier2_quarter_gross():
    state, ds = run_path([100, 91.9, 88.9])      # -11.1%
    assert state["gross"] == 0.25
    assert ds[-1]["action"] == "derisk"


def test_halt_is_sticky_through_recovery_and_new_highs():
    state, ds = run_path([100, 86.9])            # -13.1% -> halt
    assert state["halted"] is True and state["gross"] == 0.0
    assert ds[-1]["action"] == "halt"
    state, ds = run_path([95, 101, 120], state=state)
    assert state["halted"] is True and state["gross"] == 0.0
    assert all(d["action"] == "halted" for d in ds)


def test_resume_keeps_peak_and_rehalts_below_the_line():
    state, _ = run_path([100, 86.0])             # halt at -14
    assert state["halted"]
    state = resume(state)
    assert state["halted"] is False and state["peak_nav"] == 100 and state["gross"] == 0.0
    state, d = decide(state, 86.0)               # still -14 from true peak
    assert state["halted"] and d["action"] == "halt"


def test_resume_climbs_ladder_as_true_dd_recovers():
    state, _ = run_path([100, 86.0])
    state = resume(state)
    state, d = decide(state, 92.0)               # -8: t1 zone allows half gross
    assert not state["halted"] and state["gross"] == 0.5
    state, d = decide(state, 95.0)               # -5: past t1 hysteresis (-6)
    assert state["gross"] == 1.0


def test_rebase_restarts_budget_deliberately():
    state, _ = run_path([100, 86.0])
    state = rebase(86.0)
    assert state["halted"] is False and state["gross"] == 1.0 and state["peak_nav"] == 86.0


def test_overnight_gap_straight_to_halt():
    state, ds = run_path([100, 87.0])            # -13% single gap: skip tiers, halt
    assert state["halted"] and ds[-1]["action"] == "halt"


def test_repeated_same_nav_is_quiet():
    state, _ = run_path([100, 91.5])
    for _ in range(5):
        state, d = decide(state, 91.5)
        assert d["action"] == "none"
        assert state["gross"] == 0.5


def test_peak_updates_do_not_rerisk_prematurely():
    # fall to tier, then peak-relative recovery via rising nav BUT still below line
    state, _ = run_path([100, 91.9, 92.5, 93.0, 93.5])   # -6.5%: inside band
    assert state["gross"] == 0.5


def test_deterministic():
    s1, d1 = run_path([100, 95, 90, 88, 92, 96])
    s2, d2 = run_path([100, 95, 90, 88, 92, 96])
    assert s1 == s2 and d1 == d2

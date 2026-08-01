"""Unit tests for the drawdown governor (scripts/kis/dd_engine.py). Pure logic,
no I/O. Run: python -m pytest scripts/test_dd_engine.py -q"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kis.dd_engine import apply_flow, decide, initial_state, rebase, resume  # noqa: E402


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


# --- unitized flow tracking -------------------------------------------------

def test_pre_unitization_state_migrates_with_dd_unchanged():
    """Free migration: units=1 makes per-unit value identical to raw NAV.

    Existing persisted rows carry only peak_nav/gross/halted. Reading one must
    reproduce the raw governor's verdict exactly, or the upgrade silently
    re-rates the live book.
    """
    old = {"peak_nav": 100.0, "gross": 0.5, "halted": False}
    state, d = decide(old, 91.0)
    assert abs(d["dd"] - (-0.09)) < 1e-12, d["dd"]
    assert state["units"] == 1.0 and state["peak_pu"] == 100.0
    assert state["peak_nav"] == 100.0


def test_deposit_does_not_forgive_an_open_drawdown():
    """The failure that motivated this: a top-up while down must not reset."""
    state, _ = run_path([100, 91.9])                 # -8.1% -> tier 1, gross 0.5
    assert state["gross"] == 0.5

    raw_would_be = 91.9 + 20.0                       # deposit lifts NAV past the peak
    state = apply_flow(state, raw_would_be, +20.0)
    state, d = decide(state, raw_would_be)
    assert abs(d["dd"] - (-0.081)) < 1e-9, d["dd"]   # drawdown preserved to the basis point
    assert state["gross"] == 0.5, "deposit must not restore gross"
    assert d["action"] == "none"


def test_withdrawal_does_not_manufacture_a_drawdown():
    state, _ = run_path([100, 100])                  # sitting at the peak
    state = apply_flow(state, 86.0, -14.0)           # withdraw 14% of the book
    state, d = decide(state, 86.0)
    assert abs(d["dd"]) < 1e-12, d["dd"]
    assert state["halted"] is False and state["gross"] == 1.0


def test_raw_nav_would_have_halted_on_that_same_withdrawal():
    # Proves the test above is not vacuous: the pre-unitization path halts here.
    state, d = decide({"peak_nav": 100.0, "gross": 1.0, "halted": False}, 86.0)
    assert state["halted"] and d["action"] == "halt"


def test_flow_is_transparent_to_subsequent_real_performance():
    """After a flow, a genuine move must read at its true magnitude."""
    state = initial_state(100.0)
    state = apply_flow(state, 150.0, +50.0)          # deposit, no market move
    state, d = decide(state, 150.0)
    assert abs(d["dd"]) < 1e-12

    state, d = decide(state, 150.0 * 0.90)           # then a real -10%
    assert abs(d["dd"] - (-0.10)) < 1e-12, d["dd"]
    assert state["gross"] == 0.5                     # -10% sits in tier 1


def test_flow_masking_a_real_decline_is_still_caught():
    """The scenario from the KRW->USD walkthrough: a top-up must not hide a fall."""
    state, _ = run_path([100, 91.9])                 # -8.1%
    state = apply_flow(state, 91.9 + 20.0, +20.0)    # top up while down
    # stocks then fall another 10% of the enlarged book
    state, d = decide(state, (91.9 + 20.0) * 0.90)
    assert d["dd"] < -0.17, d["dd"]                  # compounded, not forgiven
    assert state["halted"] is True                   # raw NAV would have read ~ -6%


def test_round_trip_flow_leaves_units_and_dd_intact():
    state = initial_state(100.0)
    state = apply_flow(state, 130.0, +30.0)
    state = apply_flow(state, 100.0, -30.0)
    assert abs(state["units"] - 1.0) < 1e-12, state["units"]
    _, d = decide(state, 100.0)
    assert abs(d["dd"]) < 1e-12


def test_zero_flow_is_a_no_op_and_implausible_flow_refuses():
    state = initial_state(100.0)
    assert apply_flow(state, 100.0, 0.0)["units"] == 1.0
    for bad in (100.0, 150.0):        # flow >= NAV: pre-flow NAV would be <= 0
        try:
            apply_flow(state, 100.0, bad)
        except ValueError:
            continue
        raise AssertionError(f"flow {bad} against NAV 100 should refuse")


def test_halt_state_survives_a_flow():
    # A deposit must not be a back door around the sticky halt.
    state, _ = run_path([100, 86.0])
    assert state["halted"]
    state = apply_flow(state, 200.0, +114.0)
    state, d = decide(state, 200.0)
    assert state["halted"] and d["action"] == "halted"

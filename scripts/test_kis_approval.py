"""SPEC 3R guards G2 (large-sell approval) and G5 (the drawdown governor proposes only).

Fake broker, fake stores, no network, no credentials, no KIS endpoint. Reuses the harness of
test_kis_guards.py (sync.main() driven end to end).

Run: python -m pytest scripts/test_kis_approval.py -q
"""

import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kis.approval as approval  # noqa: E402
import sync_kis_portfolio as sync  # noqa: E402
from kis.approval import (  # noqa: E402
    APPROVED_PLAN_HASH_ENV, EXIT_APPROVAL_REQUIRED, approval_reasons, check_approval,
)
from kis.dd_engine import initial_state  # noqa: E402
from kis.journal import plan_hash  # noqa: E402
from kis.reconcile import Order, Plan  # noqa: E402
from test_kis_guards import FakeKIS, book, harness, pos  # noqa: E402,F401  (harness is a fixture)

EXEC = ["--env", "real", "--ledger", "rn_depth", "--execute", "--confirm-real"]
DRY = ["--env", "real", "--ledger", "rn_depth"]
HASH_RE = re.compile(r"plan hash: ([0-9a-f]{64})")


def empty_while_long():
    """rn_depth is all cash (empty target); the account holds three names: NAV 27,000, sells 17,000."""
    return dict(ledger_book=book(holdings={}, cash=95.76),
                positions=[pos("AAA", 100), pos("BBB", 50), pos("CCC", 20)])


def true_hash(harness, capsys, argv=DRY, **scenario):
    """The hash a dry run prints for a scenario (what the operator would copy)."""
    harness("false", argv=argv, **scenario)
    found = HASH_RE.findall(capsys.readouterr().out)
    assert len(found) == 1
    return found[0]


def sold(orders=None):
    return sorted((o[0], o[2], o[3]) for o in (FakeKIS.orders if orders is None else orders))


# ===================================================== G2: empty target while long
def test_G2_without_approval_nothing_is_sold(harness, capsys, monkeypatch):
    summary = harness.tmp / "summary.md"
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(summary))
    with pytest.raises(SystemExit) as e:
        harness("false", argv=EXEC, **empty_while_long())
    assert e.value.code == EXIT_APPROVAL_REQUIRED == 5
    assert FakeKIS.orders == []
    out = capsys.readouterr()
    h = HASH_RE.search(out.out).group(1)
    assert "| sell | AAA |" in out.out and "| sell | CCC |" in out.out, "the full plan is printed"
    assert "APPROVAL REQUIRED" in out.out and h in out.err and "--approve-plan" in out.err
    text = summary.read_text(encoding="utf-8")
    assert h in text and "Approval required" in text and "| sell | BBB |" in text
    ev = [x for x in harness.events if x["event"] == "approval_required"]
    assert len(ev) == 1 and ev[0]["plan_hash"] == h
    assert any("empty target while long" in r for r in ev[0]["reasons"])
    plan_ev = [x for x in harness.events if x["event"] == "plan"][0]
    assert plan_ev["plan_hash"] == h and plan_ev["approval_required"] == ev[0]["reasons"]
    assert not sync.JOURNAL_PATH.exists(), "no order was journaled: none was sent"


def test_G2_with_the_matching_hash_it_sells(harness, capsys, monkeypatch):
    h = true_hash(harness, capsys, **empty_while_long())
    assert FakeKIS.orders == []                       # the dry run sent nothing
    monkeypatch.setenv(APPROVED_PLAN_HASH_ENV, h)
    harness("false", argv=EXEC, **empty_while_long())
    assert sold() == [("sell", "AAA", 100), ("sell", "BBB", 50), ("sell", "CCC", 20)]
    assert any(x["event"] == "approval_accepted" and x["plan_hash"] == h for x in harness.events)


def test_G2_the_flag_works_like_the_variable_and_wins_over_it(harness, capsys, monkeypatch):
    h = true_hash(harness, capsys, **empty_while_long())
    monkeypatch.setenv(APPROVED_PLAN_HASH_ENV, "0" * 64)          # wrong variable, right flag
    harness("false", argv=EXEC + ["--approve-plan", h], **empty_while_long())
    assert len(FakeKIS.orders) == 3
    FakeKIS.orders.clear()
    monkeypatch.setenv(APPROVED_PLAN_HASH_ENV, h)                 # right variable, wrong flag
    with pytest.raises(SystemExit) as e:
        harness("false", argv=EXEC + ["--approve-plan", "0" * 64], **empty_while_long())
    assert e.value.code == 5 and FakeKIS.orders == []


def _other_plan_hashes(today):
    lines = [("sell", "AAA", 100), ("sell", "BBB", 50), ("sell", "CCC", 20)]
    return {
        "a different plan (CCC left out)": plan_hash("real", "rn_depth", today, lines[:2]),
        "the same plan on another day": plan_hash("real", "rn_depth", "20200101", lines),
        "the same plan, another env": plan_hash("paper", "rn_depth", today, lines),
        "garbage": "approved",
        "blank": "   ",
        "zeros": "0" * 64,
    }


@pytest.mark.parametrize("which", ["a different plan (CCC left out)", "the same plan on another day",
                                   "the same plan, another env", "garbage", "blank", "zeros"])
def test_G2_a_stale_or_wrong_hash_refuses(harness, capsys, monkeypatch, which):
    from datetime import datetime, timezone
    supplied = _other_plan_hashes(datetime.now(timezone.utc).strftime("%Y%m%d"))[which]
    monkeypatch.setenv(APPROVED_PLAN_HASH_ENV, supplied)
    with pytest.raises(SystemExit) as e:
        harness("false", argv=EXEC, **empty_while_long())
    assert e.value.code == 5
    assert FakeKIS.orders == []
    assert "No order sent" in capsys.readouterr().err


def test_G2_a_hash_prefix_is_not_an_approval(harness, capsys, monkeypatch):
    h = true_hash(harness, capsys, **empty_while_long())
    monkeypatch.setenv(APPROVED_PLAN_HASH_ENV, h[:12])
    with pytest.raises(SystemExit) as e:
        harness("false", argv=EXEC, **empty_while_long())
    assert e.value.code == 5 and FakeKIS.orders == []


def test_G2_an_approved_hash_goes_stale_when_the_account_changes(harness, capsys, monkeypatch):
    h = true_hash(harness, capsys, **empty_while_long())
    monkeypatch.setenv(APPROVED_PLAN_HASH_ENV, h)
    changed = empty_while_long()
    changed["positions"] = changed["positions"] + [pos("DDD", 10)]          # a fourth holding
    with pytest.raises(SystemExit) as e:
        harness("false", argv=EXEC, **changed)
    assert e.value.code == 5 and FakeKIS.orders == []


def test_G2_hash_case_and_spaces_do_not_matter(harness, capsys, monkeypatch):
    h = true_hash(harness, capsys, **empty_while_long())
    monkeypatch.setenv(APPROVED_PLAN_HASH_ENV, f"  {h.upper()}\n")
    harness("false", argv=EXEC, **empty_while_long())
    assert len(FakeKIS.orders) == 3


def test_G2_a_dry_run_always_prints_the_hash_and_never_exits_5(harness, capsys):
    harness("false", argv=DRY, **empty_while_long())          # needs approval, but only a dry run
    out = capsys.readouterr().out
    assert FakeKIS.orders == []
    assert HASH_RE.search(out) and "APPROVAL REQUIRED" in out and "dry run" in out


def test_G2_the_hash_is_printed_even_when_no_approval_is_needed(harness, capsys):
    harness("false", argv=DRY, ledger_book=book({"BBB": {"shares": 50, "entry_price": 100.0}},
                                                  cash=5000.0))
    out = capsys.readouterr().out
    assert HASH_RE.search(out) and "APPROVAL REQUIRED" not in out


def test_G2_a_small_trim_needs_no_approval(harness):
    # account AAA 120 ($12,000) + BBB 100 + cash 10,000 = NAV 32,000; the ledger wants AAA 100.
    # The sell is 20 sh = $2,000 = 6.25% of NAV, and the target is not empty.
    b = book({"AAA": {"shares": 100, "entry_price": 100.0}, "BBB": {"shares": 100, "entry_price": 100.0}},
             cash=12000.0)
    harness("false", argv=EXEC, ledger_book=b, positions=[pos("AAA", 120), pos("BBB", 100)])
    assert sold() == [("sell", "AAA", 20)]


def test_G2_an_approval_that_is_not_needed_is_ignored(harness, capsys, monkeypatch):
    monkeypatch.setenv(APPROVED_PLAN_HASH_ENV, "0" * 64)
    b = book({"AAA": {"shares": 100, "entry_price": 100.0}, "BBB": {"shares": 100, "entry_price": 100.0}},
             cash=12000.0)
    harness("false", argv=EXEC, ledger_book=b, positions=[pos("AAA", 120), pos("BBB", 100)])
    assert sold() == [("sell", "AAA", 20)]


def _boundary(ccc_shares):
    """NAV = 10,000 cash + 200 sh x 100 + CCC x 100. The ledger keeps AAA and BBB at 25% each and
    holds no CCC, so the only sell is CCC and the targets are not empty."""
    b = book({"AAA": {"shares": 100, "entry_price": 100.0}, "BBB": {"shares": 100, "entry_price": 100.0}},
             cash=20000.0)
    return dict(ledger_book=b, positions=[pos("AAA", 100), pos("BBB", 100), pos("CCC", ccc_shares)])


def test_G2_the_limit_is_strictly_above_25_percent_of_nav(harness):
    harness("false", argv=EXEC, **_boundary(100))             # sells $10,000 of NAV $40,000: exactly 25%
    assert sold() == [("sell", "CCC", 100)]


def test_G2_just_over_25_percent_needs_approval(harness, capsys):
    with pytest.raises(SystemExit) as e:
        harness("false", argv=EXEC, **_boundary(101))         # sells $10,100 of NAV $40,100
    assert e.value.code == 5 and FakeKIS.orders == []
    ev = [x for x in harness.events if x["event"] == "approval_required"][0]
    assert len(ev["reasons"]) == 1 and "total sell value" in ev["reasons"][0]
    assert "25%" in ev["reasons"][0]


def test_G2_the_limit_is_one_named_value(harness, monkeypatch):
    assert approval.KIS_SELL_APPROVAL_FRACTION == 0.25
    monkeypatch.setattr(approval, "KIS_SELL_APPROVAL_FRACTION", 0.5)    # a decision, not code
    harness("false", argv=EXEC, **_boundary(101))
    assert sold() == [("sell", "CCC", 101)]


def test_G2_empty_target_needs_approval_even_when_the_sell_is_tiny(harness, capsys, monkeypatch):
    scenario = dict(ledger_book=book(holdings={}, cash=95.76), positions=[pos("AAA", 1)])
    with pytest.raises(SystemExit) as e:                     # sell $100 of NAV $10,100: 1%
        harness("false", argv=EXEC, **scenario)
    assert e.value.code == 5 and FakeKIS.orders == []
    ev = [x for x in harness.events if x["event"] == "approval_required"][0]
    assert len(ev["reasons"]) == 1 and "empty target while long" in ev["reasons"][0]
    h = ev["plan_hash"]
    monkeypatch.setenv(APPROVED_PLAN_HASH_ENV, h)
    harness("false", argv=EXEC, **scenario)
    assert sold() == [("sell", "AAA", 1)]


def test_G2_an_empty_target_with_nothing_held_needs_no_approval(harness):
    harness("false", argv=EXEC, ledger_book=book(holdings={}, cash=95.76), positions=[])
    assert FakeKIS.orders == [] and not any(x["event"] == "approval_required" for x in harness.events)


def test_G2_a_refused_plan_sends_nothing_even_with_the_market_closed(harness, monkeypatch):
    monkeypatch.setattr(sync, "us_market_open", lambda now=None: False)
    with pytest.raises(SystemExit) as e:
        harness("false", argv=EXEC, **empty_while_long())
    assert e.value.code == 5                                  # approval is asked before the market check


# --------------------------------------------------------- G2: the pure functions
def _plan(sells=(), buys=(), nav=10000.0):
    orders = [Order("sell", t, q, p, "exit") for t, q, p in sells] \
        + [Order("buy", t, q, p, "enter") for t, q, p in buys]
    return Plan(orders=orders, nav=nav)


def test_reasons_none_when_the_plan_has_no_sells():
    assert approval_reasons(_plan(buys=[("AAA", 90, 100.0)]), {}, {"AAA": 0.9}, False) == []
    assert approval_reasons(_plan(), {"AAA": 5}, {}, True) == []


def test_reasons_sell_value_is_compared_with_nav():
    held, w = {"AAA": 100, "BBB": 100}, {"BBB": 0.5}
    assert approval_reasons(_plan(sells=[("AAA", 25, 100.0)]), held, w, False) == []
    r = approval_reasons(_plan(sells=[("AAA", 26, 100.0)]), held, w, False)
    assert len(r) == 1 and "26.0% of NAV" in r[0]
    assert approval_reasons(_plan(sells=[("AAA", 26, 100.0)]), held, w, False, fraction=0.3) == []


def test_reasons_all_zero_targets_count_as_empty():
    held = {"AAA": 10}
    for weights in ({}, {"AAA": 0.0}, {"BBB": 0.0}):
        r = approval_reasons(_plan(sells=[("AAA", 1, 100.0)]), held, weights, False)
        assert len(r) == 1 and "empty target while long" in r[0]
    assert approval_reasons(_plan(sells=[("AAA", 1, 100.0)]), held, {"BBB": 0.01}, False) == []


def test_reasons_zero_share_positions_do_not_count_as_held():
    assert approval_reasons(_plan(sells=[("AAA", 1, 100.0)]), {"AAA": 0}, {}, False) == []


def test_reasons_a_non_positive_nav_always_asks():
    r = approval_reasons(_plan(sells=[("AAA", 1, 100.0)], nav=0.0), {"AAA": 1}, {"AAA": 1.0}, False)
    assert len(r) == 1 and "NAV is not positive" in r[0]


def test_reasons_collects_every_reason():
    r = approval_reasons(_plan(sells=[("AAA", 90, 100.0)]), {"AAA": 90}, {}, True)
    assert len(r) == 3


def test_check_approval():
    h = "ab" * 32
    assert check_approval(h, h) == (True, "the supplied hash matches this plan")
    assert check_approval(h, " " + h.upper() + " ")[0] is True
    for bad in (None, "", "  ", h[:-1], h + "0", "cd" * 32):
        assert check_approval(h, bad)[0] is False


def test_defaults():
    assert approval.KIS_SELL_APPROVAL_FRACTION == 0.25
    assert approval.DD_TRIP_REQUIRES_APPROVAL is True
    assert approval.APPROVED_PLAN_HASH_ENV == "KIS_APPROVED_PLAN_HASH"
    assert approval.EXIT_APPROVAL_REQUIRED == 5


# ================================================= G5: the governor proposes only
def governor_scenario():
    """NAV $15,000: AAA 50 sh ($5,000) + $10,000 cash. The ledger holds AAA at 50% of its NAV.
    Untripped the plan BUYS AAA. In the 50% tier the targets halve and the plan SELLS 13 sh ($1,300),
    far under the 25% limit, so only the governor can make it need approval."""
    return dict(ledger_book=book({"AAA": {"shares": 50, "entry_price": 100.0}}, cash=5000.0),
                positions=[pos("AAA", 50)])


@pytest.fixture
def dd_state(monkeypatch):
    """Installs a governor state and returns the list of states the run saved."""
    saved = []

    def install(state, source="supabase"):
        monkeypatch.setattr(sync, "load_dd_states", lambda: ({"real": state}, source))

    monkeypatch.setattr(sync, "save_dd_states", lambda envs: saved.append(envs) or True)
    install.saved = saved
    return install


def test_G5_control_without_a_trip_the_plan_buys_with_no_approval(harness, dd_state):
    dd_state(initial_state(15000.0))
    harness("false", argv=EXEC, **governor_scenario())
    assert [o[0] for o in FakeKIS.orders] == ["buy"]


def test_G5_a_reduced_tier_proposes_and_does_not_sell(harness, dd_state, capsys):
    dd_state(initial_state(15000.0 / 0.91))                     # -9%: the 50% tier
    with pytest.raises(SystemExit) as e:
        harness("false", argv=EXEC, **governor_scenario())
    assert e.value.code == 5 and FakeKIS.orders == []
    out = capsys.readouterr()
    assert "DD gate: reduced tier" in out.out and "| sell | AAA |" in out.out
    ev = [x for x in harness.events if x["event"] == "approval_required"][0]
    assert len(ev["reasons"]) == 1 and "drawdown governor" in ev["reasons"][0]


def test_G5_the_proposed_plan_sells_once_its_hash_is_approved(harness, dd_state, capsys, monkeypatch):
    dd_state(initial_state(15000.0 / 0.91))
    h = true_hash(harness, capsys, **governor_scenario())
    monkeypatch.setenv(APPROVED_PLAN_HASH_ENV, h)
    harness("false", argv=EXEC, **governor_scenario())
    assert sold() == [("sell", "AAA", 13)]


def test_G5_a_halt_proposes_a_liquidation_and_does_not_sell(harness, dd_state, capsys, monkeypatch):
    dd_state(initial_state(30000.0))                            # -50%: HALT, targets cleared
    with pytest.raises(SystemExit) as e:
        harness("false", argv=EXEC, **governor_scenario())
    assert e.value.code == 5 and FakeKIS.orders == []
    ev = [x for x in harness.events if x["event"] == "approval_required"][0]
    assert any("drawdown governor" in r for r in ev["reasons"])
    assert any("empty target while long" in r for r in ev["reasons"])
    monkeypatch.setenv(APPROVED_PLAN_HASH_ENV, ev["plan_hash"])
    harness("false", argv=EXEC, **governor_scenario())
    assert sold() == [("sell", "AAA", 50)]


def test_G5_a_sticky_halt_also_only_proposes(harness, dd_state):
    st = initial_state(15000.0)
    st["halted"] = True
    dd_state(st)
    with pytest.raises(SystemExit) as e:
        harness("false", argv=EXEC, **governor_scenario())
    assert e.value.code == 5 and FakeKIS.orders == []


def test_G5_whether_a_trip_needs_approval_is_one_named_value(harness, dd_state, monkeypatch):
    monkeypatch.setattr(approval, "DD_TRIP_REQUIRES_APPROVAL", False)    # the A5 decision
    dd_state(initial_state(15000.0 / 0.91))
    harness("false", argv=EXEC, **governor_scenario())
    assert sold() == [("sell", "AAA", 13)]


# --------------------------------------------------- G5: a state-store outage halts
def test_G5_a_state_store_outage_halts_instead_of_trading_ungated(harness, monkeypatch, capsys):
    saved = []
    monkeypatch.setattr(sync, "load_dd_states", lambda: (None, "error"))
    monkeypatch.setattr(sync, "save_dd_states", lambda envs: saved.append(envs) or True)
    with pytest.raises(SystemExit) as e:
        harness("false", argv=EXEC, ledger_book=book({"BBB": {"shares": 100, "entry_price": 100.0}},
                                                      cash=5000.0))
    assert "drawdown state store is unreachable" in str(e.value) and e.value.code != 0
    assert FakeKIS.orders == [] and saved == []
    assert [x["event"] for x in harness.events if x["event"] == "dd_store_down_halt"]
    assert any("HALTED" in t for t in harness.telegrams)
    assert "UNGATED" not in capsys.readouterr().out


def test_G5_a_state_store_outage_halts_a_dry_run_too(harness, monkeypatch):
    # a dry run would print a plan, and a hash, that ignores the governor
    monkeypatch.setattr(sync, "load_dd_states", lambda: (None, "error"))
    with pytest.raises(SystemExit):
        harness("false", argv=DRY, **empty_while_long())
    assert FakeKIS.orders == []


def test_G5_an_empty_but_reachable_store_is_not_an_outage(harness, monkeypatch):
    monkeypatch.setattr(sync, "load_dd_states", lambda: ({}, "empty"))
    harness("false", argv=EXEC, ledger_book=book({"BBB": {"shares": 100, "entry_price": 100.0}},
                                                  cash=5000.0))
    assert [o[0] for o in FakeKIS.orders] == ["buy"]


# ------------------------------------------- G5: a dry run saves no governor state
def test_G5_a_dry_run_saves_no_governor_state(harness, dd_state, capsys):
    dd_state(initial_state(15000.0 / 0.91))                    # even a tripping run
    harness("false", argv=DRY, **governor_scenario())
    assert dd_state.saved == []
    assert "governor state not saved" in capsys.readouterr().out


def test_G5_a_dry_run_cannot_latch_a_halt(harness, dd_state):
    dd_state(initial_state(30000.0))                           # this run would latch halted=True
    harness("false", argv=DRY, **governor_scenario())
    assert dd_state.saved == []


def test_G5_a_dry_run_with_dd_rebase_or_resume_saves_nothing(harness, dd_state):
    dd_state(initial_state(15000.0))
    for flag in ("--dd-rebase", "--dd-resume"):
        harness("false", argv=DRY + [flag], **governor_scenario())
    assert dd_state.saved == []


def test_G5_an_execute_run_still_saves_the_state(harness, dd_state):
    dd_state(initial_state(15000.0))
    harness("false", argv=EXEC, **governor_scenario())
    assert len(dd_state.saved) == 1
    st = dd_state.saved[0]["real"]
    assert st["peak_nav"] == 15000.0 and st["snap"]["holdings"] == {"AAA": 50.0}


# ===================================================== A16: KIS_DD_DISABLE needs approval (operator 2026-10-30)
def test_A16_governor_disabled_a_buy_plan_needs_approval(harness, capsys, monkeypatch):
    monkeypatch.setenv("KIS_DD_DISABLE", "true")
    with pytest.raises(SystemExit) as e:
        harness("false", argv=EXEC, **governor_scenario())
    assert e.value.code == EXIT_APPROVAL_REQUIRED and FakeKIS.orders == []
    ev = [x for x in harness.events if x["event"] == "approval_required"][0]
    assert ev["reasons"] == ["the drawdown governor is disabled (KIS_DD_DISABLE)"]


def test_A16_governor_disabled_trades_once_its_hash_is_approved(harness, capsys, monkeypatch):
    monkeypatch.setenv("KIS_DD_DISABLE", "true")
    h = true_hash(harness, capsys, **governor_scenario())
    monkeypatch.setenv(APPROVED_PLAN_HASH_ENV, h)
    harness("false", argv=EXEC, **governor_scenario())
    assert [o[0] for o in FakeKIS.orders] == ["buy"]


# ===================================================== A14/A15: the workflow wiring (operator 2026-10-30)
def _sync_step_env():
    text = (Path(__file__).resolve().parent.parent / ".github" / "workflows" / "kis-sync.yml").read_text(encoding="utf-8")
    return text.split("- name: Run sync", 1)[1].split("run: |", 1)[0]


def test_A14_workflow_passes_model_release_blocked():
    assert "MODEL_RELEASE_BLOCKED: ${{ vars.MODEL_RELEASE_BLOCKED || '' }}" in _sync_step_env()


def test_A15_workflow_passes_the_approval_input_through_env():
    assert f"{APPROVED_PLAN_HASH_ENV}: ${{{{ inputs.approve_plan }}}}" in _sync_step_env()

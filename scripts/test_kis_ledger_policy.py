"""SPEC 3R guards G6 (real-money ledger allow-list) and G7 (model_release_blocked is a switch).

Fake broker, fake stores, no network, no credentials, no KIS endpoint. Reuses the harness of
test_kis_guards.py (sync.main() driven end to end).

Run: python -m pytest scripts/test_kis_ledger_policy.py -q
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kis.ledger_policy as policy  # noqa: E402
import sync_kis_portfolio as sync  # noqa: E402
from kis.halt import model_release_blocked_state  # noqa: E402
from kis.ledger_policy import KIS_REAL_LEDGERS, MODEL_DERIVED_LEDGERS, ledger_refusals  # noqa: E402
from kis.targets import PAPER_ONLY_LEDGERS  # noqa: E402
from test_kis_guards import FakeKIS, book, harness, pos  # noqa: E402,F401  (harness is a fixture)

BLOCKING = [None, "", "  ", "true", "TRUE", " True ", "1", "yes", "0", "no", "off", "tru", "flase",
            "false.", "'false'", "False!", "blocked"]
OPEN = ["false", "FALSE", "False", " false ", "\tfalse\n"]
ALL_MODEL = ["rn_depth", "rn_gemini", "rn_v4", "rn_v4_low", "rn_v4_abs"]


def named(key, holdings=None, cash=5000.0):
    """A one-ledger book under `key` (the harness book is always called rn_depth)."""
    b = book(holdings if holdings is not None else {"BBB": {"shares": 100, "entry_price": 100.0}},
             cash=cash)
    b["ledgers"] = {key: b["ledgers"]["rn_depth"]}
    return b


def argv(env, ledger, *extra):
    return ["--env", env, "--ledger", ledger, "--max-turnover", "100", *extra]


def release(monkeypatch, value):
    if value is None:
        monkeypatch.delenv("MODEL_RELEASE_BLOCKED", raising=False)
    else:
        monkeypatch.setenv("MODEL_RELEASE_BLOCKED", value)


# ============================================================ the defaults
def test_defaults_live_in_one_place_each():
    assert KIS_REAL_LEDGERS == frozenset({"rn_depth"})
    assert MODEL_DERIVED_LEDGERS == frozenset(ALL_MODEL)
    assert PAPER_ONLY_LEDGERS == frozenset({"rn_gemini", "rn_v4", "rn_v4_low", "rn_v4_abs"})
    assert PAPER_ONLY_LEDGERS <= MODEL_DERIVED_LEDGERS


# ================================================================== G6
@pytest.mark.parametrize("ledger", ["equal", "equal_llm", "plan", "rn_x", "RN_DEPTH", "rn_depth "])
def test_G6_real_refuses_any_ledger_not_on_the_allow_list(harness, ledger):
    with pytest.raises(SystemExit) as e:
        harness("false", ledger_book=named(ledger),
                argv=argv("real", ledger, "--execute", "--confirm-real"))
    assert "allow-list" in str(e.value) and ("--env real" in str(e.value))
    assert FakeKIS.orders == [] and FakeKIS.built == [], "refused before the broker client exists"
    ev = [x for x in harness.events if x["event"] == "ledger_refused"]
    assert len(ev) == 1 and ev[0]["env"] == "real" and ev[0]["ledger"] == ledger


def test_G6_a_dry_run_on_real_is_refused_too(harness):
    with pytest.raises(SystemExit):
        harness("false", ledger_book=named("equal"), argv=argv("real", "equal"))
    assert FakeKIS.built == []


def test_G6_the_allowed_ledger_still_mirrors_to_real(harness):
    harness("false", ledger_book=named("rn_depth"),
            argv=argv("real", "rn_depth", "--execute", "--confirm-real"))
    assert [o[0] for o in FakeKIS.orders] == ["buy"]


def test_G6_paper_may_mirror_a_ledger_that_is_not_on_the_real_list(harness):
    harness("false", ledger_book=named("equal"), argv=argv("paper", "equal", "--execute"))
    assert [o[0] for o in FakeKIS.orders] == ["buy"]


def test_G6_the_allow_list_is_one_named_value(harness, monkeypatch):
    assert ledger_refusals("equal", "real") != []
    monkeypatch.setattr(policy, "KIS_REAL_LEDGERS", frozenset({"rn_depth", "equal"}))   # the A6 decision
    assert ledger_refusals("equal", "real") == []
    harness("false", ledger_book=named("equal"),
            argv=argv("real", "equal", "--execute", "--confirm-real"))
    assert [o[0] for o in FakeKIS.orders] == ["buy"]


@pytest.mark.parametrize("ledger", sorted(PAPER_ONLY_LEDGERS))
def test_G6_the_paper_only_deny_list_stays(harness, monkeypatch, ledger):
    # the allow-list refuses these on real; the deny-list in kis.targets still refuses them
    # on every env, even when the release is open and the allow-list were widened
    release(monkeypatch, "false")
    monkeypatch.setattr(policy, "KIS_REAL_LEDGERS", frozenset({"rn_depth", ledger}))
    for env in ("paper", "real"):
        with pytest.raises(ValueError, match="paper-only"):
            harness("false", ledger_book=named(ledger),
                    argv=argv(env, ledger, "--execute", "--confirm-real"))
    assert FakeKIS.orders == []


@pytest.mark.parametrize("ledger", sorted(PAPER_ONLY_LEDGERS))
def test_G6_paper_only_ledgers_are_refused_on_real_before_the_target_load(harness, ledger):
    with pytest.raises(SystemExit) as e:
        harness("false", ledger_book=named(ledger),
                argv=argv("real", ledger, "--execute", "--confirm-real"))
    assert "allow-list" in str(e.value) and FakeKIS.built == []


# ================================================================== G7: the switch
def test_G7_unset_reason():
    assert model_release_blocked_state({}) == (True, "MODEL_RELEASE_BLOCKED unset")


@pytest.mark.parametrize("raw", [v for v in BLOCKING if v is not None])
def test_G7_anything_but_false_is_blocked(raw):
    blocked, reason = model_release_blocked_state({"MODEL_RELEASE_BLOCKED": raw})
    assert blocked is True
    assert reason == f"MODEL_RELEASE_BLOCKED={raw!r} is not 'false'"


@pytest.mark.parametrize("raw", OPEN)
def test_G7_only_false_after_strip_and_lower_is_open(raw):
    assert model_release_blocked_state({"MODEL_RELEASE_BLOCKED": raw}) == (False, "")


def test_G7_reads_the_real_environment(monkeypatch):
    monkeypatch.delenv("MODEL_RELEASE_BLOCKED", raising=False)
    assert model_release_blocked_state()[0] is True
    monkeypatch.setenv("MODEL_RELEASE_BLOCKED", "false")
    assert model_release_blocked_state() == (False, "")


@pytest.mark.parametrize("raw", BLOCKING, ids=lambda v: "UNSET" if v is None else repr(v))
@pytest.mark.parametrize("env", ["real", "paper"])
def test_G7_blocked_refuses_a_model_derived_ledger_on_both_envs(harness, monkeypatch, env, raw):
    release(monkeypatch, raw)
    with pytest.raises(SystemExit) as e:
        harness("false", ledger_book=named("rn_depth"),
                argv=argv(env, "rn_depth", "--execute", "--confirm-real"))
    assert "model release is blocked" in str(e.value)
    assert FakeKIS.orders == [] and FakeKIS.built == []
    ev = [x for x in harness.events if x["event"] == "ledger_refused"]
    assert len(ev) == 1 and any("model release" in r for r in ev[0]["reasons"])


@pytest.mark.parametrize("ledger", ALL_MODEL)
@pytest.mark.parametrize("env", ["real", "paper"])
def test_G7_every_model_derived_ledger_is_blocked(monkeypatch, ledger, env):
    release(monkeypatch, "true")
    assert any("model release is blocked" in r for r in ledger_refusals(ledger, env))


def test_G7_a_dry_run_is_blocked_too(harness, monkeypatch):
    release(monkeypatch, None)
    with pytest.raises(SystemExit):
        harness("false", ledger_book=named("rn_depth"), argv=argv("paper", "rn_depth"))
    assert FakeKIS.built == []


@pytest.mark.parametrize("raw", OPEN)
def test_G7_open_release_lets_the_allowed_ledger_trade(harness, monkeypatch, raw):
    release(monkeypatch, raw)
    harness("false", ledger_book=named("rn_depth"),
            argv=argv("real", "rn_depth", "--execute", "--confirm-real"))
    assert [o[0] for o in FakeKIS.orders] == ["buy"]


def test_G7_a_ledger_that_is_not_model_derived_is_not_blocked(harness, monkeypatch):
    release(monkeypatch, "true")
    assert ledger_refusals("equal", "paper") == []
    harness("false", ledger_book=named("equal"), argv=argv("paper", "equal", "--execute"))
    assert [o[0] for o in FakeKIS.orders] == ["buy"]


def test_G7_the_model_derived_set_is_one_named_value(monkeypatch):
    release(monkeypatch, "true")
    assert ledger_refusals("equal", "paper") == []
    monkeypatch.setattr(policy, "MODEL_DERIVED_LEDGERS", MODEL_DERIVED_LEDGERS | {"equal"})
    assert ledger_refusals("equal", "paper") != []


def test_G7_both_reasons_are_reported_together():
    r = ledger_refusals("rn_gemini", "real", {})
    assert len(r) == 2 and "allow-list" in r[0] and "model release" in r[1]


def test_G7_the_halt_is_checked_first_and_alone(harness, monkeypatch):
    release(monkeypatch, None)
    harness(None, ledger_book=named("rn_depth"),
            argv=argv("real", "rn_depth", "--execute", "--confirm-real"))      # halted: returns, no exit
    assert [x["event"] for x in harness.events] == ["halted"]

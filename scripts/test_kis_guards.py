"""SPEC 3R execution-safety guards G1, G8, G9, driven end to end on a fake broker.

No network, no credentials, no KIS endpoint: sync_kis_portfolio.main() and
kis_liquidate_except.main() run with a fake KIS client (it records every order
call), a fake ledger book, a fake drawdown state store, and a temp log path.

Run: python -m pytest scripts/test_kis_guards.py -q
"""

import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kis_liquidate_except as liq  # noqa: E402
import sync_kis_portfolio as sync  # noqa: E402
from kis.client import KISClient  # noqa: E402
import kis.targets as kis_targets  # noqa: E402
from kis.halt import kis_halt_state  # noqa: E402
from kis.targets import ledger_weights  # noqa: E402

REPO = Path(__file__).resolve().parents[1]
TODAY = date.today().isoformat()

# KIS_HALT values that must halt. None = variable absent from the environment.
HALTING = [None, "", "  ", "0", "no", "off", "n", "fals", "flase", "tru", "true", "TRUE",
           " True ", "1", "yes", "halt", "false.", "'false'", "False!"]
TRADING = ["false", "FALSE", "False", " false ", "\tfalse\n"]


# --------------------------------------------------------------------------- fakes
class FakeKIS:
    """Stands in for KISClient. Class-level state so a test can read what the run did."""
    positions: list = []
    orders: list = []
    built: list = []

    def __init__(self, env, key, secret, cano, acnt):
        self.env = env
        FakeKIS.built.append(env)

    def balance(self):
        return [dict(p) for p in FakeKIS.positions]

    def usd_funds(self, with_orderable=True):
        return {"deposit": 10000.0, "withdrawable": 10000.0, "sell_in_transit": 0.0,
                "buy_in_transit": 0.0, "nav_cash": 10000.0, "orderable": 10000.0,
                "kis_total_usd": 0.0, "kis_krw_reserve_usd": 0.0,
                "source": "deposit", "row": {}, "bp": {}}

    def unfilled(self):
        return []

    def quote(self, excd, ticker):
        return 100.0

    def resolve_exchange(self, ticker):
        return "NAS", 100.0

    def place_order(self, side, exch, ticker, qty, limit):
        FakeKIS.orders.append((side, exch, ticker, qty, limit))
        return {"ok": True, "order_no": f"F{len(FakeKIS.orders)}", "msg": "fake"}


def book(holdings=None, cash=10000.0, marks=None):
    return {"ledgers": {"rn_depth": {
        "current_date": TODAY,
        "state": {"cash": cash, "holdings": holdings or {}},
        "last_marks": marks or {}}}}


@pytest.fixture
def harness(monkeypatch, tmp_path):
    """Wires sync.main() to fakes. Returns a run(env_halt, argv, ...) callable."""
    FakeKIS.positions, FakeKIS.orders, FakeKIS.built = [], [], []
    events, telegrams = [], []
    for k in ("KIS_HALT", "KIS_LEDGER", "KIS_ENV", "KIS_DD_DISABLE", "GITHUB_OUTPUT",
              "GITHUB_STEP_SUMMARY", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_KEY",
              "GITHUB_ACTIONS"):
        monkeypatch.delenv(k, raising=False)
    for k in ("KIS_APP_KEY", "KIS_APP_SECRET", "KIS_CANO", "KIS_ACNT_PRDT_CD"):
        monkeypatch.setenv(k, "fake")
    monkeypatch.setattr(sync, "LOG_PATH", tmp_path / "kis_sync.jsonl")
    monkeypatch.setattr(sync, "EXCHANGE_MAP", tmp_path / "exchange_map.json")
    monkeypatch.setattr(sync, "JOURNAL_PATH", tmp_path / "kis_order_journal.jsonl")   # G3
    overlay = tmp_path.parent / (tmp_path.name + "_overlay.json")                  # G4: fresh
    overlay.write_text(json.dumps({"generated_at": datetime.now(timezone.utc).isoformat()}))
    monkeypatch.setitem(kis_targets.OVERLAY_FILES, "rn_depth", overlay)
    monkeypatch.setattr(sync, "KISClient", FakeKIS)
    monkeypatch.setattr(liq, "KISClient", FakeKIS)
    monkeypatch.setattr(sync, "us_market_open", lambda now=None: True)
    monkeypatch.setattr(liq, "us_market_open", lambda now=None: True)
    monkeypatch.setattr(sync.time, "sleep", lambda s: None)
    monkeypatch.setattr(sync, "load_dd_states", lambda: ({}, "empty"))
    monkeypatch.setattr(sync, "save_dd_states", lambda envs: True)
    monkeypatch.setattr(sync, "send_telegram", lambda msg, **k: telegrams.append(msg) or True)
    monkeypatch.setattr(sync, "sb_upsert", lambda *a, **k: True)
    monkeypatch.setattr(sync, "log_event", lambda e: events.append(dict(e)))
    monkeypatch.setattr(liq, "log_event", lambda e: events.append(dict(e)))
    state = {"book": book()}
    monkeypatch.setattr(sync, "load_ledger_book", lambda: (state["book"], "fake"))

    def run(halt, ledger_book=None, positions=None, argv=None, module=sync):
        if halt is None:
            monkeypatch.delenv("KIS_HALT", raising=False)
        else:
            monkeypatch.setenv("KIS_HALT", halt)
        if ledger_book is not None:
            state["book"] = ledger_book
        FakeKIS.positions = positions or []
        args = argv if argv is not None else ["--env", "real", "--ledger", "rn_depth",
                                              "--execute", "--confirm-real"]
        monkeypatch.setattr(sys, "argv", ["prog"] + args)
        module.main()

    run.events, run.telegrams, run.tmp = events, telegrams, tmp_path
    return run


def pos(ticker, shares, sellable=None):
    return {"ticker": ticker, "shares": shares,
            "sellable": shares if sellable is None else sellable,
            "exch_order_cd": "NASD", "name": ticker, "avg_cost": 90.0}


# ------------------------------------------------------------------- G1: the rule
def test_halt_state_unset_reason():
    assert kis_halt_state({}) == (True, "KIS_HALT unset")


@pytest.mark.parametrize("raw", [v for v in HALTING if v is not None])
def test_halt_state_anything_but_false_halts(raw):
    halted, reason = kis_halt_state({"KIS_HALT": raw})
    assert halted is True
    assert reason == f"KIS_HALT={raw!r} is not 'false'"


@pytest.mark.parametrize("raw", TRADING)
def test_halt_state_false_after_strip_and_lower_trades(raw):
    assert kis_halt_state({"KIS_HALT": raw}) == (False, "")


def test_halt_state_reads_the_real_environment(monkeypatch):
    monkeypatch.delenv("KIS_HALT", raising=False)
    assert kis_halt_state()[0] is True
    monkeypatch.setenv("KIS_HALT", "false")
    assert kis_halt_state() == (False, "")


# --------------------------------------------- G1: sync.main() driven end to end
@pytest.mark.parametrize("raw", HALTING, ids=lambda v: "UNSET" if v is None else repr(v))
def test_sync_halts_and_sends_no_order(harness, capsys, raw):
    harness(raw, ledger_book=book({"AAA": {"shares": 5, "entry_price": 100.0}}, cash=500.0),
            positions=[pos("AAA", 5)])
    out = capsys.readouterr().out
    assert FakeKIS.orders == []
    assert FakeKIS.built == [], "a halted run must stop before the broker client is built"
    expected = "KIS_HALT unset" if raw is None else f"KIS_HALT={raw!r} is not 'false'"
    assert expected in out
    assert [(e["event"], e["reason"]) for e in harness.events] == [("halted", expected)]


@pytest.mark.parametrize("raw", HALTING, ids=lambda v: "UNSET" if v is None else repr(v))
def test_sync_halts_even_with_a_target_to_buy(harness, raw):
    harness(raw, ledger_book=book({"BBB": {"shares": 50, "entry_price": 100.0}}, cash=5000.0))
    assert FakeKIS.orders == []


@pytest.mark.parametrize("raw", HALTING, ids=lambda v: "UNSET" if v is None else repr(v))
def test_sync_halts_the_probe_too(harness, raw):
    harness(raw, argv=["--env", "real", "--ledger", "rn_depth", "--probe"])
    assert FakeKIS.built == []


@pytest.mark.parametrize("raw", TRADING)
def test_sync_trades_when_halt_is_false(harness, raw):
    # ledger holds BBB (100 sh x $100 = $10,000 + $5,000 cash); the account holds nothing.
    harness(raw, ledger_book=book({"BBB": {"shares": 100, "entry_price": 100.0}}, cash=5000.0),
            argv=["--env", "real", "--ledger", "rn_depth", "--execute", "--confirm-real",
                  "--max-turnover", "100"])
    assert FakeKIS.built == ["real"]
    assert [o[0] for o in FakeKIS.orders] == ["buy"]
    assert FakeKIS.orders[0][2] == "BBB"


def test_sync_false_dry_run_sends_nothing(harness):
    harness("false", ledger_book=book({"BBB": {"shares": 100, "entry_price": 100.0}}),
            argv=["--env", "real", "--ledger", "rn_depth"])
    assert FakeKIS.orders == []


def test_G2_OPEN_CASE_empty_target_while_long_sells_the_whole_book(harness):
    """SPEC G2's open case, asserted AS IT IS TODAY and not fixed here (WO_R2).

    rn_depth holds nothing (all cash), so its target is empty. With KIS_HALT='false' the
    mirror sells every held name, because exits are exempt from the turnover cap.
    When G2 lands, this test must change to expect a refusal and zero orders.
    """
    harness("false", ledger_book=book(holdings={}, cash=95.76),
            positions=[pos("AAA", 100), pos("BBB", 50), pos("CCC", 20)])
    assert sorted((o[0], o[2], o[3]) for o in FakeKIS.orders) == [
        ("sell", "AAA", 100), ("sell", "BBB", 50), ("sell", "CCC", 20)]


# ---------------------------------------------------------- G8: no traded marker
def test_halted_run_writes_halted_output_and_no_traded_marker(harness, monkeypatch):
    """A halted run exits 0, which is why the workflow's 'Mark traded' step fires on it.
    The marker itself is workflow text (kis-sync.yml, step 'Mark traded'), not script
    output; the script tells the workflow it halted via the step output below."""
    out_file = harness.tmp / "github_output"
    summary = harness.tmp / "github_summary"
    monkeypatch.setenv("GITHUB_OUTPUT", str(out_file))
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(summary))
    harness(None)
    assert out_file.read_text() == "halted=true\n"
    assert "traded" not in out_file.read_text() + summary.read_text().lower().replace("halted", "")
    assert sorted(p.name for p in harness.tmp.iterdir()) == ["github_output", "github_summary"]


def test_trading_run_does_not_say_halted(harness, monkeypatch):
    out_file = harness.tmp / "github_output"
    monkeypatch.setenv("GITHUB_OUTPUT", str(out_file))
    harness("false", ledger_book=book({"BBB": {"shares": 100, "entry_price": 100.0}}))
    assert not out_file.exists() or "halted" not in out_file.read_text()


@pytest.mark.xfail(reason="G8: the 'Mark traded' marker is written by kis-sync.yml, which this "
                          "work order may not edit. Operator fix: see RR_R2.md", strict=False)
def test_workflow_mark_traded_step_skips_a_halted_run():
    text = (REPO / ".github" / "workflows" / "kis-sync.yml").read_text(encoding="utf-8")
    step = text.split("- name: Mark traded", 1)[1].split("- name:", 1)[0]
    cond = next(line for line in step.splitlines() if line.strip().startswith("if:"))
    assert "halted" in cond


# ------------------------------------------- G1: kis_liquidate_except --execute
LIQ_ARGV = ["--env", "real", "--keep-none"]


def test_liquidate_halted_refuses_execute(harness):
    for raw in (None, "", "0", "no", "tru", "true"):
        FakeKIS.orders.clear()
        with pytest.raises(SystemExit) as e:
            harness(raw, positions=[pos("AAA", 10)], module=liq,
                    argv=LIQ_ARGV + ["--execute", "--confirm-real"])
        assert "refusing --execute: halted" in str(e.value)
        assert FakeKIS.orders == []


def test_liquidate_halted_dry_run_still_plans(harness, capsys):
    harness(None, positions=[pos("AAA", 10)], module=liq, argv=LIQ_ARGV)
    out = capsys.readouterr().out
    assert "KIS_HALT: halted (KIS_HALT unset)" in out
    assert "DRY RUN" in out
    assert FakeKIS.orders == []


def test_liquidate_ignore_halt_alone_is_not_enough(harness):
    with pytest.raises(SystemExit) as e:
        harness(None, positions=[pos("AAA", 10)], module=liq,
                argv=LIQ_ARGV + ["--execute", "--ignore-halt"])
    assert "refusing --execute: halted" in str(e.value)
    assert FakeKIS.orders == []


def test_liquidate_confirm_real_alone_is_not_enough(harness):
    with pytest.raises(SystemExit):
        harness("", positions=[pos("AAA", 10)], module=liq,
                argv=LIQ_ARGV + ["--execute", "--confirm-real"])
    assert FakeKIS.orders == []


def test_liquidate_ignore_halt_with_confirm_real_overrides(harness, capsys):
    harness("true", positions=[pos("AAA", 10)], module=liq,
            argv=LIQ_ARGV + ["--execute", "--ignore-halt", "--confirm-real"])
    assert [o[:4] for o in FakeKIS.orders] == [("sell", "NASD", "AAA", 10)]
    assert "--ignore-halt" in capsys.readouterr().out


def test_liquidate_false_executes_with_confirm_real_only(harness):
    harness("false", positions=[pos("AAA", 10)], module=liq,
            argv=LIQ_ARGV + ["--execute", "--confirm-real"])
    assert len(FakeKIS.orders) == 1


# ------------------------------------------------------------- G9: zero is a value
def test_ledger_mark_zero_refuses_the_plan_instead_of_selling_on_a_bad_quote():
    # AUDIT_R2: a 0.0 mark valued at 0 would give a held name a target weight of 0, a sale
    b = book({"AAA": {"shares": 10, "entry_price": 100.0},
              "BBB": {"shares": 10, "entry_price": 50.0}}, cash=500.0,
             marks={"AAA": 0.0, "BBB": 50.0})
    with pytest.raises(RuntimeError, match=r"mark <= 0: \['AAA'\]"):
        ledger_weights(b, "rn_depth")


def test_ledger_negative_mark_refuses():
    b = book({"AAA": {"shares": 10, "entry_price": 100.0}}, cash=500.0, marks={"AAA": -1.0})
    with pytest.raises(RuntimeError, match="refusing to trade"):
        ledger_weights(b, "rn_depth")


def test_ledger_missing_mark_still_falls_back_to_entry_price():
    b = book({"AAA": {"shares": 10, "entry_price": 100.0}}, cash=0.0, marks={})
    assert ledger_weights(b, "rn_depth")["weights"] == {"AAA": 1.0}


def test_ledger_no_mark_and_no_entry_price_refuses_instead_of_excluding():
    # it used to be excluded from targets (weight 0), which plans a sale of the held name
    b = book({"AAA": {"shares": 10}, "BBB": {"shares": 10, "entry_price": 50.0}}, cash=500.0)
    with pytest.raises(RuntimeError, match=r"no mark: \['AAA'\]"):
        ledger_weights(b, "rn_depth")


def test_ledger_nonzero_marks_unchanged():
    b = book({"AAA": {"shares": 10, "entry_price": 100.0}}, cash=500.0, marks={"AAA": 150.0})
    t = ledger_weights(b, "rn_depth")
    assert t["nav"] == 2000.0 and t["weights"]["AAA"] == 0.75


def _balance_client(rows):
    payload = {"output1": rows}

    class Fake(KISClient):
        def __init__(self):
            self.env, self.cano, self.acnt_prdt_cd = "real", "00000000", "01"

        def _get(self, *a, **k):
            return payload, ""
    return Fake()


def _row(**kw):
    return {"ovrs_pdno": "AAA", "ovrs_cblc_qty": "10", "ovrs_excg_cd": "NASD",
            "pchs_avg_pric": "90", **kw}


@pytest.mark.parametrize("psbl", ["0", "0.0", 0, 0.0])
def test_balance_sellable_zero_is_zero_not_the_full_quantity(psbl):
    (p,) = _balance_client([_row(ord_psbl_qty=psbl)]).balance()
    assert p["shares"] == 10.0 and p["sellable"] == 0.0


@pytest.mark.parametrize("row", [_row(), _row(ord_psbl_qty=None), _row(ord_psbl_qty="")])
def test_balance_missing_sellable_still_means_all_shares(row):
    (p,) = _balance_client([row]).balance()
    assert p["sellable"] == 10.0


def test_balance_nonzero_sellable_unchanged():
    (p,) = _balance_client([_row(ord_psbl_qty="4")]).balance()
    assert p["sellable"] == 4.0


def test_sync_with_zero_sellable_places_no_sell(harness):
    """End to end: a held name with sellable=0 (locked) must not be sold on an empty target."""
    harness("false", ledger_book=book(holdings={}, cash=95.76),
            positions=[pos("AAA", 10, sellable=0)])
    assert FakeKIS.orders == []

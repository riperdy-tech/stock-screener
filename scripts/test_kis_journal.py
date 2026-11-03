"""SPEC 3R guards G3 (order journal, idempotency key) and G4 (freshness of the served source).

Fake broker, fake stores, no network, no credentials, no KIS endpoint. Reuses the harness of
test_kis_guards.py (sync.main() and kis_liquidate_except.main() driven end to end).

Run: python -m pytest scripts/test_kis_journal.py -q
"""

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kis.targets as kt  # noqa: E402
import kis_liquidate_except as liq  # noqa: E402
import sync_kis_portfolio as sync  # noqa: E402
from kis.journal import (  # noqa: E402
    JournalError, LocalFileJournal, idempotency_key, last_entries, open_entries, plan_hash,
    run_reconcile, send_order, state_of,
)
from test_kis_guards import FakeKIS, book, harness, pos  # noqa: E402,F401  (harness is a fixture)

BUY_ARGV = ["--env", "real", "--ledger", "rn_depth", "--execute", "--confirm-real",
            "--max-turnover", "100"]


class SimulatedCrash(BaseException):
    """The process dies mid-call (not an Exception: nothing may catch it)."""


class JournalFake(FakeKIS):
    """Records every place_order attempt and checks the journal BEFORE answering.

    script: list of behaviours, one per call, consumed in order; after it runs out the
    broker accepts. A behaviour is 'ok', 'reject', 'timeout', 'conn', 'crash' or 'html'.
    """
    script: list = []
    attempts: list = []
    violations: list = []
    journal_path: Path | None = None
    daily: list | None = None            # None: the client has no daily_orders at all

    def place_order(self, side, exch, ticker, qty, limit):
        JournalFake.attempts.append((side, ticker, qty, limit))
        # G3: the 'sending' line must already be the last line for this key when the broker is
        # called. Violations are collected (an assert here would be swallowed as 'unknown').
        lines = [json.loads(x) for x in JournalFake.journal_path.read_text(
            encoding="utf-8").splitlines() if x.strip()]
        mine = [x for x in lines if x["ticker"] == ticker and x["side"] == side
                and x["qty"] == qty]
        if not mine or mine[-1]["state"] != "sending":
            JournalFake.violations.append((side, ticker, qty))
        mode = JournalFake.script.pop(0) if JournalFake.script else "ok"
        if mode == "timeout":
            raise TimeoutError("read timed out")
        if mode == "conn":
            raise ConnectionError("connection reset")
        if mode == "crash":
            raise SimulatedCrash()
        if mode == "html":
            return {"ok": False, "order_no": None, "ambiguous": True,
                    "msg": "HTTP 502: <html>bad gateway</html>"}
        if mode == "reject":
            return {"ok": False, "order_no": None, "msg": "insufficient margin"}
        FakeKIS.orders.append((side, exch, ticker, qty, limit))
        return {"ok": True, "order_no": f"J{len(FakeKIS.orders)}", "msg": ""}


class DailyFake(JournalFake):
    def daily_orders(self):
        return list(JournalFake.daily)


@pytest.fixture
def jh(harness, monkeypatch):
    """The sync/liquidate harness with the journal-aware fake broker installed."""
    JournalFake.script, JournalFake.attempts, JournalFake.daily = [], [], None
    JournalFake.violations = []
    JournalFake.journal_path = sync.JOURNAL_PATH
    monkeypatch.setattr(sync, "KISClient", JournalFake)
    monkeypatch.setattr(liq, "KISClient", JournalFake)
    harness.journal = LocalFileJournal(sync.JOURNAL_PATH)
    yield harness
    assert JournalFake.violations == [], "an order was sent before its 'sending' journal line"


def two_buys():
    return book({"AAA": {"shares": 50, "entry_price": 100.0},
                 "BBB": {"shares": 50, "entry_price": 100.0}}, cash=0.0)


def sell_then_buy():
    # account holds AAA (not in the ledger -> exit sell); ledger wants BBB (buy)
    return book({"BBB": {"shares": 50, "entry_price": 100.0}}, cash=5000.0)


def states(journal):
    return [(e["ticker"], e["side"], e["state"]) for e in journal.entries()]


# =================================================================== keys
def test_plan_hash_is_stable_and_order_independent():
    a = plan_hash("real", "rn_depth", "20261029", [("buy", "AAA", 5), ("sell", "BBB", 2)])
    b = plan_hash("real", "rn_depth", "20261029", [("sell", "BBB", 2), ("buy", "AAA", 5)])
    assert a == b and len(a) == 64


@pytest.mark.parametrize("change", [
    dict(env="paper"), dict(ledger="rn_x"), dict(trade_date="20261030"),
    dict(orders=[("buy", "AAA", 6)]), dict(orders=[("sell", "AAA", 5)]),
    dict(orders=[("buy", "AAB", 5)])])
def test_plan_hash_changes_with_every_input(change):
    base = dict(env="real", ledger="rn_depth", trade_date="20261029", orders=[("buy", "AAA", 5)])
    assert plan_hash(**base) != plan_hash(**{**base, **change})


def test_idempotency_key_covers_ticker_side_qty_price_and_seq():
    k = idempotency_key("h", "AAA", "buy", 5, 100.3)
    assert k == idempotency_key("h", "AAA", "buy", 5, 100.3)
    for other in (idempotency_key("h2", "AAA", "buy", 5, 100.3),
                  idempotency_key("h", "AAB", "buy", 5, 100.3),
                  idempotency_key("h", "AAA", "sell", 5, 100.3),
                  idempotency_key("h", "AAA", "buy", 6, 100.3),
                  idempotency_key("h", "AAA", "buy", 5, 100.31),
                  idempotency_key("h", "AAA", "buy", 5, 100.3, seq=1)):
        assert other != k


# ================================================================== store
def test_local_journal_is_append_only_and_round_trips(tmp_path):
    j = LocalFileJournal(tmp_path / "j.jsonl")
    assert j.entries() == []
    j.append({"key": "k1", "state": "sending"})
    j.append({"key": "k1", "state": "accepted"})
    assert [e["state"] for e in j.entries()] == ["sending", "accepted"]
    assert state_of(j, "k1") == "accepted" and state_of(j, "nope") is None


@pytest.mark.parametrize("bad", ['{"key": "k1", "state": "sen', "not json", "[1, 2]",
                                 '{"state": "accepted"}'])
def test_unreadable_journal_raises_instead_of_looking_empty(tmp_path, bad):
    path = tmp_path / "j.jsonl"
    path.write_text('{"key": "k0", "state": "accepted"}\n' + bad + "\n", encoding="utf-8")
    with pytest.raises(JournalError):
        LocalFileJournal(path).entries()


def test_durable_flag_follows_github_actions(tmp_path, monkeypatch):
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    assert LocalFileJournal(tmp_path / "j").durable is False
    monkeypatch.delenv("GITHUB_ACTIONS")
    assert LocalFileJournal(tmp_path / "j").durable is True
    assert LocalFileJournal(tmp_path / "j", durable=False).durable is False


# ============================================================ send_order
class OneShot:
    def __init__(self, result=None, exc=None):
        self.result, self.exc, self.calls = result, exc, 0

    def place_order(self, *a):
        self.calls += 1
        if self.exc:
            raise self.exc
        return self.result


def _send(journal, client, **kw):
    args = dict(run_id="R1", env="real", ledger="rn_depth", plan_hash_="h", side="buy",
                exch="NASD", ticker="AAA", qty=5, limit=100.3)
    return send_order(journal, client, **{**args, **kw})


@pytest.mark.parametrize("exc", [TimeoutError("t"), ConnectionError("c"), RuntimeError("boom"),
                                 OSError("sock")])
def test_any_exception_is_recorded_unknown_not_raised(tmp_path, exc):
    j = LocalFileJournal(tmp_path / "j.jsonl")
    res = _send(j, OneShot(exc=exc))
    assert res["state"] == "unknown" and res["stop"] and res["ok"] is False
    assert [e["state"] for e in j.entries()] == ["sending", "unknown"]
    assert type(exc).__name__ in j.entries()[-1]["reason"]


def test_non_json_reply_is_unknown(tmp_path):
    j = LocalFileJournal(tmp_path / "j.jsonl")
    res = _send(j, OneShot({"ok": False, "order_no": None, "ambiguous": True, "msg": "HTTP 502"}))
    assert res["state"] == "unknown" and states(j)[-1][2] == "unknown"


def test_accepted_and_rejected_are_recorded_with_order_no_and_reason(tmp_path):
    j = LocalFileJournal(tmp_path / "j.jsonl")
    ok = _send(j, OneShot({"ok": True, "order_no": "0001", "msg": ""}))
    bad = _send(j, OneShot({"ok": False, "order_no": None, "msg": "no funds"}), ticker="BBB")
    assert ok["state"] == "accepted" and "stop" not in ok
    assert bad["state"] == "rejected" and "stop" not in bad
    last = last_entries(j)
    assert last[ok["key"]]["order_no"] == "0001"
    assert last[bad["key"]]["reason"] == "no funds"
    for e in j.entries():
        assert e["env"] == "real" and e["run_id"] == "R1" and e["ts"].endswith("+00:00")


def test_accepted_key_is_never_sent_twice(tmp_path):
    j = LocalFileJournal(tmp_path / "j.jsonl")
    c = OneShot({"ok": True, "order_no": "1", "msg": ""})
    assert _send(j, c)["state"] == "accepted"
    again = _send(j, c)
    assert again["state"] == "duplicate" and c.calls == 1


@pytest.mark.parametrize("first", [{"ok": False, "order_no": None, "msg": "rejected"}])
def test_rejected_key_may_be_retried(tmp_path, first):
    j = LocalFileJournal(tmp_path / "j.jsonl")
    assert _send(j, OneShot(first))["state"] == "rejected"
    c = OneShot({"ok": True, "order_no": "2", "msg": ""})
    assert _send(j, c)["state"] == "accepted" and c.calls == 1


def test_a_journal_write_failure_means_the_order_is_not_sent(tmp_path):
    class Broken(LocalFileJournal):
        def append(self, entry):
            raise JournalError("disk full")

    c = OneShot({"ok": True, "order_no": "1", "msg": ""})
    res = _send(Broken(tmp_path / "j.jsonl"), c)
    assert res["state"] == "not_sent" and res["stop"] and c.calls == 0


# =========================================================== sync: G3 end to end
def test_journal_is_written_before_the_call_and_updated_after(jh):
    jh("false", ledger_book=sell_then_buy(), positions=[pos("AAA", 10)], argv=BUY_ARGV)
    # (the fixture also checks, at every broker call, that 'sending' was already on disk)
    assert states(jh.journal) == [("AAA", "sell", "sending"), ("AAA", "sell", "accepted"),
                                  ("BBB", "buy", "sending"), ("BBB", "buy", "accepted")]
    assert [a[:2] for a in JournalFake.attempts] == [("sell", "AAA"), ("buy", "BBB")]
    keys = {e["key"] for e in jh.journal.entries()}
    assert len(keys) == 2 and all(len(k) == 64 for k in keys)
    assert open_entries(jh.journal) == []


def test_timeout_is_unknown_the_run_stops_and_the_next_run_refuses(jh, capsys):
    JournalFake.script = ["timeout"]
    with pytest.raises(SystemExit) as e:
        jh("false", ledger_book=sell_then_buy(), positions=[pos("AAA", 10)], argv=BUY_ARGV)
    assert e.value.code == 4
    assert [a[:2] for a in JournalFake.attempts] == [("sell", "AAA")], "nothing after the unknown"
    assert states(jh.journal) == [("AAA", "sell", "sending"), ("AAA", "sell", "unknown")]
    assert "STOPPED after unknown" in capsys.readouterr().err
    assert any("STOPPED" in t for t in jh.telegrams)
    executed = [ev for ev in jh.events if ev["event"] == "execute"]
    assert executed and executed[0]["results"][0]["state"] == "unknown"

    # the next run refuses before it builds a client or sends anything
    JournalFake.attempts.clear()
    FakeKIS.built.clear()
    with pytest.raises(SystemExit) as e2:
        jh("false", ledger_book=sell_then_buy(), positions=[pos("AAA", 10)], argv=BUY_ARGV)
    assert e2.value.code == 3
    assert JournalFake.attempts == [] and FakeKIS.built == []
    err = capsys.readouterr().err
    assert "AAA" in err and "unknown" in err and "--reconcile-journal" in err


@pytest.mark.parametrize("mode", ["timeout", "conn", "html"])
def test_each_unknown_kind_blocks_the_next_run(jh, mode):
    JournalFake.script = [mode]
    with pytest.raises(SystemExit) as e:
        jh("false", ledger_book=two_buys(), argv=BUY_ARGV)
    assert e.value.code == 4 and len(JournalFake.attempts) == 1
    assert len(open_entries(jh.journal, "real")) == 1
    with pytest.raises(SystemExit) as e2:
        jh("false", ledger_book=two_buys(), argv=BUY_ARGV)
    assert e2.value.code == 3 and len(JournalFake.attempts) == 1


def test_unknown_on_the_second_buy_stops_before_the_third(jh):
    b = book({t: {"shares": 30, "entry_price": 100.0} for t in ("AAA", "BBB", "CCC")}, cash=0.0)
    JournalFake.script = ["ok", "timeout"]
    with pytest.raises(SystemExit) as e:
        jh("false", ledger_book=b, argv=BUY_ARGV)
    assert e.value.code == 4
    assert len(JournalFake.attempts) == 2
    assert [s for _, _, s in states(jh.journal)] == ["sending", "accepted", "sending", "unknown"]


def test_a_rejection_does_not_stop_the_run(jh):
    JournalFake.script = ["reject", "ok"]
    jh("false", ledger_book=two_buys(), argv=BUY_ARGV)
    assert len(JournalFake.attempts) == 2
    assert sorted(s for _, _, s in states(jh.journal) if s not in ("sending",)) == [
        "accepted", "rejected"]
    assert open_entries(jh.journal) == []


def test_a_crash_between_sending_and_the_result_blocks_the_next_run(jh):
    JournalFake.script = ["crash"]
    with pytest.raises(SimulatedCrash):
        jh("false", ledger_book=two_buys(), argv=BUY_ARGV)
    assert [s for _, _, s in states(jh.journal)] == ["sending"]
    assert [e["state"] for e in open_entries(jh.journal, "real")] == ["sending"]
    JournalFake.attempts.clear()
    with pytest.raises(SystemExit) as e:
        jh("false", ledger_book=two_buys(), argv=BUY_ARGV)
    assert e.value.code == 3 and JournalFake.attempts == []


def test_duplicate_run_with_the_same_plan_sends_nothing(jh):
    jh("false", ledger_book=two_buys(), argv=BUY_ARGV)
    n = len(JournalFake.attempts)
    assert n == 2
    jh("false", ledger_book=two_buys(), argv=BUY_ARGV)          # same plan, same UTC day
    assert len(JournalFake.attempts) == n, "an accepted key was sent again"
    assert [ev["event"] for ev in jh.events].count("order_skipped_duplicate") == 2


def test_dry_run_is_not_blocked_and_writes_nothing(jh, capsys):
    JournalFake.script = ["timeout"]
    with pytest.raises(SystemExit):
        jh("false", ledger_book=two_buys(), argv=BUY_ARGV)
    before = sync.JOURNAL_PATH.read_text(encoding="utf-8")
    jh("false", ledger_book=two_buys(), argv=["--env", "real", "--ledger", "rn_depth"])
    assert sync.JOURNAL_PATH.read_text(encoding="utf-8") == before
    assert "dry run" in capsys.readouterr().out


def test_an_unknown_in_paper_does_not_block_real(jh):
    jh.journal.append({"key": "p1", "state": "unknown", "env": "paper", "ticker": "ZZZ",
                       "side": "buy", "qty": 1, "ts": "2026-10-29T00:00:00+00:00"})
    jh("false", ledger_book=two_buys(), argv=BUY_ARGV)
    assert len(JournalFake.attempts) == 2
    with pytest.raises(SystemExit) as e:
        jh("false", ledger_book=two_buys(),
           argv=["--env", "paper", "--ledger", "rn_depth", "--execute", "--max-turnover", "100"])
    assert e.value.code == 3


def test_an_unreadable_journal_refuses_to_trade(jh):
    sync.JOURNAL_PATH.write_text('{"key": "k", "state": "sen', encoding="utf-8")
    with pytest.raises(SystemExit) as e:
        jh("false", ledger_book=two_buys(), argv=BUY_ARGV)
    assert "journal" in str(e.value) and JournalFake.attempts == []


def test_an_ephemeral_runner_refuses_to_execute_but_may_dry_run(jh, monkeypatch):
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    with pytest.raises(SystemExit) as e:
        jh("false", ledger_book=two_buys(), argv=BUY_ARGV)
    assert "ephemeral" in str(e.value) and JournalFake.attempts == []
    jh("false", ledger_book=two_buys(), argv=["--env", "real", "--ledger", "rn_depth"])
    assert JournalFake.attempts == []


# ===================================================== reconcile (fake broker)
def _unknown_run(jh):
    JournalFake.script = ["timeout"]
    with pytest.raises(SystemExit):
        jh("false", ledger_book=two_buys(), argv=BUY_ARGV)
    return open_entries(jh.journal, "real")[0]


RECONCILE_ARGV = ["--env", "real", "--reconcile-journal"]


def test_reconcile_found_at_the_broker_becomes_accepted_and_unblocks(jh, monkeypatch):
    first = _unknown_run(jh)
    monkeypatch.setattr(sync, "KISClient", DailyFake)
    JournalFake.daily = [{"ticker": first["ticker"], "side": first["side"],
                          "qty": first["qty"], "order_no": "0099"}]
    with pytest.raises(SystemExit) as e:
        jh("false", argv=RECONCILE_ARGV)
    assert e.value.code == 0
    last = last_entries(jh.journal)[first["key"]]
    assert last["state"] == "accepted" and last["order_no"] == "0099" and last["by"] == "reconcile"
    assert [x["state"] for x in jh.journal.entries()] == ["sending", "unknown", "accepted"], \
        "reconcile appends, it never rewrites"
    # the next run goes ahead, and the reconciled order is not sent a second time
    monkeypatch.setattr(sync, "KISClient", JournalFake)
    JournalFake.attempts.clear()
    jh("false", ledger_book=two_buys(), argv=BUY_ARGV)
    assert first["ticker"] not in [a[1] for a in JournalFake.attempts]
    assert len(JournalFake.attempts) == 1


def test_reconcile_not_found_becomes_absent_and_the_order_may_be_sent_again(jh, monkeypatch):
    first = _unknown_run(jh)
    monkeypatch.setattr(sync, "KISClient", DailyFake)
    JournalFake.daily = []
    with pytest.raises(SystemExit) as e:
        jh("false", argv=RECONCILE_ARGV)
    assert e.value.code == 0
    assert last_entries(jh.journal)[first["key"]]["state"] == "absent"
    monkeypatch.setattr(sync, "KISClient", JournalFake)
    JournalFake.attempts.clear()
    jh("false", ledger_book=two_buys(), argv=BUY_ARGV)
    assert len(JournalFake.attempts) == 2 and first["ticker"] in [a[1] for a in JournalFake.attempts]


def test_reconcile_without_a_broker_order_list_says_so_and_stops(jh, capsys):
    _unknown_run(jh)
    capsys.readouterr()
    with pytest.raises(SystemExit) as e:
        jh("false", argv=RECONCILE_ARGV)               # JournalFake has no daily_orders
    assert e.value.code == 2
    assert "no same-day order-history method" in capsys.readouterr().out
    assert len(open_entries(jh.journal, "real")) == 1


def test_reconcile_leaves_an_older_key_open(tmp_path):
    j = LocalFileJournal(tmp_path / "j.jsonl")
    j.append({"key": "old", "state": "unknown", "env": "real", "ticker": "AAA", "side": "buy",
              "qty": 5, "ts": "2026-10-27T15:00:00+00:00"})
    rc = run_reconcile(j, DailyFake("real", "k", "s", "c", "a"), "real", today="2026-10-29")
    assert rc == 2 and state_of(j, "old") == "unknown"


def test_reconcile_matches_each_broker_row_once(tmp_path):
    JournalFake.daily = [{"ticker": "AAA", "side": "buy", "qty": 5, "order_no": "1"}]
    j = LocalFileJournal(tmp_path / "j.jsonl")
    for k in ("k1", "k2"):
        j.append({"key": k, "state": "unknown", "env": "real", "ticker": "AAA", "side": "buy",
                  "qty": 5, "ts": "2026-10-29T15:00:00+00:00"})
    rc = run_reconcile(j, DailyFake("real", "k", "s", "c", "a"), "real", today="2026-10-29")
    assert rc == 0
    assert sorted(state_of(j, k) for k in ("k1", "k2")) == ["absent", "accepted"]


def test_reconcile_runs_while_halted_and_sends_no_order(jh, monkeypatch):
    _unknown_run(jh)
    monkeypatch.setattr(sync, "KISClient", DailyFake)
    JournalFake.daily = []
    JournalFake.attempts.clear()
    with pytest.raises(SystemExit) as e:
        jh(None, argv=RECONCILE_ARGV)                  # KIS_HALT unset
    assert e.value.code == 0 and JournalFake.attempts == []


# ============================================================ liquidate_except
LIQ = ["--env", "real", "--keep-none", "--execute", "--confirm-real"]


def test_liquidate_journals_each_sell_and_a_timeout_stops_it(jh, capsys):
    JournalFake.script = ["ok", "timeout"]
    with pytest.raises(SystemExit) as e:
        jh("false", positions=[pos("AAA", 10), pos("BBB", 10), pos("CCC", 10)],
           module=liq, argv=LIQ)
    assert e.value.code == 4
    assert [a[1] for a in JournalFake.attempts] == ["AAA", "BBB"]
    assert [s for _, _, s in states(jh.journal)] == ["sending", "accepted", "sending", "unknown"]
    assert "STOPPED after unknown" in capsys.readouterr().err
    JournalFake.attempts.clear()
    with pytest.raises(SystemExit) as e2:
        jh("false", positions=[pos("CCC", 10)], module=liq, argv=LIQ)
    assert e2.value.code == 3 and JournalFake.attempts == []


def test_liquidate_split_chunks_get_distinct_keys(jh):
    # 100-dollar stock, 150 sh with a 5,000 cap per order -> identical chunks
    jh("false", positions=[pos("AAA", 150)], module=liq,
       argv=LIQ + ["--max-order-usd", "5000"])
    sent = [a for a in JournalFake.attempts]
    assert len(sent) >= 2, "split position should yield several orders"
    keys = [e["key"] for e in jh.journal.entries() if e["state"] == "accepted"]
    assert len(keys) == len(sent) == len(set(keys)), "a chunk was skipped as a duplicate"


def test_liquidate_dry_run_ignores_an_open_key(jh):
    jh.journal.append({"key": "u", "state": "unknown", "env": "real", "ticker": "ZZZ",
                       "side": "sell", "qty": 1, "ts": "2026-10-29T00:00:00+00:00"})
    jh("false", positions=[pos("AAA", 10)], module=liq, argv=["--env", "real", "--keep-none"])
    assert JournalFake.attempts == []


def test_liquidate_reconcile_flag(jh, monkeypatch):
    jh.journal.append({"key": "u", "state": "unknown", "env": "real", "ticker": "AAA",
                       "side": "sell", "qty": 10, "ts": datetime.now(timezone.utc).isoformat()})
    monkeypatch.setattr(liq, "KISClient", DailyFake)
    JournalFake.daily = [{"ticker": "AAA", "side": "sell", "qty": 10, "order_no": "7"}]
    with pytest.raises(SystemExit) as e:
        jh("false", module=liq, argv=["--env", "real", "--reconcile-journal"])
    assert e.value.code == 0 and state_of(jh.journal, "u") == "accepted"


# ====================================================================== G4
NOW = datetime(2026, 10, 29, 12, 0, tzinfo=timezone.utc)


def _ledger_book(as_of="2026-10-29"):
    return {"last_updated": "2026-10-29T01:13:17Z",
            "ledgers": {"rn_depth": {"current_date": as_of, "state": {"cash": 1.0, "holdings": {}},
                                     "last_marks": {}},
                        "equal": {"current_date": as_of}}}


@pytest.fixture
def overlay(tmp_path, monkeypatch):
    path = tmp_path / "depth_overlay.json"
    monkeypatch.setitem(kt.OVERLAY_FILES, "rn_depth", path)

    def write(**raw):
        path.write_text(json.dumps(raw), encoding="utf-8")
        return path
    write.path = path
    return write


def test_g4_passes_a_fresh_served_source_and_reports_it(overlay):
    overlay(generated_at=(NOW - timedelta(days=1)).replace(tzinfo=None).isoformat())  # naive UTC
    rep = kt.check_served_freshness(_ledger_book("2026-10-28"), "supabase", "rn_depth", now=NOW)
    assert rep["source"] == "supabase" and rep["age_days"] == 1
    assert rep["overlay_age_days"] == pytest.approx(1.0, abs=0.01)
    assert rep["fallback"] is False and rep["passed_over"] == []


def test_g4_refuses_a_stale_served_ledger(overlay):
    overlay(generated_at=NOW.isoformat())
    with pytest.raises(kt.StaleSourceError) as e:
        kt.check_served_freshness(_ledger_book("2026-10-20"), "supabase", "rn_depth", now=NOW)
    assert "9 days old" in str(e.value) and "supabase" in str(e.value)
    assert e.value.report["problems"]


def test_g4_the_limit_is_max_stale_days(overlay):
    overlay(generated_at=NOW.isoformat())
    kt.check_served_freshness(_ledger_book("2026-10-24"), "local-file", "rn_depth", now=NOW)
    with pytest.raises(kt.StaleSourceError):
        kt.check_served_freshness(_ledger_book("2026-10-23"), "local-file", "rn_depth", now=NOW)
    kt.check_served_freshness(_ledger_book("2026-10-23"), "local-file", "rn_depth", now=NOW,
                              max_stale_days=6)


def test_g4_refuses_a_stale_overlay_behind_a_fresh_ledger(overlay):
    # the real situation of 2026-10-29: current_date advances daily, the overlay is 23 days old
    overlay(generated_at="2026-10-06T21:42:22.311708")
    with pytest.raises(kt.StaleSourceError) as e:
        kt.check_served_freshness(_ledger_book("2026-10-29"), "supabase", "rn_depth", now=NOW)
    assert "depth_overlay.json" in str(e.value) and "2026-10-06" in str(e.value)


def test_a12_the_overlay_limit_is_its_own_14_days(overlay):
    # A12: a fresh ledger with an overlay 13.9 days old passes; 14.1 days refuses; the ledger keeps its 5 days
    assert kt.OVERLAY_MAX_AGE_DAYS == 14
    overlay(generated_at=(NOW - timedelta(days=13.9)).isoformat())
    rep = kt.check_served_freshness(_ledger_book("2026-10-29"), "supabase", "rn_depth", now=NOW)
    assert rep["overlay_max_age_days"] == 14
    overlay(generated_at=(NOW - timedelta(days=14.1)).isoformat())
    with pytest.raises(kt.StaleSourceError) as e:
        kt.check_served_freshness(_ledger_book("2026-10-29"), "supabase", "rn_depth", now=NOW)
    assert "limit 14" in str(e.value)


def test_g4_accepts_a_generated_key_and_a_z_suffix(overlay):
    overlay(generated="2026-10-28T09:00:00Z")
    rep = kt.check_served_freshness(_ledger_book(), "url", "rn_depth", now=NOW)
    assert rep["overlay_generated"] == "2026-10-28T09:00:00Z"


@pytest.mark.parametrize("content", [None, "{}", "not json", '{"generated_at": "yesterday"}'])
def test_g4_an_unreadable_overlay_age_refuses(overlay, content):
    if content is None:
        overlay.path.unlink(missing_ok=True)
    else:
        overlay.path.write_text(content, encoding="utf-8")
    with pytest.raises(kt.StaleSourceError) as e:
        kt.check_served_freshness(_ledger_book(), "supabase", "rn_depth", now=NOW)
    assert "age unreadable" in str(e.value)


def test_g4_a_ledger_without_an_overlay_source_checks_only_current_date(overlay):
    overlay.path.unlink(missing_ok=True)
    rep = kt.check_served_freshness(_ledger_book(), "supabase", "equal", now=NOW)
    assert rep["overlay_file"] is None
    with pytest.raises(kt.StaleSourceError):
        kt.check_served_freshness(_ledger_book("2026-10-01"), "supabase", "equal", now=NOW)


def test_g4_missing_current_date_refuses(overlay):
    overlay(generated_at=NOW.isoformat())
    b = _ledger_book()
    del b["ledgers"]["rn_depth"]["current_date"]
    with pytest.raises(kt.StaleSourceError):
        kt.check_served_freshness(b, "supabase", "rn_depth", now=NOW)


def test_g4_sync_refuses_a_stale_overlay_before_the_broker(harness, overlay):
    overlay(generated_at=(datetime.now(timezone.utc) - timedelta(days=23)).isoformat())
    with pytest.raises(SystemExit) as e:
        harness("false", ledger_book=book({"BBB": {"shares": 50, "entry_price": 100.0}}),
                argv=["--env", "real", "--ledger", "rn_depth", "--execute", "--confirm-real"])
    assert "stale target source" in str(e.value) and "depth_overlay.json" in str(e.value)
    assert FakeKIS.built == [] and FakeKIS.orders == []
    refused = [ev for ev in harness.events if ev["event"] == "stale_source_refused"]
    assert refused and refused[0]["overlay_age_days"] > 22


def test_g4_sync_logs_the_source_and_its_age(harness, capsys):
    harness("false", ledger_book=book({"BBB": {"shares": 50, "entry_price": 100.0}}),
            argv=["--env", "real", "--ledger", "rn_depth"])
    out = capsys.readouterr().out
    assert "freshness: source=fake" in out and "_overlay.json generated" in out and "age=" in out
    ev = [e for e in harness.events if e["event"] == "target_source"]
    assert ev and ev[0]["source"] == "fake" and ev[0]["age_days"] in (0, -1)  # -1: local date ahead of UTC


def test_g4_sync_warns_loudly_when_a_fallback_served_the_targets(harness, monkeypatch, capsys):
    monkeypatch.setattr(sync, "load_ledger_book", lambda: (book(), "local-file"))
    monkeypatch.setattr(sync, "last_load_notes", lambda: ["supabase: Timeout: read timed out"])
    harness("false", argv=["--env", "real", "--ledger", "rn_depth"])
    out = capsys.readouterr().out
    assert "WARNING: targets came from 'local-file', not supabase" in out
    assert "read timed out" in out
    ev = [e for e in harness.events if e["event"] == "target_source"][0]
    assert ev["fallback"] is True and ev["passed_over"] == ["supabase: Timeout: read timed out"]


def test_g4_load_ledger_book_records_why_supabase_was_passed_over(tmp_path, monkeypatch):
    import requests
    local = tmp_path / "paper_ledgers.json"
    local.write_text(json.dumps(_ledger_book()), encoding="utf-8")
    monkeypatch.setattr(kt, "LEDGERS_JSON", local)
    monkeypatch.delenv("LEDGER_URL", raising=False)

    # 1. not configured
    monkeypatch.delenv("NEXT_PUBLIC_SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_KEY", raising=False)
    book_, src = kt.load_ledger_book()
    assert src == "local-file" and "not configured" in kt.last_load_notes()[0]

    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_URL", "https://example.invalid")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "not-a-real-key")

    # 2. the request raises
    def boom(*a, **k):
        raise requests.exceptions.Timeout("read timed out")
    monkeypatch.setattr(requests, "get", boom)
    _, src = kt.load_ledger_book()
    assert src == "local-file" and "Timeout" in kt.last_load_notes()[0]

    # 3. HTTP error
    class R:
        status_code = 503

        def json(self):
            return []
    monkeypatch.setattr(requests, "get", lambda *a, **k: R())
    _, src = kt.load_ledger_book()
    assert src == "local-file" and kt.last_load_notes() == ["supabase: HTTP 503"]

    # 4. served: no notes, and notes do not leak from the previous call
    class OK:
        status_code = 200

        def json(self):
            return [{"data": _ledger_book()}]
    monkeypatch.setattr(requests, "get", lambda *a, **k: OK())
    _, src = kt.load_ledger_book()
    assert src == "supabase" and kt.last_load_notes() == []


# ====================================================================== A13: KISClient.daily_orders
def _ccnl_client(env, pages):
    from kis.client import KISClient
    calls = []

    class Fake(KISClient):
        def __init__(self):
            self.env, self.cano, self.acnt_prdt_cd = env, "00000000", "01"

        def _get(self, path, tr_id, params, tr_cont=""):
            calls.append((path, tr_id, dict(params), tr_cont))
            return pages[len(calls) - 1]
    c = Fake()
    c.calls = calls
    return c


def _ccnl_row(**kw):
    return {"odno": "0001", "pdno": "AAA ", "sll_buy_dvsn_cd": "02", "ft_ord_qty": "10", "ft_ccld_qty": "10",
            "prcs_stat_name": "완료", "rvse_cncl_dvsn": "00", "ord_dt": "20261029", **kw}


def test_a13_daily_orders_reads_the_new_york_day_and_maps_rows():
    c = _ccnl_client("real", [({"output": [_ccnl_row(), _ccnl_row(odno="0002", pdno="BBB", sll_buy_dvsn_cd="01",
                                                                  ft_ord_qty="5", ft_ccld_qty="0")]}, "")])
    rows = c.daily_orders(now=datetime(2026, 10, 30, 2, 0, tzinfo=timezone.utc))   # 22:00 ET on 10-29
    path, tr_id, params, _ = c.calls[0]
    assert path.endswith("/inquire-ccnl") and tr_id == "TTTS3035R"
    assert params["ORD_STRT_DT"] == params["ORD_END_DT"] == "20261029"
    assert params["PDNO"] == "%" and params["OVRS_EXCG_CD"] == "NASD"
    assert [(r["ticker"], r["side"], r["qty"], r["order_no"]) for r in rows] == [("AAA", "buy", 10, "0001"),
                                                                                  ("BBB", "sell", 5, "0002")]


def test_a13_daily_orders_paper_uses_the_all_form_and_follows_pages():
    c = _ccnl_client("paper", [({"output": [_ccnl_row()], "ctx_area_fk200": "F1", "ctx_area_nk200": "N1"}, "M"),
                               ({"output": [_ccnl_row(odno="0002")]}, "")])
    rows = c.daily_orders(now=datetime(2026, 10, 29, 16, 30, tzinfo=timezone.utc))
    assert c.calls[0][1] == "VTTS3035R" and c.calls[0][2]["PDNO"] == "" and c.calls[0][2]["OVRS_EXCG_CD"] == ""
    assert c.calls[1][2]["CTX_AREA_FK200"] == "F1" and c.calls[1][3] == "N"
    assert len(rows) == 2


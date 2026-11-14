"""equal_dial: the paper-only book that follows the MRI's month decision (WO_DB2, operator 2026-11-13).

The book is `equal`'s rule with a gross (share of value its targets add up to): 1.0 when the month's
dial is full, 0.5 when half. No network, no files.
Run: python -m pytest scripts/test_equal_dial_ledger.py -q
"""

import copy
import importlib.util
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
spec = importlib.util.spec_from_file_location(
    "tp", str(Path(__file__).resolve().parent / "track_paper_portfolios.py"))
tp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tp)

NAMES = ["A", "B", "C", "D", "E", "F", "G", "H"]
PRICES = {n: 100.0 for n in NAMES}
EQ = 100.0 / 8


def targets(names=NAMES):
    return {n: 100.0 / max(len(names), tp.MIN_EQUAL_NAMES) for n in names}


def risk(month="2026-11", dial="half", asof="2026-11-12", decided_on="2026-10-30"):
    return {"asof": asof, "month_decision": {"month": month, "dial": dial, "decided_on": decided_on}}


@pytest.fixture(autouse=True)
def clean_holders():
    tp.price_asof_holder.clear()
    tp.dividends_holder.clear()
    yield
    tp.price_asof_holder.clear()
    tp.dividends_holder.clear()


def run(led, session, rs, prices=PRICES, tg=None):
    out = {}
    nav, stale = tp.run_dial_ledger(led, tg if tg is not None else targets(), prices, session, "rank", rs,
                                    note_out=out)
    return nav, stale, out


def nav_of(led, prices=PRICES):
    return tp.portfolio_value(led, prices)[0]


def test_first_run_no_file_is_gross_one_and_equals_the_equal_rule():
    dial, eq = tp.empty_ledger(), tp.empty_ledger()
    _, _, out = run(dial, "2026-11-12", None)
    tp.run_target_ledger(eq, targets(), PRICES, "2026-11-12", "rank")
    assert out["gross"] == 1.0 and out["dial_note"] == "initial_full"
    assert dial["state"]["holdings"] == eq["state"]["holdings"]
    assert dial["state"]["cash"] == eq["state"]["cash"]
    assert dial["trades"] == eq["trades"]


def test_half_in_the_sessions_month_halves_every_holding_and_sizes_entrants_at_half():
    led = tp.empty_ledger()
    run(led, "2026-10-30", None)                      # full book, 8 names, 12.5% each
    before = {t: h["shares"] for t, h in led["state"]["holdings"].items()}
    nav0 = nav_of(led)
    _, _, out = run(led, "2026-11-02", risk())
    assert out["gross"] == 0.5 and out["dial_note"] == "decided"
    for t, sh in before.items():
        assert led["state"]["holdings"][t]["shares"] == pytest.approx(sh * 0.5)
    # cash is about half the value (less the 25 bps cost on the half that was sold)
    assert led["state"]["cash"] / nav_of(led) == pytest.approx(0.5, abs=0.003)
    assert led["state"]["cash"] == pytest.approx(nav0 * 0.5 * tp.cost_factor(), rel=1e-9)
    st = led["state"]["dial_state"]
    assert st == {"month": "2026-11", "dial": "half", "gross": 0.5, "decided_on": "2026-10-30",
                  "read_at_session": "2026-11-02"}
    # an entrant arriving in the half book is sized at half the weight
    tg = targets(NAMES + ["Z"])
    prices = dict(PRICES, Z=100.0)
    nav = nav_of(led, prices)
    run(led, "2026-11-03", risk(), prices, tg)
    z = led["state"]["holdings"]["Z"]["shares"] * 100.0
    assert z == pytest.approx(nav * (100.0 / 9) / 100.0 * 0.5, rel=0.01)


def test_resize_trades_are_recorded_one_per_holding_with_a_dial_reason():
    led = tp.empty_ledger()
    run(led, "2026-10-30", None)
    run(led, "2026-11-02", risk())
    rows = [x for x in led["trades"] if x["date"] == "2026-11-02"]
    assert len(rows) == 8 and all(x["side"] == "sell" for x in rows)
    assert {x["reason"] for x in rows} == {"dial_resize_1.0_to_0.5"}
    assert len(led["closed"]) == 0, "a resize is not a closed round trip"


def test_same_month_again_does_not_trade():
    led = tp.empty_ledger()
    run(led, "2026-10-30", None)
    run(led, "2026-11-02", risk())
    n = len(led["trades"])
    _, _, out = run(led, "2026-11-03", risk(dial="full"))     # the file flips inside the month: ignored
    assert out["dial_note"] == "kept_month_already_decided" and out["gross"] == 0.5
    assert len(led["trades"]) == n
    assert led["state"]["dial_state"]["dial"] == "half"


def test_next_month_full_buys_back_and_leaves_little_cash():
    led = tp.empty_ledger()
    run(led, "2026-10-30", None)
    run(led, "2026-11-02", risk())
    _, _, out = run(led, "2026-12-01", risk(month="2026-12", dial="full", asof="2026-12-01"))
    assert out["gross"] == 1.0 and out["dial_note"] == "decided"
    assert led["state"]["cash"] / nav_of(led) < 0.005
    buys = [x for x in led["trades"] if x["date"] == "2026-12-01"]
    assert buys and all(x["side"] == "buy" and x["reason"] == "dial_resize_0.5_to_1.0" for x in buys)
    for h in led["state"]["holdings"].values():
        assert h["shares"] * 100.0 == pytest.approx(EQ, rel=0.01)


@pytest.mark.parametrize("rs, code", [
    (None, "kept_no_file"),
    ({"asof": "2026-11-12"}, "kept_no_decision"),
    (risk(dial=None), "kept_no_decision"),
    (risk(dial="quarter"), "kept_no_decision"),
    (risk(month="2026-10"), "kept_month_mismatch"),
    (risk(asof="2026-11-01"), "kept_stale_file"),
    (risk(asof=None), "kept_stale_file"),
])
def test_no_valid_decision_keeps_the_previous_gross_with_the_code(rs, code):
    led = tp.empty_ledger()
    run(led, "2026-09-30", risk(month="2026-09", asof="2026-09-30"))   # decided half in September
    assert led["state"]["dial_state"]["gross"] == 0.5
    n = len(led["trades"])
    _, _, out = run(led, "2026-11-12", rs)
    assert out["gross"] == 0.5 and out["dial_note"] == code
    assert len(led["trades"]) == n or all(x["reason"] != "dial_resize_0.5_to_1.0" for x in led["trades"])
    assert led["state"]["dial_state"]["month"] == "2026-09"


def test_no_decision_yet_stays_initial_full_with_the_cause():
    led = tp.empty_ledger()
    _, _, out = run(led, "2026-11-12", risk(month="2026-10"))
    assert out["gross"] == 1.0 and out["dial_note"] == "initial_full"
    assert out["dial_note_detail"] == {"cause": "kept_month_mismatch"}
    assert "dial_state" not in led["state"]


def test_stale_mark_during_a_resize_is_not_traded_and_is_listed():
    led = tp.empty_ledger()
    run(led, "2026-10-30", None)
    sh = led["state"]["holdings"]["C"]["shares"]
    tp.price_asof_holder["older"] = {"C"}
    _, _, out = run(led, "2026-11-02", risk())
    assert led["state"]["holdings"]["C"]["shares"] == sh
    assert out["dial_note_detail"] == {"not_resized_stale_mark": ["C"]}
    assert led["state"]["holdings"]["B"]["shares"] == pytest.approx(sh * 0.5)
    assert all(x["ticker"] != "C" for x in led["trades"] if x["date"] == "2026-11-02")


def test_buyback_is_limited_by_cash_and_says_so():
    led = tp.empty_ledger()
    run(led, "2026-10-30", None)
    run(led, "2026-11-02", risk())
    led["state"]["cash"] = 1.0                              # the book has little cash to buy back with
    _, _, out = run(led, "2026-12-01", risk(month="2026-12", dial="full", asof="2026-12-01"))
    assert out["dial_note_detail"] == {"buyback_cash_limited": True}
    assert led["state"]["cash"] >= -1e-9


def test_second_run_on_the_same_session_writes_nothing_new():
    led = tp.empty_ledger()
    run(led, "2026-10-30", None)
    run(led, "2026-11-02", risk())
    snap = copy.deepcopy((led["state"], led["trades"], led["closed"]))
    run(led, "2026-11-02", risk())
    assert (led["state"], led["trades"], led["closed"]) == snap
    # and main()'s own gate refuses a second row for the session
    led["nav_series"].append({"date": "2026-11-02", "price_session": "2026-11-02"})
    assert tp.ledger_row_due(led, "2026-11-02") is False


def test_gross_is_a_real_number_never_zero_and_half_is_half_of_one():
    assert tp.DIAL_GROSS["half"] == 0.5 and tp.DIAL_GROSS["full"] == 1.0
    assert tp.DIAL_GROSS["half"] * 2 == tp.DIAL_GROSS["full"]
    assert all(g > 0.0 for g in tp.DIAL_GROSS.values())
    led = tp.empty_ledger()
    for sess, rs in (("2026-10-30", None), ("2026-11-02", risk()), ("2026-12-01", None)):
        _, _, out = run(led, sess, rs)
        assert out["gross"] in (0.5, 1.0)


def test_equal_itself_is_identical_with_and_without_the_dial_hook():
    a, b = tp.empty_ledger(), tp.empty_ledger()
    px = dict(PRICES)
    for ledger, hook in ((a, False), (b, True)):
        for i, sess in enumerate(("2026-11-02", "2026-11-03", "2026-11-04")):
            px2 = {n: 100.0 + i for n in NAMES}
            if hook:
                tp.run_target_ledger(ledger, targets(NAMES[:7]), px2, sess, "rank", before_trades=None)
            else:
                tp.run_target_ledger(ledger, targets(NAMES[:7]), px2, sess, "rank")
    assert a == b


def test_risk_state_loader_reads_a_file_and_returns_none_when_absent(tmp_path):
    assert tp.load_risk_state(tmp_path / "nope.json") is None
    p = tmp_path / "risk_state.json"
    p.write_text("{not json", encoding="utf-8")
    assert tp.load_risk_state(p) is None
    p.write_text('{"asof": "2026-11-12"}', encoding="utf-8")
    assert tp.load_risk_state(p) == {"asof": "2026-11-12"}


# ── a holding skipped at a resize (stale mark) is resized on a later fresh row ────────────────────────────

def late_trades(led, session):
    return [x for x in led["trades"] if x["date"] == session]


def test_skipped_holding_is_resized_by_its_stored_ratio_on_the_next_fresh_row():
    led = tp.empty_ledger()
    run(led, "2026-10-30", None)
    sh = led["state"]["holdings"]["C"]["shares"]
    tp.price_asof_holder["older"] = {"C"}
    run(led, "2026-11-02", risk())
    assert led["state"]["holdings"]["C"]["shares"] == sh
    assert led["state"]["dial_state"]["pending_resize"] == {"C": 0.5}
    tp.price_asof_holder.clear()                                   # C's mark is fresh again
    _, _, out = run(led, "2026-11-03", risk())
    assert out["dial_note"] == "kept_month_already_decided"
    assert led["state"]["holdings"]["C"]["shares"] == pytest.approx(sh * 0.5)
    rows = late_trades(led, "2026-11-03")
    assert [(x["ticker"], x["side"], x["reason"]) for x in rows] == [("C", "sell", "dial_resize_late_1.0_to_0.5")]
    assert out["dial_note_detail"] == {"resized_late": ["C"]}
    assert "pending_resize" not in led["state"]["dial_state"]
    assert led["state"]["cash"] / nav_of(led) == pytest.approx(0.5, abs=0.003)
    assert len(led["closed"]) == 0, "a late resize is not a closed round trip"


def test_still_stale_holding_stays_pending_and_is_listed():
    led = tp.empty_ledger()
    run(led, "2026-10-30", None)
    sh = led["state"]["holdings"]["C"]["shares"]
    tp.price_asof_holder["older"] = {"C"}
    run(led, "2026-11-02", risk())
    _, _, out = run(led, "2026-11-03", risk())
    assert led["state"]["holdings"]["C"]["shares"] == sh
    assert led["state"]["dial_state"]["pending_resize"] == {"C": 0.5}
    assert out["dial_note_detail"] == {"still_pending": ["C"]}
    assert late_trades(led, "2026-11-03") == []


def test_pending_holding_that_left_the_book_is_dropped_from_the_map():
    led = tp.empty_ledger()
    run(led, "2026-10-30", None)
    tp.price_asof_holder["older"] = {"C"}
    run(led, "2026-11-02", risk())
    without_c = targets([n for n in NAMES if n != "C"])
    run(led, "2026-11-03", risk(), tg=without_c)                    # first miss: C is held one more run
    assert led["state"]["dial_state"]["pending_resize"] == {"C": 0.5}
    run(led, "2026-11-04", risk(), tg=without_c)                    # second miss: C is sold
    assert "C" not in led["state"]["holdings"]
    assert "pending_resize" not in led["state"]["dial_state"]
    assert [x["reason"] for x in led["trades"] if x["ticker"] == "C" and x["date"] == "2026-11-04"] == ["left_rank"]


def test_half_then_full_while_pending_cancels_and_never_trades_the_skipped_holding():
    led = tp.empty_ledger()
    run(led, "2026-10-30", None)
    sh = led["state"]["holdings"]["C"]["shares"]
    tp.price_asof_holder["older"] = {"C"}
    run(led, "2026-11-02", risk())
    assert led["state"]["dial_state"]["pending_resize"] == {"C": 0.5}
    _, _, out = run(led, "2026-12-01", risk(month="2026-12", dial="full", asof="2026-12-01"))
    assert "pending_resize" not in led["state"]["dial_state"]       # 0.5 x 2.0 = 1.0: nothing is owed
    assert led["state"]["holdings"]["C"]["shares"] == sh
    assert all(x["ticker"] != "C" for x in led["trades"] if x["date"] > "2026-10-30")
    assert out["dial_note_detail"]["not_resized_stale_mark"] == ["C"]


def test_two_changes_in_the_same_direction_multiply_the_pending_ratio():
    led = tp.empty_ledger()
    run(led, "2026-10-30", None)
    tp.price_asof_holder["older"] = {"C"}
    run(led, "2026-11-02", risk())                                  # full -> half: C owes 0.5
    led["state"]["dial_state"]["gross"] = 1.0                       # as if the book were full again and the month new
    run(led, "2026-12-01", risk(month="2026-12", dial="half", asof="2026-12-01"))
    assert led["state"]["dial_state"]["pending_resize"] == {"C": 0.25}


def test_a_skipped_buyback_is_bought_later_with_the_cash_the_book_has():
    led = tp.empty_ledger()
    run(led, "2026-10-30", None)
    run(led, "2026-11-02", risk())                                  # everything at half
    sh = led["state"]["holdings"]["C"]["shares"]
    tp.price_asof_holder["older"] = {"C"}
    run(led, "2026-12-01", risk(month="2026-12", dial="full", asof="2026-12-01"))
    assert led["state"]["dial_state"]["pending_resize"] == {"C": 2.0}
    tp.price_asof_holder.clear()
    _, _, out = run(led, "2026-12-02", risk(month="2026-12", dial="full", asof="2026-12-01"))
    assert led["state"]["holdings"]["C"]["shares"] > sh
    rows = late_trades(led, "2026-12-02")
    assert [(x["ticker"], x["side"], x["reason"]) for x in rows] == [("C", "buy", "dial_resize_late_0.5_to_1.0")]
    # the buy-back is still limited by cash: the seven others took theirs first, the 25 bps cost leaves C a little short
    assert out["dial_note_detail"] == {"resized_late": ["C"], "buyback_cash_limited": True}
    assert "pending_resize" not in led["state"]["dial_state"]


def test_late_resize_run_twice_on_the_same_session_writes_nothing_new():
    led = tp.empty_ledger()
    run(led, "2026-10-30", None)
    tp.price_asof_holder["older"] = {"C"}
    run(led, "2026-11-02", risk())
    tp.price_asof_holder.clear()
    run(led, "2026-11-03", risk())
    snap = copy.deepcopy((led["state"], led["trades"], led["closed"]))
    run(led, "2026-11-03", risk())
    assert (led["state"], led["trades"], led["closed"]) == snap

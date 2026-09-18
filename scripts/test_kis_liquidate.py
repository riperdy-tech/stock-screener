"""Offline tests for the manual keep-list exit. No network, no credentials."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kis_liquidate_except import parse_keep, plan_sells  # noqa: E402


def pos(ticker, shares, sellable=None, exch="NASD"):
    return {"ticker": ticker, "shares": shares,
            "sellable": shares if sellable is None else sellable,
            "exch_order_cd": exch, "name": ticker, "avg_cost": 0.0}


PRICES = {"AAA": 100.0, "BBB": 50.0, "CCC": 10.0}
ORDER_CD = {"AAA": "NASD", "BBB": "NYSE", "CCC": "AMEX"}


def test_keep_list_parsing_is_case_and_separator_tolerant():
    assert parse_keep(" cart, expe  bmrn ,, ") == {"CART", "EXPE", "BMRN"}
    assert parse_keep("") == set()


def test_kept_names_are_never_ordered():
    orders, skipped = plan_sells(
        [pos("AAA", 10), pos("BBB", 10)], {"AAA"}, PRICES, ORDER_CD, 15000)
    assert [o["ticker"] for o in orders] == ["BBB"]
    assert skipped == []


def test_limit_is_last_minus_30bps_and_qty_is_whole_shares():
    orders, _ = plan_sells([pos("AAA", 10)], set(), PRICES, ORDER_CD, 15000)
    assert orders[0]["price"] == 99.70  # 100 * 0.997
    assert orders[0]["qty"] == 10
    assert isinstance(orders[0]["qty"], int)


def test_sells_only_the_sellable_slice_and_flags_it():
    orders, _ = plan_sells([pos("AAA", 10, sellable=4)], set(), PRICES, ORDER_CD, 15000)
    assert orders[0]["qty"] == 4
    assert "PARTIAL" in orders[0]["note"]


def test_zero_sellable_is_skipped_not_ordered():
    orders, skipped = plan_sells([pos("AAA", 10, sellable=0)], set(), PRICES, ORDER_CD, 15000)
    assert orders == []
    assert skipped[0]["ticker"] == "AAA"


def test_missing_price_is_skipped_not_ordered():
    orders, skipped = plan_sells([pos("ZZZ", 10)], set(), PRICES, ORDER_CD, 15000)
    assert orders == []
    assert "no price" in skipped[0]["why"]


def test_large_position_splits_and_conserves_share_count():
    # 500 sh @ 99.70 limit = $49,850; cap 15000 -> 150 sh per chunk
    orders, _ = plan_sells([pos("AAA", 500)], set(), PRICES, ORDER_CD, 15000)
    assert len(orders) == 4
    assert sum(o["qty"] for o in orders) == 500
    assert all(o["est_value"] <= 15000 for o in orders)
    assert all("split" in o["note"] for o in orders)


def test_unsplit_orders_carry_no_split_note():
    orders, _ = plan_sells([pos("CCC", 10)], set(), PRICES, ORDER_CD, 15000)
    assert orders[0]["note"] == ""


def test_exchange_falls_back_to_the_balance_row():
    orders, _ = plan_sells([pos("AAA", 1, exch="NYSE")], set(), PRICES, {}, 15000)
    assert orders[0]["exch"] == "NYSE"

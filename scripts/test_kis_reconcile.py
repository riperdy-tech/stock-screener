"""Unit tests for scripts/kis/reconcile.py (pure logic, no network).

Run: python scripts/test_kis_reconcile.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kis.reconcile import compute_plan  # noqa: E402


def test_initial_buy_in():
    """Empty account -> buys for every affordable target, sized to weights."""
    targets = {"AAA": 0.5, "BBB": 0.3}
    plan = compute_plan(targets, held={}, sellable={}, prices={"AAA": 100, "BBB": 50},
                        cash=10_000, max_turnover_pct=100)
    assert plan.nav == 10_000
    by = {o.ticker: o for o in plan.orders}
    assert by["AAA"].side == "buy" and by["AAA"].qty == 50      # 5000/100
    assert by["BBB"].qty == 60                                   # 3000/50
    assert by["AAA"].reason == "enter"


def test_full_exit_below_threshold_still_sells():
    """Outs must be mirrored even when tiny."""
    plan = compute_plan(targets={"KEEP": 0.9}, held={"KEEP": 90, "GONE": 1},
                        sellable={"KEEP": 90, "GONE": 1},
                        prices={"KEEP": 100, "GONE": 20}, cash=1000,
                        min_order_usd=50)
    gone = [o for o in plan.orders if o.ticker == "GONE"]
    assert len(gone) == 1 and gone[0].side == "sell" and gone[0].qty == 1
    assert gone[0].reason == "exit"


def test_churn_threshold_skips_small_rebalance():
    """A $30 trim on a $10k account (threshold $50) is skipped."""
    plan = compute_plan(targets={"AAA": 0.997}, held={"AAA": 1000},
                        sellable={"AAA": 1000}, prices={"AAA": 10},
                        cash=0, min_order_usd=50, min_order_bps=25)
    assert plan.orders == []


def test_zero_share_entry_warns():
    plan = compute_plan(targets={"PRICY": 0.02}, held={}, sellable={},
                        prices={"PRICY": 1200}, cash=10_000)
    assert plan.orders == []
    assert any("can't afford 1 share" in w for w in plan.warnings)


def test_buys_capped_by_cash():
    """Buys never exceed cash + sell proceeds."""
    plan = compute_plan(targets={"NEW": 1.0}, held={}, sellable={},
                        prices={"NEW": 100}, cash=505, max_turnover_pct=100)
    assert sum(o.est_value for o in plan.buys) <= 505


def test_turnover_cap_drops_buys_keeps_exits():
    targets = {"NEW": 0.5}
    plan = compute_plan(targets, held={"OLD": 100}, sellable={"OLD": 100},
                        prices={"OLD": 100, "NEW": 100}, cash=0,
                        max_turnover_pct=20)  # cap $2k on $10k NAV
    sides = {(o.side, o.ticker) for o in plan.orders}
    assert ("sell", "OLD") in sides                     # exit exempt from cap
    assert all(o.ticker != "NEW" for o in plan.buys)    # buy dropped
    assert any("turnover cap" in w for w in plan.warnings)


def test_sells_ordered_before_buys():
    plan = compute_plan(targets={"NEW": 0.9}, held={"OLD": 50},
                        sellable={"OLD": 50}, prices={"OLD": 100, "NEW": 10},
                        cash=100, max_turnover_pct=100)
    sides = [o.side for o in plan.orders]
    assert sides == sorted(sides, reverse=True)  # all sells, then all buys


def test_max_order_usd_clips_single_order():
    plan = compute_plan(targets={"BIG": 1.0}, held={}, sellable={},
                        prices={"BIG": 100}, cash=100_000,
                        max_order_usd=5_000, max_turnover_pct=100)
    assert all(o.est_value <= 5_000 for o in plan.orders)


def test_sellable_limits_sell_qty():
    """Can't sell shares locked in open orders / unsettled."""
    plan = compute_plan(targets={}, held={"AAA": 100}, sellable={"AAA": 40},
                        prices={"AAA": 10}, cash=0)
    assert plan.orders[0].qty == 40


def test_held_without_price_untouched():
    plan = compute_plan(targets={"AAA": 0.5}, held={"MYSTERY": 10, "AAA": 1},
                        sellable={"MYSTERY": 10, "AAA": 1},
                        prices={"AAA": 100}, cash=1000)
    assert all(o.ticker != "MYSTERY" for o in plan.orders)
    assert any("MYSTERY" in w for w in plan.warnings)


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

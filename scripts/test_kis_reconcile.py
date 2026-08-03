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


def test_largest_remainder_rescues_near_whole_share():
    """A 1.97-share target gets 2, not 1 (regression: MU stranded $945 in cash).

    The extra share is funded by the fractional slack other names leave behind
    when they floor — here FILLER wants 14.3 shares and takes 14.
    """
    plan = compute_plan(targets={"MU": 0.019, "FILLER": 0.10}, held={}, sellable={},
                        prices={"MU": 978.0, "FILLER": 700.0}, cash=100_000,
                        max_turnover_pct=100)
    qty = {o.ticker: o.qty for o in plan.buys}
    assert qty["MU"] == 2, f"expected 2 shares of MU, got {qty['MU']}"
    assert qty["FILLER"] == 14, f"FILLER (frac 0.28) must not round up, got {qty['FILLER']}"


def test_top_up_refuses_to_overshoot_slot():
    """Leftover cash may not buy a share costing far more than the target slot."""
    plan = compute_plan(targets={"PRICY": 0.02, "CHEAP": 0.10}, held={}, sellable={},
                        prices={"PRICY": 1200.0, "CHEAP": 10.0}, cash=10_000,
                        max_turnover_pct=100)
    assert all(o.ticker != "PRICY" for o in plan.buys)
    assert any("can't afford 1 share" in w for w in plan.warnings)


def test_cash_weight_is_respected_not_deployed():
    """Ledger cash is a position: don't spend it just because it's sitting there."""
    plan = compute_plan(targets={"AAA": 0.5, "BBB": 0.3}, held={}, sellable={},
                        prices={"AAA": 100.0, "BBB": 50.0}, cash=10_000,
                        max_turnover_pct=100)
    spent = sum(o.est_value for o in plan.buys)
    assert spent <= 8_000, f"deployed {spent}, must not touch the 20% cash weight"


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


def test_small_entry_below_threshold_still_buys():
    """Ins are mirrored like outs: a 1-share entry worth less than the churn
    threshold still executes (regression: RMD, 0.4% weight, silently skipped)."""
    plan = compute_plan(targets={"RMD": 0.004}, held={}, sellable={},
                        prices={"RMD": 208.45}, cash=100_000,
                        min_order_usd=50, min_order_bps=25)  # threshold = $250
    rmd = [o for o in plan.orders if o.ticker == "RMD"]
    assert len(rmd) == 1 and rmd[0].side == "buy" and rmd[0].qty == 1
    assert rmd[0].reason == "enter"


def test_small_add_below_threshold_skipped():
    """...but topping up a name we already hold still respects the threshold."""
    plan = compute_plan(targets={"RMD": 0.006}, held={"RMD": 1}, sellable={"RMD": 1},
                        prices={"RMD": 208.45}, cash=100_000,
                        min_order_usd=50, min_order_bps=25)
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


# --- idle-cash allowance ----------------------------------------------------
#
# Shared setup: $10k NAV = $6k idle cash + a $4k position being exited. Targets
# ask for 90% invested, so target cash is $1k and $5k of the cash is idle.
# A 40% cap gives $4k of turnover, entirely consumed by the exit — under the old
# rule every buy was dropped even though the money was sitting there.
IDLE_KW = dict(held={"OLD": 40}, sellable={"OLD": 40},
               prices={"OLD": 100, "AAA": 100, "BBB": 100},
               cash=6_000, max_turnover_pct=40)
IDLE_TARGETS = {"AAA": 0.45, "BBB": 0.45}


def test_idle_cash_is_exempt_from_the_turnover_cap():
    plan = compute_plan(IDLE_TARGETS, **IDLE_KW)
    assert plan.nav == 10_000, plan.nav
    # cap 4,000 - exit 4,000 = 0 room; allowance = 6,000 cash - 1,000 target
    bought = sum(o.est_value for o in plan.buys)
    assert bought > 0, "idle cash must not queue behind unrelated rotation"
    assert bought <= 5_000 + 1e-6, bought
    assert any("idle-cash allowance" in w for w in plan.warnings)


def test_without_the_allowance_the_same_plan_is_fully_blocked():
    """Same book, but cash already at the ledger's target -> nothing exempt.

    Pins the old behaviour so the test above cannot go vacuous. cash=444 is the
    fixed point: NAV 4,444 x 10% target cash == the cash held, so idle is zero.
    """
    plan = compute_plan(IDLE_TARGETS, held={"OLD": 40}, sellable={"OLD": 40},
                        prices={"OLD": 100, "AAA": 100, "BBB": 100},
                        cash=444, max_turnover_pct=40)
    assert sum(o.est_value for o in plan.buys) == 0
    assert not any("idle-cash allowance" in w for w in plan.warnings)
    assert any("turnover cap" in w for w in plan.warnings)


def test_allowance_never_breaches_the_cash_budget():
    """Solvency is a separate cap and still binds: buys <= orderable + proceeds."""
    plan = compute_plan(IDLE_TARGETS, **{**IDLE_KW, "buy_budget": 500})
    bought = sum(o.est_value for o in plan.buys)
    exits = sum(o.est_value for o in plan.sells)
    assert bought <= (500 + exits) * 0.995 + 1e-6, (bought, exits)


def test_allowance_vanishes_when_the_dd_gate_scales_targets_down():
    """A reduced tier raises target cash, so there is no 'idle' cash to deploy.

    The governor wants that cash held; the allowance must not undo the gate.
    """
    gated = {t: w * 0.25 for t, w in IDLE_TARGETS.items()}   # quarter gross
    plan = compute_plan(gated, **IDLE_KW)
    assert not any("idle-cash allowance" in w for w in plan.warnings)


def test_rotation_trims_do_not_draw_on_the_allowance():
    """The allowance funds deployment, never churn.

    TRIM is grossly overweight (100 shares held against a 22-share slot, a
    $7,800 trim) while the exit leaves only $2,800 of room. Idle cash of $3,800
    is available and must NOT rescue it.
    """
    plan = compute_plan({"TRIM": 0.10, "AAA": 0.80},
                        held={"OLD": 60, "TRIM": 100},
                        sellable={"OLD": 60, "TRIM": 100},
                        prices={"OLD": 100, "TRIM": 100, "AAA": 100},
                        cash=6_000, max_turnover_pct=40)
    assert any("TRIM" in w and "trim" in w and "turnover cap" in w
               for w in plan.warnings), plan.warnings
    assert all(o.reason != "trim" for o in plan.sells)


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


def test_buy_budget_defaults_to_cash():
    # Callers with no settlement distinction keep the old behaviour exactly.
    a = compute_plan(targets={"AAA": 1.0}, held={}, sellable={},
                     prices={"AAA": 100}, cash=1000)
    b = compute_plan(targets={"AAA": 1.0}, held={}, sellable={},
                     prices={"AAA": 100}, cash=1000, buy_budget=1000)
    assert [(o.ticker, o.qty) for o in a.orders] == [(o.ticker, o.qty) for o in b.orders]


def test_buy_budget_limits_buys_without_shrinking_nav():
    # The bug this guards: NAV cash (settled + in transit) must size the book,
    # while only the spendable slice funds buys. Passing one for the other
    # either invents a drawdown or over-funds the plan.
    plan = compute_plan(targets={"AAA": 1.0}, held={}, sellable={},
                        prices={"AAA": 100}, cash=10_000, buy_budget=500)
    assert plan.nav == 10_000, plan.nav          # NAV from the full cash figure
    bought = sum(o.qty for o in plan.buys)
    assert bought <= 5, f"bought {bought} shares on a $500 budget"


def test_nav_counts_cash_in_transit():
    # Same book, same prices: cash still in transit must not shrink NAV.
    settled_only = compute_plan(targets={}, held={"AAA": 10}, sellable={"AAA": 10},
                                prices={"AAA": 100}, cash=2_000)
    with_transit = compute_plan(targets={}, held={"AAA": 10}, sellable={"AAA": 10},
                                prices={"AAA": 100}, cash=2_000 + 8_000)
    assert settled_only.nav == 3_000
    assert with_transit.nav == 11_000
    # An 8k gap on a 11k book is the difference between calm and a -70% drawdown.
    assert with_transit.nav / settled_only.nav > 3


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

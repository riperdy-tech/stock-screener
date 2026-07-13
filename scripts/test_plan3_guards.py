"""Guards in run_plan3_ledger (plan3 · bold momentum sleeve).

Pins the defense layers: trailing stop + cooldown, kill-switch tiers with
hysteresis, halt at -20%, band rebalance, regime throttle. No network, no files.
Run: python scripts/test_plan3_guards.py
"""

import importlib.util
import sys
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "tp", str(Path(__file__).resolve().parent / "track_paper_portfolios.py"))
tp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tp)


def _plan(weights, gross=100.0):
    return {"positions": [{"symbol": s, "weight_pct": w} for s, w in weights.items()],
            "regime": {"gross_exposure_pct": gross}}


def _run_day(led, plan, prices, as_of):
    """run + append the NAV point the way finalize_ledger would (peak tracking)."""
    nav, stale = tp.run_plan3_ledger(led, plan, prices, as_of)
    led["nav_series"].append({"date": as_of, "nav": round(nav, 4)})
    return nav


def _seeded(weights, prices, as_of="2026-07-01", gross=100.0):
    led = tp.empty_ledger()
    _run_day(led, _plan(weights, gross), prices, as_of)
    return led


# ── trailing stop + cooldown ─────────────────────────────────────────────────

def test_trailing_stop_fires_and_sets_cooldown():
    prices = {"A": 100.0, "B": 100.0}
    led = _seeded({"A": 50.0, "B": 50.0}, prices)
    # A rallies (raises its high-water mark), then falls 20% off the high.
    _run_day(led, _plan({"A": 50.0, "B": 50.0}), {"A": 120.0, "B": 100.0}, "2026-07-02")
    _run_day(led, _plan({"A": 50.0, "B": 50.0}), {"A": 95.0, "B": 100.0}, "2026-07-03")
    assert "A" not in led["state"]["holdings"], "20% off the high-water mark did not stop out"
    assert led["state"]["cooldown"].get("A") == "2026-07-03"
    assert "B" in led["state"]["holdings"], "stop took out the wrong name"
    stop_trades = [t for t in led["trades"] if t["reason"] == "stop_plan3"]
    assert len(stop_trades) == 1 and stop_trades[0]["ticker"] == "A"


def test_drawdown_from_entry_also_stops():
    """With no rally, the entry price is the high-water mark."""
    prices = {"A": 100.0, "B": 100.0}
    led = _seeded({"A": 50.0, "B": 50.0}, prices)
    _run_day(led, _plan({"A": 50.0, "B": 50.0}), {"A": 84.0, "B": 100.0}, "2026-07-02")
    assert "A" not in led["state"]["holdings"], "-16% from entry did not stop out"


def test_cooldown_blocks_reentry_then_expires():
    prices = {"A": 100.0, "B": 100.0}
    led = _seeded({"A": 50.0, "B": 50.0}, prices)
    _run_day(led, _plan({"A": 50.0, "B": 50.0}), {"A": 80.0, "B": 100.0}, "2026-07-02")  # stop A
    assert "A" not in led["state"]["holdings"]
    # A recovers and is still in the plan — cooldown must block the re-buy (JLHL loop).
    _run_day(led, _plan({"A": 50.0, "B": 50.0}), {"A": 100.0, "B": 100.0}, "2026-07-05")
    assert "A" not in led["state"]["holdings"], "re-entered during cooldown"
    # 14+ calendar days later the ban has expired.
    _run_day(led, _plan({"A": 50.0, "B": 50.0}), {"A": 100.0, "B": 100.0}, "2026-07-17")
    assert "A" in led["state"]["holdings"], "cooldown never expired"
    assert "A" not in led["state"]["cooldown"], "expired cooldown entry not pruned"


def test_stale_mark_neither_raises_hwm_nor_fires_stop():
    prices = {"A": 100.0, "B": 100.0}
    led = _seeded({"A": 50.0, "B": 50.0}, prices)
    # A has no fresh mark today: carried, not stopped, hwm unchanged.
    _run_day(led, _plan({"A": 50.0, "B": 50.0}), {"B": 100.0}, "2026-07-02")
    assert "A" in led["state"]["holdings"], "stale-marked name was traded"
    assert led["state"]["hwm"]["A"] == 100.0


# ── kill switch ──────────────────────────────────────────────────────────────

def test_kill_switch_liquidates_and_halts_past_dd_kill():
    prices = {"A": 50.0, "B": 50.0}
    led = _seeded({"A": 50.0, "B": 50.0}, prices)
    # Both halve: stops fire but the day's NAV is already ~-50% -> kill switch.
    _run_day(led, _plan({"A": 50.0, "B": 50.0}), {"A": 25.0, "B": 25.0}, "2026-07-02")
    assert led["state"]["halted"] is True, "kill switch did not halt"
    assert not led["state"]["holdings"], "halted book still holds positions"
    # Halted book never trades again, even with the plan still asking for entries.
    _run_day(led, _plan({"A": 50.0, "B": 50.0}), {"A": 50.0, "B": 50.0}, "2026-07-03")
    assert not led["state"]["holdings"], "halted book traded"


def test_tier_halves_gross_past_dd_half():
    """Ledger dd past -15% halves gross. A uniform -17% day would trip every
    trailing stop first, so use a mixed book: A crashes out (stop), B holds."""
    prices = {"A": 100.0, "B": 100.0}
    led = _seeded({"A": 50.0, "B": 50.0}, prices)
    # A -30% (stopped out), B -5%: ledger dd ~ -17.6% -> tier 0.5, B trimmed
    # toward weight x nav x 0.5.
    _run_day(led, _plan({"A": 50.0, "B": 50.0}), {"A": 70.0, "B": 95.0}, "2026-07-02")
    assert "A" not in led["state"]["holdings"], "A should have stopped out"
    assert led["state"]["risk_tier"] == 0.5, f"tier {led['state']['risk_tier']}, expected 0.5"
    nav = led["nav_series"][-1]["nav"]
    h = led["state"]["holdings"]["B"]
    value = h["shares"] * 95.0
    target = 0.50 * nav * 0.5
    assert value <= target * (1 + tp.PLAN3_REBAL_BAND) + 0.01, \
        f"B not trimmed to the throttled target: {value:.1f} vs {target:.1f}"


def test_tier_recovers_only_past_hysteresis():
    prices = {"A": 100.0, "B": 100.0}
    led = _seeded({"A": 50.0, "B": 50.0}, prices)
    # A stops out at -30%, B -5%: dd ~ -17.6% -> tier 0.5 (see previous test).
    _run_day(led, _plan({"A": 50.0, "B": 50.0}), {"A": 70.0, "B": 95.0}, "2026-07-02")
    assert led["state"]["risk_tier"] == 0.5
    # B rallies to 110: nav ~ 85.5, dd ~ -14.4% — above the -15% trigger but
    # inside the 2pt hysteresis window (needs > -13%), so the tier holds at 0.5.
    _run_day(led, _plan({"A": 50.0, "B": 50.0}), {"B": 110.0}, "2026-07-03")
    assert led["state"]["risk_tier"] == 0.5, "tier bounced back inside hysteresis"
    # B at 125: nav ~ 88.8, dd ~ -11.1% > -13% -> tier restores. NAV recovers
    # slower than price because the book was de-risked at the lows (the honest
    # cost of the throttle).
    _run_day(led, _plan({"A": 50.0, "B": 50.0}), {"B": 125.0}, "2026-07-04")
    assert led["state"]["risk_tier"] == 1.0, "tier never recovered"


def test_reset_flag_state_reenters_from_cash():
    prices = {"A": 50.0, "B": 50.0}
    led = _seeded({"A": 50.0, "B": 50.0}, prices)
    _run_day(led, _plan({"A": 50.0, "B": 50.0}), {"A": 25.0, "B": 25.0}, "2026-07-02")
    assert led["state"]["halted"]
    # what --reset-plan3-halt does:
    led["state"]["halted"] = False
    led["state"]["risk_tier"] = 1.0
    led["state"]["cooldown"] = {}
    led["state"]["peak_since"] = "2026-07-03"   # rebase: dd measured from here on
    _run_day(led, _plan({"A": 50.0, "B": 50.0}), {"A": 25.0, "B": 25.0}, "2026-07-03")
    assert not led["state"]["halted"], "kill switch re-fired off the pre-crash peak"
    assert led["state"]["holdings"], "reset book did not re-enter"


# ── band rebalance + regime throttle ─────────────────────────────────────────

def test_no_churn_inside_the_band():
    prices = {"A": 100.0, "B": 100.0}
    led = _seeded({"A": 50.0, "B": 50.0}, prices)
    n_trades = len(led["trades"])
    # +10% / -10% drift: inside the 25% band, nothing should trade.
    _run_day(led, _plan({"A": 50.0, "B": 50.0}), {"A": 110.0, "B": 90.0}, "2026-07-02")
    assert len(led["trades"]) == n_trades, "band rebalance churned inside the band"


def test_regime_throttle_scales_entries():
    prices = {"A": 100.0, "B": 100.0}
    led = tp.empty_ledger()
    _run_day(led, _plan({"A": 50.0, "B": 50.0}, gross=50.0), prices, "2026-07-01")
    nav = led["nav_series"][-1]["nav"]
    invested = sum(h["shares"] * 100.0 for h in led["state"]["holdings"].values())
    assert invested < nav * 0.6, f"regime 50% ignored: invested {invested:.0f} of {nav:.0f}"
    assert led["state"]["cash"] > nav * 0.4, "cash not held back under the throttle"


def test_throttle_raise_redeploys_cash():
    """Cash is a regime decision: gross back to 100% must top positions back up."""
    prices = {"A": 100.0, "B": 100.0}
    led = tp.empty_ledger()
    _run_day(led, _plan({"A": 50.0, "B": 50.0}, gross=50.0), prices, "2026-07-01")
    _run_day(led, _plan({"A": 50.0, "B": 50.0}, gross=100.0), prices, "2026-07-02")
    invested = sum(h["shares"] * 100.0 for h in led["state"]["holdings"].values())
    nav = led["nav_series"][-1]["nav"]
    assert invested > nav * 0.85, f"cash never redeployed: invested {invested:.0f} of {nav:.0f}"


def test_leaver_exits_on_grace_schedule():
    prices = {"A": 100.0, "B": 100.0, "C": 100.0}
    led = _seeded({"A": 34.0, "B": 33.0, "C": 33.0}, prices)
    _run_day(led, _plan({"A": 50.0, "B": 50.0}), prices, "2026-07-02")  # arms C
    assert "C" in led["state"]["holdings"]
    _run_day(led, _plan({"A": 50.0, "B": 50.0}), prices, "2026-07-03")  # sells C
    assert "C" not in led["state"]["holdings"], "leaver never exited"
    assert "C" not in led["state"]["hwm"], "leaver's high-water mark not cleaned up"


def test_same_day_rerun_is_idempotent():
    prices = {"A": 100.0, "B": 100.0}
    led = _seeded({"A": 50.0, "B": 50.0}, prices)
    tp.run_plan3_ledger(led, _plan({"A": 50.0, "B": 50.0}), {"A": 80.0, "B": 100.0}, "2026-07-02")
    trades_first = [t for t in led["trades"] if t["date"] == "2026-07-02"]
    tp.run_plan3_ledger(led, _plan({"A": 50.0, "B": 50.0}), {"A": 80.0, "B": 100.0}, "2026-07-02")
    trades_second = [t for t in led["trades"] if t["date"] == "2026-07-02"]
    assert len(trades_first) == len(trades_second), "same-day rerun double-traded"
    assert len([t for t in led["trades"] if t["reason"] == "stop_plan3"]) == 1


def test_top_up_averages_entry_basis():
    led = tp.empty_ledger()
    led["state"]["holdings"]["A"] = {"entry_date": "2026-07-01", "entry_price": 100.0,
                                     "shares": 1.0}
    led["state"]["cash"] = 100.0
    tp.top_up(led, "A", 200.0, 100.0, "2026-07-02", "rebalance_plan3")
    h = led["state"]["holdings"]["A"]
    assert h["shares"] > 1.0
    assert 100.0 < h["entry_price"] < 200.0, f"basis {h['entry_price']} not averaged"


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
        except Exception as e:
            failed += 1
            print(f"  ERROR {fn.__name__}: {type(e).__name__}: {e}")
    print(f"{len(fns) - failed}/{len(fns)} passed")
    sys.exit(1 if failed else 0)

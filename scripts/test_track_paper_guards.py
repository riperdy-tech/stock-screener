"""Guards in track_paper_portfolios.py: unknown-vs-demoted, source health, entrant funding.

These pin the Step-1 correctness fixes. No network, no files.
Run: python scripts/test_track_paper_guards.py
"""

import importlib.util
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "tp", str(Path(__file__).resolve().parent / "track_paper_portfolios.py"))
tp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tp)


def _seeded(names, prices):
    """A ledger already holding `names`, equally weighted."""
    led = tp.empty_ledger()
    tp.run_target_ledger(led, {n: 100.0 / len(names) for n in names}, prices, "2026-07-01", "rank")
    return led


# ── unknown vs demoted ───────────────────────────────────────────────────────

def test_unevaluated_name_is_not_a_leaver():
    """A held name the engine did not band must be carried, never sold."""
    prices = {"A": 100.0, "B": 100.0}
    led = _seeded(["A", "B"], prices)
    # B is unknown this run; target set contains only A.
    tp.run_target_ledger(led, {"A": 100.0}, prices, "2026-07-02", "rank", unknown={"B"})
    tp.run_target_ledger(led, {"A": 100.0}, prices, "2026-07-03", "rank", unknown={"B"})
    assert "B" in led["state"]["holdings"], "unknown name was sold"
    assert not led.get("exit_pending", {}).get("B"), "unknown name armed an exit"


def test_evaluated_and_demoted_name_still_exits():
    """The grace period still applies to a genuine demotion (2 consecutive misses)."""
    prices = {"A": 100.0, "B": 100.0}
    led = _seeded(["A", "B"], prices)
    tp.run_target_ledger(led, {"A": 100.0}, prices, "2026-07-02", "rank")  # arms
    assert "B" in led["state"]["holdings"]
    tp.run_target_ledger(led, {"A": 100.0}, prices, "2026-07-03", "rank")  # sells
    assert "B" not in led["state"]["holdings"], "demoted name was not sold"


def test_unknown_run_disarms_a_pending_exit():
    """Grace counts 2 consecutive EVALUATED misses.

    A name armed yesterday and unevaluated today must not sell the instant it is
    graded again — that would skip its grace period entirely (observed on ATAT).
    """
    prices = {"A": 100.0, "B": 100.0}
    led = _seeded(["A", "B"], prices)
    tp.run_target_ledger(led, {"A": 100.0}, prices, "2026-07-02", "rank")            # arms B
    assert led["exit_pending"].get("B")
    tp.run_target_ledger(led, {"A": 100.0}, prices, "2026-07-03", "rank", unknown={"B"})
    assert not led["exit_pending"].get("B"), "unknown run left the exit armed"
    assert "B" in led["state"]["holdings"]
    tp.run_target_ledger(led, {"A": 100.0}, prices, "2026-07-04", "rank")            # re-arms
    assert "B" in led["state"]["holdings"], "sold on first evaluated miss after unknown"
    tp.run_target_ledger(led, {"A": 100.0}, prices, "2026-07-05", "rank")            # sells
    assert "B" not in led["state"]["holdings"]


def test_evaluated_quant_and_llm_predicates():
    assert tp.evaluated_quant({"fct_band": "research_now"})
    assert tp.evaluated_quant({"fct_band": "pass"})
    assert not tp.evaluated_quant({"fct_band": "insufficient_factors"})
    assert not tp.evaluated_quant({"fct_band": None})
    assert not tp.evaluated_quant(None)          # absent ticker
    assert not tp.evaluated_quant({})
    # LLM silence must never be read as a verdict
    assert tp.evaluated_llm({"fct_band_llm": "watchlist"})
    assert not tp.evaluated_llm({"fct_band": "research_now"})   # quant only -> unknown to LLM
    assert not tp.evaluated_llm({"fct_band_llm": None})


# ── source health ────────────────────────────────────────────────────────────

def _fresh(**kw):
    d = {"generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
         "scored_count": 1000}
    d.update(kw)
    return d


def test_factor_health_accepts_fresh_file():
    ok, why = tp.factor_healthy(_fresh(), {}, "2026-07-10")
    assert ok, why


def test_factor_health_rejects_stale_content():
    old = (datetime.now(timezone.utc) - timedelta(hours=tp.FACTOR_MAX_AGE_H + 1)).isoformat()
    ok, why = tp.factor_healthy(_fresh(generated_at=old), {}, "2026-07-10")
    assert not ok and "old" in why


def test_factor_health_rejects_collapsed_scored_count():
    book = {"health": {"factor_scored_count": 1000}}
    ok, why = tp.factor_healthy(_fresh(scored_count=500), book, "2026-07-10")
    assert not ok and "collapsed" in why


def test_factor_health_rejects_missing_timestamp():
    ok, why = tp.factor_healthy({"scored_count": 1000}, {}, "2026-07-10")
    assert not ok and "generated_at" in why


def test_empty_target_set_with_holdings_is_a_failure():
    """The deterministic replacement for the old collapse breaker."""
    led = _seeded(["A", "B"], {"A": 100.0, "B": 100.0})
    ok, why = tp.targets_healthy("equal", {}, led)
    assert not ok and "empty" in why
    # ...but an empty target set on an empty book is fine (inception).
    ok2, _ = tp.targets_healthy("equal", {}, tp.empty_ledger())
    assert ok2


def test_hold_ledger_marks_nav_without_trading():
    prices = {"A": 100.0, "B": 100.0}
    led = _seeded(["A", "B"], prices)
    before = len(led["trades"])
    nav, _ = tp.hold_ledger(led, {"A": 110.0, "B": 90.0}, "2026-07-02")
    assert len(led["trades"]) == before, "hold_ledger traded"
    assert len(led["state"]["holdings"]) == 2
    assert nav > 0


# ── entrant funding (the UFPT bug) ───────────────────────────────────────────

def test_entrants_are_not_starved_by_alphabet():
    """Cash short: fund pro-rata, never silently skip whoever sorts last."""
    prices = {"AAA": 100.0, "ZZZ": 100.0}
    led = tp.empty_ledger()
    led["state"]["cash"] = 100.0
    # Two entrants each wanting 50% of a NAV of 100 -> exactly funded.
    tp.run_target_ledger(led, {"AAA": 50.0, "ZZZ": 50.0}, prices, "2026-07-01", "rank")
    assert set(led["state"]["holdings"]) == {"AAA", "ZZZ"}, "an entrant was dropped"


def test_underfunded_entrants_are_deferred_loudly_not_silently():
    """Fully invested, incumbent unpriceable (so untrimmable), no cash for entrants.

    This is the UFPT shape: entrants must be recorded and warned about, never
    dropped in silence, and never opened as token positions.
    """
    led = _seeded(["HELD"], {"HELD": 100.0})          # cash 0, nav 100
    assert led["state"]["cash"] == 0
    prices = {"BBB": 100.0, "CCC": 100.0}             # HELD has no fresh price -> stale
    tp.run_target_ledger(led, {"HELD": 33.3, "BBB": 33.3, "CCC": 33.3},
                         prices, "2026-07-02", "rank")
    assert set(led["state"]["holdings"]) == {"HELD"}, "opened positions it could not fund"
    rec = led.get("underfunded_entrants")
    assert rec and set(rec["tickers"]) == {"BBB", "CCC"}, f"deferral not recorded: {rec}"


def test_deferred_entrant_enters_next_run_once_cash_frees():
    """Deferral self-heals: no permanent underweight, no token position."""
    led = _seeded(["HELD"], {"HELD": 100.0})
    tp.run_target_ledger(led, {"HELD": 33.3, "BBB": 33.3, "CCC": 33.3},
                         {"BBB": 100.0, "CCC": 100.0}, "2026-07-02", "rank")
    assert led.get("underfunded_entrants")
    # HELD prices again -> trimming can fund the entrants.
    tp.run_target_ledger(led, {"HELD": 33.3, "BBB": 33.3, "CCC": 33.3},
                         {"HELD": 100.0, "BBB": 100.0, "CCC": 100.0}, "2026-07-03", "rank")
    assert set(led["state"]["holdings"]) == {"HELD", "BBB", "CCC"}, "entrants never arrived"
    assert not led.get("underfunded_entrants"), "stale deferral record survived"


def test_no_partial_entry_positions():
    """A funded entrant sits at full target weight, never a fraction of it."""
    led = _seeded(["HELD"], {"HELD": 100.0})
    tp.run_target_ledger(led, {"HELD": 50.0, "BBB": 50.0},
                         {"HELD": 100.0, "BBB": 100.0}, "2026-07-02", "rank")
    h = led["state"]["holdings"]["BBB"]
    value = h["shares"] * 100.0
    assert value > 45.0, f"entered at {value:.1f}, not ~50 (partial position)"


# ── the removed breaker must not resurrect ───────────────────────────────────

def test_mass_demotion_now_exits_on_the_grace_schedule_not_four_days():
    """6 of 10 names genuinely demoted: sold on the 2nd consecutive miss, not the 4th run."""
    names = [f"N{i}" for i in range(10)]
    prices = {n: 100.0 for n in names}
    led = _seeded(names, prices)
    survivors = {n: 25.0 for n in names[:4]}
    tp.run_target_ledger(led, survivors, prices, "2026-07-02", "rank")   # arms
    assert len(led["state"]["holdings"]) == 10
    tp.run_target_ledger(led, survivors, prices, "2026-07-03", "rank")   # sells
    assert len(led["state"]["holdings"]) == 4, "mass demotion did not execute on schedule"


# ── F-04 hysteresis exit band (equal_llm retention) ──────────────────────────

def _verdict(action="Hold", conviction=10.0, fair_value=None,
             analyzed_date="2026-07-01", entry_timing="stage", stance="fair"):
    return {"action": action, "conviction": conviction, "fair_value": fair_value,
            "analyzed_date": analyzed_date, "entry_timing": entry_timing, "stance": stance}


_OK_ENTRY = {"fct_veto": None}


def test_hyst_retains_name_in_buffer_zone():
    """Live MoS 12 (below the 15 entry gate, above the 10 exit) with healthy
    conviction -> a held name is retained, not sold on boundary noise."""
    v = _verdict(conviction=10.0, fair_value=112.0)          # (112/100-1)=12% MoS
    assert tp.llm_hold_qualifies(_OK_ENTRY, v, 100.0, "2026-07-05") is True


def test_hyst_sells_below_exit_band():
    """Live MoS 8 (below the 10 exit) with conviction below 9.0 -> not retained."""
    v = _verdict(conviction=8.5, fair_value=108.0)           # 8% MoS
    assert tp.llm_hold_qualifies(_OK_ENTRY, v, 100.0, "2026-07-05") is False


def test_hyst_deep_value_holds_regardless_of_conviction():
    """MoS >= 25 holds even on weak conviction (deep-value carve-out)."""
    v = _verdict(conviction=4.0, fair_value=130.0)           # 30% MoS
    assert tp.llm_hold_qualifies(_OK_ENTRY, v, 100.0, "2026-07-05") is True


def test_hyst_bearish_is_hard_exit():
    """An explicit bearish call always exits, even with a fat margin of safety."""
    v = _verdict(action="Sell / reduce exposure", conviction=12.0, fair_value=140.0)
    assert tp.llm_hold_qualifies(_OK_ENTRY, v, 100.0, "2026-07-05") is False


def test_hyst_conviction_buffer_boundary():
    """MoS in [10,25) needs conviction >= 9.0 (the token buffer below the 9.5 gate)."""
    v_ok = _verdict(conviction=9.0, fair_value=112.0)        # conv exactly at the buffer
    v_no = _verdict(conviction=8.9, fair_value=112.0)        # just below
    assert tp.llm_hold_qualifies(_OK_ENTRY, v_ok, 100.0, "2026-07-05") is True
    assert tp.llm_hold_qualifies(_OK_ENTRY, v_no, 100.0, "2026-07-05") is False


def test_hyst_uses_live_price_not_frozen_mos():
    """A name that rallied so its LIVE MoS collapsed is dropped even if the
    frozen verdict MoS still looks cheap — the whole point of F-04."""
    v = _verdict(conviction=8.0, fair_value=105.0)           # live MoS ~5% at price 100
    v["realistic_mos_pct"] = 40.0                            # stale frozen value, must be ignored
    assert tp.llm_hold_qualifies(_OK_ENTRY, v, 100.0, "2026-07-05") is False


def test_hyst_vetoed_or_missing_verdict_not_retained():
    """Quant hard-veto or an absent verdict -> never retained."""
    assert tp.llm_hold_qualifies({"fct_veto": "forensic_pair"},
                                 _verdict(fair_value=130.0), 100.0, "2026-07-05") is False
    assert tp.llm_hold_qualifies(_OK_ENTRY, None, 100.0, "2026-07-05") is False


def test_guard_does_not_raise_systemexit():
    """The tracker signals held books via the data, never by failing the process —
    a nonzero exit would abort run_chain's daily commit. Guard-tripping paths must
    return normally."""
    import inspect
    src = inspect.getsource(tp.main)
    assert "sys.exit(" not in src, "main() still calls sys.exit — would break the chain"


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

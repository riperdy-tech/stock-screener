"""dd_engine.py — portfolio drawdown governor (Phase 2, spec 2026-07-20 §5).

Pure logic, no I/O, no network: track peak NAV and return the gross-exposure
target the drawdown budget allows. Tiers de-risk in steps BEFORE the user's
15% budget so the realized worst case (daily marks, overnight gaps) stays
inside it. Recovery uses hysteresis so a NAV oscillating at a boundary does
not churn. HALT is sticky: only a manual reset clears it (same philosophy as
the KIS_HALT variable, which the future sync wiring trips automatically).

Generalizes the proven plan3 machinery (track_paper_portfolios.py PLAN3_*)
to whatever book is mirrored to KIS. Validated by
docs/superpowers/audit/tools/dd_replay.py; unit tests in
scripts/test_dd_engine.py. NOT wired to any order path — wiring is a
separate, explicitly approved change."""

from __future__ import annotations

# Defaults are SIMULATION INPUTS, not final policy: dd_replay.py's stress grid
# selects the final numbers so realized max DD stays inside the 15% budget.
DEFAULT_CONFIG = {
    "tiers": [(-0.08, 0.50), (-0.11, 0.25)],  # (drawdown trigger, gross target)
    "halt_dd": -0.13,                          # liquidate + sticky halt
    "recover_hyst": 0.02,                      # re-risk only this far above a trigger
}


def _migrate(state: dict) -> dict:
    """Bring a pre-unitization state forward. Free and exact: with units = 1 the
    per-unit value IS the NAV, so peak_pu = peak_nav and every drawdown reading
    is bit-identical to what the raw governor produced."""
    if "units" in state and "peak_pu" in state:
        return state
    return {**state, "units": 1.0, "peak_pu": float(state["peak_nav"])}


def initial_state(nav: float) -> dict:
    return {"peak_nav": float(nav), "peak_pu": float(nav), "units": 1.0,
            "gross": 1.0, "halted": False}


def apply_flow(state: dict, nav_after: float, flow: float) -> dict:
    """Record money crossing the USD-sleeve boundary, so it is NOT read as P&L.

    `flow` is signed and denominated in USD: positive for money arriving in the
    sleeve (an external USD deposit, or a KRW->USD 환전), negative for money
    leaving it (a withdrawal, or USD->KRW). Pure KRW movement is not a flow —
    it never enters NAV, so it must never move units either.

    A flow buys or sells units at the pre-flow price, which leaves the price per
    unit exactly unchanged:

        units' = units x nav_after / nav_before    where nav_before = nav_after - flow
        pu'    = nav_after / units' = nav_before / units = pu

    That identity is the whole mechanism. Without it a deposit lifts NAV past the
    high-water mark and silently forgives an open drawdown — worse than merely
    failing to notice, because it also restores full gross exposure.

    Timing note: `nav_after` is observed on the next run, not at the instant of
    the transfer, so any market move in between is attributed to the flow. One
    run per day bounds that to intraday noise; declare the flow on the first run
    after moving money rather than saving several up.
    """
    st = _migrate(state)
    flow = float(flow)
    if flow == 0.0:
        return st
    nav_before = float(nav_after) - flow
    if nav_before <= 0 or float(nav_after) <= 0:
        raise ValueError(
            f"implausible flow {flow:+,.2f} against NAV {nav_after:,.2f}: "
            f"pre-flow NAV would be {nav_before:,.2f}")
    units = float(st["units"]) * float(nav_after) / nav_before
    return {**st, "units": units, "peak_nav": float(st["peak_pu"]) * units}


def resume(state: dict) -> dict:
    """Clear a halt after human review, PRESERVING the peak. The drawdown budget
    is measured from the true high-water mark, so re-risking is governed by the
    tier ladder at the still-depressed dd — and if dd sits at/below the halt
    line, the next decide() re-halts immediately (stay flat until the water
    recedes). This is the routine post-halt action.

    Validation note (dd_replay, 2026-07-21): modeling reset as a budget restart
    at the bottom compounded −13% cycles into −38% realized in a 2022-style
    grind. Resume-with-peak is the budget-honoring semantics."""
    st = _migrate(state)
    return {"peak_nav": float(st["peak_nav"]), "peak_pu": float(st["peak_pu"]),
            "units": float(st["units"]), "gross": 0.0, "halted": False}


def rebase(nav: float) -> dict:
    """Deliberate NEW budget base — accepts a fresh 15% below here. A conscious
    regime decision (e.g., months later, new capital), never routine.

    Since unitization landed this is rarely the right tool for new capital:
    apply_flow() keeps the budget honest without forgiving an open drawdown,
    whereas rebase() deliberately discards it. Reach for it on a genuine regime
    change, not on a deposit."""
    return initial_state(nav)


def decide(state: dict, nav: float, config: dict | None = None):
    """One daily mark. Returns (new_state, decision).

    decision = {dd, pu, units, gross, prev_gross,
                action: none|derisk|rerisk|halt|halted, reason}.
    Pure function: same inputs -> same outputs.

    Drawdown is measured on NAV PER UNIT, not raw NAV, so money moving in or out
    of the USD sleeve cannot register as performance (see apply_flow). Cash still
    counts toward NAV exactly as before — an undeployed balance dilutes the
    reading, which is correct for a budget on capital rather than on the equity
    sleeve alone."""
    cfg = {**DEFAULT_CONFIG, **(config or {})}
    tiers = sorted(cfg["tiers"])                     # most negative trigger first
    st = _migrate(state)
    units = float(st["units"])
    pu = float(nav) / units
    peak_pu = max(float(st["peak_pu"]), pu)
    peak = peak_pu * units                           # display only: NAV at the high-water mark
    dd = pu / peak_pu - 1.0
    prev = float(st["gross"])

    def _state(gross, halted):
        return {"peak_nav": peak, "peak_pu": peak_pu, "units": units,
                "gross": gross, "halted": halted}

    if st.get("halted"):
        return (_state(0.0, True),
                {"dd": dd, "pu": pu, "units": units, "gross": 0.0, "prev_gross": prev,
                 "action": "halted", "reason": "halt is sticky until manual reset"})

    if dd <= cfg["halt_dd"]:
        return (_state(0.0, True),
                {"dd": dd, "pu": pu, "units": units, "gross": 0.0, "prev_gross": prev,
                 "action": "halt",
                 "reason": f"dd {dd:.1%} <= halt {cfg['halt_dd']:.0%} — liquidate and halt"})

    # tier target on the way DOWN (enter at the trigger)
    target = 1.0
    for trig, gross in tiers:
        if dd <= trig:
            target = gross
            break

    # allowed level on the way UP (leave only above trigger + hysteresis)
    allowed = 1.0
    for trig, gross in tiers:
        if dd <= trig + cfg["recover_hyst"]:
            allowed = gross
            break

    if target < prev:
        new_gross, action = target, "derisk"
        reason = f"dd {dd:.1%} entered tier -> gross {target:.0%}"
    elif allowed > prev:
        new_gross, action = allowed, "rerisk"
        reason = f"dd {dd:.1%} recovered past hysteresis -> gross {allowed:.0%}"
    else:
        new_gross, action = prev, "none"
        reason = ""
    return (_state(new_gross, False),
            {"dd": dd, "pu": pu, "units": units, "gross": new_gross,
             "prev_gross": prev, "action": action, "reason": reason})

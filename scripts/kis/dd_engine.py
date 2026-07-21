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


def initial_state(nav: float) -> dict:
    return {"peak_nav": float(nav), "gross": 1.0, "halted": False}


def resume(state: dict) -> dict:
    """Clear a halt after human review, PRESERVING the peak. The drawdown budget
    is measured from the true high-water mark, so re-risking is governed by the
    tier ladder at the still-depressed dd — and if dd sits at/below the halt
    line, the next decide() re-halts immediately (stay flat until the water
    recedes). This is the routine post-halt action.

    Validation note (dd_replay, 2026-07-21): modeling reset as a budget restart
    at the bottom compounded −13% cycles into −38% realized in a 2022-style
    grind. Resume-with-peak is the budget-honoring semantics."""
    return {"peak_nav": float(state["peak_nav"]), "gross": 0.0, "halted": False}


def rebase(nav: float) -> dict:
    """Deliberate NEW budget base — accepts a fresh 15% below here. A conscious
    regime decision (e.g., months later, new capital), never routine."""
    return initial_state(nav)


def decide(state: dict, nav: float, config: dict | None = None):
    """One daily mark. Returns (new_state, decision).

    decision = {dd, gross, prev_gross, action: none|derisk|rerisk|halt|halted,
                reason}. Pure function: same inputs -> same outputs."""
    cfg = {**DEFAULT_CONFIG, **(config or {})}
    tiers = sorted(cfg["tiers"])                     # most negative trigger first
    peak = max(float(state["peak_nav"]), float(nav))
    dd = nav / peak - 1.0
    prev = float(state["gross"])

    if state.get("halted"):
        return ({"peak_nav": peak, "gross": 0.0, "halted": True},
                {"dd": dd, "gross": 0.0, "prev_gross": prev, "action": "halted",
                 "reason": "halt is sticky until manual reset"})

    if dd <= cfg["halt_dd"]:
        return ({"peak_nav": peak, "gross": 0.0, "halted": True},
                {"dd": dd, "gross": 0.0, "prev_gross": prev, "action": "halt",
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
    return ({"peak_nav": peak, "gross": new_gross, "halted": False},
            {"dd": dd, "gross": new_gross, "prev_gross": prev, "action": action,
             "reason": reason})

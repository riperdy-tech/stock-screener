"""Approval of a large sell plan (SPEC 3R, guard G2; G5 for the drawdown governor).

A plan needs a human-supplied approval hash before any order is sent when:

  * its total sell value exceeds KIS_SELL_APPROVAL_FRACTION of account NAV; or
  * every target weight is 0 (an empty target) while the account holds positions: the
    plan leaves the book all cash and every holding would be sold; or
  * the drawdown governor tripped (it reduced or halted the targets) and the plan sells.
    The governor proposes a plan; it never executes one on its own (G5).

The approval is the plan's own hash (kis.journal.plan_hash: environment, ledger, UTC
trade date and the sorted side/ticker/qty lines), supplied by the operator through the
environment variable KIS_APPROVED_PLAN_HASH or the --approve-plan flag. A hash from a
different plan, or from another day, does not match.

The defaults below are the recommended values pending OPERATOR_DECISIONS A4 and A5.
Each lives in exactly one place, here.
"""

from __future__ import annotations

# A4: a plan whose sells exceed this fraction of NAV needs approval.
KIS_SELL_APPROVAL_FRACTION = 0.25
# A5: True = a governor trip that sells needs approval (it only proposes). False would let
# the governor's own sells go out like any other plan; the recommendation is True.
DD_TRIP_REQUIRES_APPROVAL = True
# Where the operator supplies the approved hash (the --approve-plan flag defaults to it).
APPROVED_PLAN_HASH_ENV = "KIS_APPROVED_PLAN_HASH"
# Process exit code of a run that stopped for want of approval.
EXIT_APPROVAL_REQUIRED = 5


def approval_reasons(plan, held: dict, weights: dict, governor_tripped: bool,
                     fraction: float | None = None) -> list[str]:
    """Why `plan` needs approval; an empty list means it does not.

    `plan` is a kis.reconcile.Plan, `held` {ticker: shares} as the account holds them,
    `weights` the final target weights (after the governor's gate), `governor_tripped`
    whether the governor reduced or halted the targets. A plan with no sells never
    needs approval: nothing in it can reduce the book.
    """
    fraction = KIS_SELL_APPROVAL_FRACTION if fraction is None else fraction
    sells = plan.sells
    if not sells:
        return []
    reasons = []
    sell_value = sum(o.est_value for o in sells)
    if sell_value > fraction * plan.nav:
        share = f"{sell_value / plan.nav:.1%} of NAV" if plan.nav > 0 else "NAV is not positive"
        reasons.append(f"total sell value ${sell_value:,.2f} is {share} "
                       f"(approval above {fraction:.0%}, NAV ${plan.nav:,.2f})")
    longs = sorted(t for t, sh in held.items() if sh > 0)
    if longs and not any(w > 0 for w in weights.values()):
        reasons.append(f"every target weight is 0 (empty target while long): the plan leaves "
                       f"the book all cash and the account holds {len(longs)} position(s): "
                       f"{', '.join(longs)}")
    if governor_tripped and DD_TRIP_REQUIRES_APPROVAL:
        reasons.append("the drawdown governor tripped and proposes these sells (it never "
                       "executes on its own)")
    return reasons


def check_approval(plan_hash_: str, supplied: str | None) -> tuple[bool, str]:
    """(approved, detail). Approved only when `supplied` is exactly this plan's hash."""
    text = (supplied or "").strip().lower()
    if not text:
        return False, "no approval hash supplied"
    if text != plan_hash_.lower():
        return False, (f"the supplied hash {text[:12]}... is not this plan's hash "
                       f"{plan_hash_[:12]}... (a different plan, or another day)")
    return True, "the supplied hash matches this plan"

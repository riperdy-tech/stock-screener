"""Which ledgers may be mirrored to a broker account (SPEC 3R, guards G6 and G7).

G6: real money may mirror only the ledgers in KIS_REAL_LEDGERS (an allow-list). Any other
    ledger refuses with --env real. The paper-only deny-list in kis.targets
    (PAPER_ONLY_LEDGERS) stays, and still refuses those ledgers on every env.
G7: while MODEL_RELEASE_BLOCKED is not exactly 'false' (kis.halt), a ledger in
    MODEL_DERIVED_LEDGERS refuses to be mirrored, on --env real and --env paper alike.

The defaults below are the recommended values pending OPERATOR_DECISIONS A6 and A7.
Each lives in exactly one place, here.
"""

from __future__ import annotations

from kis.halt import model_release_blocked_state

# A6: the only ledgers real money may mirror.
KIS_REAL_LEDGERS = frozenset({"rn_depth"})
# A7: ledgers whose targets come from a model; blocked while the model release is blocked.
MODEL_DERIVED_LEDGERS = frozenset({"rn_depth", "rn_gemini", "rn_v4", "rn_v4_low", "rn_v4_abs"})


def ledger_refusals(ledger: str, env: str, environ=None) -> list[str]:
    """Reasons `ledger` may not be mirrored to `env`; an empty list means allowed."""
    reasons = []
    if env == "real" and ledger not in KIS_REAL_LEDGERS:
        reasons.append(f"ledger {ledger!r} is not on the real-money allow-list "
                       f"{sorted(KIS_REAL_LEDGERS)}; it may not be mirrored with --env real")
    if ledger in MODEL_DERIVED_LEDGERS:
        blocked, why = model_release_blocked_state(environ)
        if blocked:
            reasons.append(f"ledger {ledger!r} is model-derived and the model release is "
                           f"blocked ({why}); it may not be mirrored on any env")
    return reasons

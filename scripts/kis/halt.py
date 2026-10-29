"""The KIS kill switch, read in exactly one place.

Fail closed (SPEC 3R, guard G1): trading is allowed only when KIS_HALT is
exactly 'false' after strip and lower-case. Unset, empty, '0', 'no', 'off' or a
typo all halt. Every KIS script that can send an order calls kis_halt_state().
"""

from __future__ import annotations

import os


def kis_halt_state(environ=None) -> tuple[bool, str]:
    """Return (halted, reason). reason is '' when trading is allowed."""
    env = os.environ if environ is None else environ
    if "KIS_HALT" not in env:
        return True, "KIS_HALT unset"
    raw = env["KIS_HALT"]
    if raw.strip().lower() == "false":
        return False, ""
    return True, f"KIS_HALT={raw!r} is not 'false'"


def model_release_blocked_state(environ=None) -> tuple[bool, str]:
    """G7: the MODEL_RELEASE_BLOCKED repository variable, read in exactly one place.

    Fails closed like kis_halt_state: only 'false' (after strip and lower-case) means the
    model release is not blocked. Unset, empty or any other value is blocked.
    Return (blocked, reason). reason is '' when not blocked.
    """
    env = os.environ if environ is None else environ
    if "MODEL_RELEASE_BLOCKED" not in env:
        return True, "MODEL_RELEASE_BLOCKED unset"
    raw = env["MODEL_RELEASE_BLOCKED"]
    if raw.strip().lower() == "false":
        return False, ""
    return True, f"MODEL_RELEASE_BLOCKED={raw!r} is not 'false'"

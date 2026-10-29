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

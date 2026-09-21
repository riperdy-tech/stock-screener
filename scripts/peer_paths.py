"""peer_paths.py - the single owner of where this repo's PEER repositories live.

Only one thing in this repository reaches outside it: fetch_macro_state.py needs the Macro Regime
Indicator's .env to borrow FRED_API_KEY. It used to do that by walking UP one directory and back
down by a hardcoded folder name:

    macro_env = ROOT.parent / "Macro Regime Indicator" / ".env"

which made the DIRECTORY NESTING itself load-bearing. This repository currently sits inside a
non-repository wrapper folder that happens to also contain the MRI repository, and that accident
is the only reason the line worked. Under the planned layout the two become siblings and the line
would silently stop finding the file - silently, because the caller only checks `.exists()` and
falls through to a generic "FRED_API_KEY not set" error that names neither path it tried.

The contract, matching rs2-local/paths.py:

  1. the key's own environment variable, if set - used VERBATIM, never probed. An operator who
     names a path means it; a typo must surface as a missing file, not be quietly replaced.
  2. a probe across the candidate roots and folder spellings below, first hit wins.

Both the current nested layout and the post-move sibling layout are listed, current first, so the
folder move needs no edit here and a half-finished move cannot resolve to a freshly created empty
sibling.

Nothing is cached, so a moved folder takes effect on the next run.

See docs/superpowers/specs/2026-09-22-stocks-workspace-reorg-design.md.
"""

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]      # the stock-screener repo root

# Candidate parents holding the sibling repositories. Today this repo is nested one level deeper
# than the MRI (inside the `Stock Screener` wrapper), so BOTH the parent and the grandparent have
# to be tried; after the move only the parent is needed. STOCKS_ROOT, when set, replaces both.
def _candidate_roots():
    env = (os.environ.get("STOCKS_ROOT") or "").strip()
    if env:
        return [Path(env).expanduser()]
    return [ROOT.parent, ROOT.parent.parent]


# Folder spellings for the MRI repo, current layout first.
_MRI_NAMES = ("Macro Regime Indicator", "macro-regime-indicator")


def mri_dir(required=False):
    """The Macro Regime Indicator repository root, or None when it cannot be found.

    Absent by default rather than fatal: this repository can do almost everything without the MRI
    present, and only fetch_macro_state.py cares.
    """
    env = (os.environ.get("MRI_DIR") or "").strip()
    if env:
        return Path(env).expanduser()

    for root in _candidate_roots():
        for name in _MRI_NAMES:
            candidate = root / name
            if candidate.exists():
                return candidate

    if required:
        raise FileNotFoundError(
            f"cannot locate the Macro Regime Indicator repository. Tried MRI_DIR, then "
            f"{', '.join(str(r / n) for r in _candidate_roots() for n in _MRI_NAMES)}. "
            f"Set MRI_DIR or STOCKS_ROOT to the real location - do not guess."
        )
    return None


def mri_env_file():
    """The MRI .env, from MRI_ENV_FILE if set, else `<mri_dir>/.env`, else None.

    Returned whether or not it exists: the caller decides, and a caller that reports WHICH path it
    tried is more useful than one handed a pre-validated None.
    """
    env = (os.environ.get("MRI_ENV_FILE") or "").strip()
    if env:
        return Path(env).expanduser()

    base = mri_dir()
    return (base / ".env") if base else None


def mri_outputs_dir():
    """Where MRI writes current_regime.json and the capital-market anchors."""
    env = (os.environ.get("MRI_OUTPUTS_DIR") or "").strip()
    if env:
        return Path(env).expanduser()

    base = mri_dir()
    return (base / "outputs") if base else None


if __name__ == "__main__":
    for label, value in (("STOCKS_ROOT candidates", _candidate_roots()),
                         ("mri_dir", mri_dir()),
                         ("mri_env_file", mri_env_file()),
                         ("mri_outputs_dir", mri_outputs_dir())):
        if isinstance(value, list):
            print(f"{label:24s} = {', '.join(str(v) for v in value)}")
        else:
            state = "" if value is None else ("(exists)" if value.exists() else "(MISSING)")
            print(f"{label:24s} = {value}  {state}")

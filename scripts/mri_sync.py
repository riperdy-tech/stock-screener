"""mri_sync.py — copies MRI's live outputs into the screener's committed snapshot.

Why this exists: score_factors_dual_door.py's sector-quota loader (MRI-11) reads MRI's
current_sector_ranking.json straight from the MRI checkout when peer_paths.mri_outputs_dir()
resolves (the operator's PC, the self-hosted runner). A cloud run has no MRI checkout, so it
needs a fallback the screener repo itself carries: a snapshot under public/data/mri/, refreshed
by whichever machine last ran with the MRI present.

sync_mri_snapshot() is that refresh. It is machine-written only: the workflow edit that would
`git add public/data/mri/` on every scheduled run is an operator-approval item (P0.6 item 3) and
is not made here. Until approved, the snapshot is written locally and the operator commits it by
hand.
"""

import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

sys.path.append(str(Path(__file__).resolve().parent))
import peer_paths  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT_DIR = ROOT / "public" / "data" / "mri"
MANIFEST_JSON = SNAPSHOT_DIR / "manifest.json"

# The files load_sector_ranking() and the anchor consumers need when the MRI checkout is absent.
SNAPSHOT_FILES = (
    "current_sector_ranking.json",
    "current_regime.json",
    "cost_of_capital_anchor.json",
    "long_run_growth_anchor.json",
    "sector_multiple_bands.json",
)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sync_mri_snapshot() -> Optional[Dict[str, Any]]:
    """Copy MRI's outputs into public/data/mri/ when the MRI checkout is present.

    Returns the manifest dict written, or None when peer_paths.mri_outputs_dir() does not
    resolve (no MRI checkout on this machine) — the existing snapshot, if any, is left
    untouched, since a machine without the MRI has nothing better to copy from.
    """
    outputs_dir = peer_paths.mri_outputs_dir()
    if outputs_dir is None or not outputs_dir.exists():
        return None

    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    files: Dict[str, Any] = {}
    for name in SNAPSHOT_FILES:
        src = outputs_dir / name
        if not src.exists():
            continue
        dst = SNAPSHOT_DIR / name
        shutil.copyfile(src, dst)
        try:
            mri_date = json.loads(src.read_text(encoding="utf-8")).get("date")
        except Exception:
            mri_date = None
        files[name] = {"mri_date": mri_date, "sha256": _sha256(dst)}

    manifest = {
        "copied_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source_dir": str(outputs_dir),
        "files": files,
    }
    MANIFEST_JSON.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


if __name__ == "__main__":
    result = sync_mri_snapshot()
    if result is None:
        print("mri_sync: MRI outputs directory not found — snapshot left untouched.")
    else:
        print(f"mri_sync: copied {len(result['files'])} files from {result['source_dir']}")
        print(json.dumps(result, indent=2))

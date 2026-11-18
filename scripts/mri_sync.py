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
import os
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Tuple

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
    # MRI-12 shock register and the MRI-15 event register's run record (D5, operator 2026-10-22). Optional: a missing
    # file is skipped. The event register itself is not copied (it grows daily); build_macro_events.py writes the small
    # per-stock index from it instead.
    "shock_register.json",
    "event_register_run.json",
    # The MRI's shadow risk dial. Its month_decision block drives the screener's one paper-only book, equal_dial
    # (operator 2026-11-13). The document's date key is `asof`.
    "risk_state.json",
    # The /macro page (WO_MP1, operator 2026-11-18: the MRI site's panels move to the stockpeak macro page). These four are
    # written by the local daily run, so they are fresh. Optional: a missing file is skipped. macro_features_timeline.json
    # is the largest (about 0.8 MB, it ships to the browser); the page needs it for the indicator lines.
    "daily_diagnostic_summary.json",
    "regime_timeline.json",
    "macro_features_timeline.json",
    "sector_validation.json",
)

# The cloud-only files (WO_MP2). The MRI's cloud job (GitHub Actions) writes these and publishes them to the `data/` folder
# of the repository's `gh-pages` branch; the local daily run does not produce them, so they are fetched over HTTPS from there
# (peer_paths.mri_cloud_data_url()). Each entry is: name in public/data/mri/ -> (name on the data branch, the path inside the
# file to its own date). Two cloud files share a name with something else and are stored under a "cloud_" name so neither can
# replace the other: the daily summary (the local run writes one with the same name and keeps priority) and the export manifest
# (public/data/mri/manifest.json is this script's own manifest). news_source_coverage_report.json is not listed: the cloud job
# does not write it (its export manifest names it as optional-missing and the branch has no such file).
CLOUD_FILES: Dict[str, Tuple[str, Tuple[str, ...]]] = {
    "data_health.json": ("data_health.json", ("generated_at",)),
    "history_index.json": ("history_index.json", ("generated_at",)),
    "nber_benchmark.json": ("nber_benchmark.json", ("generated_at",)),
    "news_score_report.json": ("news_score_report.json", ("latest_news_scoring_date",)),
    "news_monitoring_report.json": ("news_monitoring_report.json", ("overlay_monitoring", "diagnostic_date")),
    "news_accumulation_report.json": ("news_accumulation_report.json", ("latest_run", "run_date")),
    "combined_sector_diagnostic.json": ("combined_sector_diagnostic.json", ("diagnostic_date",)),
    "news_sources.json": ("news_sources.json", ("generated_at",)),
    "cloud_daily_diagnostic_summary.json": ("daily_diagnostic_summary.json", ("run_date",)),
    "cloud_export_manifest.json": ("manifest.json", ("generated_at",)),
}

# A cloud file larger than this is refused: everything here ships to the browser, and the largest real one is about 0.1 MB.
MAX_CLOUD_BYTES = 2_000_000
CLOUD_TIMEOUT_SECONDS = 20
# The only thing sent with a request besides the address: a generic client name.
CLOUD_CLIENT_NAME = "mri-sync"


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
        # One original read owns the snapshot bytes, metadata and source digest.
        raw = src.read_bytes()
        source_sha256 = hashlib.sha256(raw).hexdigest()
        dst = SNAPSHOT_DIR / name
        dst.write_bytes(raw)
        if _sha256(dst) != source_sha256:
            raise OSError(f"MRI snapshot byte mismatch after copy: {name}")
        try:
            doc = json.loads(raw.decode("utf-8"))
            # the shock register says `asof`, the event register's run record `as_of_date`; the others `date`
            mri_date = doc.get("date") or doc.get("asof") or doc.get("as_of_date")
            # the daily summary says `run_date`, the two timelines `end_date`, the sector validation `score_end_date`
            mri_date = mri_date or doc.get("run_date") or doc.get("end_date") or doc.get("score_end_date")
        except Exception:
            mri_date = None
        files[name] = {"mri_date": mri_date, "sha256": source_sha256}

    manifest = {
        "copied_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source_dir": Path(outputs_dir).name,   # the folder's name only: this file is published, and the full path names a user account
        "files": files,
    }
    # The cloud files are fetched by a separate step (sync_cloud_files); keep what it recorded.
    manifest.update({k: v for k, v in _read_manifest().items() if k.startswith("cloud_")})
    MANIFEST_JSON.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def _read_manifest() -> Dict[str, Any]:
    """The snapshot manifest as written last time, or {} when it is absent or unreadable."""
    try:
        doc = json.loads(MANIFEST_JSON.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return doc if isinstance(doc, dict) else {}


def _http_get(url: str) -> bytes:
    """One HTTPS GET with a generic client name and nothing else. Raises on any failure."""
    if not url.startswith("https://"):
        raise ValueError(f"refusing a non-HTTPS address: {url}")
    request = urllib.request.Request(url, headers={"User-Agent": CLOUD_CLIENT_NAME})
    with urllib.request.urlopen(request, timeout=CLOUD_TIMEOUT_SECONDS) as response:
        return response.read(MAX_CLOUD_BYTES + 1)


def _own_date(doc: Dict[str, Any], path: Tuple[str, ...]) -> Optional[str]:
    """The file's own date (YYYY-MM-DD) at `path`, or None when it is not there or does not read as a date."""
    value: Any = doc
    for key in path:
        value = value.get(key) if isinstance(value, dict) else None
    text = str(value)[:10] if value else ""
    try:
        datetime.strptime(text, "%Y-%m-%d")
    except ValueError:
        return None
    return text


def sync_cloud_files(
    fetch: Optional[Callable[[str], bytes]] = None, base_url: Optional[str] = None
) -> Dict[str, Any]:
    """Fetch the cloud-only files into public/data/mri/ and record each one's own date in the manifest.

    `fetch` takes a URL and returns bytes (injected by the tests, so they make no network call). A file that cannot be
    fetched, is too large, is not JSON or is not a JSON object is skipped and named in the result with the reason; it is never
    invented and never stops the others. A skipped file that was fetched on an earlier run stays on disk with its older
    date, so the page can say how old it is. A name that the local sync owns is never fetched, so a cloud copy cannot replace
    a local file. Returns {"fetched": {name: entry}, "skipped": {name: reason}}.
    """
    fetch = fetch or _http_get
    base = (base_url or peer_paths.mri_cloud_data_url()).rstrip("/")
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = _read_manifest()
    owned_locally = set(SNAPSHOT_FILES) | set(manifest.get("files") or {})
    earlier = manifest.get("cloud_files") if isinstance(manifest.get("cloud_files"), dict) else {}
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    fetched: Dict[str, Any] = {}
    skipped: Dict[str, str] = {}
    kept: Dict[str, Any] = {}
    for name, (remote, date_path) in CLOUD_FILES.items():
        try:
            if name in owned_locally:
                raise ValueError("the local sync owns this name")
            raw = fetch(f"{base}/{remote}")
            if len(raw) > MAX_CLOUD_BYTES:
                raise ValueError(f"larger than {MAX_CLOUD_BYTES} bytes")
            doc = json.loads(raw.decode("utf-8"))
            if not isinstance(doc, dict):
                raise ValueError("not a JSON object")
        except Exception as exc:  # noqa: BLE001 - any failure skips this one file, by design
            skipped[name] = f"{type(exc).__name__}: {exc}"
            if name in earlier and (SNAPSHOT_DIR / name).exists():
                kept[name] = earlier[name]
            continue
        # Written whole under a temporary name, then renamed, so a reader never sees half a file.
        temporary = SNAPSHOT_DIR / (name + ".part")
        temporary.write_bytes(raw)
        os.replace(temporary, SNAPSHOT_DIR / name)
        fetched[name] = {
            "date": _own_date(doc, date_path),
            "sha256": hashlib.sha256(raw).hexdigest(),
            "bytes": len(raw),
            "fetched_at": now,
        }

    manifest["cloud_source"] = base
    manifest["cloud_fetched_at"] = now
    manifest["cloud_files"] = {**kept, **fetched}
    MANIFEST_JSON.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return {"fetched": fetched, "skipped": skipped}


if __name__ == "__main__":
    result = sync_mri_snapshot()
    if result is None:
        print("mri_sync: MRI outputs directory not found — snapshot left untouched.")
    else:
        print(f"mri_sync: copied {len(result['files'])} files from {result['source_dir']}")
        print(json.dumps(result, indent=2))
    cloud = sync_cloud_files()
    print(f"mri_sync: cloud files fetched {len(cloud['fetched'])}, skipped {len(cloud['skipped'])}")
    for cloud_name, entry in cloud["fetched"].items():
        flag = "  OVER 1 MB" if entry["bytes"] > 1_000_000 else ""
        print(f"  fetched {cloud_name}  {entry['bytes']} bytes  date {entry['date']}{flag}")
    for cloud_name, reason in cloud["skipped"].items():
        print(f"  skipped {cloud_name}  {reason}")

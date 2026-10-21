"""build_macro_events.py — the per-stock index of MRI news candidates (MRI-15, Stage 1 display).

MRI's event register (event_register.json, beside MRI's other outputs) lists news candidates with what the market did
after them and the sectors the classifier tied them to. This script, run where the MRI outputs resolve (the operator's PC,
the self-hosted runner), expands that register to stocks with the screener's own taxonomy and writes a small file the
stock page reads: public/data/mri/macro_events.json.

Tiers: `named` (the candidate names the company), `peer` (same cluster as a named company, industry_taxonomy), `sector`
(the classifier tied the news to the stock's sector; looked up by the stocks.json sector string, so the sector tier is
stored once per sector, not per stock). Nothing here changes a score, rank or verdict (MRI D1): it is a display index.

The register is not committed to this repository (it grows daily); only the index is. A missing register leaves the old
index in place and exits 0: a missing register must not fail the screener run.
"""

import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

sys.path.append(str(Path(__file__).resolve().parent))
import peer_paths  # noqa: E402
from industry_taxonomy import get_taxonomy_profile  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
STOCKS_JSON = ROOT / "public" / "data" / "stocks.json"
OUT_JSON = ROOT / "public" / "data" / "mri" / "macro_events.json"
SCHEMA_VERSION = 1
KNOWN_REGISTER_SCHEMAS = {1}
MAX_PER_STOCK = 8    # newest first, per ticker / cluster / sector; the page shows what it has room for

# The screener's Yahoo-sector -> MRI sector_id map, restated so this script does not import the scorer.
# Kept equal to score_factors_dual_door.GICS_TO_MACRO_ID by test_build_macro_events.py.
GICS_TO_MACRO_ID = {
    "Basic Materials": "materials",
    "Communication Services": "communication_services",
    "Consumer Cyclical": "consumer_discretionary",
    "Consumer Defensive": "consumer_staples",
    "Energy": "energy",
    "Financial Services": "financials",
    "Healthcare": "health_care",
    "Industrials": "industrials",
    "Real Estate": "real_estate",
    "Technology": "information_technology",
    "Utilities": "utilities",
}


def _summary(c: Dict[str, Any]) -> Dict[str, Any]:
    """What the page shows for one candidate. Field meanings: MRI docs/events_build/STAGE1_HANDOFF.md."""
    mr = c.get("market_response") or {}
    return {
        "title": c.get("title"),
        "onset": c.get("onset"),
        "first_available_at": c.get("first_available_at"),
        "status": (c.get("status_window") or {}).get("status"),
        "publisher_count": c.get("publisher_count"),
        "corroboration": (c.get("corroboration") or {}).get("category"),
        "classified": (c.get("classification_status") or {}).get("classified_reports", 0) > 0,
        "themes": [{"theme_id": t.get("theme_id"), "direction": t.get("direction")} for t in c.get("themes") or []],
        "market": [{"theme_id": m.get("theme_id"), "result": m.get("result"), "reason": m.get("reason"),
                    "provisional": bool(m.get("provisional", False))} for m in mr.get("checks") or []],
        "company": [{"ticker": k.get("ticker"), "benchmark": k.get("benchmark"), "result": k.get("result"),
                     "z": k.get("z"), "reason": k.get("reason")} for k in mr.get("company_checks") or []],
        "sectors": sorted({e.get("sector_id") for e in c.get("sector_exposure") or [] if e.get("sector_id")}),
        "flags": [f for f in c.get("flags") or [] if f in ("single_source", "unclassified_reports", "syndication_only")],
    }


def build_index(register: Dict[str, Any], stocks: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Candidates are stored once, in `candidates` (a list); every other field refers to them by list position.
    `named`: ticker -> candidates naming it. `peer`: cluster -> candidates naming a company in that cluster, with
    `cluster_of` for the tickers whose cluster has any. `sector`: stocks.json sector string -> candidates."""
    if register.get("schema_version") not in KNOWN_REGISTER_SCHEMAS:
        raise ValueError(f"event_register schema_version {register.get('schema_version')!r} is not known here")
    cluster_of_all: Dict[str, str] = {}
    for s in stocks:
        sym = str(s.get("symbol") or "").upper()
        if not sym:
            continue
        cluster = get_taxonomy_profile(s.get("industry"), s.get("sector")).get("cluster")
        if cluster and cluster != "general_unclassified":
            cluster_of_all[sym] = cluster
    yahoo_of = {v: k for k, v in GICS_TO_MACRO_ID.items()}

    named: Dict[str, List[str]] = {}
    peer: Dict[str, List[str]] = {}
    sector: Dict[str, List[str]] = {}
    summaries: Dict[str, Dict[str, Any]] = {}

    def push(table: Dict[str, List[str]], key: str, cid: str) -> None:
        lst = table.setdefault(key, [])
        if cid not in lst and len(lst) < MAX_PER_STOCK:
            lst.append(cid)

    newest_first = sorted(register.get("candidates") or [], key=lambda c: c.get("onset") or "", reverse=True)
    for c in newest_first:
        cid = c["candidate_id"]
        tickers = sorted({t.upper() for e in c.get("entities_resolved") or [] for t in (e.get("tickers") or [])[:1]})
        sectors = sorted({e.get("sector_id") for e in c.get("sector_exposure") or [] if e.get("sector_id")})
        if not tickers and not sectors:
            continue
        summaries[cid] = {**_summary(c), "candidate_id": cid, "named_tickers": tickers}
        for t in tickers:
            push(named, t, cid)
            if t in cluster_of_all:
                push(peer, cluster_of_all[t], cid)
        for sid in sectors:
            if sid in yahoo_of:
                push(sector, yahoo_of[sid], cid)

    used = sorted({cid for table in (named, peer, sector) for lst in table.values() for cid in lst},
                  key=lambda cid: (summaries[cid].get("onset") or "", cid), reverse=True)
    pos = {cid: i for i, cid in enumerate(used)}
    ref = lambda table: {k: [pos[c] for c in v] for k, v in sorted(table.items())}  # noqa: E731
    return {
        "schema_version": SCHEMA_VERSION,
        "source": "MRI event_register.json (MRI-15)",
        "register_as_of_date": register.get("as_of_date"),
        "register_schema_version": register.get("schema_version"),
        "notice": register.get("notice"),
        "market_meaning": (register.get("market_response_method") or {}).get("meaning"),
        "candidates": [summaries[cid] for cid in used],
        "named": ref(named),
        "peer": ref(peer),
        "cluster_of": {t: c for t, c in sorted(cluster_of_all.items()) if c in peer},
        "sector": ref(sector),
    }


def build_macro_events(outputs_dir: Optional[Path] = None, stocks_path: Path = STOCKS_JSON,
                       out_path: Path = OUT_JSON) -> Optional[Dict[str, Any]]:
    outputs_dir = outputs_dir or peer_paths.mri_outputs_dir()
    if outputs_dir is None or not (Path(outputs_dir) / "event_register.json").exists():
        print("build_macro_events: no event_register.json where the MRI outputs resolve; index left as it was")
        return None
    register = json.loads((Path(outputs_dir) / "event_register.json").read_text(encoding="utf-8"))
    run = Path(outputs_dir) / "event_register_run.json"
    stocks = json.loads(Path(stocks_path).read_text(encoding="utf-8"))
    index = build_index(register, stocks)
    index["register_run_status"] = json.loads(run.read_text(encoding="utf-8")).get("status") if run.exists() else None
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = out_path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(index, separators=(",", ":"), sort_keys=True), encoding="utf-8")
    tmp.replace(out_path)
    print(f"build_macro_events: {len(index['candidates'])} candidates, {len(index['named'])} named tickers, "
          f"{len(index['peer'])} clusters, {len(index['sector'])} sectors -> {out_path}")
    return index


if __name__ == "__main__":
    build_macro_events()

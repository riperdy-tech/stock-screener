"""
fetch_macro_state.py - WS1-T9: Macro overlay state fetcher (FRED).

Pulls latest values for 5 key macro signals from FRED and writes
public/data/macro_state.json. Consumed read-only by score_paradigm.py
to add macro_* flags to pdm_flags. Flags-only per operator decision
(option C); no automatic signal multiplier.

Per brief: macro is overlay, NOT load-bearing on paradigm scoring.
Flags fire; operator interprets. Future hook for hard multiplier when
forward-logging proves macro signal is predictive.

Critical framing: separate pre-compute pipeline. NO network calls during
paradigm scoring. The brief's 'no network in scoring' rule remains intact.

Usage:
    # Dry-run (default): prints what would be fetched, makes zero API calls
    python scripts/fetch_macro_state.py

    # Apply mode (writes public/data/macro_state.json)
    python scripts/fetch_macro_state.py --apply
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Force UTF-8 stdout (cp949-safe on Windows)
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"
MACRO_STATE_JSON = DATA_DIR / "macro_state.json"
CONFIG_JSON = Path(__file__).resolve().with_name("paradigm_config.json")

# FRED series to pull. Series_id -> human-readable label + interpretation.
SERIES = {
    "DGS10": {
        "label": "10-Year Treasury Yield (%)",
        "interpretation": "Rate-sensitive risk; >5% historically precedes corrections (1987, 2000, 2007).",
    },
    "T10Y2Y": {
        "label": "10Y-2Y Yield Spread (%)",
        "interpretation": "Yield curve. Negative = inverted, classic recession leading indicator.",
    },
    "BAA10Y": {
        "label": "BAA Corp - 10Y Treasury Spread (%)",
        "interpretation": "Credit-stress signal at IG level.",
    },
    "NFCI": {
        "label": "National Financial Conditions Index",
        "interpretation": "Composite financial conditions. >0 = tighter than average.",
    },
    "BAMLH0A0HYM2": {
        "label": "ICE BofA High Yield OAS (%)",
        "interpretation": "HY credit spread. Widening = stress in junk credit.",
    },
}

FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"


def fetch_latest(series_id, api_key):
    """Return (value: float|None, date: str|None) for the latest non-null observation."""
    params = {
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
        "sort_order": "desc",
        "limit": 10,  # In case the most recent is "."
    }
    resp = requests.get(FRED_BASE, params=params, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    for obs in data.get("observations", []):
        v = obs.get("value", ".")
        if v not in (".", "", None):
            try:
                return float(v), obs.get("date")
            except (ValueError, TypeError):
                continue
    return None, None


def evaluate_flags(values, macro_config):
    """Apply config thresholds; return list of triggered macro flag names."""
    flags = []
    dgs10 = values.get("DGS10", {}).get("value")
    t10y2y = values.get("T10Y2Y", {}).get("value")
    baa10y = values.get("BAA10Y", {}).get("value")
    nfci = values.get("NFCI", {}).get("value")
    hy = values.get("BAMLH0A0HYM2", {}).get("value")

    if dgs10 is not None and dgs10 >= macro_config.get("dgs10_warning", 5.0):
        flags.append("macro_yield_warning")
    if t10y2y is not None and t10y2y < macro_config.get("t10y2y_inverted", 0.0):
        flags.append("macro_curve_inverted")
    if baa10y is not None and baa10y >= macro_config.get("baa10y_stress", 3.0):
        flags.append("macro_ig_credit_stress")
    if nfci is not None and nfci > macro_config.get("nfci_tight", 0.0):
        flags.append("macro_conditions_tight")
    if hy is not None and hy >= macro_config.get("hy_stress", 5.0):
        flags.append("macro_hy_credit_stress")

    return flags


def main():
    parser = argparse.ArgumentParser(description="Fetch latest FRED macro state.")
    parser.add_argument("--apply", action="store_true", help="Fetch and write (default: dry-run)")
    args = parser.parse_args()

    # Try workspace root .env first, then fall back to Macro repo .env
    # (key lives there from WS2-T1 backfill work).
    load_dotenv()
    api_key = os.getenv("FRED_API_KEY")
    if not api_key:
        macro_env = ROOT.parent / "Macro Regime Indicator" / ".env"
        if macro_env.exists():
            load_dotenv(macro_env, override=False)
            api_key = os.getenv("FRED_API_KEY")
    if not api_key:
        print("ERROR: FRED_API_KEY not set. Add to .env or environment.", file=sys.stderr)
        print("       Tried CWD .env and 'Macro Regime Indicator/.env'.", file=sys.stderr)
        sys.exit(1)

    # Load config for thresholds (gracefully handle absent block)
    macro_config = {}
    if CONFIG_JSON.exists():
        with CONFIG_JSON.open("r", encoding="utf-8") as f:
            cfg = json.load(f)
        macro_config = cfg.get("macro_overlay", {})

    print("=" * 60)
    print("  FETCH MACRO STATE - " + ("APPLY" if args.apply else "DRY-RUN"))
    print("=" * 60)
    print(f"  Series to fetch: {len(SERIES)}")
    for sid, meta in SERIES.items():
        print(f"    {sid:15s} {meta['label']}")
    print()

    if not args.apply:
        print("  DRY-RUN - no FRED calls made.")
        print("  Re-run with --apply to fetch and write public/data/macro_state.json.")
        print("=" * 60)
        return

    values = {}
    errors = []
    for sid, meta in SERIES.items():
        try:
            v, d = fetch_latest(sid, api_key)
            values[sid] = {
                "value": v,
                "as_of": d,
                "label": meta["label"],
                "interpretation": meta["interpretation"],
            }
            print(f"  {sid:15s} = {v} (as of {d})")
        except Exception as e:
            errors.append((sid, str(e)))
            values[sid] = {"value": None, "as_of": None, "label": meta["label"], "error": str(e)}
            print(f"  {sid:15s} ERROR: {e}", file=sys.stderr)
        time.sleep(0.2)

    flags = evaluate_flags(values, macro_config)
    print()
    print(f"  Triggered macro flags: {flags if flags else '(none)'}")

    payload = {
        "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "api.stlouisfed.org/fred/series/observations",
        "series": values,
        "triggered_flags": flags,
        "thresholds_used": {
            "dgs10_warning": macro_config.get("dgs10_warning", 5.0),
            "t10y2y_inverted": macro_config.get("t10y2y_inverted", 0.0),
            "baa10y_stress": macro_config.get("baa10y_stress", 3.0),
            "nfci_tight": macro_config.get("nfci_tight", 0.0),
            "hy_stress": macro_config.get("hy_stress", 5.0),
        },
    }

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with MACRO_STATE_JSON.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, sort_keys=True)
        f.write("\n")

    print(f"  Written: {MACRO_STATE_JSON}")
    if errors:
        print(f"  WARNING: {len(errors)} series failed: {[e[0] for e in errors]}", file=sys.stderr)
    print("=" * 60)


if __name__ == "__main__":
    main()

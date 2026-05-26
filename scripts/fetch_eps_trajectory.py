"""
fetch_eps_trajectory.py -- WS1-T8b: Forward EPS trajectory pre-compute (yfinance).

Pulls multi-quarter forward EPS estimates from yfinance per ticker and writes
`public/data/eps_trajectory.json`. This file is consumed read-only by
`score_paradigm.py`'s forward-EPS gate bridge.

Critical framing: This is a separate pre-compute pipeline. It does NOT make
network calls during scoring. The brief's "no network in scoring" rule remains intact.

Usage:
    # Dry-run (default): prints what would happen, makes zero API calls
    python scripts/fetch_eps_trajectory.py

    # Single-ticker dry-run
    python scripts/fetch_eps_trajectory.py --ticker NVDA

    # Apply mode with safety cap
    python scripts/fetch_eps_trajectory.py --apply --max-calls 5

    # Apply mode for one specific ticker
    python scripts/fetch_eps_trajectory.py --apply --ticker NVDA
"""

import argparse
import hashlib
import json
import math
import os
import sys

# Force UTF-8 on stdout so non-ASCII company names (accents, CJK) don't crash
# on Windows cp949 consoles. This is a Python 3.7+ idiom; safe no-op elsewhere.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass
import time
from datetime import datetime, timezone
from pathlib import Path

# ── yfinance import (fail fast if missing) ──────────────────────────────
try:
    import yfinance as yf
except ImportError:
    print("ERROR: yfinance is not installed. Run: pip install yfinance")
    sys.exit(1)

# ── Paths ────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"
STOCKS_JSON = DATA_DIR / "stocks.json"
EPS_TRAJECTORY_JSON = DATA_DIR / "eps_trajectory.json"

# ── Constants ────────────────────────────────────────────────────────────
DEFAULT_MAX_CALLS = 100
RATE_LIMIT_SECONDS = 0.5
ESTIMATED_COST_PER_CALL = 0.0  # yfinance is free; kept for template consistency


def load_json(path):
    """Load a JSON file, returning None if missing."""
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path, payload):
    """Write a JSON file with sorted keys for deterministic output."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, sort_keys=True)
        f.write("\n")


def compute_input_hash(ticker, stock):
    """
    Compute sha256 of ticker + '|' + the existing forwardEpsEstimate value.
    This lets us skip re-fetching when the cached estimate hasn't changed.
    """
    fwd_eps = stock.get("metrics", {}).get("forwardEpsEstimate")
    raw = ticker + "|" + str(fwd_eps)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def safe_float(val):
    """Convert to float or return None if NaN/Inf/None."""
    if val is None:
        return None
    try:
        v = float(val)
        if math.isnan(v) or math.isinf(v):
            return None
        return v
    except (ValueError, TypeError):
        return None


def extract_eps_estimates(ticker_symbol):
    """
    Fetch forward EPS estimates via yfinance Ticker.earnings_estimate.

    Returns a dict with keys:
        next_q_eps, next_q_plus_1_eps, next_y_eps (float or None)
    or raises on failure.
    """
    ticker = yf.Ticker(ticker_symbol)
    ee = ticker.earnings_estimate

    # ee is a pandas DataFrame indexed by period labels like '0q', '+1q', '0y', '+1y'
    # with columns including 'avg' (consensus mean estimate)
    if ee is None or ee.empty:
        raise ValueError("earnings_estimate returned empty DataFrame")

    # Helper: extract 'avg' value for a given period index label
    def get_avg(period_label):
        try:
            if period_label in ee.index:
                val = ee.loc[period_label]
                if isinstance(val, dict):
                    return safe_float(val.get("avg"))
                # pandas Series
                if "avg" in ee.columns:
                    return safe_float(val["avg"])
                # fallback: first column
                return safe_float(val.iloc[0])
        except Exception:
            pass
        return None

    next_q_eps = get_avg("0q")
    next_q_plus_1_eps = get_avg("+1q")
    # Try '0y' first, fall back to '+1y'
    next_y_eps = get_avg("0y")
    if next_y_eps is None:
        next_y_eps = get_avg("+1y")

    return {
        "next_q_eps": next_q_eps,
        "next_q_plus_1_eps": next_q_plus_1_eps,
        "next_y_eps": next_y_eps,
    }


def compute_trajectory_slope(next_q_eps, next_q_plus_1_eps, next_y_eps):
    """
    Compute a normalized trajectory slope in [-1, 1].

    Logic:
    - If both next_q_eps and next_q_plus_1_eps present:
        slope = (next_q_plus_1_eps - next_q_eps) / max(abs(next_q_eps), 1.0)
    - If next_y_eps also present, average with that direction.
    - Clamp to [-1, 1]. Return None if no data.
    """
    slopes = []

    if next_q_eps is not None and next_q_plus_1_eps is not None:
        denom = max(abs(next_q_eps), 1.0)
        q_slope = (next_q_plus_1_eps - next_q_eps) / denom
        slopes.append(q_slope)

    if next_q_eps is not None and next_y_eps is not None:
        denom = max(abs(next_q_eps), 1.0)
        y_slope = (next_y_eps - next_q_eps) / denom
        slopes.append(y_slope)

    if not slopes:
        return None

    avg_slope = sum(slopes) / len(slopes)
    return max(-1.0, min(1.0, avg_slope))


def main():
    parser = argparse.ArgumentParser(
        description="Fetch forward EPS trajectory via yfinance (pre-compute pipeline)."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually fetch from yfinance and write output. Default is dry-run (no network calls).",
    )
    parser.add_argument(
        "--max-calls",
        type=int,
        default=DEFAULT_MAX_CALLS,
        help=f"Maximum number of yfinance calls (default: {DEFAULT_MAX_CALLS}).",
    )
    parser.add_argument(
        "--ticker",
        type=str,
        default=None,
        help="If set, only process this specific ticker (dry-run or apply).",
    )
    args = parser.parse_args()

    # ── Load stocks ──────────────────────────────────────────────────────
    stocks = load_json(STOCKS_JSON)
    if stocks is None:
        print(f"ERROR: {STOCKS_JSON} not found.")
        sys.exit(1)

    print(f"Loaded {len(stocks)} stocks from {STOCKS_JSON}")

    # ── Identify candidates (tickers with non-empty pdm_themes) ──────────
    candidates = []
    for stock in stocks:
        ticker = stock.get("symbol")
        if not ticker:
            continue
        if args.ticker and ticker != args.ticker:
            continue
        # Only process tickers that have been tagged with paradigm themes
        paradigm = stock.get("paradigm", {})
        pdm_themes = paradigm.get("pdm_themes", [])
        if not pdm_themes:
            continue
        candidates.append(stock)

    if args.ticker:
        print(f"Filtered to ticker: {args.ticker}")
    print(f"Candidates with non-empty pdm_themes: {len(candidates)}")

    if len(candidates) == 0:
        print("No candidates to process. Exiting.")
        return

    # ── Load existing trajectory data (caching) ──────────────────────────
    trajectory_data = {}
    if EPS_TRAJECTORY_JSON.exists():
        trajectory_data = load_json(EPS_TRAJECTORY_JSON) or {}
        print(
            f"Loaded {len(trajectory_data)} existing entries from {EPS_TRAJECTORY_JSON}"
        )

    # ── Initialize counters ──────────────────────────────────────────────
    cached_hits = 0
    fetched = 0
    succeeded = 0
    failed = 0
    errors = 0

    # ── Process candidates ───────────────────────────────────────────────
    for idx, stock in enumerate(candidates):
        ticker = stock.get("symbol")
        input_hash = compute_input_hash(ticker, stock)

        # Check cache
        cached_entry = trajectory_data.get(ticker)
        if cached_entry and cached_entry.get("input_hash") == input_hash:
            cached_hits += 1
            continue

        # Dry-run: just print what would happen
        if not args.apply:
            name = stock.get("name", "?")
            print(f"  WOULD fetch {ticker}: {name}")
            continue

        # Apply mode: call yfinance
        if fetched >= args.max_calls:
            print(f"Reached --max-calls limit ({args.max_calls}). Stopping early.")
            break

        try:
            estimates = extract_eps_estimates(ticker)
            fetched += 1

            next_q_eps = estimates["next_q_eps"]
            next_q_plus_1_eps = estimates["next_q_plus_1_eps"]
            next_y_eps = estimates["next_y_eps"]

            trajectory_slope = compute_trajectory_slope(
                next_q_eps, next_q_plus_1_eps, next_y_eps
            )

            # Build entry
            trajectory_data[ticker] = {
                "next_q_eps": next_q_eps,
                "next_q_plus_1_eps": next_q_plus_1_eps,
                "next_y_eps": next_y_eps,
                "trajectory_slope": trajectory_slope,
                "fetched_at": datetime.now(timezone.utc).strftime(
                    "%Y-%m-%dT%H:%M:%SZ"
                ),
                "source": "yfinance.Ticker.earnings_estimate",
                "input_hash": input_hash,
            }

            succeeded += 1

            # Print summary line
            parts = [
                f"[{idx + 1}/{len(candidates)}] {ticker}:",
            ]
            if next_q_eps is not None:
                parts.append(f"0q={next_q_eps:.4f}")
            else:
                parts.append("0q=null")
            if next_q_plus_1_eps is not None:
                parts.append("+1q=" + f"{next_q_plus_1_eps:.4f}")
            else:
                parts.append("+1q=null")
            if next_y_eps is not None:
                parts.append("0y=" + f"{next_y_eps:.4f}")
            else:
                parts.append("0y=null")
            if trajectory_slope is not None:
                parts.append("slope=" + f"{trajectory_slope:.4f}")
            else:
                parts.append("slope=null")
            print("  " + ", ".join(parts))

        except Exception as e:
            errors += 1
            failed += 1
            print(f"  [{idx + 1}/{len(candidates)}] {ticker}: ERROR - {e}")
            # Record a fallback entry so we don't re-query on next run
            trajectory_data[ticker] = {
                "next_q_eps": None,
                "next_q_plus_1_eps": None,
                "next_y_eps": None,
                "trajectory_slope": None,
                "fetched_at": datetime.now(timezone.utc).strftime(
                    "%Y-%m-%dT%H:%M:%SZ"
                ),
                "source": "yfinance.Ticker.earnings_estimate",
                "input_hash": input_hash,
            }

        # Rate limit
        time.sleep(RATE_LIMIT_SECONDS)

    # ── Write output (apply mode only) ───────────────────────────────────
    if args.apply:
        write_json(EPS_TRAJECTORY_JSON, trajectory_data)
        print(
            f"\nWritten {len(trajectory_data)} entries to {EPS_TRAJECTORY_JSON}"
        )

    # ── Summary ──────────────────────────────────────────────────────────
    total_processed = cached_hits + fetched
    estimated_cost = fetched * ESTIMATED_COST_PER_CALL

    print()
    print("=" * 60)
    print("  FETCH EPS TRAJECTORY - Summary")
    print("=" * 60)
    print(f"  Mode:                    {'APPLY' if args.apply else 'DRY-RUN'}")
    print(f"  Total candidates:        {len(candidates)}")
    print(f"  Cached hits (skipped):   {cached_hits}")
    print(f"  Fetched (yfinance):      {fetched}")
    print(f"  Succeeded:               {succeeded}")
    print(f"  Failed:                  {failed}")
    print(f"  Errors:                  {errors}")
    print(f"  Estimated cost:          ${estimated_cost:.4f}")
    if not args.apply:
        print()
        print("  NOTE: This was a dry-run. No yfinance calls were made.")
        print(
            "  Re-run with --apply to actually fetch and write output."
        )
    print("=" * 60)


if __name__ == "__main__":
    main()

"""
build_price_history.py — Extract monthlyCloses from stocks.json into a
dedicated deterministic snapshot file for the momentum scorer (WS1-T3a).

Pure extraction. No network. No API calls. No mutations to stocks.json.

Output:
  public/data/price_history.json        — ticker -> monthly closes (sorted keys)
  public/data/price_history_missing.txt — tickers lacking monthlyCloses (sorted)

Usage:
  python scripts/build_price_history.py
"""

import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# ── Paths ────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"
STOCKS_JSON = DATA_DIR / "stocks.json"
PRICE_HISTORY_JSON = DATA_DIR / "price_history.json"
MISSING_TXT = DATA_DIR / "price_history_missing.txt"


def load_json(path):
    """Load a JSON file, failing fast if missing or malformed."""
    if not path.exists():
        print(f"ERROR: File not found: {path}")
        sys.exit(1)
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        print(f"ERROR: Malformed JSON in {path}: {e}")
        sys.exit(1)


def write_json(path, payload):
    """Write a JSON file with sorted keys for determinism."""
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, sort_keys=True)
        f.write("\n")


def write_text(path, lines):
    """Write a text file, one line per entry."""
    with path.open("w", encoding="utf-8") as f:
        for line in lines:
            f.write(line + "\n")


def get_snapshot_date(path):
    """
    Use the most-recent file-modification time of stocks.json as the
    snapshot timestamp, converted to UTC date (YYYY-MM-DD).
    """
    mtime = os.path.getmtime(path)
    dt = datetime.fromtimestamp(mtime, tz=timezone.utc)
    return dt.strftime("%Y-%m-%d")


def validate_monthly_closes(arr):
    """
    Validate that arr is a list of real numbers, length >= 1, no NaN/None.
    Drop trailing NaNs (None, NaN, inf) from the edges if present.
    Returns the cleaned list, or None if the array is unusable.
    """
    if not isinstance(arr, list) or len(arr) == 0:
        return None

    # Drop trailing None/NaN from the end (newest side) first
    cleaned = list(arr)
    while cleaned and (cleaned[-1] is None or (isinstance(cleaned[-1], float) and (math.isnan(cleaned[-1]) or math.isinf(cleaned[-1])))):
        cleaned.pop()

    # Drop leading None/NaN from the start (oldest side)
    while cleaned and (cleaned[0] is None or (isinstance(cleaned[0], float) and (math.isnan(cleaned[0]) or math.isinf(cleaned[0])))):
        cleaned.pop(0)

    if len(cleaned) == 0:
        return None

    # Verify all remaining entries are real numbers
    for val in cleaned:
        if val is None:
            return None
        if isinstance(val, (int, float)):
            if math.isnan(val) or math.isinf(val):
                return None
        else:
            return None

    return cleaned


def main():
    # ── Load stocks ──────────────────────────────────────────────────────
    print("Loading stocks.json ...")
    stocks = load_json(STOCKS_JSON)
    total_stocks = len(stocks)
    print(f"  Stocks loaded: {total_stocks}")

    # ── Extract monthlyCloses ────────────────────────────────────────────
    prices = {}       # ticker -> cleaned monthly closes list
    missing = []      # tickers without usable monthlyCloses

    for stock in stocks:
        ticker = stock.get("symbol")
        if not ticker:
            continue

        metrics = stock.get("metrics")
        if metrics is None:
            missing.append(ticker)
            continue

        monthly_closes = metrics.get("monthlyCloses")
        if monthly_closes is None:
            missing.append(ticker)
            continue

        cleaned = validate_monthly_closes(monthly_closes)
        if cleaned is None:
            missing.append(ticker)
            continue

        prices[ticker] = cleaned

    # ── Sort keys for determinism ────────────────────────────────────────
    prices = dict(sorted(prices.items()))
    missing.sort()

    ticker_count = len(prices)
    missing_count = len(missing)

    # ── Compute snapshot_date from file mtime ────────────────────────────
    snapshot_date = get_snapshot_date(STOCKS_JSON)
    fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # ── Build payload ────────────────────────────────────────────────────
    payload = {
        "snapshot_date": snapshot_date,
        "fetched_at": fetched_at,
        "source": "stocks.json metrics.monthlyCloses (24 monthly closes per ticker)",
        "ticker_count": ticker_count,
        "missing_count": missing_count,
        "prices": prices,
    }

    # ── Write price_history.json ─────────────────────────────────────────
    write_json(PRICE_HISTORY_JSON, payload)
    json_size = PRICE_HISTORY_JSON.stat().st_size

    # ── Write price_history_missing.txt ──────────────────────────────────
    write_text(MISSING_TXT, missing)

    # ── Summary ──────────────────────────────────────────────────────────
    first_ticker = next(iter(prices.keys())) if prices else "N/A"
    last_ticker = next(reversed(list(prices.keys()))) if prices else "N/A"

    print()
    print("=" * 60)
    print("  PRICE HISTORY EXTRACTION - Complete")
    print("=" * 60)
    print(f"  Stocks loaded:              {total_stocks}")
    print(f"  Tickers with price history: {ticker_count}")
    print(f"  Tickers without:            {missing_count}")
    print(f"  Snapshot date:              {snapshot_date}")
    print(f"  Fetched at:                 {fetched_at}")
    print(f"  Output file size:           {json_size:,} bytes")
    print(f"  First ticker:               {first_ticker}")
    print(f"  Last ticker:                {last_ticker}")
    print(f"  Written: {PRICE_HISTORY_JSON}")
    print(f"  Written: {MISSING_TXT}")
    print("=" * 60)


if __name__ == "__main__":
    main()

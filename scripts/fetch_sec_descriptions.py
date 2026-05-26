"""
fetch_sec_descriptions.py -- WS1-T2d: SEC business-description fetcher.

Pulls SIC code + business description (submission metadata) from SEC EDGAR
for each CIK already present in public/data/sec_facts/. Outputs to
public/data/sec_descriptions.json.

This is a PRE-COMPUTE pipeline (like WS1-T2e). Workers cannot run it;
operator runs after review.

Usage:
    # Dry-run (default) -- enumerates CIKs, prints what would be fetched
    python scripts/fetch_sec_descriptions.py

    # Apply mode with safety cap
    python scripts/fetch_sec_descriptions.py --apply --max-calls 5

    # Single CIK
    python scripts/fetch_sec_descriptions.py --apply --cik 0000320193

    # Limit to first N CIKs from sec_facts/
    python scripts/fetch_sec_descriptions.py --apply --limit 10

SEC EDGAR endpoint used:
    https://data.sec.gov/submissions/CIK{cik10}.json
    Returns metadata: SIC code, SIC description, name, exchanges, tickers.
"""

import os
import sys
import json
import time
import argparse
import logging
from datetime import datetime, timezone

import requests

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
log = logging.getLogger("fetch_sec_descriptions")

# ---------------------------------------------------------------------------
# SEC EDGAR request configuration
# Mirrors fetch_sec_data.py exactly -- SEC rejects requests without a proper
# contact-info User-Agent header.
# ---------------------------------------------------------------------------
SEC_HEADERS = {
    "User-Agent": "StockScreener/1.0 (contact@example.com)"
}

SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik10}.json"

# Rate limit: 0.15s between requests (~6.7 req/sec, well under SEC's ~10 req/sec limit)
REQUEST_DELAY = 0.15

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SEC_FACTS_DIR = "public/data/sec_facts"
OUTPUT_PATH = "public/data/sec_descriptions.json"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def enumerate_ciks_from_sec_facts(sec_facts_dir):
    """Yield (cik_raw, cik10) tuples from CIK*.json filenames in sec_facts_dir.

    Skips files that don't match the CIK<10-digit>.json pattern.
    """
    if not os.path.isdir(sec_facts_dir):
        log.warning("Directory does not exist: %s", sec_facts_dir)
        return

    for fname in sorted(os.listdir(sec_facts_dir)):
        if not fname.startswith("CIK") or not fname.endswith(".json"):
            continue
        # Extract the CIK part: "CIK0000320193.json" -> "0000320193"
        cik_raw = fname[3:-5]  # strip "CIK" prefix and ".json" suffix
        # Validate: must be exactly 10 digits
        if len(cik_raw) != 10 or not cik_raw.isdigit():
            log.warning("Skipping malformed filename (not 10-digit CIK): %s", fname)
            continue
        yield cik_raw, cik_raw


def load_existing_output(path):
    """Load existing sec_descriptions.json if present, else return empty dict."""
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            log.info("Loaded existing output with %d entries from %s", len(data), path)
            return data
        except (json.JSONDecodeError, OSError) as e:
            log.warning("Could not load existing output (%s); starting fresh.", e)
    return {}


def fetch_submission(cik10):
    """Fetch SEC submission metadata for a 10-digit CIK.

    Returns the parsed JSON response on success, None on failure.
    """
    url = SEC_SUBMISSIONS_URL.format(cik10=cik10)
    try:
        resp = requests.get(url, headers=SEC_HEADERS, timeout=30)
        if resp.status_code == 404:
            log.warning("CIK %s: 404 Not Found (no SEC submissions data)", cik10)
            return None
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.Timeout:
        log.warning("CIK %s: request timed out", cik10)
        return None
    except requests.exceptions.RequestException as e:
        log.warning("CIK %s: request failed: %s", cik10, e)
        return None


def extract_fields(cik10, data):
    """Extract relevant fields from SEC submissions JSON.

    Returns a dict matching the output schema.
    """
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # SIC code -- can be int or string in the JSON; normalize to string
    sic_raw = data.get("sic")
    sic_str = str(sic_raw) if sic_raw is not None else None

    # Tickers array
    tickers = data.get("tickers", [])

    # Exchanges array
    exchanges = data.get("exchanges", [])

    return {
        "cik": cik10,
        "name": data.get("name"),
        "tickers": tickers,
        "sic": sic_str,
        "sic_description": data.get("sicDescription"),
        "exchanges": exchanges,
        "fetched_at": now_iso,
        "source": "sec.gov/submissions",
    }


def validate_entry(entry):
    """Basic schema validation for a single output entry."""
    required_keys = {"cik", "name", "tickers", "sic", "sic_description",
                     "exchanges", "fetched_at", "source"}
    if not all(k in entry for k in required_keys):
        return False
    if not isinstance(entry.get("tickers"), list):
        return False
    if not isinstance(entry.get("exchanges"), list):
        return False
    return True


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Fetch SIC codes and business descriptions from SEC EDGAR "
                    "for CIKs in sec_facts/."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="If set, actually makes network calls and writes output. "
             "Default is dry-run (no network, no file write).",
    )
    parser.add_argument(
        "--max-calls",
        type=int,
        default=100,
        help="Maximum number of SEC API calls to make (safety cap). Default: 100.",
    )
    parser.add_argument(
        "--cik",
        type=str,
        default=None,
        help="Process a single CIK (with or without leading zeros).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Process at most N CIKs from sec_facts/ (useful for testing).",
    )
    args = parser.parse_args()

    # -----------------------------------------------------------------------
    # Step 1: Enumerate CIKs from sec_facts/
    # -----------------------------------------------------------------------
    all_ciks = list(enumerate_ciks_from_sec_facts(SEC_FACTS_DIR))
    if not all_ciks:
        log.warning("No CIK files found in %s. Nothing to do.", SEC_FACTS_DIR)
        sys.exit(0)

    log.info("Found %d CIK files in %s", len(all_ciks), SEC_FACTS_DIR)

    # If --cik specified, filter to just that one
    if args.cik:
        target = args.cik.zfill(10)  # normalize to 10 digits
        filtered = [(raw, c10) for raw, c10 in all_ciks if c10 == target]
        if not filtered:
            log.warning("CIK %s not found in sec_facts/ directory.", args.cik)
            sys.exit(1)
        all_ciks = filtered
        log.info("Filtered to single CIK: %s", target)

    # Apply --limit
    if args.limit is not None and args.limit > 0:
        all_ciks = all_ciks[:args.limit]
        log.info("Limited to first %d CIKs", args.limit)

    total_ciks = len(all_ciks)
    log.info("Total CIKs to process: %d", total_ciks)

    # -----------------------------------------------------------------------
    # Step 2: Load existing cache
    # -----------------------------------------------------------------------
    existing = load_existing_output(OUTPUT_PATH)
    cached_count = 0
    for raw, cik10 in all_ciks:
        if cik10 in existing:
            cached_count += 1

    log.info("Cached entries (will skip): %d", cached_count)

    # -----------------------------------------------------------------------
    # Step 3: Dry-run mode -- just report
    # -----------------------------------------------------------------------
    if not args.apply:
        to_fetch = total_ciks - cached_count
        print("=== SEC Descriptions Fetcher (DRY-RUN) ===")
        print("  CIKs in sec_facts/:       %d" % total_ciks)
        print("  Already cached:           %d" % cached_count)
        print("  Would fetch (new):        %d" % to_fetch)
        print("  Max calls (--max-calls):  %d" % args.max_calls)
        if args.cik:
            print("  Single CIK filter:       %s" % args.cik)
        if args.limit:
            print("  Limit:                   %d" % args.limit)
        print()
        print("  Dry-run: no network calls made, no files written.")
        print("  Pass --apply to execute.")
        return

    # -----------------------------------------------------------------------
    # Step 4: Apply mode -- fetch and write
    # -----------------------------------------------------------------------
    output = dict(existing)  # start with cached entries
    fetched_count = 0
    succeeded_count = 0
    failed_count = 0
    skipped_count = 0
    calls_made = 0

    print("=== SEC Descriptions Fetcher (APPLY) ===")
    print("  Total CIKs: %d, Cached: %d, Max calls: %d" % (total_ciks, cached_count, args.max_calls))
    print()

    for raw, cik10 in all_ciks:
        # Skip if already cached
        if cik10 in existing:
            skipped_count += 1
            continue

        # Safety cap
        if calls_made >= args.max_calls:
            log.info("Reached --max-calls limit (%d). Stopping.", args.max_calls)
            break

        # Fetch
        log.info("Fetching CIK %s (%d/%d)...", cik10, calls_made + 1, min(args.max_calls, total_ciks))
        data = fetch_submission(cik10)
        calls_made += 1

        if data is None:
            failed_count += 1
            # Still store a placeholder so we don't re-fetch on next run
            output[cik10] = {
                "cik": cik10,
                "name": None,
                "tickers": [],
                "sic": None,
                "sic_description": None,
                "exchanges": [],
                "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "source": "sec.gov/submissions",
                "error": "fetch_failed",
            }
            continue

        entry = extract_fields(cik10, data)

        if not validate_entry(entry):
            log.warning("CIK %s: extracted entry failed schema validation", cik10)
            entry["error"] = "schema_validation_failed"
            failed_count += 1
        else:
            succeeded_count += 1

        output[cik10] = entry
        fetched_count += 1

        # Rate limit
        if calls_made < min(args.max_calls, total_ciks):
            time.sleep(REQUEST_DELAY)

    # -----------------------------------------------------------------------
    # Step 5: Write output
    # -----------------------------------------------------------------------
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    log.info("Wrote %d entries to %s", len(output), OUTPUT_PATH)

    # -----------------------------------------------------------------------
    # Step 6: Summary
    # -----------------------------------------------------------------------
    print()
    print("=== Summary ===")
    print("  Total CIKs in sec_facts/:  %d" % total_ciks)
    print("  Cached (skipped):          %d" % skipped_count)
    print("  Fetched (new):             %d" % fetched_count)
    print("  Succeeded:                 %d" % succeeded_count)
    print("  Failed:                    %d" % failed_count)
    print("  Total in output file:      %d" % len(output))
    print("  Output:                    %s" % OUTPUT_PATH)


if __name__ == "__main__":
    main()

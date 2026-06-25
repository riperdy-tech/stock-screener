"""
enrich_missing_sectors.py — WS1-T2e: DeepSeek sector/industry enrichment (pre-compute).

Classifies stocks with missing/Unknown sector or industry into the existing canonical
taxonomy via DeepSeek API. Output is a separate file `public/data/sectors_enriched.json`
that `score_paradigm.py` optionally consumes.

Critical framing: This is a separate pre-compute pipeline. It does NOT make network calls
during scoring. The brief's "no network in scoring" rule remains intact.

Usage:
    # Dry-run (default): prints what would happen, makes zero API calls
    python scripts/enrich_missing_sectors.py

    # Single-ticker dry-run
    python scripts/enrich_missing_sectors.py --ticker XYZ

    # Apply mode with safety cap
    python scripts/enrich_missing_sectors.py --apply --max-calls 5

    # Apply mode for one specific ticker
    python scripts/enrich_missing_sectors.py --apply --ticker XYZ
"""

import argparse
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

# ── Paths ────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"
STOCKS_JSON = DATA_DIR / "stocks.json"
SECTORS_ENRICHED_JSON = DATA_DIR / "sectors_enriched.json"

# ── Constants ────────────────────────────────────────────────────────────
DEFAULT_MAX_CALLS = 100
RATE_LIMIT_SECONDS = 0.5
CONFIDENCE_THRESHOLD = 0.6
ESTIMATED_COST_PER_CALL = 0.0003  # rough estimate for deepseek-v4-flash (replace if pro)


def load_json(path):
    """Load a JSON file, returning None if missing."""
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path, payload):
    """Write a JSON file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")


def compute_description_hash(stock):
    """Compute sha256 of name + '|' + description (or empty string)."""
    name = stock.get("name") or ""
    description = stock.get("description") or ""
    raw = name + "|" + description
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def needs_enrichment(stock):
    """Return True if stock's sector or industry is null/missing/Unknown/empty."""
    sector = stock.get("sector")
    industry = stock.get("industry")
    if sector is None or str(sector).strip() == "" or sector == "Unknown":
        return True
    if industry is None or str(industry).strip() == "" or industry == "Unknown":
        return True
    return False


def build_canonical_taxonomy(stocks):
    """
    Build the set of all unique (sector, industry) pairs across stocks where
    BOTH are non-null, non-empty, and non-"Unknown".
    Returns a list of sorted tuples.
    """
    pairs = set()
    for stock in stocks:
        sector = stock.get("sector")
        industry = stock.get("industry")
        if (
            sector
            and industry
            and str(sector).strip() != ""
            and str(industry).strip() != ""
            and sector != "Unknown"
            and industry != "Unknown"
        ):
            pairs.add((sector, industry))
    return sorted(pairs)


def format_canonical_pairs(pairs):
    """Format canonical pairs as a human-readable list for the prompt."""
    lines = []
    for sector, industry in pairs:
        lines.append(f"  ({sector}, {industry})")
    return "\n".join(lines)


def build_prompt(stock, canonical_pairs_text):
    """Build the structured prompt for DeepSeek."""
    name = stock.get("name") or ""
    description = stock.get("description") or ""
    sector = stock.get("sector") or "Unknown"
    industry = stock.get("industry") or "Unknown"

    prompt = f"""You are classifying a US-listed equity into a closed taxonomy of sectors and industries.

Available (sector, industry) pairs (choose exactly one):
{canonical_pairs_text}

Stock to classify:
Name: {name}
Description: {description or "(none)"}
Current sector: {sector if sector and sector != "Unknown" else "Unknown"}
Current industry: {industry if industry and industry != "Unknown" else "Unknown"}

Return ONLY a JSON object with this exact shape (no markdown, no commentary):
{{
  "sector": "<one of the listed sectors, or 'Unknown' if genuinely uncertain>",
  "industry": "<one of the listed industries that pairs with the chosen sector, or 'Unknown'>",
  "confidence": <float 0.0 to 1.0>,
  "reasoning": "<one short sentence>"
}}

If your confidence is below 0.6, return sector and industry as 'Unknown'."""
    return prompt


def parse_deepseek_response(response_text):
    """
    Parse the JSON response from DeepSeek.
    Returns (sector, industry, confidence, reasoning) or raises on failure.
    """
    text = response_text.strip()
    # Remove markdown code fences if present
    if text.startswith("```"):
        lines = text.splitlines()
        # Remove first and last fence lines
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    data = json.loads(text)
    sector = data.get("sector", "Unknown")
    industry = data.get("industry", "Unknown")
    confidence = float(data.get("confidence", 0.0))
    reasoning = str(data.get("reasoning", ""))
    return sector, industry, confidence, reasoning


def validate_canonical(sector, industry, canonical_pairs_set):
    """
    Validate that (sector, industry) is in the canonical set.
    If not, return ("Unknown", "Unknown").
    """
    if (sector, industry) in canonical_pairs_set:
        return sector, industry
    return "Unknown", "Unknown"


def main():
    parser = argparse.ArgumentParser(
        description="Enrich missing sector/industry via DeepSeek API (pre-compute pipeline)."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually call DeepSeek API and write output. Default is dry-run (no API calls).",
    )
    parser.add_argument(
        "--max-calls",
        type=int,
        default=DEFAULT_MAX_CALLS,
        help=f"Maximum number of API calls (default: {DEFAULT_MAX_CALLS}).",
    )
    parser.add_argument(
        "--ticker",
        type=str,
        default=None,
        help="If set, only enrich this specific ticker (dry-run or apply).",
    )
    args = parser.parse_args()

    # ── Auth check (fail fast) ───────────────────────────────────────────
    load_dotenv()
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key:
        print("ERROR: DEEPSEEK_API_KEY not found in environment or .env file.")
        print("Set DEEPSEEK_API_KEY in .env at the workspace root.")
        sys.exit(1)

    model = os.getenv("DEEPSEEK_MODEL") or "deepseek-v4-flash"  # `or`: empty secret -> default

    # ── Load stocks ──────────────────────────────────────────────────────
    stocks = load_json(STOCKS_JSON)
    if stocks is None:
        print(f"ERROR: {STOCKS_JSON} not found.")
        sys.exit(1)

    print(f"Loaded {len(stocks)} stocks from {STOCKS_JSON}")

    # ── Build canonical taxonomy ─────────────────────────────────────────
    canonical_pairs = build_canonical_taxonomy(stocks)
    canonical_pairs_set = set(canonical_pairs)
    canonical_pairs_text = format_canonical_pairs(canonical_pairs)
    print(f"Canonical taxonomy: {len(canonical_pairs)} unique (sector, industry) pairs")

    # ── Identify candidates ──────────────────────────────────────────────
    candidates = []
    for stock in stocks:
        ticker = stock.get("symbol")
        if not ticker:
            continue
        if args.ticker and ticker != args.ticker:
            continue
        if needs_enrichment(stock):
            candidates.append(stock)

    if args.ticker:
        print(f"Filtered to ticker: {args.ticker}")
    print(f"Candidates needing enrichment: {len(candidates)}")

    if len(candidates) == 0:
        print("No candidates to enrich. Exiting.")
        return

    # ── Load existing enriched data (caching) ────────────────────────────
    enriched_data = {}
    if SECTORS_ENRICHED_JSON.exists():
        enriched_data = load_json(SECTORS_ENRICHED_JSON) or {}
        print(f"Loaded {len(enriched_data)} existing enriched entries from {SECTORS_ENRICHED_JSON}")

    # ── Initialize counters ──────────────────────────────────────────────
    cached_hits = 0
    fetched = 0
    accepted = 0
    rejected = 0
    errors = 0

    # ── Process candidates ───────────────────────────────────────────────
    client = None
    if args.apply:
        client = OpenAI(
            api_key=api_key,
            base_url="https://api.deepseek.com",
        )

    for idx, stock in enumerate(candidates):
        ticker = stock.get("symbol")
        desc_hash = compute_description_hash(stock)

        # Check cache
        cached_entry = enriched_data.get(ticker)
        if cached_entry and cached_entry.get("description_hash") == desc_hash:
            cached_hits += 1
            continue

        # Dry-run: just print what would happen
        if not args.apply:
            name = stock.get("name", "?")
            sector = stock.get("sector") or "Unknown"
            industry = stock.get("industry") or "Unknown"
            print(f"  WOULD enrich {ticker}: {name} (sector={sector}, industry={industry})")
            continue

        # Apply mode: call DeepSeek
        if fetched >= args.max_calls:
            print(f"Reached --max-calls limit ({args.max_calls}). Stopping early.")
            break

        prompt = build_prompt(stock, canonical_pairs_text)

        try:
            response = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=300,
            )
            fetched += 1

            response_text = response.choices[0].message.content or ""
            sector, industry, confidence, reasoning = parse_deepseek_response(response_text)

            # Validate against canonical taxonomy
            sector, industry = validate_canonical(sector, industry, canonical_pairs_set)

            if confidence >= CONFIDENCE_THRESHOLD and sector != "Unknown" and industry != "Unknown":
                accepted += 1
            else:
                rejected += 1
                sector = "Unknown"
                industry = "Unknown"

            # Build enriched entry
            enriched_data[ticker] = {
                "sector": sector,
                "industry": industry,
                "enrichment_confidence": round(confidence, 4),
                "enrichment_source": model,
                "enriched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "description_hash": desc_hash,
            }

            print(
                f"  [{idx + 1}/{len(candidates)}] {ticker}: "
                f"sector={sector}, industry={industry}, "
                f"confidence={confidence:.2f}, reasoning={reasoning[:60]}"
            )

        except Exception as e:
            errors += 1
            print(f"  [{idx + 1}/{len(candidates)}] {ticker}: ERROR - {e}")
            # Still record a fallback entry so we don't re-query on next run
            enriched_data[ticker] = {
                "sector": "Unknown",
                "industry": "Unknown",
                "enrichment_confidence": 0.0,
                "enrichment_source": model,
                "enriched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "description_hash": desc_hash,
            }

        # Rate limit
        time.sleep(RATE_LIMIT_SECONDS)

    # ── Write output (apply mode only) ───────────────────────────────────
    if args.apply:
        write_json(SECTORS_ENRICHED_JSON, enriched_data)
        print(f"\nWritten {len(enriched_data)} entries to {SECTORS_ENRICHED_JSON}")

    # ── Summary ──────────────────────────────────────────────────────────
    total_processed = cached_hits + fetched
    estimated_cost = fetched * ESTIMATED_COST_PER_CALL

    print()
    print("=" * 60)
    print("  ENRICH MISSING SECTORS - Summary")
    print("=" * 60)
    print(f"  Mode:                    {'APPLY' if args.apply else 'DRY-RUN'}")
    print(f"  Total candidates:        {len(candidates)}")
    print(f"  Cached hits (skipped):   {cached_hits}")
    print(f"  API calls made:          {fetched}")
    print(f"  Accepted (conf >= 0.6):  {accepted}")
    print(f"  Rejected (conf < 0.6):   {rejected}")
    print(f"  Errors:                  {errors}")
    print(f"  Estimated cost:          ${estimated_cost:.4f}")
    if not args.apply:
        print()
        print("  NOTE: This was a dry-run. No API calls were made.")
        print("  Re-run with --apply to actually call DeepSeek and write output.")
    print("=" * 60)


if __name__ == "__main__":
    main()

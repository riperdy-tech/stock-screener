"""
fetch_analyst_coverage.py -- WS1-T8c: Two-tier analyst coverage enrichment.

Tier 1 (yfinance): Structured price targets and recommendation counts.
Tier 2 (DeepSeek): Constrained narrative summarization (no attribution).

Output: public/data/analyst_coverage.json keyed by ticker.
Consumed read-only by score_paradigm.py's analyst uplift logic.

Usage:
    # Dry-run (default): prints what would happen, makes zero network calls
    python scripts/fetch_analyst_coverage.py

    # Single-ticker dry-run
    python scripts/fetch_analyst_coverage.py --ticker NVDA

    # Apply mode, Tier 1 only (no DeepSeek)
    python scripts/fetch_analyst_coverage.py --apply --skip-narrative --max-calls 5

    # Apply mode, both tiers
    python scripts/fetch_analyst_coverage.py --apply --max-calls 5
"""

import argparse
import hashlib
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Force UTF-8 on stdout so non-ASCII company names (accents, CJK) don't crash
# on Windows cp949 consoles. Python 3.7+ idiom; safe no-op elsewhere.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from dotenv import load_dotenv
from openai import OpenAI


# ── Paths ────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"
STOCKS_JSON = DATA_DIR / "stocks.json"
ANALYST_COVERAGE_JSON = DATA_DIR / "analyst_coverage.json"

# ── Constants ────────────────────────────────────────────────────────────
DEFAULT_MAX_CALLS = 100
RATE_LIMIT_SECONDS = 0.5
CONFIDENCE_THRESHOLD = 0.6
ESTIMATED_COST_PER_CALL = 0.0003  # rough estimate for deepseek-v4-flash (replace if pro)

# Suspicious attribution phrases to strip from narrative output
ATTRIBUTION_PATTERNS = [
    r"according to",
    r"report from",
    r"analyst at",
    r"\b(Goldman Sachs|Morgan Stanley|JP Morgan|JPMorgan|Bank of America|BofA|Merrill Lynch|"
    r"Citigroup|Citi|UBS|Credit Suisse|Barclays|Deutsche Bank|Wells Fargo|"
    r"RBC Capital|Jefferies|Piper Sandler|Needham|Raymond James|Oppenheimer|"
    r"Stifel|Baird|Cowen|Evercore|BMO Capital|Canaccord|William Blair|"
    r"Truist|Wedbush|Loop Capital|Rosenblatt|Susquehanna|Bernstein|"
    r"HSBC|Nomura|Mizuho|Daiwa|Macquarie|Societe Generale)\b",
]

FALLBACK_RATIONALE = "Analyst data summary (narrative attribution removed)"


def load_json(path):
    """Load a JSON file, returning None if missing."""
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path, payload):
    """Write a JSON file with sorted keys, indent=2."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, sort_keys=True)
        f.write("\n")


def compute_input_hash(ticker, price):
    """Compute sha256 of ticker + '|' + price rounded to nearest dollar."""
    rounded_price = round(price) if price is not None else 0
    raw = f"{ticker}|{rounded_price}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def clamp(value, lo, hi):
    """Clamp value to [lo, hi]."""
    return max(lo, min(hi, value))


def safe_get_price_target(ticker_obj):
    """Safely extract price target dict from yfinance Ticker object.

    Returns dict with keys: mean, high, low, current (or None for missing).
    """
    try:
        pt = ticker_obj.analyst_price_targets
        if pt is None:
            return {}
        # pt might be a dict-like; handle both camelCase and snake_case
        result = {}
        for key in ("mean", "high", "low", "current"):
            # Try direct attribute, then dict get, then camelCase variant
            val = None
            if hasattr(pt, key):
                val = getattr(pt, key)
            elif isinstance(pt, dict):
                val = pt.get(key) or pt.get(key[0].upper() + key[1:])  # mean -> Mean
            if val is not None:
                try:
                    result[key] = float(val)
                except (ValueError, TypeError):
                    result[key] = None
            else:
                result[key] = None
        return result
    except Exception:
        return {}


def safe_get_recommendations(ticker_obj):
    """Safely extract recommendation summary from yfinance Ticker object.

    Returns a dict with keys: strongBuy, buy, hold, sell, strongSell (int).
    Returns empty dict if unavailable.
    """
    rec = None
    try:
        rec = ticker_obj.recommendations_summary
    except AttributeError:
        try:
            rec = ticker_obj.recommendations
        except Exception:
            pass
    except Exception:
        try:
            rec = ticker_obj.recommendations
        except Exception:
            pass

    if rec is None:
        return {}

    # rec might be a DataFrame or dict-like
    try:
        # If it's a DataFrame, get the last row as a dict
        if hasattr(rec, "iloc"):
            if rec.empty:
                return {}
            last = rec.iloc[-1]
            if hasattr(last, "to_dict"):
                last = last.to_dict()
            elif isinstance(last, dict):
                pass
            else:
                return {}
        elif isinstance(rec, dict):
            last = rec
        else:
            return {}

        counts = {}
        for key in ("strongBuy", "buy", "hold", "sell", "strongSell"):
            # Try exact, then camelCase, then lowercase
            val = last.get(key) or last.get(key[0].upper() + key[1:]) or last.get(key.lower())
            if val is not None:
                try:
                    counts[key] = int(val)
                except (ValueError, TypeError):
                    counts[key] = 0
            else:
                counts[key] = 0
        return counts
    except Exception:
        return {}


def compute_structured_score(target_mean_delta_pct, buy_consensus_ratio, analyst_count):
    """Compute the 0-100 structured score from analyst data.

    Args:
        target_mean_delta_pct: float, percentage upside/downside from current price
        buy_consensus_ratio: float 0-1 or None
        analyst_count: int or None

    Returns:
        int 0-100, or None if insufficient data
    """
    if target_mean_delta_pct is None:
        return None

    # target_score: +50% upside maps to 100, -50% maps to 0
    target_score = clamp((target_mean_delta_pct + 50) * 1.0, 0, 100)

    # consensus_score: ratio * 100, default neutral 50
    if buy_consensus_ratio is not None:
        consensus_score = buy_consensus_ratio * 100
    else:
        consensus_score = 50.0

    # analyst_count_weight: 10+ analysts = full weight
    if analyst_count is not None and analyst_count > 0:
        analyst_count_weight = min(1.0, analyst_count / 10)
    else:
        analyst_count_weight = 0.0

    structured_score = round((0.6 * target_score + 0.4 * consensus_score) * analyst_count_weight)
    return int(structured_score)


def build_narrative_prompt(symbol, name, price, pdm_themes, target_mean, target_mean_delta_pct,
                           analyst_count, buy_consensus_ratio, rec_counts):
    """Build the constrained narrative prompt for DeepSeek.

    Strict no-attribution wording. Returns a single user message string.
    """
    themes_str = ", ".join(pdm_themes) if pdm_themes else "(none)"
    rec_str = (
        f"strongBuy={rec_counts.get('strongBuy', 0)}, "
        f"buy={rec_counts.get('buy', 0)}, "
        f"hold={rec_counts.get('hold', 0)}, "
        f"sell={rec_counts.get('sell', 0)}, "
        f"strongSell={rec_counts.get('strongSell', 0)}"
    )

    prompt = f"""You are summarizing publicly known analyst sentiment for a US-listed equity.

You will receive STRUCTURED analyst data already aggregated from public sources. Your job
is to produce a one-sentence narrative interpretation and a 0-100 score, using ONLY the
provided numbers as evidence. Do not invent firm names, specific analyst names, or
specific quotes. Do not refer to events, reports, or sources by name. Do not assert
information you cannot derive from the provided structured data.

Stock:
  Ticker: {symbol}
  Name: {name}
  Current price: ${price}
  Theme membership: {themes_str}

Structured analyst data:
  Price target mean: ${target_mean}
  Price target upside vs current: {target_mean_delta_pct}%
  Number of analysts: {analyst_count}
  Buy/StrongBuy ratio: {buy_consensus_ratio}
  Recommendation counts: {rec_str}

Return ONLY a JSON object with this exact shape (no markdown, no commentary):
{{
  "narrative_score": <integer 0-100, or null if you cannot derive a confident view>,
  "rationale_one_sentence": "<one sentence, no firm names, no analyst names, no specific event references>",
  "confidence": <float 0.0 to 1.0>
}}

If your confidence is below 0.6, return narrative_score as null."""
    return prompt


def parse_narrative_response(response_text):
    """Parse the JSON response from DeepSeek for narrative data.

    Returns (narrative_score, rationale, confidence) or raises on failure.
    """
    text = response_text.strip()
    # Remove markdown code fences if present
    if text.startswith("```"):
        lines = text.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    data = json.loads(text)
    narrative_score = data.get("narrative_score")
    if narrative_score is not None:
        narrative_score = int(narrative_score)
    rationale = str(data.get("rationale_one_sentence", ""))
    confidence = float(data.get("confidence", 0.0))
    return narrative_score, rationale, confidence


def strip_attribution(rationale):
    """Strip suspicious attribution phrases from narrative output.

    If any attribution pattern is found, return the fallback string.
    """
    if not rationale:
        return FALLBACK_RATIONALE

    lower = rationale.lower()
    for pattern in ATTRIBUTION_PATTERNS:
        if re.search(pattern, lower):
            return FALLBACK_RATIONALE

    # Also check for any uppercase-leading multi-word phrase that looks like a firm name
    # e.g., "Goldman Sachs", "Morgan Stanley" - these are already in ATTRIBUTION_PATTERNS
    # but catch any unknown firm-like patterns: two+ capitalized words in a row
    firm_like = re.findall(r'\b([A-Z][a-z]+ [A-Z][a-z]+)\b', rationale)
    known_firms = {
        "Goldman Sachs", "Morgan Stanley", "Bank of America", "Merrill Lynch",
        "Credit Suisse", "Deutsche Bank", "Wells Fargo", "RBC Capital",
        "Piper Sandler", "Raymond James", "William Blair", "Loop Capital",
        "Rosenblatt Securities", "Societe Generale", "BMO Capital",
        "Canaccord Genuity", "Jefferies Group", "Barclays Capital",
        "Citigroup Global", "UBS Group", "HSBC Holdings", "Nomura Holdings",
        "Mizuho Financial", "Daiwa Securities", "Macquarie Group",
        "Stifel Financial", "Baird Financial", "Cowen Group", "Evercore ISI",
        "Oppenheimer Holdings", "Truist Financial", "Wedbush Securities",
        "Susquehanna International", "Bernstein Research",
    }
    for phrase in firm_like:
        if phrase in known_firms:
            return FALLBACK_RATIONALE

    return rationale


def main():
    parser = argparse.ArgumentParser(
        description="Fetch analyst coverage data (yfinance + DeepSeek narrative)."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually call yfinance/DeepSeek and write output. Default is dry-run.",
    )
    parser.add_argument(
        "--max-calls",
        type=int,
        default=DEFAULT_MAX_CALLS,
        help=f"Maximum number of API calls (yfinance + DeepSeek combined; default: {DEFAULT_MAX_CALLS}).",
    )
    parser.add_argument(
        "--ticker",
        type=str,
        default=None,
        help="If set, only process this specific ticker (dry-run or apply).",
    )
    parser.add_argument(
        "--skip-narrative",
        action="store_true",
        help="Skip Tier 2 (DeepSeek narrative). Tier 1 (yfinance) only.",
    )
    args = parser.parse_args()

    # ── Fail-fast: check yfinance importable ─────────────────────────────
    try:
        import yfinance as yf
    except ImportError:
        print("ERROR: yfinance is not installed. Install with: pip install yfinance")
        sys.exit(1)

    # ── Auth check (fail fast if DeepSeek needed) ────────────────────────
    if not args.skip_narrative:
        load_dotenv()
        api_key = os.environ.get("DEEPSEEK_API_KEY")
        if not api_key:
            print("ERROR: DEEPSEEK_API_KEY not found in environment or .env file.")
            print("Set DEEPSEEK_API_KEY in .env at the workspace root, or use --skip-narrative.")
            sys.exit(1)
        model = os.getenv("DEEPSEEK_MODEL") or "deepseek-v4-flash"  # `or`: empty secret -> default
    else:
        api_key = None
        model = None

    # ── Load stocks ──────────────────────────────────────────────────────
    stocks = load_json(STOCKS_JSON)
    if stocks is None:
        print(f"ERROR: {STOCKS_JSON} not found.")
        sys.exit(1)

    print(f"Loaded {len(stocks)} stocks from {STOCKS_JSON}")

    # ── Pre-filter: only tickers with non-empty pdm_themes ───────────────
    candidates = []
    for stock in stocks:
        ticker = stock.get("symbol")
        if not ticker:
            continue
        if args.ticker and ticker != args.ticker:
            continue
        pdm_themes = stock.get("paradigm", {}).get("pdm_themes", [])
        if pdm_themes and len(pdm_themes) > 0:
            candidates.append(stock)

    if args.ticker:
        print(f"Filtered to ticker: {args.ticker}")
    print(f"Candidates (non-empty pdm_themes): {len(candidates)}")

    if len(candidates) == 0:
        print("No candidates to process. Exiting.")
        return

    # ── Load existing analyst coverage data (caching) ────────────────────
    existing_data = {}
    if ANALYST_COVERAGE_JSON.exists():
        existing_data = load_json(ANALYST_COVERAGE_JSON) or {}
        print(f"Loaded {len(existing_data)} existing entries from {ANALYST_COVERAGE_JSON}")

    # ── Initialize counters ──────────────────────────────────────────────
    cached_hits = 0
    tier1_attempted = 0
    tier1_succeeded = 0
    tier1_failed = 0
    tier2_attempted = 0
    tier2_succeeded = 0
    tier2_rejected = 0
    tier2_errors = 0
    total_calls = 0  # yfinance + DeepSeek combined

    # ── Initialize clients ───────────────────────────────────────────────
    deepseek_client = None
    if args.apply and not args.skip_narrative:
        deepseek_client = OpenAI(
            api_key=api_key,
            base_url="https://api.deepseek.com",
        )

    # ── Process candidates ───────────────────────────────────────────────
    for idx, stock in enumerate(candidates):
        ticker = stock.get("symbol")
        name = stock.get("name", "?")
        current_price = stock.get("price")
        pdm_themes = stock.get("paradigm", {}).get("pdm_themes", [])

        if current_price is None:
            print(f"  [{idx + 1}/{len(candidates)}] {ticker}: no price, skipping")
            continue

        input_hash = compute_input_hash(ticker, current_price)

        # Check cache: re-fetch when price moves (hash changes)
        cached_entry = existing_data.get(ticker)
        if cached_entry and cached_entry.get("input_hash") == input_hash:
            cached_hits += 1
            continue

        # ── Dry-run: just print what would happen ────────────────────────
        if not args.apply:
            print(f"  WOULD fetch {ticker}: {name} (price=${current_price})")
            continue

        # ── Apply mode ───────────────────────────────────────────────────
        if total_calls >= args.max_calls:
            print(f"Reached --max-calls limit ({args.max_calls}). Stopping early.")
            break

        # ── Tier 1: yfinance structured data ─────────────────────────────
        tier1_attempted += 1
        total_calls += 1

        entry = {
            "structured_score": None,
            "target_mean_delta_pct": None,
            "buy_consensus_ratio": None,
            "analyst_count": None,
            "raw_recommendation_counts": {
                "strongBuy": 0, "buy": 0, "hold": 0, "sell": 0, "strongSell": 0
            },
            "narrative_score": None,
            "narrative_rationale": None,
            "narrative_confidence": None,
            "tier1_source": "yfinance",
            "tier2_source": None,
            "input_hash": input_hash,
            "enriched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

        try:
            t = yf.Ticker(ticker)

            # Price targets
            pt = safe_get_price_target(t)
            target_mean = pt.get("mean")
            target_high = pt.get("high")
            target_low = pt.get("low")

            # Recommendations
            rec_counts = safe_get_recommendations(t)
            entry["raw_recommendation_counts"] = rec_counts

            # Compute buy consensus ratio
            strong_buy = rec_counts.get("strongBuy", 0)
            buy = rec_counts.get("buy", 0)
            hold = rec_counts.get("hold", 0)
            sell = rec_counts.get("sell", 0)
            strong_sell = rec_counts.get("strongSell", 0)
            total_count = strong_buy + buy + hold + sell + strong_sell

            if total_count > 0:
                buy_consensus_ratio = (strong_buy + buy) / total_count
                entry["buy_consensus_ratio"] = round(buy_consensus_ratio, 4)
                entry["analyst_count"] = total_count
            else:
                buy_consensus_ratio = None
                entry["analyst_count"] = None

            # Compute target mean delta
            if target_mean is not None and current_price and current_price > 0:
                target_mean_delta_pct = (target_mean - current_price) / current_price * 100
                target_mean_delta_pct = clamp(target_mean_delta_pct, -200, 200)
                entry["target_mean_delta_pct"] = round(target_mean_delta_pct, 2)
            else:
                target_mean_delta_pct = None

            # Compute structured score
            structured_score = compute_structured_score(
                target_mean_delta_pct, buy_consensus_ratio, entry["analyst_count"]
            )
            entry["structured_score"] = structured_score

            if structured_score is not None:
                tier1_succeeded += 1
            else:
                tier1_failed += 1

            print(
                f"  [T1][{idx + 1}/{len(candidates)}] {ticker}: "
                f"score={structured_score}, "
                f"upside={target_mean_delta_pct}%, "
                f"buy_ratio={buy_consensus_ratio}, "
                f"analysts={entry['analyst_count']}"
            )

        except Exception as e:
            tier1_failed += 1
            print(f"  [T1][{idx + 1}/{len(candidates)}] {ticker}: ERROR - {e}")
            # Entry already has all-null defaults; save it and continue
            existing_data[ticker] = entry
            continue

        # ── Tier 2: DeepSeek narrative (only if structured_score is non-null) ──
        if not args.skip_narrative and structured_score is not None and deepseek_client is not None:
            if total_calls >= args.max_calls:
                print(f"Reached --max-calls limit ({args.max_calls}). Skipping Tier 2 for {ticker}.")
            else:
                tier2_attempted += 1
                total_calls += 1

                prompt = build_narrative_prompt(
                    symbol=ticker,
                    name=name,
                    price=current_price,
                    pdm_themes=pdm_themes,
                    target_mean=target_mean,
                    target_mean_delta_pct=target_mean_delta_pct,
                    analyst_count=entry["analyst_count"],
                    buy_consensus_ratio=buy_consensus_ratio,
                    rec_counts=rec_counts,
                )

                try:
                    response = deepseek_client.chat.completions.create(
                        model=model,
                        messages=[{"role": "user", "content": prompt}],
                        temperature=0.1,
                        max_tokens=300,
                    )

                    response_text = response.choices[0].message.content or ""
                    narrative_score, rationale, confidence = parse_narrative_response(response_text)

                    # Apply confidence threshold
                    if confidence < CONFIDENCE_THRESHOLD:
                        narrative_score = None
                        tier2_rejected += 1
                    else:
                        tier2_succeeded += 1

                    # Strip attribution phrases
                    rationale = strip_attribution(rationale)

                    entry["narrative_score"] = narrative_score
                    entry["narrative_rationale"] = rationale
                    entry["narrative_confidence"] = round(confidence, 4)
                    entry["tier2_source"] = model

                    print(
                        f"  [T2][{idx + 1}/{len(candidates)}] {ticker}: "
                        f"narrative_score={narrative_score}, "
                        f"confidence={confidence:.2f}"
                    )

                except Exception as e:
                    tier2_errors += 1
                    print(f"  [T2][{idx + 1}/{len(candidates)}] {ticker}: ERROR - {e}")
                    entry["narrative_score"] = None
                    entry["narrative_rationale"] = None
                    entry["narrative_confidence"] = None
                    entry["tier2_source"] = None

                # Rate limit
                time.sleep(RATE_LIMIT_SECONDS)

        # Save entry
        existing_data[ticker] = entry

    # ── Write output (apply mode only) ───────────────────────────────────
    if args.apply:
        write_json(ANALYST_COVERAGE_JSON, existing_data)
        print(f"\nWritten {len(existing_data)} entries to {ANALYST_COVERAGE_JSON}")

    # ── Summary ──────────────────────────────────────────────────────────
    estimated_cost = tier2_attempted * ESTIMATED_COST_PER_CALL

    print()
    print("=" * 60)
    print("  FETCH ANALYST COVERAGE - Summary")
    print("=" * 60)
    print(f"  Mode:                    {'APPLY' if args.apply else 'DRY-RUN'}")
    print(f"  Total candidates:        {len(candidates)}")
    print(f"  Cached hits (skipped):   {cached_hits}")
    print(f"  Tier 1 attempted:        {tier1_attempted}")
    print(f"  Tier 1 succeeded:        {tier1_succeeded}")
    print(f"  Tier 1 failed:           {tier1_failed}")
    print(f"  Tier 2 attempted:        {tier2_attempted}")
    print(f"  Tier 2 succeeded:        {tier2_succeeded}")
    print(f"  Tier 2 rejected (conf):  {tier2_rejected}")
    print(f"  Tier 2 errors:           {tier2_errors}")
    print(f"  Estimated cost:          ${estimated_cost:.4f}")
    if not args.apply:
        print()
        print("  NOTE: This was a dry-run. No network calls were made.")
        print("  Re-run with --apply to actually fetch data and write output.")
    print("=" * 60)


if __name__ == "__main__":
    main()

"""
fetch_analyst_coverage.py -- WS1-T8c: Two-tier analyst coverage enrichment.

Tier 1 (yfinance): Structured price targets and recommendation counts.
Tier 2 (deterministic): narrative_score computed from the Tier-1 numbers by
    analyst_uplift_score() — no LLM. The DeepSeek call this replaced (2026-08-21)
    received ONLY the Tier-1 numbers and was forbidden from adding anything, so it
    was pure compression of known inputs: nondeterministic at a gate (unseeded —
    same counts could score differently next Sunday and churn gate membership), an
    API failure surface (keys/quota/JSON/attribution-leak policing), and gated on
    the model's own uncalibrated self-confidence. A formula over the same inputs
    is deterministic, free, and offline. Archived-score calibration: see
    analyst_uplift_score's docstring.

Output: public/data/analyst_coverage.json keyed by ticker.
Consumed read-only by score_paradigm.py's analyst uplift logic.

Usage:
    # Dry-run (default): prints what would happen, makes zero network calls
    python scripts/fetch_analyst_coverage.py

    # Single-ticker dry-run
    python scripts/fetch_analyst_coverage.py --ticker NVDA

    # Apply mode
    python scripts/fetch_analyst_coverage.py --apply --max-calls 5
"""

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# Force UTF-8 on stdout so non-ASCII company names (accents, CJK) don't crash
# on Windows cp949 consoles. Python 3.7+ idiom; safe no-op elsewhere.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


# ── Paths ────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"
STOCKS_JSON = DATA_DIR / "stocks.json"
ANALYST_COVERAGE_JSON = DATA_DIR / "analyst_coverage.json"

# ── Constants ────────────────────────────────────────────────────────────
DEFAULT_MAX_CALLS = 100


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


def analyst_uplift_score(strong_buy, buy, hold, sell, strong_sell, upside_pct,
                         k=3, w_rec=0.8, w_up=0.2, upside_cap=50.0):
    """Deterministic replacement for the DeepSeek Tier-2 narrative_score (2026-08-21).

    Returns a float in [0, 100], or None when there is no coverage (n == 0) —
    absence of coverage is information, not a neutral 50 and not a 0.

    Constants FROZEN after calibration against the last archived DeepSeek scores
    (137 entries, 2026-08-16 run): Spearman rank correlation 0.6622 at
    (k=3, w_rec=0.8, w_up=0.2, upside_cap=50) vs 0.5764 at the proposal defaults.
    The LLM scores were never ground truth — the largest divergences are names
    where DeepSeek scored 85-95 on ONE analyst with a +200% target (HIT, FURY,
    IPM, QNC), exactly the overconfidence the n/(n+k) shrinkage suppresses and
    the upside cap bounds. Do not re-tune toward those.
    """
    n = strong_buy + buy + hold + sell + strong_sell
    if n == 0:
        return None
    # recommendation balance in [-1, 1]
    rec = (2 * strong_buy + buy - sell - 2 * strong_sell) / (2.0 * n)
    # target upside in [-1, 1], capped so one outlier target cannot dominate
    up = 0.0 if upside_pct is None else max(-1.0, min(1.0, upside_pct / upside_cap))
    w_up_eff = 0.0 if upside_pct is None else w_up
    w_rec_eff = 1.0 - w_up_eff
    raw = w_rec_eff * rec + w_up_eff * up
    # shrink toward neutral when coverage is thin: 2 analysts must not score like 30
    shrunk = raw * (n / (n + k))
    return round(50.0 + 50.0 * shrunk, 1)


def narrative_rationale_template(rec_counts, analyst_count, target_mean_delta_pct):
    """Human-readable one-sentence rationale from the same numbers. No LLM."""
    if not analyst_count:
        return None
    positive = rec_counts.get("strongBuy", 0) + rec_counts.get("buy", 0)
    parts = [f"{positive} of {analyst_count} analysts rate buy or stronger"]
    if target_mean_delta_pct is not None:
        parts.append(f"mean target implies {target_mean_delta_pct:+.0f}% vs current price")
    return "; ".join(parts) + "."


def main():
    parser = argparse.ArgumentParser(
        description="Fetch analyst coverage data (yfinance + deterministic narrative score)."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually call yfinance and write output. Default is dry-run.",
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

    # ── Fail-fast: check yfinance importable ─────────────────────────────
    try:
        import yfinance as yf
    except ImportError:
        print("ERROR: yfinance is not installed. Install with: pip install yfinance")
        sys.exit(1)

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
    tier2_scored = 0
    tier2_no_coverage = 0
    total_calls = 0  # yfinance only (Tier 2 is a local formula, zero API cost)

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

        # ── Tier 2: deterministic narrative_score from the same Tier-1 numbers ──
        # No LLM, no network, no confidence gate: same inputs always give the same
        # score (gate membership cannot churn without an underlying data change).
        # n == 0 (no analysts) -> null: no coverage is information, not neutral.
        narrative_score = analyst_uplift_score(
            rec_counts.get("strongBuy", 0), rec_counts.get("buy", 0),
            rec_counts.get("hold", 0), rec_counts.get("sell", 0),
            rec_counts.get("strongSell", 0), target_mean_delta_pct,
        )
        if narrative_score is None:
            tier2_no_coverage += 1
        else:
            tier2_scored += 1
        entry["narrative_score"] = narrative_score
        entry["narrative_rationale"] = narrative_rationale_template(
            rec_counts, entry["analyst_count"], target_mean_delta_pct)
        # deterministic computation: confidence is structurally 1.0 (consumers
        # multiply the narrative leg by this; the old value was LLM self-report)
        entry["narrative_confidence"] = 1.0 if narrative_score is not None else None
        entry["tier2_source"] = "deterministic-v1" if narrative_score is not None else None
        if narrative_score is not None:
            print(f"  [T2][{idx + 1}/{len(candidates)}] {ticker}: narrative_score={narrative_score}")

        # Save entry
        existing_data[ticker] = entry

    # ── Write output (apply mode only) ───────────────────────────────────
    if args.apply:
        write_json(ANALYST_COVERAGE_JSON, existing_data)
        print(f"\nWritten {len(existing_data)} entries to {ANALYST_COVERAGE_JSON}")

    # ── Summary ──────────────────────────────────────────────────────────
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
    print(f"  Tier 2 scored (formula): {tier2_scored}")
    print(f"  Tier 2 no coverage:      {tier2_no_coverage}")
    print(f"  API cost:                $0 (Tier 2 is deterministic, no LLM)")
    if not args.apply:
        print()
        print("  NOTE: This was a dry-run. No network calls were made.")
        print("  Re-run with --apply to actually fetch data and write output.")
    print("=" * 60)


if __name__ == "__main__":
    main()

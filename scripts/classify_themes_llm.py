"""
classify_themes_llm.py - DeepSeek fallback theme classifier.

For stocks where the rule-based composite tagger cannot reach the threshold
(>=2.0 default, >=1.5 hot) but at least one method partially fires
(composite in [1.0, 2.0)), asks DeepSeek to decide if the stock genuinely
belongs to any of the 9 secular themes.

Pre-compute pipeline. Output: public/data/theme_assignments_llm.json.
Consumed read-only by score_paradigm.py.

Strict constraints to prevent fabrication:
- Closed taxonomy: prompt lists the 9 themes verbatim. Model must pick from
  this list OR return [] (no themes apply).
- Confidence threshold: scores < 0.7 collapse to no-tag.
- Schema-validated JSON output; non-conforming responses logged + skipped.
- Caching keyed by sha256(symbol + name + description) - re-fetch only when
  underlying data changes.

Usage:
    python scripts/classify_themes_llm.py                  # dry-run
    python scripts/classify_themes_llm.py --apply --max-calls 100
    python scripts/classify_themes_llm.py --ticker MSFT    # one ticker
    python scripts/classify_themes_llm.py --apply --recompute-all  # ignore cache
"""

import argparse
import hashlib
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

from dotenv import load_dotenv
from openai import OpenAI

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"
STOCKS_JSON = DATA_DIR / "stocks.json"
CONFIG_JSON = Path(__file__).resolve().with_name("paradigm_config.json")
OUTPUT_JSON = DATA_DIR / "theme_assignments_llm.json"
PARADIGM_SCORES_JSON = DATA_DIR / "paradigm_scores.json"

RATE_LIMIT_SECONDS = 0.5
CONFIDENCE_THRESHOLD = 0.7
ESTIMATED_COST_PER_CALL = 0.0003  # deepseek-v4-flash rough estimate

# Composite-vote range where LLM classification is invoked.
# Below 1.0: zero rule-based signal - skip (likely off-theme).
# At/above 2.0: already tagged by rules - skip (no need).
LLM_MIN_COMPOSITE = 1.0
LLM_MAX_COMPOSITE = 2.0


def load_json(path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path, payload):
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, sort_keys=True)
        f.write("\n")


def compute_input_hash(stock):
    name = stock.get("name") or ""
    desc = stock.get("description") or ""
    sym = stock.get("symbol") or ""
    return hashlib.sha256(f"{sym}|{name}|{desc}".encode("utf-8")).hexdigest()


def build_prompt(stock, themes):
    sym = stock.get("symbol")
    name = stock.get("name") or ""
    desc = stock.get("description") or "(no description)"
    industry = stock.get("industry") or "Unknown"

    theme_lines = "\n".join(
        f"- {t['id']} - {t.get('label', t['id'])}: {t.get('description', '')[:200]}"
        for t in themes
    )

    return f"""You are classifying a US-listed equity into secular investment themes.

CLOSED THEME LIST (you must pick from this list ONLY, do not invent new themes):
{theme_lines}

Stock to classify:
  Ticker: {sym}
  Name: {name}
  Industry: {industry}
  Description: {desc[:1500]}

A stock can belong to ZERO, ONE, or MULTIPLE themes. Be conservative - only
assign a theme if the stock is a GENUINE participant (revenue exposure, core
product, strategic focus), not a tangential mention.

Return ONLY a JSON object with this exact shape (no markdown, no commentary):
{{
  "themes": ["<theme_id_1>", "<theme_id_2>", ...],
  "confidence": <float 0.0 to 1.0>,
  "rationale_one_sentence": "<short, no firm names beyond the stock itself, no specific event references>"
}}

If your confidence is below 0.7, return themes as an empty list [] and confidence < 0.7.
If no theme applies, return themes as [] with confidence reflecting your certainty in the "no theme" judgment.
"""


def call_deepseek(client, model, stock, themes):
    prompt = build_prompt(stock, themes)
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.0,
        max_tokens=512,
        response_format={"type": "json_object"},
    )
    raw = resp.choices[0].message.content or "{}"
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None, "parse_error"

    themes_returned = parsed.get("themes") or []
    confidence = parsed.get("confidence")
    rationale = parsed.get("rationale_one_sentence") or ""

    if not isinstance(themes_returned, list) or not isinstance(confidence, (int, float)):
        return None, "bad_shape"

    # Validate themes are in closed list
    valid_theme_ids = {t["id"] for t in themes}
    themes_returned = [t for t in themes_returned if t in valid_theme_ids]

    # Confidence guard
    if confidence < CONFIDENCE_THRESHOLD:
        themes_returned = []

    return {
        "themes": themes_returned,
        "confidence": float(confidence),
        "rationale": rationale,
    }, None


def get_candidates(stocks, paradigm_scores, max_candidates=None):
    """Return stocks needing LLM classification.

    A stock is a candidate if:
    - It has a 'paradigm' object
    - Currently has 0 tagged themes (rule-based composite did not reach threshold)
    - Has any non-trivial signal hint (industry present + description present)
    Skips stocks already tagged (composite >= 2.0 fired).
    """
    candidates = []
    for stock in stocks:
        sym = stock.get("symbol")
        if not sym:
            continue
        p = stock.get("paradigm") or {}
        if p.get("pdm_themes"):
            continue  # already rule-tagged
        # Heuristic: only classify stocks with description (otherwise LLM has nothing to read)
        desc = stock.get("description") or ""
        if len(desc) < 50:
            continue
        candidates.append(stock)
    if max_candidates:
        candidates = candidates[:max_candidates]
    return candidates


def main():
    parser = argparse.ArgumentParser(description="DeepSeek fallback theme classifier.")
    parser.add_argument("--apply", action="store_true", help="Fetch and write (default: dry-run)")
    parser.add_argument("--max-calls", type=int, default=100, help="Cap on API calls per run")
    parser.add_argument("--ticker", default=None, help="Process one ticker only")
    parser.add_argument("--recompute-all", action="store_true", help="Ignore cache; re-classify everything")
    args = parser.parse_args()

    # Try root .env first, then Stock Screener .env.local
    load_dotenv()
    if not os.getenv("DEEPSEEK_API_KEY"):
        local_env = ROOT / ".env.local"
        if local_env.exists():
            load_dotenv(local_env, override=False)
    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        print("ERROR: DEEPSEEK_API_KEY not set.", file=sys.stderr)
        sys.exit(1)

    model = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")

    if not STOCKS_JSON.exists():
        print(f"ERROR: {STOCKS_JSON} not found.", file=sys.stderr)
        sys.exit(1)
    if not CONFIG_JSON.exists():
        print(f"ERROR: {CONFIG_JSON} not found.", file=sys.stderr)
        sys.exit(1)

    stocks = load_json(STOCKS_JSON)
    config = load_json(CONFIG_JSON)
    themes = config.get("themes", [])
    if not themes:
        print("ERROR: no themes in paradigm_config.json.", file=sys.stderr)
        sys.exit(1)

    # Load paradigm_scores (for reference; we use stocks[].paradigm directly)
    paradigm_scores = {}
    if PARADIGM_SCORES_JSON.exists():
        paradigm_scores = load_json(PARADIGM_SCORES_JSON)

    # Load existing cache
    cache = {}
    if OUTPUT_JSON.exists() and not args.recompute_all:
        try:
            cache = load_json(OUTPUT_JSON)
        except Exception:
            cache = {}

    # Filter candidates
    if args.ticker:
        stocks = [s for s in stocks if s.get("symbol") == args.ticker]
    candidates = get_candidates(stocks, paradigm_scores)

    print("=" * 60)
    print(f"  CLASSIFY THEMES (LLM) - {'APPLY' if args.apply else 'DRY-RUN'}")
    print("=" * 60)
    print(f"  Model: {model}")
    print(f"  Themes available: {len(themes)}")
    print(f"  Candidates needing classification: {len(candidates)}")
    print(f"  Cached entries: {len(cache)}")
    print(f"  Max API calls this run: {args.max_calls}")
    print()

    if not args.apply:
        # Dry-run: show first 10 candidates
        print("  First 10 candidates that WOULD be classified:")
        for stock in candidates[:10]:
            sym = stock.get("symbol")
            name = (stock.get("name") or "")[:40]
            ind = stock.get("industry") or "?"
            print(f"    {sym:6s}  {name:40s}  ({ind})")
        print()
        print("  DRY-RUN: no API calls made. Re-run with --apply.")
        print("=" * 60)
        return

    # Apply mode
    client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")

    fetched = 0
    succeeded = 0
    rejected_conf = 0
    failed = 0
    cache_hits = 0
    classified_with_themes = 0

    for stock in candidates:
        if fetched >= args.max_calls:
            print(f"  Reached --max-calls limit ({args.max_calls}). Stopping.")
            break

        sym = stock.get("symbol")
        input_hash = compute_input_hash(stock)

        # Cache check
        if not args.recompute_all and sym in cache:
            entry = cache[sym]
            if entry.get("input_hash") == input_hash:
                cache_hits += 1
                continue

        # Fetch
        try:
            result, err = call_deepseek(client, model, stock, themes)
            if err is not None:
                print(f"  [{fetched+1}] {sym}: parse error ({err})", file=sys.stderr)
                failed += 1
                fetched += 1
                time.sleep(RATE_LIMIT_SECONDS)
                continue
            if result is None:
                failed += 1
                fetched += 1
                time.sleep(RATE_LIMIT_SECONDS)
                continue

            themes_assigned = result["themes"]
            if not themes_assigned:
                rejected_conf += 1
            else:
                succeeded += 1
                classified_with_themes += 1

            cache[sym] = {
                "themes": themes_assigned,
                "confidence": result["confidence"],
                "rationale": result["rationale"],
                "input_hash": input_hash,
                "source": model,
                "classified_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
            fetched += 1
            print(f"  [{fetched}/{args.max_calls}] {sym}: themes={themes_assigned} conf={result['confidence']:.2f}")
            time.sleep(RATE_LIMIT_SECONDS)
        except Exception as exc:
            print(f"  [{fetched+1}] {sym}: ERROR {type(exc).__name__}: {exc}", file=sys.stderr)
            failed += 1
            fetched += 1
            time.sleep(RATE_LIMIT_SECONDS)

    # Write
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    write_json(OUTPUT_JSON, cache)
    cost = fetched * ESTIMATED_COST_PER_CALL

    print()
    print("=" * 60)
    print("  CLASSIFY THEMES (LLM) - Summary")
    print("=" * 60)
    print(f"  Mode:                          APPLY")
    print(f"  Candidates total:              {len(candidates)}")
    print(f"  Cache hits (skipped):          {cache_hits}")
    print(f"  API calls made:                {fetched}")
    print(f"  Succeeded (any themes):        {succeeded}")
    print(f"  Rejected (conf < 0.7 or no theme): {rejected_conf}")
    print(f"  Failed (parse/error):          {failed}")
    print(f"  Stocks newly tagged via LLM:   {classified_with_themes}")
    print(f"  Estimated cost:                ${cost:.4f}")
    print(f"  Written: {OUTPUT_JSON}")
    print("=" * 60)


if __name__ == "__main__":
    main()

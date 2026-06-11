"""fetch_overlay_signals.py — Stage-4 overlay: informed demand + GPR exposure.

Per the Integrated Ecosystem review (§E, §F): news/insider/geopolitical
signals are VETO / SIZING / CONFIRMATION layers, never additive alpha.

Tier 1 (free):
  - Net insider buying (yfinance insider_purchases — Jiao-Massa "informed
    demand": insider buys + falling short interest outperform the opposite).
  - Short interest level + delta vs previous run, institutional ownership
    (both read from the daily financials sidecars — no extra network).
  -> informed_demand in {-1, 0, +1}.

Tier 2 (DeepSeek, ~$0.0003/call): geopolitical exposure tag from company
description + sector -> {gpr_level 0-3, channels, note}. Used by the
portfolio plan as a sizing multiplier (level 2 -> x0.75; level 3 -> x0.5 and
requires a negative expectations gap) and shown as a chip in the cockpit.
Previous GPR tags are carried forward when the call budget runs out —
exposure profiles change slowly.

Usage:
    python scripts/fetch_overlay_signals.py                       # dry-run
    python scripts/fetch_overlay_signals.py --apply --max-calls 200
    python scripts/fetch_overlay_signals.py --apply --skip-gpr    # Tier 1 only
Output: public/data/overlay_signals.json
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"
STOCKS_JSON = DATA / "stocks.json"
FACTOR_SCORES_JSON = DATA / "factor_scores.json"
FINANCIALS_DIR = DATA / "financials"
OUT_JSON = DATA / "overlay_signals.json"

ELIGIBLE_BANDS = ("research_now", "watchlist")
RATE_LIMIT_SECONDS = 0.4
INSIDER_BUY_THRESHOLD = 0.005   # >0.5% of shares net-bought = meaningful
INSIDER_SELL_THRESHOLD = -0.005
GPR_CHANNELS = ["revenue_geography", "supply_chain", "regulation", "sanctions"]

GPR_PROMPT = """You are tagging a US-listed stock for GEOPOLITICAL RISK exposure.
Based ONLY on the company profile below (do not recall other facts), output strict JSON:
{{"gpr_level": <0-3>, "channels": [<zero or more of: "revenue_geography","supply_chain","regulation","sanctions">], "note": "<one factual sentence, max 140 chars>"}}

Levels: 0 = negligible (domestic, low-regulation); 1 = minor; 2 = material exposure
(significant foreign revenue/supply chain OR heavy regulatory dependence);
3 = severe (chokepoint dependence, sanctions-adjacent markets, geopolitical flashpoint).

Company: {name}
Sector / Industry: {sector} / {industry}
Description: {description}

JSON only, no other text."""


def load_json(path, default=None):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def read_calculated_metrics(ticker):
    detail = load_json(FINANCIALS_DIR / f"{ticker}.json", {}) or {}
    return detail.get("Calculated_Metrics") or {}


def fetch_insider_net_pct(ticker):
    """Net shares purchased (sold) as % of shares, from yfinance. None on failure."""
    import yfinance as yf
    try:
        df = yf.Ticker(ticker).insider_purchases
        if df is None or df.empty:
            return None
        # Row label contains '% Net Shares Purchased (Sold)'; first value column.
        for idx in df.index:
            label = str(df.loc[idx].iloc[0]) if df.shape[1] > 1 else str(idx)
            if "% net shares purchased" in str(idx).lower() or "% net shares purchased" in label.lower():
                row = df.loc[idx]
                for v in row:
                    try:
                        # yfinance reports this row in percent units (0.36 = 0.36%)
                        return float(v) / 100.0
                    except (TypeError, ValueError):
                        continue
        # Fallback: column-style frames {'Insider Purchases Last 6m': ..., 'Shares': ...}
        return None
    except Exception:
        return None


def informed_demand(insider_net, short_delta, short_pct):
    """Jiao-Massa style: insiders buying while shorts retreat = +1; the reverse = -1."""
    if insider_net is None:
        return 0
    shorts_rising = short_delta is not None and short_delta > 0.005
    shorts_falling = short_delta is not None and short_delta < -0.005
    if insider_net >= INSIDER_BUY_THRESHOLD and not shorts_rising:
        return 1
    if insider_net <= INSIDER_SELL_THRESHOLD and (shorts_rising or (short_pct or 0) > 0.10):
        return -1
    return 0


def parse_gpr_response(text):
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return None
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    level = data.get("gpr_level")
    if not isinstance(level, int) or not 0 <= level <= 3:
        return None
    channels = [c for c in (data.get("channels") or []) if c in GPR_CHANNELS]
    note = str(data.get("note") or "")[:140]
    return {"gpr_level": level, "channels": channels, "note": note}


def main():
    parser = argparse.ArgumentParser(description="Fetch Stage-4 overlay signals (informed demand + GPR).")
    parser.add_argument("--apply", action="store_true", help="Fetch and write (default: dry-run).")
    parser.add_argument("--max-calls", type=int, default=200, help="Max API calls (yfinance + DeepSeek combined).")
    parser.add_argument("--skip-gpr", action="store_true", help="Tier 1 only (no DeepSeek).")
    args = parser.parse_args()

    factor = (load_json(FACTOR_SCORES_JSON, {}) or {}).get("tickers", {})
    eligible = sorted(t for t, e in factor.items() if e.get("fct_band") in ELIGIBLE_BANDS)
    stocks = {s["symbol"]: s for s in load_json(STOCKS_JSON, []) if s.get("symbol")}
    previous = (load_json(OUT_JSON, {}) or {}).get("tickers", {})

    print(f"Eligible (research_now + watchlist): {len(eligible)} | previous entries: {len(previous)}")
    if not args.apply:
        print("DRY-RUN — no API calls. Re-run with --apply.")
        return

    deepseek_client = None
    model = None
    if not args.skip_gpr:
        load_dotenv()
        api_key = os.environ.get("DEEPSEEK_API_KEY")
        if not api_key:
            print("WARNING: DEEPSEEK_API_KEY missing — running Tier 1 only.")
            args.skip_gpr = True
        else:
            from openai import OpenAI
            deepseek_client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")
            model = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")

    calls = 0
    results = {}
    gpr_fetched = 0
    gpr_carried = 0

    for t in eligible:
        prev = previous.get(t) or {}
        cm = read_calculated_metrics(t)
        short_pct = cm.get("Short_Percent_Float")
        inst_pct = cm.get("Held_Percent_Institutions")
        prev_short = prev.get("short_pct")
        short_delta = (short_pct - prev_short) if (
            isinstance(short_pct, (int, float)) and isinstance(prev_short, (int, float))) else None

        insider_net = None
        if calls < args.max_calls:
            insider_net = fetch_insider_net_pct(t)
            calls += 1
            time.sleep(RATE_LIMIT_SECONDS)

        entry = {
            "insider_net_pct": round(insider_net, 4) if insider_net is not None else None,
            "short_pct": short_pct,
            "short_delta": round(short_delta, 4) if short_delta is not None else None,
            "inst_pct": inst_pct,
            "informed_demand": informed_demand(insider_net, short_delta, short_pct),
        }

        # GPR: fetch when budget allows, otherwise carry forward (slow-moving)
        gpr = prev.get("gpr")
        if not args.skip_gpr and calls < args.max_calls:
            stock = stocks.get(t) or {}
            description = (stock.get("description") or "")[:1200]
            if description:
                prompt = GPR_PROMPT.format(
                    name=stock.get("name") or t, sector=stock.get("sector") or "?",
                    industry=stock.get("industry") or "?", description=description)
                try:
                    response = deepseek_client.chat.completions.create(
                        model=model, messages=[{"role": "user", "content": prompt}],
                        temperature=0.1, max_tokens=200)
                    parsed = parse_gpr_response(response.choices[0].message.content or "")
                    if parsed:
                        gpr = parsed
                        gpr["fetched_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
                        gpr_fetched += 1
                except Exception as e:
                    print(f"  {t}: GPR call failed ({e}); carrying previous", file=sys.stderr)
                calls += 1
                time.sleep(RATE_LIMIT_SECONDS)
        elif gpr:
            gpr_carried += 1
        entry["gpr"] = gpr
        results[t] = entry

    # Keep previous entries for names that dropped out of the bands (stale but labeled)
    for t, prev in previous.items():
        if t not in results:
            results[t] = {**prev, "stale": True}

    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "_note": ("Stage-4 overlay: veto/sizing/confirmation only, never additive alpha. "
                  "informed_demand: +1 insider buying w/o rising shorts, -1 insider selling "
                  "w/ rising or high shorts. gpr_level: 0-3 LLM-tagged exposure (slow-moving; "
                  "carried forward when call budget exhausted)."),
        "tickers": {t: results[t] for t in sorted(results)},
    }
    OUT_JSON.write_text(json.dumps(payload, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    demand_counts = {}
    for e in results.values():
        d = e.get("informed_demand")
        demand_counts[d] = demand_counts.get(d, 0) + 1
    print(f"Written: {OUT_JSON.name} | {len(results)} tickers | calls used: {calls}")
    print(f"informed_demand counts: {demand_counts} | GPR fetched: {gpr_fetched}, carried: {gpr_carried}")


if __name__ == "__main__":
    main()

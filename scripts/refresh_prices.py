"""refresh_prices.py — overlay LIVE yfinance prices onto stocks.json.

Why this exists: the bulk fetch's price source (defeatbeta) is a once-daily EOD
mirror — every price it serves is yesterday's close, and when its single
maintainer skips a publish the whole pipeline falls back to a multi-hour legacy
scan. This script makes price freshness independent of that: batched
yf.download for the entire universe (~14 requests for ~7k names, minutes, far
below the per-ticker .info load that used to hit Yahoo's throttle).

Two call sites:
  * after fetch_data.py in the post-open fetch  -> bands score on intraday prices
  * alone in the post-close price-refresh run   -> bands, ledger marks and the
    RS2 review all see the actual closing prices

ATOMIC BY DESIGN: cross-sectional percentile ranks only distort when price
timestamps MIX, so this either overlays >= MIN_COVERAGE of the universe or
changes nothing at all. A partial overlay is worse than a stale-but-consistent
snapshot and never happens.

Updates per symbol: price, marketCap (scaled by price ratio — avoids share-count
drift), and the last monthlyCloses point (momentum's live tail; earlier points
are dividend-adjusted history and are left alone).

Usage:
    python scripts/refresh_prices.py           # overlay onto public/data/stocks.json
    python scripts/refresh_prices.py --dry-run # fetch + report coverage, write nothing
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[1]
STOCKS_JSON = ROOT / "public" / "data" / "stocks.json"

CHUNK = 250          # tickers per yf.download call
MIN_COVERAGE = 0.90  # below this the overlay aborts and the file is untouched

# Yahoo rate-limits BURSTS, not volume: threads=True fires one HTTP request per
# ticker as fast as possible and dies with YFRateLimitError within a few hundred
# names (observed: 498/500 failed). The legacy fetch path sustains ~145 req/min
# sequentially for 90+ minutes without complaint, so this fetcher is paced:
# sequential downloads, a pause between chunks, and exponential backoff when the
# limiter still objects. Whole universe ≈ 45-55 min — fine for both call sites.
CHUNK_PAUSE = 2.0    # seconds between chunks
BACKOFFS = (60, 180, 420)  # seconds to wait after a rate-limited chunk


def num(v):
    return v if isinstance(v, (int, float)) and math.isfinite(v) and v > 0 else None


def _is_rate_limit(exc: Exception) -> bool:
    s = f"{type(exc).__name__}: {exc}"
    return "RateLimit" in s or "Too Many Requests" in s or "429" in s


def fetch_live_prices(symbols: list[str]) -> dict[str, float]:
    """Paced last-close prices. Returns {symbol: price} for every hit."""
    import yfinance as yf
    out: dict[str, float] = {}
    n_chunks = (len(symbols) - 1) // CHUNK + 1
    for i in range(0, len(symbols), CHUNK):
        chunk = symbols[i:i + CHUNK]
        got = 0
        for attempt in range(len(BACKOFFS) + 1):
            try:
                df = yf.download(" ".join(chunk), period="5d", interval="1d",
                                 auto_adjust=False, progress=False, threads=False)
                closes = df["Close"] if "Close" in df else df
                if hasattr(closes, "columns"):        # multi-ticker frame
                    for sym in closes.columns:
                        col = closes[sym].dropna()
                        p = num(float(col.iloc[-1])) if len(col) else None
                        if p:
                            out[str(sym)] = p
                            got += 1
                elif len(chunk) == 1:                  # single-ticker series
                    col = closes.dropna()
                    p = num(float(col.iloc[-1])) if len(col) else None
                    if p:
                        out[chunk[0]] = p
                        got = 1
                # a chunk that "succeeds" but prices almost nothing is a silent
                # rate-limit (yfinance eats per-ticker errors) — back off and retry
                if got < len(chunk) * 0.5 and attempt < len(BACKOFFS):
                    print(f"  chunk {i // CHUNK + 1}: only {got}/{len(chunk)} priced — "
                          f"treating as rate-limit, backing off {BACKOFFS[attempt]}s")
                    time.sleep(BACKOFFS[attempt])
                    continue
                break
            except Exception as e:
                if _is_rate_limit(e) and attempt < len(BACKOFFS):
                    print(f"  chunk {i // CHUNK + 1}: rate-limited, "
                          f"backing off {BACKOFFS[attempt]}s")
                    time.sleep(BACKOFFS[attempt])
                    continue
                print(f"  chunk {i // CHUNK + 1}: failed: {e}", file=sys.stderr)
                break
        print(f"  chunk {i // CHUNK + 1}/{n_chunks}: cumulative {len(out)} priced")
        time.sleep(CHUNK_PAUSE)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--dry-run", action="store_true", help="report coverage, write nothing")
    ap.add_argument("--stocks-json", default=None, help="override path (testing)")
    args = ap.parse_args()

    path = Path(args.stocks_json) if args.stocks_json else STOCKS_JSON
    rows = json.loads(path.read_text(encoding="utf-8"))
    symbols = [r["symbol"] for r in rows if isinstance(r, dict) and r.get("symbol")]
    print(f"universe: {len(symbols)} symbols from {path.name}")

    live = fetch_live_prices(symbols)
    coverage = len(live) / len(symbols) if symbols else 0
    print(f"live prices: {len(live)} / {len(symbols)} ({coverage:.1%})")

    if coverage < MIN_COVERAGE:
        # A partial overlay would mix price timestamps across the cross-section
        # and tilt every percentile rank. Keep the consistent snapshot instead.
        print(f"ABORT: coverage {coverage:.1%} < {MIN_COVERAGE:.0%} — "
              f"stocks.json left untouched (consistent snapshot preserved)")
        sys.exit(3)

    if args.dry_run:
        sample = [(s, live[s]) for s in list(live)[:5]]
        print(f"dry run — no write. sample: {sample}")
        return

    updated = big_moves = 0
    for r in rows:
        sym = r.get("symbol") if isinstance(r, dict) else None
        p_new = live.get(sym)
        if not p_new:
            continue
        p_old = num(r.get("price"))
        r["price"] = round(p_new, 4)
        if p_old:
            ratio = p_new / p_old
            if abs(ratio - 1) > 0.25:
                big_moves += 1   # logged; big single-day moves are rare but real
            mc = num(r.get("marketCap"))
            if mc:
                r["marketCap"] = round(mc * ratio)
        closes = (r.get("metrics") or {}).get("monthlyCloses")
        if isinstance(closes, list) and closes:
            closes[-1] = round(p_new, 4)   # live tail; adjusted history untouched
        updated += 1

    meta = {"price_refresh_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "price_refresh_coverage": round(coverage, 4)}
    # stocks.json is a bare list; stash the marker on the first row's namespace-safe key
    if rows and isinstance(rows[0], dict):
        rows[0].setdefault("_meta", {}).update(meta)

    path.write_text(json.dumps(rows, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {path.name}: {updated} prices overlaid, "
          f"{big_moves} moved >25% (check if unusually many)")


if __name__ == "__main__":
    main()

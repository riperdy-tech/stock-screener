"""backfill_last_listed.py — one-time seed of last_listed for records that predate stamping.

Why: stocks.json records written before the listing-reconciliation code landed have
last_listed=None, and tradability.days_unlisted() correctly treats None as "unknown,
not evidence" — so a name that left the exchange BEFORE stamping existed (MASI:
delisted 2026-06-10, record frozen 2026-06-11) is invisible to the automatic veto
forever. fetch_data.py's own bootstrap (the `elif not rec.get('last_listed')` branch
of listing reconciliation) seeds exactly these records on its next completed run;
this script is a faithful pre-run of that same logic so the operator can (a) see the
outcome before it lands and (b) apply it now instead of after the next multi-hour scan.

Semantics — identical to fetch_data.py reconciliation, applied only to never-stamped
records (records that already carry last_listed are never touched):
  * in today's live NASDAQ/NYSE/AMEX listing  -> last_listed = today
  * absent from the listing                   -> last_listed = Last_Updated[:10],
                                                 failing that today (never vetoed on ignorance)
  * listing fetch below MIN_LISTING_SIZE      -> refuse to do anything (same guard)

    python scripts/backfill_last_listed.py            # dry run: report only
    python scripts/backfill_last_listed.py --apply    # write stocks.json (backup kept)

Dry run also simulates tradability.scan() on the post-backfill universe and reports
the resulting veto count against the MAX_UNLISTED_SHARE circuit breaker.
"""
import argparse
import json
import shutil
import sys
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tradability

REPO = Path(__file__).resolve().parents[1]
STOCKS = REPO / "public" / "data" / "stocks.json"
MIN_LISTING_SIZE = 5000     # same guard as fetch_data.py


def live_listing():
    """Today's NASDAQ/NYSE/AMEX symbols, normalized exactly like fetch_data.get_fdr_tickers."""
    import FinanceDataReader as fdr
    import pandas as pd
    frames = [fdr.StockListing(x) for x in ("NASDAQ", "NYSE", "AMEX")]
    df = pd.concat(frames).drop_duplicates(subset=["Symbol"])
    out = set()
    for t in df["Symbol"].tolist():
        t = str(t)
        if " " in t or "-PR" in t or ".PR" in t or "-WS" in t or ".WS" in t:
            continue
        out.add(t.replace(".", "-"))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write stocks.json (default: report only)")
    args = ap.parse_args()

    data = json.loads(STOCKS.read_text(encoding="utf-8"))
    stocks = {r["symbol"]: r for r in data}
    unstamped = {s: r for s, r in stocks.items() if not r.get("last_listed")}
    print(f"records: {len(stocks)} | never stamped (last_listed missing): {len(unstamped)}")
    if not unstamped:
        print("nothing to do.")
        return 0

    listed = live_listing()
    print(f"live listing: {len(listed)} symbols")
    if len(listed) < MIN_LISTING_SIZE:
        print(f"REFUSING: listing fetch returned {len(listed)} (< {MIN_LISTING_SIZE}) — "
              "a truncated feed would seed old dates for listed names.")
        return 1

    today_str = date.today().strftime("%Y-%m-%d")
    proposals = {}          # symbol -> stamp
    for sym, rec in unstamped.items():
        if sym in listed:
            proposals[sym] = today_str
        else:
            proposals[sym] = (rec.get("Last_Updated") or "")[:10] or today_str

    stamped_today = sorted(s for s, d in proposals.items() if s in listed)
    seeded_absent = sorted(s for s in proposals if s not in listed)
    print(f"in listing -> stamp today          : {len(stamped_today)}")
    print(f"absent     -> seed from Last_Updated: {len(seeded_absent)}")

    # simulate the post-backfill tradability sweep
    sim = {s: dict(r) for s, r in stocks.items()}
    for sym, stamp in proposals.items():
        sim[sym]["last_listed"] = stamp
    cfg = tradability.load_config()
    vetoes, note = tradability.scan(sim, cfg)
    share = sum(1 for v in vetoes.values() if "absent from the exchange listing" in v) / max(len(sim), 1)
    print(f"post-backfill tradability: {note}")
    print(f"unlisted share {share:.1%} vs circuit breaker {tradability.MAX_UNLISTED_SHARE:.0%}")
    newly = sorted(s for s in vetoes if s in proposals)
    print(f"\nnames the backfill newly exposes to the automatic veto ({len(newly)}):")
    for s in newly:
        gone = tradability.days_unlisted(sim[s], date.today())
        print(f"  {s:8s} last_listed {sim[s]['last_listed']}  ({gone}d absent)  Last_Updated {str(stocks[s].get('Last_Updated'))[:10]}")

    if not args.apply:
        print("\nDRY RUN — nothing written. Re-run with --apply to stamp.")
        return 0

    bak = STOCKS.with_name(f"stocks.json.bak-{datetime.now().strftime('%Y%m%d_%H%M%S')}")
    shutil.copy2(STOCKS, bak)
    for sym, stamp in proposals.items():
        stocks[sym]["last_listed"] = stamp
    STOCKS.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"\nAPPLIED: {len(proposals)} records stamped. Backup: {bak.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

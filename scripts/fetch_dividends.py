"""fetch_dividends.py — ex-dividend calendar for the paper-ledger total-return model.

track_paper_portfolios.py credits holders on the ex-date (Approach B), so NAV
reflects dividends actually earned during a holding — honoring churn (a name only
in the ledger briefly earns a dividend only if an ex-date falls in that window).

Pulls each covered ticker's dividend history (yfinance) and writes ex-date +
per-share amount. Self-throttles: skips if dividends.json is younger than
THROTTLE_DAYS, so it can sit in the daily workflow yet only do real work weekly
(dividends change slowly and ex-dates are known well in advance).

Output: public/data/dividends.json
    {"fetched_at": iso, "ex_date_cutoff": "YYYY-MM-DD",
     "tickers": {TICKER: [[ex_date, per_share_amount], ...]}}
Usage: python scripts/fetch_dividends.py [--force]
"""

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"
STOCKS_JSON = DATA / "stocks.json"
OUT = DATA / "dividends.json"

THROTTLE_DAYS = 6
EX_DATE_CUTOFF = "2025-01-01"  # ledger inception is 2026-06; keep the file small


def is_fresh():
    if not OUT.exists():
        return False
    try:
        prev = json.loads(OUT.read_text(encoding="utf-8"))
        ts = prev.get("fetched_at")
        if not ts:
            return False
        age = datetime.now(timezone.utc) - datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return age < timedelta(days=THROTTLE_DAYS)
    except Exception:
        return False


def yf_dividends(symbols):
    """Per-ticker yfinance dividend pull (1 request each)."""
    try:
        import yfinance as yf
    except Exception as e:
        print(f"yfinance unavailable: {e}", file=sys.stderr)
        return {}
    out = {}
    for i, t in enumerate(symbols):
        try:
            divs = yf.Ticker(t).dividends
            rows = []
            for idx, amt in divs.items():
                d = idx.date().isoformat() if hasattr(idx, "date") else str(idx)[:10]
                if d >= EX_DATE_CUTOFF and amt and float(amt) > 0:
                    rows.append([d, round(float(amt), 6)])
            if rows:
                out[t] = rows
        except Exception as e:
            print(f"  {t} dividends failed: {e}", file=sys.stderr)
        if (i + 1) % 50 == 0:
            print(f"  ...{i + 1}/{len(symbols)}")
    return out


def main():
    force = "--force" in sys.argv

    stocks = json.loads(STOCKS_JSON.read_text(encoding="utf-8")) if STOCKS_JSON.exists() else []
    symbols = sorted({s["symbol"] for s in stocks if s.get("symbol")})

    # DEFEATBETA FIRST: one 0.7MB parquet replaces ~6.7k per-ticker Yahoo
    # requests (values verified identical — same Yahoo data). Cheap enough to
    # run daily, so the weekly throttle only applies to the yfinance fallback.
    # Foreign ADRs the dataset misses (~25: SONY, HMC, MUFG, ...) are topped up
    # per-ticker from yfinance, keyed off the previous file's payer list.
    out = None
    source = "defeatbeta"
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import defeatbeta_source
        out = defeatbeta_source.load_dividends(EX_DATE_CUTOFF, universe=symbols)
    except Exception as e:
        print(f"defeatbeta dividends unavailable: {e}", file=sys.stderr)
    if out is not None:
        prev_payers = set()
        try:
            prev_payers = set(json.loads(OUT.read_text(encoding="utf-8")).get("tickers", {}))
        except Exception:
            pass
        topup = sorted((prev_payers & set(symbols)) - set(out))
        if topup:
            print(f"topping up {len(topup)} dataset-missing payers via yfinance...")
            out.update(yf_dividends(topup))
    else:
        # LEGACY: full per-ticker sweep — expensive, keep the weekly throttle
        source = "yfinance"
        if not force and is_fresh():
            print(f"dividends.json fresh (< {THROTTLE_DAYS}d) — skip. Use --force to refetch.")
            return
        out = yf_dividends(symbols)

    payload = {
        "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "ex_date_cutoff": EX_DATE_CUTOFF,
        "source": source,
        "tickers": out,
    }
    OUT.write_text(json.dumps(payload, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print(f"dividends[{source}]: {len(out)}/{len(symbols)} tickers paid since {EX_DATE_CUTOFF} -> {OUT.name}")


if __name__ == "__main__":
    main()

"""
fetch_analyst_targets.py -- analysts' price targets as a daily, display-only yardstick (WO_ST1).

Writes public/data/analyst_targets.json. Nothing scores from this file: analyst_coverage.json
(weekly, feeds the score) is untouched.

Which names, each run:
  LIST  every research_now / watchlist name of factor_scores.json (fct_band, the field
        track_paper_portfolios.py reads), when its entry is absent or older than 20 hours.
  REST  every other name that passed the safety screen (fct_band != "vetoed" in factor_scores.json,
        the names the front page counts as scored_count) and is in stocks.json, when its entry is
        absent or older than 7 days; absent first, then oldest; at most --max-calls of them.
A name Yahoo has no target for is stored with four nulls and its fetched_at, so it is not asked
again inside its window. A name whose call fails keeps its previous entry. An empty answer for a name
that has a stored target counts as a failed call (Yahoo throttles with empty answers): the stored
target and its date stay. Entries of names that
left both sets are kept.

Usage:
    python scripts/fetch_analyst_targets.py --dry-run
    python scripts/fetch_analyst_targets.py [--max-calls 500] [--only T1,T2,T3]
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_analyst_coverage import safe_get_price_target  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"
STOCKS_JSON = DATA_DIR / "stocks.json"
FACTOR_SCORES_JSON = DATA_DIR / "factor_scores.json"
TARGETS_JSON = DATA_DIR / "analyst_targets.json"

SCHEMA = "analyst_targets_v1"
SOURCE = "Yahoo consensus via yfinance"
LIST_BANDS = ("research_now", "watchlist")
LIST_MAX_AGE = timedelta(hours=20)
REST_MAX_AGE = timedelta(days=7)
DEFAULT_MAX_CALLS = 500
CALL_PAUSE_S = 0.25
FIGURES = ("mean", "median", "high", "low")


def utc_iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(text):
    try:
        return datetime.strptime(text, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def load_json(path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json_atomic(path, payload):
    """Write to a temp file beside the target, then replace it: a reader never sees half a file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, sort_keys=True)
        f.write("\n")
    os.replace(tmp, path)


def yahoo_fetch(ticker):
    """The four figures for one name. Raises on a failed call; a name with no target returns
    four Nones. (safe_get_price_target swallows exceptions, which would turn a throttled call
    into a stored null, so the attribute is read here and handed to it already fetched.)"""
    import yfinance as yf
    pt = yf.Ticker(ticker).analyst_price_targets
    got = safe_get_price_target(SimpleNamespace(analyst_price_targets=pt), keys=FIGURES)
    return {k: got.get(k) for k in FIGURES}


def select_names(factor_tickers, stock_symbols, entries, now, max_calls):
    """(list_names, rest_names, fresh_count). See the module docstring."""
    def fetched_at(t):
        e = entries.get(t)
        return parse_iso(e.get("fetched_at")) if isinstance(e, dict) else None

    fresh = 0
    on_list = {t for t, e in factor_tickers.items() if e.get("fct_band") in LIST_BANDS}
    list_names = []
    for t in sorted(on_list):
        at = fetched_at(t)
        if at is None or now - at > LIST_MAX_AGE:
            list_names.append(t)
        else:
            fresh += 1
    due = []
    for t in sorted(set(stock_symbols)):
        e = factor_tickers.get(t)
        if e is None or e.get("fct_band") == "vetoed" or t in on_list:
            continue
        at = fetched_at(t)
        if at is None:
            due.append((0, "", t))
        elif now - at > REST_MAX_AGE:
            due.append((1, utc_iso(at), t))
        else:
            fresh += 1
    due.sort()
    return list_names, [t for _, _, t in due[:max_calls]], fresh


def run(factor_tickers, stock_symbols, payload, now, fetch, max_calls=DEFAULT_MAX_CALLS,
        only=None, pause=CALL_PAUSE_S, dry_run=False):
    """Fetch the due names into payload["tickers"]. Returns (list_fetched, rest_fetched, failed, fresh)."""
    entries = payload.setdefault("tickers", {})
    list_names, rest_names, fresh = select_names(factor_tickers, stock_symbols, entries, now, max_calls)
    if only:
        list_names = [t for t in list_names if t in only]
        rest_names = [t for t in rest_names if t in only]
    if dry_run:
        for label, names in (("list", list_names), ("rest", rest_names)):
            print(f"WOULD fetch {len(names)} {label} names: {', '.join(names[:20])}"
                  f"{' ...' if len(names) > 20 else ''}")
        return 0, 0, 0, fresh
    done = {"list": 0, "rest": 0}
    failed = 0
    for group, names in (("list", list_names), ("rest", rest_names)):
        for t in names:
            try:
                got = fetch(t)
                entry = {k: got.get(k) for k in FIGURES}
                old = entries.get(t)
                if all(v is None for v in entry.values()) and isinstance(old, dict) and old.get("mean") is not None:
                    # Yahoo answers a throttled call with nothing, not an error: an empty answer never wipes a target we hold
                    raise ValueError("empty answer for a name that has a stored target; the stored one is kept")
                entry["fetched_at"] = utc_iso(datetime.now(timezone.utc))
            except Exception as exc:
                failed += 1
                print(f"  FAIL {t}: {type(exc).__name__}: {str(exc)[:120]}")
                continue
            entries[t] = entry
            done[group] += 1
            if pause:
                time.sleep(pause)
    return done["list"], done["rest"], failed, fresh


def main():
    parser = argparse.ArgumentParser(description="Daily analyst price targets (display only).")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be fetched; write nothing.")
    parser.add_argument("--max-calls", type=int, default=DEFAULT_MAX_CALLS,
                        help=f"Cap on the REST names per run (default {DEFAULT_MAX_CALLS}); the list is never capped.")
    parser.add_argument("--only", type=str, default=None, help="Comma-separated tickers: fetch only these (if due).")
    args = parser.parse_args()

    factor_tickers = load_json(FACTOR_SCORES_JSON)["tickers"]
    stock_symbols = [s["symbol"] for s in load_json(STOCKS_JSON) if s.get("symbol")]
    payload = load_json(TARGETS_JSON) if TARGETS_JSON.exists() else {}
    only = {t.strip().upper() for t in args.only.split(",") if t.strip()} if args.only else None

    now = datetime.now(timezone.utc)
    nl, nr, failed, fresh = run(factor_tickers, stock_symbols, payload, now, yahoo_fetch,
                                max_calls=args.max_calls, only=only, dry_run=args.dry_run)
    print(f"analyst_targets: list fetched {nl}, rest fetched {nr}, failed {failed}, skipped as fresh {fresh}")
    if args.dry_run:
        return
    payload.update({"schema": SCHEMA, "generated_at": utc_iso(now), "source": SOURCE})
    write_json_atomic(TARGETS_JSON, payload)


if __name__ == "__main__":
    main()

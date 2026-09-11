#!/usr/bin/env python3
"""
Extend the graded verdict-outcome dataset using only cached prices.

Reads:
  - public/data/rs2_verdict_log.jsonl   (2240 verdict rows)
  - public/data/outcome_price_cache.json (cached closes per ticker, incl. IWM/SPY/QQQ)
  - public/data/rs2_verdict_outcomes.json (existing graded rows, for schema + dedup)

Writes (new file only, never touches existing repo files):
  - public/data/rs2_verdict_outcomes_extended.json

Methodology (must match the existing file's documented caveat exactly):
  "Entry = first close on/after verdict date; exit = last close on/before
   date+h; benchmarks use the same actual dates."

For each verdict row and each horizon h in {30, 60}:
  1. entry_date = earliest date in the ticker's cache that is >= verdict date,
     searching forward up to 7 calendar days. If none found, skip this ticker
     entirely (both horizons).
  2. exit_date = latest date in the ticker's cache that is <= date + h days.
     If that resolves to <= entry_date, skip this horizon.
  3. return_pct = (close[exit_date] / close[entry_date] - 1) * 100
  4. For each benchmark B in {IWM, SPY, QQQ}: compute B's return over the same
     two actual dates. If either date is missing from B's series, use B's
     nearest available date within 3 calendar days; if still missing, that
     benchmark's excess is null for this row.
  5. excess_X_pct = return_pct - benchmark_return_pct (or null)

Output rows are de-duplicated on (ticker, date, horizon_days): when the same
(ticker, date) appears multiple times in the verdict log (re-run verdicts on
the same day), only the first (earliest logged, i.e. first in file order) is
graded, so the final sample doesn't get swamped by same-day re-runs of one
name. Pre-existing graded rows (from rs2_verdict_outcomes.json) are carried
through as-is (re-keyed the same way) and newly computed rows are added only
where that key isn't already covered.
"""

import json
import os
from datetime import date, timedelta

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(REPO_ROOT, "public", "data")

VERDICT_LOG_PATH = os.path.join(DATA_DIR, "rs2_verdict_log.jsonl")
PRICE_CACHE_PATH = os.path.join(DATA_DIR, "outcome_price_cache.json")
EXISTING_OUTCOMES_PATH = os.path.join(DATA_DIR, "rs2_verdict_outcomes.json")
OUTPUT_PATH = os.path.join(DATA_DIR, "rs2_verdict_outcomes_extended.json")

BENCHMARKS = ["IWM", "SPY", "QQQ"]
HORIZONS = [30, 60]

CARRY_FIELDS = [
    "ticker",
    "date",
    "conviction",
    "conviction_scale",
    "stance",
    "band_at_analysis",
    "action_family",
    "raw_action_family",
    "research_cited",
    "repatched",
    "brake_applied",
    "entry_timing",
    "exit_review",
    "recommended_weight_pct",
    "report",
]


def parse_date(s):
    y, m, d = s.split("-")
    return date(int(y), int(m), int(d))


def fmt_date(d):
    return d.isoformat()


def load_verdict_log(path):
    rows = []
    with open(path, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def find_entry_date(series_dates_sorted, verdict_date):
    """Earliest date >= verdict_date, searching forward up to 7 calendar days."""
    limit = verdict_date + timedelta(days=7)
    for d in series_dates_sorted:
        if verdict_date <= d <= limit:
            return d
        if d > limit:
            break
    return None


def find_exit_date(series_dates_sorted, target_date):
    """Latest date <= target_date."""
    best = None
    for d in series_dates_sorted:
        if d <= target_date:
            best = d
        else:
            break
    return best


def nearest_within(series_dict_dates_sorted, target_date, window_days=3):
    """Nearest date to target_date within window_days (inclusive), or None."""
    best = None
    best_diff = None
    for d in series_dict_dates_sorted:
        diff = abs((d - target_date).days)
        if diff > window_days:
            continue
        if best_diff is None or diff < best_diff:
            best_diff = diff
            best = d
    return best


def benchmark_return(bench_cache, bench_dates_sorted, entry_date, exit_date):
    """Return benchmark's % return between entry_date and exit_date (same
    actual dates as the ticker), with nearest-within-3-days fallback for
    each endpoint. Returns None if either endpoint can't be resolved."""
    e = entry_date if fmt_date(entry_date) in bench_cache else nearest_within(
        bench_dates_sorted, entry_date
    )
    x = exit_date if fmt_date(exit_date) in bench_cache else nearest_within(
        bench_dates_sorted, exit_date
    )
    if e is None or x is None:
        return None
    e_close = bench_cache.get(fmt_date(e))
    x_close = bench_cache.get(fmt_date(x))
    if e_close is None or x_close is None:
        return None
    return (x_close / e_close - 1) * 100


def build_row(verdict, entry_date, exit_date, return_pct, excess, horizon_days):
    row = {}
    for field in CARRY_FIELDS:
        row[field] = verdict.get(field)
    row["entry_date"] = fmt_date(entry_date)
    row["exit_date"] = fmt_date(exit_date)
    row["horizon_days"] = horizon_days
    row["return_pct"] = round(return_pct, 2)
    for b in BENCHMARKS:
        key = f"excess_{b.lower()}_pct"
        row[key] = round(excess[b], 2) if excess[b] is not None else None
    return row


def main():
    verdict_rows = load_verdict_log(VERDICT_LOG_PATH)

    with open(PRICE_CACHE_PATH, "r") as f:
        price_cache_raw = json.load(f)

    # Pre-parse each ticker's series into sorted date objects + date->close map.
    price_cache = {}
    for ticker, series in price_cache_raw.items():
        dates_sorted = sorted(parse_date(d) for d in series.keys())
        price_cache[ticker] = {"closes": series, "dates_sorted": dates_sorted}

    bench_info = {}
    for b in BENCHMARKS:
        if b not in price_cache:
            raise RuntimeError(f"Benchmark {b} missing from price cache")
        bench_info[b] = price_cache[b]

    with open(EXISTING_OUTCOMES_PATH, "r") as f:
        existing = json.load(f)
    existing_graded = existing["graded"]

    # Re-key existing graded rows on (ticker, date, horizon_days) and carry
    # them through unchanged, except we backfill conviction_scale by looking
    # it up from the verdict log via the unique `report` id (the existing
    # schema predates conviction_scale being tracked).
    report_to_conviction_scale = {r["report"]: r.get("conviction_scale") for r in verdict_rows}

    existing_keys = set()
    combined_rows = []
    for row in existing_graded:
        key = (row["ticker"], row["date"], row["horizon_days"])
        existing_keys.add(key)
        new_row = dict(row)
        if "conviction_scale" not in new_row:
            new_row["conviction_scale"] = report_to_conviction_scale.get(row.get("report"))
        combined_rows.append(new_row)

    # Dedup verdict log rows on (ticker, date): keep first occurrence
    # (file order == chronological by date; ties broken by original order).
    seen_ticker_date = set()
    deduped_verdicts = []
    for v in verdict_rows:
        key = (v["ticker"], v["date"])
        if key in seen_ticker_date:
            continue
        seen_ticker_date.add(key)
        deduped_verdicts.append(v)

    skipped_no_ticker = 0
    skipped_no_entry = 0
    skipped_no_exit = {30: 0, 60: 0}
    new_rows = []
    new_dates_seen = []

    for v in deduped_verdicts:
        ticker = v["ticker"]
        if ticker not in price_cache:
            skipped_no_ticker += 1
            continue
        series = price_cache[ticker]
        verdict_date = parse_date(v["date"])
        entry_date = find_entry_date(series["dates_sorted"], verdict_date)
        if entry_date is None:
            skipped_no_entry += 1
            continue

        for h in HORIZONS:
            key = (ticker, v["date"], h)
            if key in existing_keys:
                continue  # already covered by pre-existing graded rows

            target = verdict_date + timedelta(days=h)
            exit_date = find_exit_date(series["dates_sorted"], target)
            if exit_date is None or exit_date <= entry_date:
                skipped_no_exit[h] += 1
                continue

            entry_close = series["closes"][fmt_date(entry_date)]
            exit_close = series["closes"][fmt_date(exit_date)]
            return_pct = (exit_close / entry_close - 1) * 100

            excess = {}
            for b in BENCHMARKS:
                bench_ret = benchmark_return(
                    bench_info[b]["closes"], bench_info[b]["dates_sorted"], entry_date, exit_date
                )
                excess[b] = (return_pct - bench_ret) if bench_ret is not None else None

            row = build_row(v, entry_date, exit_date, return_pct, excess, h)
            new_rows.append(row)
            existing_keys.add(key)  # guard against dup within this same run
            new_dates_seen.append(v["date"])

    combined_rows.extend(new_rows)

    # Provenance / summary counts.
    def horizon_count(rows, h):
        return sum(1 for r in rows if r["horizon_days"] == h)

    all_dates = [r["date"] for r in combined_rows]
    new_by_horizon = {h: horizon_count(new_rows, h) for h in HORIZONS}
    total_by_horizon = {h: horizon_count(combined_rows, h) for h in HORIZONS}

    provenance = {
        "generated_by": "scripts/grade_verdicts_offline.py",
        "source_verdict_log_rows": len(verdict_rows),
        "source_verdict_log_unique_ticker_date": len(deduped_verdicts),
        "pre_existing_graded_rows_carried": len(existing_graded),
        "newly_graded_rows_added": len(new_rows),
        "newly_graded_rows_by_horizon": {str(h): new_by_horizon[h] for h in HORIZONS},
        "total_graded_rows_by_horizon": {str(h): total_by_horizon[h] for h in HORIZONS},
        "total_graded_rows": len(combined_rows),
        "skipped_ticker_not_in_price_cache": skipped_no_ticker,
        "skipped_no_entry_date_within_7d": skipped_no_entry,
        "skipped_no_valid_exit_date_by_horizon": {str(h): skipped_no_exit[h] for h in HORIZONS},
        "date_coverage_min": min(all_dates) if all_dates else None,
        "date_coverage_max": max(all_dates) if all_dates else None,
        "dedup_key": "ticker+date+horizon_days (same-day re-run verdicts on one ticker: first-in-file kept)",
        "price_cache_min_date": min(fmt_date(d) for d in bench_info["IWM"]["dates_sorted"]),
        "price_cache_max_date": max(fmt_date(d) for d in bench_info["IWM"]["dates_sorted"]),
    }

    output = dict(existing)  # carry forward benchmark_primary, benchmarks, caveats, etc.
    output["generated_at"] = "offline-extension (see provenance.generated_by)"
    output["graded"] = combined_rows
    output["graded_verdict_horizons"] = len(combined_rows)
    output["provenance"] = provenance
    # Drop stale aggregate fields computed for the smaller original sample;
    # they no longer describe this larger, combined dataset and recomputing
    # them is out of scope for this script (see the analysis reported
    # separately).
    for stale in ["per_horizon", "pending_verdict_horizons", "missing", "tickers_without_price_series"]:
        output.pop(stale, None)

    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)
        f.write("\n")

    print(json.dumps(provenance, indent=2))


if __name__ == "__main__":
    main()

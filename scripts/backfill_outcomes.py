"""backfill_outcomes.py — forward-return backfill for logged signals.

Closes the validation loop the audit found missing: the system logs paradigm
signals (paradigm_signal_log.jsonl) and reverse nominations
(reverse_nomination_log.jsonl) daily, but nothing ever measured whether those
cohorts made money. This script computes forward returns for each dated
cohort at standard horizons, relative to IWM (Russell 2000 proxy) and SPY,
and writes outcome_backfill.json + outcomes_report.md.

Honest-measurement rules:
- A cohort is only evaluated at a horizon once that horizon has fully elapsed.
- Tickers with no price at the horizon date (delisted/acquired/renamed) are
  NOT silently dropped: they are excluded from return stats but counted and
  reported, because survivorship silently flatters results.
- Success metric is excess return vs IWM (small-cap benchmark), not raw return.

Usage:
    python scripts/backfill_outcomes.py            # standard horizons
    python scripts/backfill_outcomes.py --min-horizon-days 7   # debug/smoke

Run cadence: weekly is plenty (nothing matures faster than the 1-month horizon).
"""

import argparse
import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"
SIGNAL_LOG = DATA / "paradigm_signal_log.jsonl"
NOMINATION_LOG = DATA / "reverse_nomination_log.jsonl"
PRICE_CACHE_JSON = DATA / "outcome_price_cache.json"
OUTCOMES_JSON = DATA / "outcome_backfill.json"
REPORT_MD = DATA / "outcomes_report.md"

BENCHMARKS = ["IWM", "SPY"]
HORIZON_DAYS = [30, 91, 182, 365]  # ~1m / 3m / 6m / 12m calendar horizons


def read_jsonl(path):
    rows = []
    if not path.exists():
        return rows
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return rows


def load_cohorts():
    """Return {snapshot_date: {"paradigm": {sym: row}, "reverse": [sym,...]}}."""
    cohorts = {}

    for row in read_jsonl(SIGNAL_LOG):
        snap = row.get("snapshot_date")
        sym = row.get("symbol")
        if not snap or not sym:
            continue
        entry = cohorts.setdefault(snap, {"paradigm": {}, "reverse": []})
        # Keep the latest row per (snapshot, symbol); duplicate runs for the
        # same snapshot date overwrite (re-runs supersede).
        entry["paradigm"][sym] = {
            "band": row.get("pdm_band"),
            "signal": row.get("pdm_signal"),
            "theme_primary": row.get("pdm_theme_primary"),
        }

    for row in read_jsonl(NOMINATION_LOG):
        snap = row.get("snapshot_date")
        if not snap:
            continue
        entry = cohorts.setdefault(snap, {"paradigm": {}, "reverse": []})
        entry["reverse"] = [n.get("symbol") for n in row.get("nominated", []) if n.get("symbol")]

    return cohorts


def load_price_cache():
    if PRICE_CACHE_JSON.exists():
        try:
            return json.loads(PRICE_CACHE_JSON.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
    return {}


def save_price_cache(cache):
    PRICE_CACHE_JSON.write_text(json.dumps(cache, sort_keys=True), encoding="utf-8")


def close_on_or_before(cache, ticker, target):
    """Last cached close on or up to 6 days before target date (str)."""
    days = cache.get(ticker)
    if not days:
        return None
    t = date.fromisoformat(target)
    for back in range(0, 7):
        key = (t - timedelta(days=back)).isoformat()
        if key in days:
            return days[key]
    return None


def fetch_closes(tickers, target, cache):
    """Fetch closes for tickers in a window ending at target date into cache."""
    missing = [t for t in tickers if close_on_or_before(cache, t, target) is None]
    if not missing:
        return
    t = date.fromisoformat(target)
    start = (t - timedelta(days=8)).isoformat()
    end = (t + timedelta(days=1)).isoformat()
    print(f"  fetching {len(missing)} tickers around {target} ...")
    df = yf.download(missing, start=start, end=end, interval="1d",
                     auto_adjust=True, progress=False, group_by="ticker", threads=True)
    if df is None or df.empty:
        return
    for ticker in missing:
        try:
            series = df[ticker]["Close"] if len(missing) > 1 else df["Close"]
        except (KeyError, TypeError):
            continue
        series = series.dropna()
        if series.empty:
            continue
        days = cache.setdefault(ticker, {})
        for idx, value in series.items():
            days[pd.Timestamp(idx).date().isoformat()] = round(float(value), 4)


def pct(n, d):
    return round(n / d * 100, 1) if d else None


def evaluate_cohort(symbols, meta_by_symbol, snap, horizon_target, cache, bench_returns):
    """Compute forward-return stats for one cohort at one horizon."""
    returns = []
    rows = []
    missing_start = 0
    missing_end = 0
    for sym in symbols:
        p0 = close_on_or_before(cache, sym, snap)
        p1 = close_on_or_before(cache, sym, horizon_target)
        if p0 is None or p0 == 0:
            missing_start += 1
            continue
        if p1 is None:
            missing_end += 1
            continue
        r = (p1 / p0) - 1.0
        returns.append(r)
        rows.append({"symbol": sym, "return_pct": round(r * 100, 2),
                     **(meta_by_symbol.get(sym) or {})})

    if not returns:
        return None

    s = pd.Series(returns)
    iwm = bench_returns.get("IWM")
    spy = bench_returns.get("SPY")
    stats = {
        "n_evaluated": len(returns),
        "n_missing_price_at_horizon": missing_end,
        "n_missing_price_at_start": missing_start,
        "mean_return_pct": round(float(s.mean()) * 100, 2),
        "median_return_pct": round(float(s.median()) * 100, 2),
        "worst_return_pct": round(float(s.min()) * 100, 2),
        "best_return_pct": round(float(s.max()) * 100, 2),
        "iwm_return_pct": round(iwm * 100, 2) if iwm is not None else None,
        "spy_return_pct": round(spy * 100, 2) if spy is not None else None,
        "pct_beat_iwm": pct(sum(1 for r in returns if iwm is not None and r > iwm), len(returns)) if iwm is not None else None,
        "mean_excess_vs_iwm_pct": round((float(s.mean()) - iwm) * 100, 2) if iwm is not None else None,
        "members": sorted(rows, key=lambda x: -x["return_pct"]),
    }
    return stats


def main():
    parser = argparse.ArgumentParser(description="Backfill forward returns for logged signal cohorts.")
    parser.add_argument("--min-horizon-days", type=int, default=None,
                        help="Debug: add a short horizon (e.g. 7) so mechanics can be verified before real horizons mature.")
    args = parser.parse_args()

    horizons = list(HORIZON_DAYS)
    if args.min_horizon_days:
        horizons = sorted(set([args.min_horizon_days] + horizons))

    cohorts = load_cohorts()
    if not cohorts:
        print("No logged cohorts found — nothing to evaluate.")
        return

    today = date.today()
    cache = load_price_cache()

    results = []
    pending = []
    for snap in sorted(cohorts):
        snap_d = date.fromisoformat(snap)
        entry = cohorts[snap]
        paradigm_syms = sorted(entry["paradigm"].keys())
        reverse_syms = sorted(set(entry["reverse"]))
        all_syms = sorted(set(paradigm_syms) | set(reverse_syms) | set(BENCHMARKS))

        for h in horizons:
            target_d = snap_d + timedelta(days=h)
            if target_d > today:
                pending.append({"snapshot_date": snap, "horizon_days": h,
                                "matures_on": target_d.isoformat()})
                continue
            target = target_d.isoformat()
            print(f"Cohort {snap} @ {h}d (target {target}): "
                  f"{len(paradigm_syms)} paradigm, {len(reverse_syms)} nominated")
            fetch_closes(all_syms, snap, cache)
            fetch_closes(all_syms, target, cache)

            bench_returns = {}
            for b in BENCHMARKS:
                b0 = close_on_or_before(cache, b, snap)
                b1 = close_on_or_before(cache, b, target)
                bench_returns[b] = (b1 / b0 - 1.0) if (b0 and b1) else None

            for source, syms in (("paradigm", paradigm_syms), ("reverse_nominated", reverse_syms)):
                if not syms:
                    continue
                stats = evaluate_cohort(syms, entry["paradigm"], snap, target, cache, bench_returns)
                if stats is None:
                    continue
                # Paradigm cohort: also slice by band
                by_band = {}
                if source == "paradigm":
                    for band in ("high", "mid", "watch"):
                        band_syms = [s for s in syms if (entry["paradigm"].get(s) or {}).get("band") == band]
                        if band_syms:
                            band_stats = evaluate_cohort(band_syms, entry["paradigm"], snap, target, cache, bench_returns)
                            if band_stats:
                                band_stats.pop("members", None)
                                by_band[band] = band_stats
                results.append({
                    "snapshot_date": snap,
                    "horizon_days": h,
                    "source": source,
                    **stats,
                    **({"by_band": by_band} if by_band else {}),
                })

    save_price_cache(cache)

    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "benchmark_primary": "IWM",
        "note": ("Missing-price members are excluded from return stats but counted in "
                 "n_missing_price_at_horizon — do not ignore them, they may be delistings."),
        "evaluated": results,
        "pending": pending,
    }
    OUTCOMES_JSON.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    # ── Markdown report ──────────────────────────────────────────────────
    lines = ["# Signal Outcome Report", "",
             f"Generated: {payload['generated_at']}  |  Benchmark: IWM (small-cap), SPY shown for context", ""]
    if results:
        lines += ["| Cohort | Horizon | Source | n | Median | Mean | IWM | Excess vs IWM | %>IWM | Missing@end |",
                  "|---|---|---|---|---|---|---|---|---|---|"]
        for r in results:
            lines.append(
                f"| {r['snapshot_date']} | {r['horizon_days']}d | {r['source']} | {r['n_evaluated']} "
                f"| {r['median_return_pct']}% | {r['mean_return_pct']}% | {r['iwm_return_pct']}% "
                f"| {r['mean_excess_vs_iwm_pct']}% | {r['pct_beat_iwm']}% | {r['n_missing_price_at_horizon']} |")
    else:
        lines.append("No cohorts have matured to any horizon yet.")
    if pending:
        next_up = min(pending, key=lambda p: p["matures_on"])
        lines += ["", f"Pending evaluations: {len(pending)} (next matures {next_up['matures_on']}: "
                      f"cohort {next_up['snapshot_date']} @ {next_up['horizon_days']}d)"]
    REPORT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"\nWritten: {OUTCOMES_JSON.name} ({len(results)} evaluated, {len(pending)} pending)")
    print(f"Written: {REPORT_MD.name}")


if __name__ == "__main__":
    main()

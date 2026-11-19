"""Measure how far each commodity-archetype industry's operating margin swings, for the mid-cycle windows in
sifter_config.json (`mid_cycle_window.industry_years`). Read-only; prints a table.

Swing of a name: |mean of its last 3 fiscal years' operating margin - mean of its last 10|, for names with at
least 8 years of margin. Swing of an industry or a cluster: the median over its names (at least 5 names, or it is
not ranked). The bar: the median of the cluster medians over every cluster of the scored universe. An industry of
the commodity archetype above the bar takes the 8-year window.

Why operating margin and why per industry (2026-11-19): the first measurement (P3.7) used owner cash flow per
cluster. Owner cash flow needs a capital-spending figure, which 15 of the 20 long-history marine shipping names do
not have, and the freight cluster averages shipping with trucking.

Usage: python scripts/measure_mid_cycle_swing.py [data_dir]   (default public/data)
"""
import collections
import json
import statistics
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent))
from industry_taxonomy import get_taxonomy_profile

MIN_YEARS, MIN_NAMES = 8, 5


def swing(rows):
    margins = [r["operating_income"] / r["revenue"] for r in rows
               if isinstance(r.get("revenue"), (int, float)) and r["revenue"] > 0
               and isinstance(r.get("operating_income"), (int, float))]
    if len(margins) < MIN_YEARS:
        return None
    return abs(statistics.mean(margins[-3:]) - statistics.mean(margins[-10:]))


def measure(data_dir):
    """({industry: (median swing, names)} for the commodity archetype, {cluster: (median swing, names)} for every
    cluster, the bar)."""
    hist = json.loads((data_dir / "fundamentals_history.json").read_text(encoding="utf-8"))
    hist = hist.get("tickers", hist.get("fundamentals", hist))
    scored = json.loads((data_dir / "factor_scores.json").read_text(encoding="utf-8"))["tickers"]
    stocks = {s["symbol"]: s for s in json.loads((data_dir / "stocks.json").read_text(encoding="utf-8"))}
    by_industry, by_cluster = collections.defaultdict(list), collections.defaultdict(list)
    for t, row in scored.items():
        if row.get("fct_veto") or t not in hist or t not in stocks:
            continue
        years = hist[t]
        sw = swing([years[y] for y in sorted(k for k in years if k.isdigit())])
        if sw is None:
            continue
        tax = get_taxonomy_profile(stocks[t].get("industry"), stocks[t].get("sector"))
        by_cluster[tax["cluster"]].append(sw)
        if tax["archetype"] == "commodity_cyclical":
            by_industry[tax["canonical_industry"]].append(sw)
    med = lambda d: {k: (statistics.median(v), len(v)) for k, v in d.items() if len(v) >= MIN_NAMES}
    industries, clusters = med(by_industry), med(by_cluster)
    return industries, clusters, statistics.median(m for m, _ in clusters.values())


if __name__ == "__main__":
    data = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "public" / "data"
    industries, clusters, bar = measure(data)
    print(f"bar (median of {len(clusters)} cluster medians): {bar:.3f}")
    for name, (m, n) in sorted(industries.items(), key=lambda kv: -kv[1][0]):
        print(f"  {name:42s} {m:.3f}  ({n} names)  {'above' if m > bar else ''}")

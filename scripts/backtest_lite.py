"""backtest_lite.py — point-in-time V/Q/M factor backtest (audit item 10).

Tests the unified composite's core pillars (Value / Quality / Momentum,
weights renormalized to .40/.333/.267) on SEC companyfacts fundamentals and
10 years of monthly prices, quarterly rebalance, vs IWM.

=== SURVIVORSHIP CAVEAT — READ FIRST ===============================
The universe is TODAY'S listings (fundamentals_history.json built from the
current stocks.json). Companies that delisted along the way are absent from
formation universes, which FLATTERS results. Treat every number here as an
UPPER BOUND on the strategy, useful for RELATIVE judgments (factor weights,
veto efficacy, decile spread) — never as an expected-return forecast.
====================================================================

Look-ahead control: fiscal-year y fundamentals are usable only at formation
dates >= July 1 of y+1 (Fama-French convention — every filer has reported by
then). Momentum uses 12-1 on adjusted monthly closes (no skip issues:
formation-month close excluded).

Split handling: share counts in filings are NOT retro-adjusted; Yahoo prices
ARE. Year-over-year share jumps matching common split factors (within 10%)
are folded into a split-adjustment chain so shares x adjusted-price gives a
consistent market cap. Non-split-like jumps are treated as real issuance.

Usage:
  python scripts/backtest_lite.py --fetch-prices   # one-time: ~10y monthly closes (yfinance)
  python scripts/backtest_lite.py                  # run backtest from caches
Outputs:
  public/data/backtest_results.json
  public/data/backtest_report.md
"""

import argparse
import json
import math
import sys
from datetime import date, datetime, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"
HISTORY_JSON = DATA / "fundamentals_history.json"
PRICES_JSON = DATA / "backtest_prices.json"
RESULTS_JSON = DATA / "backtest_results.json"
REPORT_MD = DATA / "backtest_report.md"

BENCHMARK = "IWM"
PRICE_START = "2014-01-01"
FORMATION_START_YEAR = 2017
MIN_MCAP = 100_000_000
TOP_FRACTION = 0.10          # top decile by composite
WEIGHTS = {"value": 0.40, "quality": 0.333, "momentum": 0.267}
SPLIT_FACTORS = [1.5, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 10.0, 20.0]

SURVIVORSHIP_NOTE = ("UPPER BOUND ONLY: universe is today's listings; delisted "
                     "losers are absent from every formation date. Use for "
                     "relative factor judgments, not return forecasts.")


def month_key(y, m):
    return f"{y:04d}-{m:02d}"


def fetch_prices():
    import yfinance as yf

    history = json.loads(HISTORY_JSON.read_text(encoding="utf-8"))["tickers"]
    tickers = sorted(history.keys()) + [BENCHMARK]
    print(f"Fetching monthly closes for {len(tickers)} tickers since {PRICE_START} ...")

    prices = {}
    chunk_size = 250
    for i in range(0, len(tickers), chunk_size):
        chunk = tickers[i:i + chunk_size]
        print(f"  chunk {i // chunk_size + 1}/{(len(tickers) - 1) // chunk_size + 1} ({len(chunk)} tickers)")
        df = yf.download(chunk, start=PRICE_START, interval="1mo",
                         auto_adjust=True, progress=False, group_by="ticker", threads=True)
        if df is None or df.empty:
            continue
        import pandas as pd
        for t in chunk:
            try:
                series = df[t]["Close"] if len(chunk) > 1 else df["Close"]
            except (KeyError, TypeError):
                continue
            series = series.dropna()
            if series.empty:
                continue
            out = {}
            for idx, val in series.items():
                ts = pd.Timestamp(idx)
                out[month_key(ts.year, ts.month)] = round(float(val), 4)
            prices[t] = out

    PRICES_JSON.write_text(json.dumps(
        {"fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
         "interval": "1mo", "auto_adjust": True, "prices": prices},
        sort_keys=True), encoding="utf-8")
    print(f"Written: {PRICES_JSON.name} ({PRICES_JSON.stat().st_size:,} bytes, {len(prices)} tickers)")


def safe_div(a, b):
    if a is None or b is None or b == 0:
        return None
    return a / b


def build_split_adjusted_shares(year_rows):
    """shares per fiscal year, adjusted into the LATEST year's share basis.

    Walks consecutive share counts; ratios matching a common split factor
    (within 10%) are treated as splits and folded into the adjustment chain.
    Returns {year: adjusted_shares} plus the set of split years.
    """
    years = sorted(year_rows.keys())
    shares = {y: year_rows[y].get("shares_diluted") for y in years}
    valid = [y for y in years if shares.get(y)]
    if not valid:
        return {}, set()

    # factor[y] = multiplier to convert year-y shares into latest basis
    factor = {valid[-1]: 1.0}
    split_years = set()
    for a, b in zip(reversed(valid[:-1]), reversed(valid[1:])):
        # going backwards: b is the later year, a the earlier
        ratio = shares[b] / shares[a]
        split_mult = 1.0
        for f in SPLIT_FACTORS:
            if abs(ratio - f) / f <= 0.10:
                split_mult = f
                split_years.add(b)
                break
            if abs(ratio - 1.0 / f) * f <= 0.10:  # reverse split
                split_mult = 1.0 / f
                split_years.add(b)
                break
        factor[a] = factor[b] * split_mult
    return {y: shares[y] * factor[y] for y in valid}, split_years


def passes_vetoes(cur, prev, adj_shares, y, y_prev):
    """Formation-date vetoes from fiscal-year y vs y-1 data. True = investable."""
    # Accruals
    accruals = None
    if all(v is not None for v in (cur.get("net_income"), cur.get("ocf"), cur.get("total_assets"))):
        accruals = (cur["net_income"] - cur["ocf"]) / cur["total_assets"] if cur["total_assets"] else None
    if accruals is not None and accruals > 0.10:
        return False
    # Heavy issuance (split-adjusted)
    if adj_shares.get(y) and adj_shares.get(y_prev):
        if adj_shares[y] / adj_shares[y_prev] - 1 > 0.10:
            return False
    # Mini Piotroski (the computable core): fail if <=1 of 4 pass
    checks = []
    roa_c = safe_div(cur.get("net_income"), cur.get("total_assets"))
    roa_p = safe_div(prev.get("net_income"), prev.get("total_assets")) if prev else None
    if roa_c is not None:
        checks.append(roa_c > 0)
    if cur.get("ocf") is not None:
        checks.append(cur["ocf"] > 0)
    if roa_c is not None and roa_p is not None:
        checks.append(roa_c > roa_p)
    if cur.get("ocf") is not None and cur.get("net_income") is not None:
        checks.append(cur["ocf"] > cur["net_income"])
    if len(checks) >= 3 and sum(checks) <= 1:
        return False
    return True


def percentile_ranks(pairs):
    """[(ticker, value)] -> {ticker: rank in [0,1]}; higher value = higher rank."""
    pairs = [(t, v) for t, v in pairs if v is not None]
    pairs.sort(key=lambda x: x[1])
    n = len(pairs)
    if n <= 1:
        return {t: 0.5 for t, _ in pairs}
    return {t: i / (n - 1) for i, (t, _) in enumerate(pairs)}


def run_backtest():
    history = json.loads(HISTORY_JSON.read_text(encoding="utf-8"))["tickers"]
    pricedata = json.loads(PRICES_JSON.read_text(encoding="utf-8"))["prices"]
    bench = pricedata.get(BENCHMARK, {})
    if not bench:
        print(f"FATAL: no {BENCHMARK} prices — run --fetch-prices first.")
        sys.exit(1)

    # Pre-compute split-adjusted shares per ticker
    adj_shares_all = {}
    for t, ydata in history.items():
        rows = {int(y): r for y, r in ydata.items()}
        adj, _ = build_split_adjusted_shares(rows)
        adj_shares_all[t] = adj

    today = date.today()
    formations = []
    y = FORMATION_START_YEAR
    while y <= today.year:
        for m in (3, 6, 9, 12):
            f = date(y, m, 28)
            if f < today.replace(day=1):
                formations.append((y, m))
        y += 1

    quarters = []
    for fy, fm in formations:
        f_key = month_key(fy, fm)
        # next quarter end (hold period)
        ny, nm = (fy + 1, 3) if fm == 12 else (fy, fm + 3)
        n_key = month_key(ny, nm)
        if n_key not in bench or f_key not in bench:
            continue

        # usable fiscal year: y_fund where formation >= July 1, y_fund+1
        cutoff_year = fy - 1 if fm >= 7 else fy - 2

        candidates = []
        for t, ydata in history.items():
            prices = pricedata.get(t)
            if not prices or f_key not in prices:
                continue
            years = sorted(int(yy) for yy in ydata.keys())
            usable = [yy for yy in years if yy <= cutoff_year]
            if not usable:
                continue
            yf_ = usable[-1]
            if yf_ < cutoff_year - 1:
                continue  # stale fundamentals (>2y old) — skip
            cur = ydata[str(yf_)]
            prev = ydata[str(yf_ - 1)] if str(yf_ - 1) in ydata else None

            adj_sh = adj_shares_all.get(t, {})
            shares = adj_sh.get(yf_)
            price_f = prices[f_key]
            mcap = shares * price_f if shares else None
            if mcap is None or mcap < MIN_MCAP:
                continue

            # V: FCF yield + earnings yield (mean of available)
            v_parts = []
            fcf_y = safe_div(cur.get("fcf"), mcap)
            if fcf_y is not None:
                v_parts.append(fcf_y)
            e_y = safe_div(cur.get("net_income"), mcap)
            if e_y is not None:
                v_parts.append(e_y)
            v_raw = sum(v_parts) / len(v_parts) if v_parts else None

            # Q: ROA + gross margin level + CFO conversion
            q_parts = []
            roa = safe_div(cur.get("net_income"), cur.get("total_assets"))
            if roa is not None:
                q_parts.append(roa)
            gm = safe_div(cur.get("gross_profit"), cur.get("revenue"))
            if gm is not None:
                q_parts.append(gm * 0.5)  # scale so ROA and GM contribute comparably
            conv = safe_div(cur.get("ocf"), abs(cur["net_income"])) if cur.get("ocf") is not None and cur.get("net_income") else None
            if conv is not None:
                q_parts.append(max(-1.0, min(2.0, conv)) * 0.1)
            q_raw = sum(q_parts) if q_parts else None

            # M: 12-1 skip-month (t-13 .. t-1 closes)
            m_raw = None

            def back(months):
                yy, mm = fy, fm
                mm -= months
                while mm <= 0:
                    mm += 12
                    yy -= 1
                return month_key(yy, mm)
            p1, p13 = prices.get(back(1)), prices.get(back(13))
            if p1 and p13 and p13 > 0:
                m_raw = p1 / p13 - 1

            if v_raw is None or q_raw is None or m_raw is None:
                continue
            if not passes_vetoes(cur, prev or {}, adj_sh, yf_, yf_ - 1):
                continue
            candidates.append((t, v_raw, q_raw, m_raw))

        if len(candidates) < 100:
            continue

        v_ranks = percentile_ranks([(t, v) for t, v, _, _ in candidates])
        q_ranks = percentile_ranks([(t, q) for t, _, q, _ in candidates])
        m_ranks = percentile_ranks([(t, m) for t, _, _, m in candidates])
        total_w = sum(WEIGHTS.values())
        composite = {
            t: (WEIGHTS["value"] * v_ranks[t] + WEIGHTS["quality"] * q_ranks[t]
                + WEIGHTS["momentum"] * m_ranks[t]) / total_w
            for t, _, _, _ in candidates
        }
        ranked = sorted(composite, key=lambda t: -composite[t])
        n_top = max(10, int(len(ranked) * TOP_FRACTION))
        top = ranked[:n_top]
        bottom = ranked[-n_top:]

        def cohort_return(members):
            rets, missing = [], 0
            for t in members:
                p0 = pricedata[t].get(f_key)
                p1_ = pricedata[t].get(n_key)
                if p0 and p1_:
                    rets.append(p1_ / p0 - 1)
                else:
                    missing += 1
            return (sum(rets) / len(rets) if rets else None), missing

        top_ret, top_missing = cohort_return(top)
        bottom_ret, _ = cohort_return(bottom)
        bench_ret = bench[n_key] / bench[f_key] - 1

        if top_ret is None:
            continue
        quarters.append({
            "formation": f_key,
            "n_candidates": len(candidates),
            "n_top": n_top,
            "top_return_pct": round(top_ret * 100, 2),
            "bottom_decile_return_pct": round(bottom_ret * 100, 2) if bottom_ret is not None else None,
            "iwm_return_pct": round(bench_ret * 100, 2),
            "excess_vs_iwm_pct": round((top_ret - bench_ret) * 100, 2),
            "missing_end_price": top_missing,
        })

    # ── Aggregates ───────────────────────────────────────────────────────
    def chain(rets):
        eq = 1.0
        peak, maxdd = 1.0, 0.0
        for r in rets:
            eq *= (1 + r)
            peak = max(peak, eq)
            maxdd = min(maxdd, eq / peak - 1)
        return eq, maxdd

    top_rets = [q["top_return_pct"] / 100 for q in quarters]
    iwm_rets = [q["iwm_return_pct"] / 100 for q in quarters]
    eq_top, dd_top = chain(top_rets)
    eq_iwm, dd_iwm = chain(iwm_rets)
    n_q = len(quarters)
    years_span = n_q / 4 if n_q else 0
    summary = {
        "quarters": n_q,
        "strategy_cagr_pct": round((eq_top ** (1 / years_span) - 1) * 100, 2) if years_span else None,
        "iwm_cagr_pct": round((eq_iwm ** (1 / years_span) - 1) * 100, 2) if years_span else None,
        "strategy_max_drawdown_pct": round(dd_top * 100, 1),
        "iwm_max_drawdown_pct": round(dd_iwm * 100, 1),
        "hit_rate_vs_iwm_pct": round(100 * sum(1 for q in quarters if q["excess_vs_iwm_pct"] > 0) / n_q, 1) if n_q else None,
        "mean_quarterly_excess_pct": round(sum(q["excess_vs_iwm_pct"] for q in quarters) / n_q, 2) if n_q else None,
        "mean_decile_spread_pct": round(sum(
            q["top_return_pct"] - q["bottom_decile_return_pct"]
            for q in quarters if q["bottom_decile_return_pct"] is not None) / n_q, 2) if n_q else None,
    }

    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "survivorship_caveat": SURVIVORSHIP_NOTE,
        "method": {
            "weights": WEIGHTS, "top_fraction": TOP_FRACTION, "min_mcap": MIN_MCAP,
            "fundamentals_lag": "FY y usable from July 1, y+1 (Fama-French)",
            "rebalance": "quarterly", "benchmark": BENCHMARK,
            "vetoes": "accruals>0.10, issuance>10%/yr (split-adjusted), mini-Piotroski<=1/4",
        },
        "summary": summary,
        "quarters": quarters,
    }
    RESULTS_JSON.write_text(json.dumps(payload, indent=1, sort_keys=True) + "\n", encoding="utf-8")

    lines = ["# Backtest Lite — V/Q/M composite, quarterly, vs IWM", "",
             f"**{SURVIVORSHIP_NOTE}**", "",
             f"Generated: {payload['generated_at']}  |  Quarters: {n_q}", "",
             f"| | Strategy (top decile) | IWM |", "|---|---|---|",
             f"| CAGR | {summary['strategy_cagr_pct']}% | {summary['iwm_cagr_pct']}% |",
             f"| Max drawdown | {summary['strategy_max_drawdown_pct']}% | {summary['iwm_max_drawdown_pct']}% |", "",
             f"Hit rate vs IWM: {summary['hit_rate_vs_iwm_pct']}% of quarters  |  "
             f"Mean quarterly excess: {summary['mean_quarterly_excess_pct']}%  |  "
             f"Mean top-bottom decile spread: {summary['mean_decile_spread_pct']}%", "",
             "| Formation | n | Top% | Bottom% | IWM% | Excess% |", "|---|---|---|---|---|---|"]
    for q in quarters:
        lines.append(f"| {q['formation']} | {q['n_candidates']} | {q['top_return_pct']} "
                     f"| {q['bottom_decile_return_pct']} | {q['iwm_return_pct']} | {q['excess_vs_iwm_pct']} |")
    lines += ["", f"_Method: {json.dumps(payload['method'])}_"]
    REPORT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"Backtest: {n_q} quarters | strategy CAGR {summary['strategy_cagr_pct']}% "
          f"vs IWM {summary['iwm_cagr_pct']}% | hit rate {summary['hit_rate_vs_iwm_pct']}% "
          f"| decile spread {summary['mean_decile_spread_pct']}%/q")
    print(f"Written: {RESULTS_JSON.name}, {REPORT_MD.name}")


def main():
    parser = argparse.ArgumentParser(description="Point-in-time V/Q/M backtest (survivorship-caveated).")
    parser.add_argument("--fetch-prices", action="store_true", help="Fetch ~10y monthly closes (network)")
    args = parser.parse_args()
    if args.fetch_prices:
        fetch_prices()
    else:
        run_backtest()


if __name__ == "__main__":
    main()

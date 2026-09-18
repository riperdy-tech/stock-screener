"""grade_rs2_verdicts.py — forward-return grading of RS2 verdict ledger rows.

Closes the loop the 2026-08-09 audit found missing: the RS2 engine emits a dated,
structured verdict for every analyzed name (rs2_verdict_log.jsonl, written by
RS2 Local's verdict_ledger.py) but nothing ever measured whether those verdicts
predicted anything. This grades every verdict at standard horizons against IWM
(primary), SPY and QQQ, and aggregates along the axes that answer the real
questions:

  action_family      — do the LLM's BULL calls beat its HOLD/BEAR calls?
  stance             — does the deterministic backbone (expectations gap) rank returns?
  stance x family    — ABLATION: within a backbone stance bucket, does the LLM's
                       disposition add ranking power? If not, the LLM layer adds no
                       selection value over the deterministic math.
  raw-BULL brake cut — of the verdicts the model wrote as BULL, did the ones the
                       don't-chase brake re-tiered subsequently do worse (brake was
                       right) or better (brake costs money)?
  research_cited     — did verdicts resting on cited research outperform the
                       fabricated-research-era ones?
  conviction         — Spearman rank correlation of conviction with excess return.

Honest-measurement rules (mirrors backfill_outcomes.py):
- Entry price is the FIRST close ON OR AFTER the verdict date — a verdict can only be
  acted on after it exists. Exit is the last close on or before verdict_date + horizon.
  Benchmark returns use the SAME actual entry/exit dates as each verdict's fills.
- A horizon is graded only once fully elapsed.
- Tickers with no price at entry or exit are counted and reported, never silently
  dropped (delistings flatter results).
- Repeat verdicts on the same name are correlated observations, NOT independent samples:
  every bucket reports n_names next to n_verdicts, plus a name-weighted view (per-name
  mean first, then aggregate). Read the name-weighted numbers first.
- Prices are re-fetched over the full range every run (one adjusted series per ticker,
  internally consistent); the cache file is written for audit/--offline reruns only.

Usage:
    python scripts/grade_rs2_verdicts.py             # fetch prices, grade, write reports
    python scripts/grade_rs2_verdicts.py --offline   # reuse cached prices (no fetch)
Outputs:
    public/data/rs2_verdict_outcomes.json
    public/data/rs2_verdicts_report.md
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
LEDGER_JSONL = DATA / "rs2_verdict_log.jsonl"
PRICE_CACHE_JSON = DATA / "rs2_verdict_price_cache.json"
OUTCOMES_JSON = DATA / "rs2_verdict_outcomes.json"
REPORT_MD = DATA / "rs2_verdicts_report.md"

BENCHMARKS = ["IWM", "SPY", "QQQ"]
HORIZON_DAYS = [30, 91, 182, 365]
CHUNK = 200


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


def fetch_history(tickers, start_iso, cache):
    """Fetch full-range adjusted daily closes for all tickers into cache (whole series
    per ticker per run — never a partial patch, so each series is internally consistent)."""
    end = (date.today() + timedelta(days=1)).isoformat()
    tickers = sorted(set(tickers))
    for i in range(0, len(tickers), CHUNK):
        chunk = tickers[i:i + CHUNK]
        print(f"  fetching {len(chunk)} tickers ({i + 1}-{i + len(chunk)} of {len(tickers)}) "
              f"{start_iso} -> {end} ...")
        df = yf.download(chunk, start=start_iso, end=end, interval="1d",
                         auto_adjust=True, progress=False, group_by="ticker", threads=True)
        if df is None or df.empty:
            continue
        for t in chunk:
            try:
                series = df[t]["Close"] if isinstance(df.columns, pd.MultiIndex) else df["Close"]
            except (KeyError, TypeError):
                continue
            series = series.dropna()
            if series.empty:
                continue
            cache[t] = {pd.Timestamp(ix).date().isoformat(): round(float(v), 4)
                        for ix, v in series.items()}


def close_on_or_after(cache, ticker, target, window=7):
    """(date, close) at the first trading day on/after target, within `window` days."""
    days = cache.get(ticker)
    if not days:
        return None, None
    t = date.fromisoformat(target)
    for fwd in range(0, window + 1):
        key = (t + timedelta(days=fwd)).isoformat()
        if key in days:
            return key, days[key]
    return None, None


def close_on_or_before(cache, ticker, target, window=7):
    """(date, close) at the last trading day on/before target, within `window` days."""
    days = cache.get(ticker)
    if not days:
        return None, None
    t = date.fromisoformat(target)
    for back in range(0, window + 1):
        key = (t - timedelta(days=back)).isoformat()
        if key in days:
            return key, days[key]
    return None, None


def grade_rows(rows, cache, horizons):
    """Per-verdict forward returns. Returns (graded, pending_count, missing)."""
    today = date.today()
    graded = []
    pending = 0
    missing = {"entry": [], "exit": []}
    for r in rows:
        t = r["ticker"]
        for h in horizons:
            target_d = date.fromisoformat(r["date"]) + timedelta(days=h)
            if target_d > today:
                pending += 1
                continue
            d0, p0 = close_on_or_after(cache, t, r["date"])
            if p0 is None or p0 == 0:
                missing["entry"].append((t, r["date"], h))
                continue
            d1, p1 = close_on_or_before(cache, t, target_d.isoformat())
            # exit must postdate entry (a name delisted right after the verdict would
            # otherwise "exit" at its entry fill and score a fake 0% return)
            if p1 is None or d1 <= d0:
                missing["exit"].append((t, r["date"], h))
                continue
            ret = p1 / p0 - 1.0
            g = {"horizon_days": h, "return_pct": round(ret * 100, 2),
                 "entry_date": d0, "exit_date": d1}
            usable = True
            for b in BENCHMARKS:
                b0 = cache.get(b, {}).get(d0)
                b1 = cache.get(b, {}).get(d1)
                if b0 and b1:
                    g[f"excess_{b.lower()}_pct"] = round((ret - (b1 / b0 - 1.0)) * 100, 2)
                else:
                    usable = False
            if not usable:      # benchmark hole — should never happen; do not fabricate
                missing["exit"].append((t, r["date"], h))
                continue
            graded.append({**{k: r.get(k) for k in (
                "report", "ticker", "date", "action_family", "raw_action_family", "stance",
                "conviction", "brake_applied", "entry_timing", "research_cited", "repatched",
                "band_at_analysis", "exit_review", "recommended_weight_pct")}, **g})
    return graded, pending, missing


def bucket_stats(members):
    """Aggregate one bucket. Verdict-weighted stats + name-weighted (per-name mean first)."""
    if not members:
        return None
    x = pd.Series([m["excess_iwm_pct"] for m in members], dtype=float)
    by_name = {}
    for m in members:
        by_name.setdefault(m["ticker"], []).append(m["excess_iwm_pct"])
    nw = pd.Series([sum(v) / len(v) for v in by_name.values()], dtype=float)
    return {
        "n_verdicts": len(members), "n_names": len(by_name),
        "mean_return_pct": round(float(pd.Series([m["return_pct"] for m in members]).mean()), 2),
        "mean_excess_iwm_pct": round(float(x.mean()), 2),
        "median_excess_iwm_pct": round(float(x.median()), 2),
        "pct_beat_iwm": round(float((x > 0).mean() * 100), 1),
        "mean_excess_spy_pct": round(float(pd.Series(
            [m["excess_spy_pct"] for m in members], dtype=float).mean()), 2),
        "namewt_mean_excess_iwm_pct": round(float(nw.mean()), 2),
        "namewt_median_excess_iwm_pct": round(float(nw.median()), 2),
        "namewt_pct_beat_iwm": round(float((nw > 0).mean() * 100), 1),
    }


def spearman(pairs):
    """Spearman rho via rank-then-pearson (no scipy). pairs = [(x, y), ...]."""
    xs = pd.Series([p[0] for p in pairs], dtype=float)
    ys = pd.Series([p[1] for p in pairs], dtype=float)
    if len(xs) < 10 or xs.nunique() < 2 or ys.nunique() < 2:
        return None
    return round(float(xs.rank().corr(ys.rank())), 3)


def cut(graded, keyfn, label):
    """Group graded records by keyfn -> {bucket_label: stats}."""
    groups = {}
    for g in graded:
        groups.setdefault(keyfn(g), []).append(g)
    out = {}
    for k in sorted(groups, key=str):
        s = bucket_stats(groups[k])
        if s:
            out[str(k)] = s
    return {"cut": label, "buckets": out}


def main():
    ap = argparse.ArgumentParser(description="Grade RS2 verdicts against forward returns.")
    ap.add_argument("--offline", action="store_true", help="reuse cached prices, skip fetch")
    args = ap.parse_args()

    rows = read_jsonl(LEDGER_JSONL)
    if not rows:
        print(f"No ledger rows at {LEDGER_JSONL} — run RS2 Local's verdict_ledger.py first.")
        return
    print(f"{len(rows)} ledger rows | {len({r['ticker'] for r in rows})} names | "
          f"{min(r['date'] for r in rows)} -> {max(r['date'] for r in rows)}")

    cache = {}
    if args.offline and PRICE_CACHE_JSON.exists():
        cache = json.loads(PRICE_CACHE_JSON.read_text(encoding="utf-8"))
        print(f"offline: {len(cache)} cached series")
    else:
        start = (date.fromisoformat(min(r["date"] for r in rows)) - timedelta(days=8)).isoformat()
        fetch_history([r["ticker"] for r in rows] + BENCHMARKS, start, cache)
        PRICE_CACHE_JSON.write_text(json.dumps(cache, sort_keys=True), encoding="utf-8")
        print(f"price cache written: {len(cache)} series")

    no_series = sorted({r["ticker"] for r in rows} - set(cache))
    if no_series:
        print(f"NO PRICE SERIES for {len(no_series)} names (delisted/renamed? report them, "
              f"never drop silently): {', '.join(no_series)}")

    graded, pending, missing = grade_rows(rows, cache, HORIZON_DAYS)
    print(f"graded {len(graded)} verdict-horizons | pending {pending} | "
          f"missing entry {len(missing['entry'])} / exit {len(missing['exit'])}")

    per_horizon = {}
    for h in HORIZON_DAYS:
        gh = [g for g in graded if g["horizon_days"] == h]
        if not gh:
            continue
        bulls = [g for g in gh if g["raw_action_family"] == "BULL"]
        per_horizon[str(h)] = {
            "all": bucket_stats(gh),
            "cuts": [
                cut(gh, lambda g: g["action_family"], "action_family"),
                cut(gh, lambda g: g["stance"], "stance (deterministic gap)"),
                cut(gh, lambda g: f"{g['stance']}|{g['action_family']}",
                    "ABLATION stance x family"),
                cut(bulls, lambda g: "brake re-tiered" if g["action_family"] != "BULL"
                    else "left as BULL", "raw-BULL: brake efficacy"),
                cut(gh, lambda g: g["research_cited"], "research_cited"),
                cut(gh, lambda g: g["entry_timing"], "entry_timing"),
            ],
            "conviction_spearman_vs_excess_iwm": {
                "all": spearman([(g["conviction"], g["excess_iwm_pct"])
                                 for g in gh if g.get("conviction") is not None]),
                "bull_only": spearman([(g["conviction"], g["excess_iwm_pct"])
                                       for g in bulls if g.get("conviction") is not None]),
            },
        }

    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "benchmark_primary": "IWM",
        "benchmarks": BENCHMARKS,
        "caveats": [
            "Repeat verdicts on one name are correlated — read name-weighted stats first.",
            "Entry = first close on/after verdict date; exit = last close on/before date+h; "
            "benchmarks use the same actual dates.",
            "research_cited=false rows rest on the fabricated-research era (pre 2026-08-06 fix).",
            "repatched=true rows carry post-hoc-corrected deterministic fields on the original "
            "LLM text (dates are original).",
            "No formal significance testing — with weeks of history these are descriptive "
            "numbers, not evidence of edge.",
        ],
        "ledger_rows": len(rows),
        "graded_verdict_horizons": len(graded),
        "pending_verdict_horizons": pending,
        "missing": {k: len(v) for k, v in missing.items()},
        "tickers_without_price_series": no_series,
        "per_horizon": per_horizon,
        "graded": graded,
    }
    OUTCOMES_JSON.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n",
                             encoding="utf-8")

    # ── Markdown report ─────────────────────────────────────────────────
    L = ["# RS2 Verdict Outcome Report", "",
         f"Generated: {payload['generated_at']}  |  Benchmarks: IWM (primary), SPY, QQQ",
         "",
         f"Ledger: {len(rows)} verdicts, {len({r['ticker'] for r in rows})} names, "
         f"{min(r['date'] for r in rows)} -> {max(r['date'] for r in rows)}. "
         f"Graded verdict-horizons: {len(graded)}; pending: {pending}; "
         f"missing entry/exit: {len(missing['entry'])}/{len(missing['exit'])}.",
         "",
         "**Read the name-weighted columns first** — repeat verdicts on one name are "
         "correlated observations, and verdict-weighted means overweight frequently "
         "re-analyzed names. Descriptive only; no significance claimed.", ""]
    for h in HORIZON_DAYS:
        ph = per_horizon.get(str(h))
        if not ph:
            continue
        a = ph["all"]
        L += [f"## {h}-day horizon",
              "",
              f"All verdicts: n={a['n_verdicts']} ({a['n_names']} names) | "
              f"mean excess vs IWM {a['mean_excess_iwm_pct']}% | name-weighted "
              f"{a['namewt_mean_excess_iwm_pct']}% (median {a['namewt_median_excess_iwm_pct']}%, "
              f"{a['namewt_pct_beat_iwm']}% of names beat IWM)", ""]
        for c in ph["cuts"]:
            if not c["buckets"]:
                continue
            L += [f"### {c['cut']}", "",
                  "| Bucket | n | names | mean ret | mean xIWM | med xIWM | %>IWM | "
                  "name-wt xIWM | name-wt med | name-wt %>IWM |",
                  "|---|---|---|---|---|---|---|---|---|---|"]
            for name, s in c["buckets"].items():
                L.append(f"| {name} | {s['n_verdicts']} | {s['n_names']} "
                         f"| {s['mean_return_pct']}% | {s['mean_excess_iwm_pct']}% "
                         f"| {s['median_excess_iwm_pct']}% | {s['pct_beat_iwm']}% "
                         f"| {s['namewt_mean_excess_iwm_pct']}% "
                         f"| {s['namewt_median_excess_iwm_pct']}% "
                         f"| {s['namewt_pct_beat_iwm']}% |")
            L.append("")
        sp = ph["conviction_spearman_vs_excess_iwm"]
        L += [f"Conviction vs excess-IWM Spearman: all={sp['all']}  bull-only={sp['bull_only']}", ""]
    if no_series:
        L += [f"**No price series** ({len(no_series)}): {', '.join(no_series)}", ""]
    REPORT_MD.write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"Written: {OUTCOMES_JSON.name}, {REPORT_MD.name}")


if __name__ == "__main__":
    main()

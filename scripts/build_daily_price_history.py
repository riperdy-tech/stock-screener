"""build_daily_price_history.py — Fetch and cache adjusted daily closes and volume (DAT-03).

Produces public/data/daily_closes.json containing 400 trading days of adjusted daily close
and volume for:
1. Research Now (RN) and Watchlist (WL) of the latest factor_scores.json
2. Every ticker in public/data/depth_overlay.json
3. Every ticker in the previous public/data/momentum_state.json (so exits keep history)
4. 17 sector/cluster ETF proxies + IWM (18 ETFs total)

Features:
- Cache-and-extend: only missing tails are fetched per ticker
- Split refetch rule: detects splits via >40% gap with matching volume spike or retroactive
  adjustment disagreement on overlap dates, and refetches the full 400 trading days
- Network failure tolerance: keeps existing cached series, records failures under fetch_failed
- File layout: serialized with one ticker per line, sorted tickers, sorted dates for minimal git diffs
"""

import argparse
import json
import math
import statistics
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA_DIR = ROOT / "public" / "data"

ETF_PROXIES = [
    # 6 Strategic cluster/subindustry proxies
    "SMH",  # semiconductors
    "IGV",  # software
    "KBE",  # banks
    "XBI",  # biotech
    "XOP",  # oil & gas exploration & production
    "XHB",  # homebuilders
    # 11 GICS sector proxies
    "XLE",  # Energy
    "XLB",  # Basic Materials
    "XLI",  # Industrials
    "XLV",  # Healthcare
    "XLK",  # Technology
    "XLY",  # Consumer Cyclical
    "XLP",  # Consumer Defensive
    "XLC",  # Communication Services
    "XLU",  # Utilities
    "XLRE", # Real Estate
    "XLF",  # Financial Services
    # Benchmark proxy for smallcap relative strength
    "IWM",  # Russell 2000
]

CHUNK_SIZE = 50
TARGET_TRADING_DAYS = 400
LOOKBACK_CALENDAR_DAYS = 620  # ~400 trading days


def load_universe(data_dir: Path) -> List[str]:
    """Compile the target ticker universe from factor scores, depth overlay, previous momentum state, and ETFs."""
    universe: Set[str] = set(ETF_PROXIES)

    # 1. RN + WL from latest factor_scores.json
    fct_path = data_dir / "factor_scores.json"
    if fct_path.exists():
        try:
            fct_data = json.loads(fct_path.read_text(encoding="utf-8"))
            tickers_dict = fct_data.get("tickers", {})
            for t, info in tickers_dict.items():
                if info.get("fct_band") in ("research_now", "watchlist"):
                    universe.add(t)
        except Exception as exc:
            print(f"WARN: could not parse factor_scores.json for universe: {exc}", file=sys.stderr)

    # 2. Depth overlay tickers
    overlay_path = data_dir / "depth_overlay.json"
    if overlay_path.exists():
        try:
            overlay_data = json.loads(overlay_path.read_text(encoding="utf-8"))
            for t in overlay_data.get("tickers", {}).keys():
                universe.add(t)
        except Exception as exc:
            print(f"WARN: could not parse depth_overlay.json for universe: {exc}", file=sys.stderr)

    # 3. Previous momentum_state.json tickers (exits retain history)
    mom_path = data_dir / "momentum_state.json"
    if mom_path.exists():
        try:
            mom_data = json.loads(mom_path.read_text(encoding="utf-8"))
            for t in mom_data.get("tickers", {}).keys():
                universe.add(t)
        except Exception as exc:
            print(f"WARN: could not parse momentum_state.json for universe: {exc}", file=sys.stderr)

    return sorted(universe)


def load_cached_daily_closes(path: Path) -> Dict[str, Any]:
    """Load existing daily closes cache if available."""
    if not path.exists():
        return {"asof": None, "refetched": [], "fetch_failed": {}, "tickers": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data.get("tickers"), dict):
            data["tickers"] = {}
        data.setdefault("refetched", [])
        data.setdefault("fetch_failed", {})
        return data
    except Exception as exc:
        print(f"WARN: Failed to read existing daily_closes.json: {exc}", file=sys.stderr)
        return {"asof": None, "refetched": [], "fetch_failed": {}, "tickers": {}}


def serialize_daily_closes(payload: Dict[str, Any]) -> str:
    """Format JSON with one line per ticker for compact git diffs."""
    lines = ["{", f'  "asof": {json.dumps(payload.get("asof"))},']
    if "refetched" in payload:
        lines.append(f'  "refetched": {json.dumps(sorted(set(payload["refetched"])))},')
    if "fetch_failed" in payload:
        lines.append(f'  "fetch_failed": {json.dumps(dict(sorted(payload["fetch_failed"].items())))},')
    lines.append('  "tickers": {')
    tickers = sorted(payload.get("tickers", {}).keys())
    for idx, t in enumerate(tickers):
        t_data = payload["tickers"][t]
        sorted_dates = dict(sorted(t_data.items()))
        comma = "," if idx < len(tickers) - 1 else ""
        t_json = json.dumps(sorted_dates, separators=(", ", ": "))
        lines.append(f'    {json.dumps(t)}: {t_json}{comma}')
    lines.append("  }")
    lines.append("}\n")
    return "\n".join(lines)


def parse_yf_download(df: Any, chunk: List[str]) -> Dict[str, Dict[str, List[float]]]:
    """Parse output of yf.download into ticker -> {YYYY-MM-DD: [close, volume]}."""
    out: Dict[str, Dict[str, List[float]]] = {}
    if df is None or getattr(df, "empty", True):
        return out

    is_multi = isinstance(getattr(df, "columns", None), pd.MultiIndex)
    for t in chunk:
        try:
            if is_multi:
                if t not in df.columns.levels[0]:
                    continue
                series_close = df[t]["Close"].dropna()
                series_vol = df[t]["Volume"].dropna() if "Volume" in df[t] else None
            else:
                if len(chunk) == 1 and chunk[0] == t:
                    series_close = df["Close"].dropna()
                    series_vol = df["Volume"].dropna() if "Volume" in df else None
                else:
                    continue
        except (KeyError, TypeError, IndexError):
            continue

        ticker_data: Dict[str, List[float]] = {}
        for idx_ts, close_val in series_close.items():
            if not math.isfinite(close_val) or close_val <= 0:
                continue
            d_str = pd.Timestamp(idx_ts).date().isoformat()
            vol_val = 0.0
            if series_vol is not None and idx_ts in series_vol.index:
                raw_v = series_vol.loc[idx_ts]
                if isinstance(raw_v, pd.Series):
                    raw_v = raw_v.iloc[0]
                if math.isfinite(raw_v) and raw_v >= 0:
                    vol_val = float(raw_v)
            ticker_data[d_str] = [round(float(close_val), 4), round(vol_val, 2)]

        if ticker_data:
            out[t] = ticker_data
    return out


def detect_split(cached_series: Dict[str, List[float]], new_tail: Dict[str, List[float]]) -> bool:
    """Detect whether a split occurred:
    1. Disagreement > 40% on overlapping dates (retroactive adjustment)
    2. One-day price jump/drop > 40% with matching volume spike in the extended series
    """
    # 1. Check overlap dates
    overlap_dates = set(cached_series.keys()) & set(new_tail.keys())
    for d in overlap_dates:
        p_cached = cached_series[d][0]
        p_new = new_tail[d][0]
        if p_cached > 0 and p_new > 0:
            if abs(p_new / p_cached - 1.0) > 0.40:
                return True

    # 2. Check for single-day >40% gap with volume spike across combined chronological series
    combined = dict(cached_series)
    combined.update(new_tail)
    dates = sorted(combined.keys())
    if len(dates) < 2:
        return False

    vols = [combined[d][1] for d in dates if combined[d][1] > 0]
    med_vol = statistics.median(vols) if vols else 1.0

    for i in range(1, len(dates)):
        d_prev, d_curr = dates[i - 1], dates[i]
        p_prev = combined[d_prev][0]
        p_curr = combined[d_curr][0]
        v_curr = combined[d_curr][1]
        if p_prev > 0 and p_curr > 0:
            pct_change = abs(p_curr / p_prev - 1.0)
            if pct_change > 0.40:
                # Check for volume spike (volume > 2.0x median)
                if v_curr > 2.0 * med_vol or med_vol <= 0:
                    return True
    return False


def refetch_full_series(ticker: str, end_iso: str) -> Optional[Dict[str, List[float]]]:
    """Refetch the full series (~620 calendar days) for a ticker when a split is detected."""
    start_iso = (date.today() - timedelta(days=LOOKBACK_CALENDAR_DAYS)).isoformat()
    try:
        df = yf.download(
            [ticker],
            start=start_iso,
            end=end_iso,
            interval="1d",
            auto_adjust=True,
            progress=False,
            group_by="ticker",
            threads=False,
        )
        parsed = parse_yf_download(df, [ticker])
        return parsed.get(ticker)
    except Exception as exc:
        print(f"WARN: Full refetch failed for {ticker}: {exc}", file=sys.stderr)
        return None


def trim_to_target_days(series: Dict[str, List[float]], max_days: int = TARGET_TRADING_DAYS) -> Dict[str, List[float]]:
    """Keep only the latest max_days trading days."""
    dates = sorted(series.keys())
    if len(dates) <= max_days:
        return series
    return {d: series[d] for d in dates[-max_days:]}


def build_daily_price_history(
    data_dir: Path,
    out_file: Optional[Path] = None,
    tickers_override: Optional[List[str]] = None,
    chunk_size: int = CHUNK_SIZE,
) -> Dict[str, Any]:
    """Main builder function for public/data/daily_closes.json."""
    data_dir = data_dir.resolve()
    target_out = out_file or (data_dir / "daily_closes.json")
    target_out.parent.mkdir(parents=True, exist_ok=True)

    universe = tickers_override or load_universe(data_dir)
    cached_payload = load_cached_daily_closes(target_out)
    cached_tickers: Dict[str, Dict[str, List[float]]] = cached_payload.get("tickers", {})
    refetched: Set[str] = set(cached_payload.get("refetched", []))
    fetch_failed: Dict[str, str] = dict(cached_payload.get("fetch_failed", {}))

    today = date.today()
    end_iso = (today + timedelta(days=1)).isoformat()
    today_iso = today.isoformat()

    # Determine which tickers need full fetch vs tail fetch
    to_fetch_full: List[str] = []
    to_fetch_tail: Dict[str, str] = {}  # ticker -> start_date

    for t in universe:
        series = cached_tickers.get(t)
        if not series:
            to_fetch_full.append(t)
        else:
            dates = sorted(series.keys())
            latest_d = dates[-1]
            if latest_d < today_iso:
                # Overlap with latest cached date for split detection
                to_fetch_tail[t] = latest_d

    print(f"Daily price history universe: {len(universe)} tickers")
    print(f"  - Full fetch needed: {len(to_fetch_full)}")
    print(f"  - Tail extension needed: {len(to_fetch_tail)}")
    print(f"  - Up to date: {len(universe) - len(to_fetch_full) - len(to_fetch_tail)}")

    # 1. Fetch full series in chunks
    if to_fetch_full:
        start_full = (today - timedelta(days=LOOKBACK_CALENDAR_DAYS)).isoformat()
        for i in range(0, len(to_fetch_full), chunk_size):
            chunk = to_fetch_full[i : i + chunk_size]
            try:
                df = yf.download(
                    chunk,
                    start=start_full,
                    end=end_iso,
                    interval="1d",
                    auto_adjust=True,
                    progress=False,
                    group_by="ticker",
                    threads=True,
                )
                parsed = parse_yf_download(df, chunk)
                for t in chunk:
                    if t in parsed:
                        cached_tickers[t] = trim_to_target_days(parsed[t])
                        fetch_failed.pop(t, None)
                    else:
                        fetch_failed[t] = "no_data_returned"
            except Exception as exc:
                print(f"WARN: Error downloading full chunk {chunk[:5]}...: {exc}", file=sys.stderr)
                for t in chunk:
                    fetch_failed[t] = str(exc)

    # 2. Fetch tails grouped by start date
    # Most tails share the same start date (e.g. yesterday or Friday)
    start_groups: Dict[str, List[str]] = {}
    for t, s_date in to_fetch_tail.items():
        start_groups.setdefault(s_date, []).append(t)

    for s_date, group in start_groups.items():
        for i in range(0, len(group), chunk_size):
            chunk = group[i : i + chunk_size]
            try:
                df = yf.download(
                    chunk,
                    start=s_date,
                    end=end_iso,
                    interval="1d",
                    auto_adjust=True,
                    progress=False,
                    group_by="ticker",
                    threads=True,
                )
                parsed = parse_yf_download(df, chunk)
                for t in chunk:
                    new_data = parsed.get(t)
                    if not new_data:
                        # Keep existing cache, record fail
                        fetch_failed[t] = "no_tail_data"
                        continue

                    # Check for split
                    if detect_split(cached_tickers[t], new_data):
                        print(f"Split detected for {t} — refetching full series...")
                        full_series = refetch_full_series(t, end_iso)
                        if full_series:
                            cached_tickers[t] = trim_to_target_days(full_series)
                            refetched.add(t)
                            fetch_failed.pop(t, None)
                        else:
                            # Keep cached series, record failure
                            fetch_failed[t] = "split_refetch_failed"
                    else:
                        cached_tickers[t].update(new_data)
                        cached_tickers[t] = trim_to_target_days(cached_tickers[t])
                        fetch_failed.pop(t, None)
            except Exception as exc:
                print(f"WARN: Error downloading tail chunk {chunk[:5]}...: {exc}", file=sys.stderr)
                for t in chunk:
                    fetch_failed[t] = str(exc)

    # Assemble output payload
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    output_payload = {
        "asof": now_iso,
        "refetched": sorted(refetched),
        "fetch_failed": fetch_failed,
        "tickers": {t: cached_tickers[t] for t in sorted(universe) if t in cached_tickers},
    }

    formatted_json = serialize_daily_closes(output_payload)
    target_out.write_text(formatted_json, encoding="utf-8")
    print(f"Saved {len(output_payload['tickers'])} daily series to {target_out}")
    return output_payload


def parse_args():
    parser = argparse.ArgumentParser(description="Build daily price history (public/data/daily_closes.json).")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR, help="Data directory path.")
    parser.add_argument("--out", type=Path, default=None, help="Output JSON path override.")
    parser.add_argument("--tickers", nargs="+", default=None, help="Explicit list of tickers to fetch.")
    return parser.parse_args()


def main():
    args = parse_args()
    build_daily_price_history(
        data_dir=args.data_dir,
        out_file=args.out,
        tickers_override=args.tickers,
    )


if __name__ == "__main__":
    main()

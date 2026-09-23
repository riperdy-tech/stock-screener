"""build_momentum_state.py — Deterministic SCR-10 Momentum State Engine.

Computes public/data/momentum_state.json with single-source-of-truth momentum metrics
for both monthly closes (all universe names) and daily closes (names with daily history).

Monthly Metrics (all scored names with monthly history in price_history.json):
- mom_12_1: 12-1 skip-month return (via score_paradigm.compute_skip_month_return)
- mom_6m: 6-month trailing return (via score_paradigm.compute_raw_return)
- mom_1m: 1-month trailing return (via score_paradigm.compute_raw_return)
- high_52w_proxy: proximity to 52w high from monthly closes minus 1.0 (via score_paradigm.compute_high_proximity)
- mom_accel: cross-sectional rank_1m - rank_12m
- regime_shift_up / regime_shift_down: 10-month MA rule from score_paradigm.py:714-724
- mom_z_sector: sector-neutral z-score of mom_12_1 (via score_factors_dual_door.sector_neutral_z)

Daily Metrics (when public/data/daily_closes.json has sufficient history):
- price_asof: latest date string (YYYY-MM-DD)
- pct_from_52w_high: close[-1] / max(closes[-252:]) - 1.0 (requires >= 252 days)
- above_200dma: close[-1] > mean(closes[-200:]) (requires >= 200 days)
- dma200_slope_20d: (dma200_now / dma200_20d_ago) - 1.0 (requires >= 220 days)
- rs_vs_cluster_etf_3m: 63-day stock return - 63-day cluster/sector ETF return (requires >= 64 days)
- rs_vs_iwm_3m: 63-day stock return - 63-day IWM return (requires >= 64 days)
- adv_20d_usd: median(close * volume) over last 20 days (requires >= 20 days)
- realised_vol_60d: annualized stdev of 60 daily returns (requires >= 61 days)
- mom_break: (not above_200dma and dma200_slope_20d < 0) or (pct_from_52w_high < -0.20 and mom_1m < 0)

All fields are ABSENT when underlying data is absent (never 0, never guessed).
"""

import argparse
import json
import math
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA_DIR = ROOT / "public" / "data"
CONFIG_FILE = Path(__file__).resolve().with_name("momentum_config.json")

# Ensure scripts directory is on sys.path for internal imports
SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from score_paradigm import (
    compute_skip_month_return,
    compute_high_proximity,
    compute_raw_return,
    compute_percentile_rank,
)
from score_factors_dual_door import sector_neutral_z
from industry_taxonomy import get_taxonomy_profile

CLUSTER_ETF_MAP: Dict[str, str] = {
    "semiconductors": "SMH",
    "software": "IGV",
    "banks": "KBE",
    "biotech": "XBI",
    "oil_gas_ep": "XOP",
    "homebuilders": "XHB",
}

SECTOR_ETF_MAP: Dict[str, str] = {
    "Technology": "XLK",
    "Financial Services": "XLF",
    "Industrials": "XLI",
    "Healthcare": "XLV",
    "Energy": "XLE",
    "Basic Materials": "XLB",
    "Consumer Cyclical": "XLY",
    "Consumer Defensive": "XLP",
    "Communication Services": "XLC",
    "Real Estate": "XLRE",
    "Utilities": "XLU",
}


def load_json_file(path: Path) -> Any:
    """Load JSON from disk or return empty dict/list if not found."""
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"WARN: could not load {path}: {exc}", file=sys.stderr)
        return {}


def load_config() -> Dict[str, Any]:
    """Load momentum configuration."""
    cfg = load_json_file(CONFIG_FILE)
    if not cfg:
        cfg = {
            "_note": "Defaults are judgement until the Phase 2 trend-break study re-tunes them on valid verdicts.",
            "dma200_slope_lookback_days": 20,
            "pct_from_52w_high_break_threshold": -0.20,
            "mom_break_terms": {
                "dma_trend_break": {"require_below_200dma": True, "max_dma200_slope_20d": 0.0},
                "drawdown_break": {"max_pct_from_52w_high": -0.20, "max_mom_1m": 0.0},
            },
        }
    return cfg


def compute_monthly_metrics(
    price_history: Dict[str, Any],
    stocks: Dict[str, Any],
) -> Dict[str, Dict[str, Any]]:
    """Compute monthly momentum metrics for every ticker with monthly closes."""
    prices_dict: Dict[str, List[float]] = price_history.get("prices", {})
    all_tickers = sorted(set(list(stocks.keys()) + list(prices_dict.keys())))

    raw_returns_1m: Dict[str, float] = {}
    raw_returns_12m: Dict[str, float] = {}
    monthly_data: Dict[str, Dict[str, Any]] = {}

    for t in all_tickers:
        prices = prices_dict.get(t)
        if not isinstance(prices, list) or len(prices) < 2:
            continue

        item: Dict[str, Any] = {}

        # 1. 12-1 momentum (standard 11-month window skipping latest month)
        m121 = compute_skip_month_return(prices)
        if m121 is not None:
            item["mom_12_1"] = round(m121, 4)

        # 2. 6-month trailing return
        m6 = compute_raw_return(prices, 6)
        if m6 is not None:
            item["mom_6m"] = round(m6, 4)

        # 3. 1-month trailing return
        m1 = compute_raw_return(prices, 1)
        if m1 is not None:
            item["mom_1m"] = round(m1, 4)
            raw_returns_1m[t] = m1

        # 12-month return for acceleration
        m12 = compute_raw_return(prices, 12)
        if m12 is not None:
            raw_returns_12m[t] = m12

        # 4. 52-week high proxy (monthly closes) in drawdown/return space
        prox = compute_high_proximity(prices)
        if prox is not None:
            item["high_52w_proxy"] = round(prox - 1.0, 4)

        # 5. Regime-shift booleans from 10-month MA rule
        if len(prices) >= 22:
            ma_10_now = sum(prices[-10:]) / 10.0
            ma_10_then = sum(prices[-22:-12]) / 10.0
            price_now = prices[-1]
            item["regime_shift_up"] = bool(price_now > ma_10_now and ma_10_now > ma_10_then)
            item["regime_shift_down"] = bool(price_now < ma_10_now and ma_10_now < ma_10_then)

        if item:
            monthly_data[t] = item

    # 6. Cross-sectional momentum acceleration: rank_1m - rank_12m
    # Requires both 1m and 12m returns to be present
    common_tickers = sorted(set(raw_returns_1m.keys()) & set(raw_returns_12m.keys()))
    if common_tickers:
        dist_1m = sorted(raw_returns_1m[t] for t in common_tickers)
        dist_12m = sorted(raw_returns_12m[t] for t in common_tickers)
        count = len(common_tickers)
        for t in common_tickers:
            r1 = compute_percentile_rank(raw_returns_1m[t], dist_1m, count)
            r12 = compute_percentile_rank(raw_returns_12m[t], dist_12m, count)
            accel = r1 - r12
            if t in monthly_data:
                monthly_data[t]["mom_accel"] = round(accel, 4)

    # 7. Sector-neutral z-score of mom_12_1
    mom_12_1_by_ticker = {t: monthly_data[t].get("mom_12_1") for t in monthly_data}
    sector_by_ticker = {t: stocks.get(t, {}).get("sector") or "Unknown" for t in monthly_data}
    z_scores = sector_neutral_z(mom_12_1_by_ticker, sector_by_ticker)
    for t, z_val in z_scores.items():
        if z_val is not None:
            monthly_data[t]["mom_z_sector"] = round(z_val, 3)

    return monthly_data


def compute_daily_metrics(
    daily_closes: Dict[str, Any],
    stocks: Dict[str, Any],
    monthly_data: Dict[str, Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    """Compute daily momentum metrics for tickers present in daily_closes.json."""
    tickers_dict: Dict[str, Dict[str, List[float]]] = daily_closes.get("tickers", {})
    if not tickers_dict:
        return {}

    # Pre-extract series and calculate 63-day ETF returns
    etf_63d_returns: Dict[str, float] = {}
    parsed_series: Dict[str, Tuple[List[str], List[float], List[float]]] = {}

    for t, date_map in tickers_dict.items():
        if not date_map:
            continue
        sorted_dates = sorted(date_map.keys())
        closes = [date_map[d][0] for d in sorted_dates]
        volumes = [date_map[d][1] for d in sorted_dates]
        parsed_series[t] = (sorted_dates, closes, volumes)

        if len(closes) >= 64:
            c_now, c_past = closes[-1], closes[-64]
            if c_past > 0 and math.isfinite(c_now) and math.isfinite(c_past):
                etf_63d_returns[t] = (c_now / c_past) - 1.0

    iwm_ret_63d = etf_63d_returns.get("IWM")

    daily_results: Dict[str, Dict[str, Any]] = {}

    for t, (dates, closes, volumes) in parsed_series.items():
        item: Dict[str, Any] = {}
        n_days = len(closes)
        if n_days == 0:
            continue

        item["price_asof"] = dates[-1]

        # 1. True 252-trading-day 52-week high drawdown
        if n_days >= 252:
            high_252 = max(closes[-252:])
            if high_252 > 0 and math.isfinite(high_252) and math.isfinite(closes[-1]):
                item["pct_from_52w_high"] = round((closes[-1] / high_252) - 1.0, 4)

        # 2. 200-day moving average position
        if n_days >= 200:
            dma200_now = sum(closes[-200:]) / 200.0
            if dma200_now > 0 and math.isfinite(dma200_now) and math.isfinite(closes[-1]):
                item["above_200dma"] = bool(closes[-1] > dma200_now)

        # 3. 200-day moving average 20-day slope
        if n_days >= 220:
            dma200_now = sum(closes[-200:]) / 200.0
            dma200_past = sum(closes[-220:-20]) / 200.0
            if dma200_past > 0 and math.isfinite(dma200_now) and math.isfinite(dma200_past):
                item["dma200_slope_20d"] = round((dma200_now / dma200_past) - 1.0, 4)

        # 4. 3-month (63 trading days) return
        stock_ret_63d: Optional[float] = None
        if n_days >= 64:
            c_now, c_past = closes[-1], closes[-64]
            if c_past > 0 and math.isfinite(c_now) and math.isfinite(c_past):
                stock_ret_63d = (c_now / c_past) - 1.0

        if stock_ret_63d is not None:
            # Relative strength vs cluster or sector ETF
            s_info = stocks.get(t, {})
            tax = get_taxonomy_profile(s_info.get("industry"), s_info.get("sector"))
            mgi_id = tax.get("mgi_subindustry_id")
            sec = tax.get("sector")
            proxy_etf = CLUSTER_ETF_MAP.get(mgi_id) if mgi_id else None
            if not proxy_etf and sec:
                proxy_etf = SECTOR_ETF_MAP.get(sec)

            if proxy_etf and proxy_etf in etf_63d_returns:
                item["rs_vs_cluster_etf_3m"] = round(stock_ret_63d - etf_63d_returns[proxy_etf], 4)

            # Relative strength vs IWM (smallcap benchmark)
            if iwm_ret_63d is not None:
                item["rs_vs_iwm_3m"] = round(stock_ret_63d - iwm_ret_63d, 4)

        # 5. ADV 20-day median (close * volume)
        if n_days >= 20:
            d_closes = closes[-20:]
            d_vols = volumes[-20:]
            dollar_vols = [c * v for c, v in zip(d_closes, d_vols) if c > 0 and v >= 0]
            if len(dollar_vols) >= 20:
                item["adv_20d_usd"] = round(float(statistics.median(dollar_vols)), 2)

        # 6. Realised volatility 60-day (annualized)
        if n_days >= 61:
            recent_closes = closes[-61:]
            rets = [
                recent_closes[i] / recent_closes[i - 1] - 1.0
                for i in range(1, len(recent_closes))
                if recent_closes[i - 1] > 0
            ]
            if len(rets) == 60:
                sd_daily = statistics.stdev(rets)
                ann_vol = sd_daily * math.sqrt(252)
                if math.isfinite(ann_vol):
                    item["realised_vol_60d"] = round(ann_vol, 4)

        # 7. Trend break detection: mom_break
        above_200 = item.get("above_200dma")
        slope_200 = item.get("dma200_slope_20d")
        pct_high = item.get("pct_from_52w_high")
        mom_1m = monthly_data.get(t, {}).get("mom_1m")

        if (
            above_200 is not None
            and slope_200 is not None
            and pct_high is not None
            and mom_1m is not None
        ):
            term1 = (not above_200) and (slope_200 < 0.0)
            term2 = (pct_high < -0.20) and (mom_1m < 0.0)
            item["mom_break"] = bool(term1 or term2)

        if item:
            daily_results[t] = item

    return daily_results


def build_momentum_state(
    data_dir: Path,
    out_file: Optional[Path] = None,
) -> Dict[str, Any]:
    """Build and save public/data/momentum_state.json."""
    data_dir = data_dir.resolve()
    target_out = out_file or (data_dir / "momentum_state.json")
    target_out.parent.mkdir(parents=True, exist_ok=True)

    stocks_json_path = data_dir / "stocks.json"
    price_history_path = data_dir / "price_history.json"
    daily_closes_path = data_dir / "daily_closes.json"

    stocks_raw = load_json_file(stocks_json_path)
    if isinstance(stocks_raw, list):
        stocks = {s.get("symbol"): s for s in stocks_raw if isinstance(s, dict) and s.get("symbol")}
    elif isinstance(stocks_raw, dict):
        stocks = stocks_raw
    else:
        stocks = {}
    price_history = load_json_file(price_history_path)
    daily_closes = load_json_file(daily_closes_path)
    config = load_config()

    print(f"Building momentum state for universe in {data_dir}...")
    monthly_data = compute_monthly_metrics(price_history, stocks)
    print(f"  Computed monthly metrics for {len(monthly_data)} tickers")

    daily_data = compute_daily_metrics(daily_closes, stocks, monthly_data)
    print(f"  Computed daily metrics for {len(daily_data)} tickers")

    all_tickers = sorted(set(list(monthly_data.keys()) + list(daily_data.keys())))
    merged_tickers: Dict[str, Dict[str, Any]] = {}

    for t in all_tickers:
        m_item = monthly_data.get(t, {})
        d_item = daily_data.get(t, {})
        combined: Dict[str, Any] = {}

        # Monthly fields in order
        for f in (
            "mom_12_1",
            "mom_6m",
            "mom_1m",
            "high_52w_proxy",
            "mom_accel",
            "regime_shift_up",
            "regime_shift_down",
            "mom_z_sector",
        ):
            val = m_item.get(f)
            if val is not None:
                combined[f] = val

        # Daily fields in order
        for f in (
            "price_asof",
            "pct_from_52w_high",
            "above_200dma",
            "dma200_slope_20d",
            "rs_vs_cluster_etf_3m",
            "rs_vs_iwm_3m",
            "adv_20d_usd",
            "realised_vol_60d",
            "mom_break",
        ):
            val = d_item.get(f)
            if val is not None:
                combined[f] = val

        if combined:
            merged_tickers[t] = combined

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    payload = {
        "asof": now_iso,
        "config": config,
        "tickers": merged_tickers,
    }

    target_out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Saved momentum state with {len(merged_tickers)} tickers to {target_out}")
    return payload


def parse_args():
    parser = argparse.ArgumentParser(description="Build momentum state (public/data/momentum_state.json).")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR, help="Data directory path.")
    parser.add_argument("--out", type=Path, default=None, help="Output JSON path override.")
    return parser.parse_args()


def main():
    args = parse_args()
    build_momentum_state(data_dir=args.data_dir, out_file=args.out)


if __name__ == "__main__":
    main()

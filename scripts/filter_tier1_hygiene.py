"""filter_tier1_hygiene.py — Tier 1 Retail Hygiene & SEC Statutory Filing Verification.

Filters the universal equity pool (~6,900 tickers) down to a clean, tradeable,
SEC-compliant investment universe (~1,600-1,800 tickers).

Core Rules:
1. Minimum Market Capitalization: >= $300M (eliminates illiquid micro-caps).
2. Minimum Share Price: >= $3.00 (eliminates penny stocks subject to reverse-split volatility).
3. Minimum Dollar Volume (ADV): >= $300,000/day (keeps retail trade impact < 5% of ADV and spreads < 25 bps).
4. SEC Reporting Compliance: Verified annual report (10-K, 20-F, 40-F) within 15 months of evaluation date.
   - Issuers lacking recent US XBRL but actively trading with foreign reporting are flagged
     `DATA_FLAG: ALTERNATE_REPORTING` and retained for SearXNG Local AI verification.

Usage:
  python scripts/filter_tier1_hygiene.py
Outputs:
  public/data/tier1_hygiene_survivors.json
  public/data/tier1_hygiene_audit.json
"""

import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"

STOCKS_JSON = DATA / "stocks.json"
FUNDAMENTALS_JSON = DATA / "fundamentals_history.json"
FUNDAMENTALS_TTM_JSON = DATA / "fundamentals_ttm.json"
MOMENTUM_STATE_JSON = DATA / "momentum_state.json"
PRICE_HISTORY_JSON = DATA / "price_history.json"
CIK_MAP_JSON = DATA / "cik_map.json"

sys.path.append(str(Path(__file__).resolve().parent))
from hygiene_thresholds import MIN_MARKET_CAP, MIN_SHARE_PRICE, MIN_ADV_DOLLAR, resolve_adv_usd

OUT_SURVIVORS_JSON = DATA / "tier1_hygiene_survivors.json"
OUT_AUDIT_JSON = DATA / "tier1_hygiene_audit.json"

# Thresholds — P3.10: the only statutory-staleness constant actually used. EVAL_YEAR and
# MIN_COMPLIANT_FY (a hardcoded fiscal-year cutoff) and the unused MAX_STALE_MONTHS are gone;
# staleness is now measured from the real annual period-end date, not a fixed calendar year.
STALE_ANNUAL_REPORT_MAX_MONTHS = 16   # 16 months from fiscal year end (15 months from filing)

# Benchmark tickers that MUST NEVER be rejected (Preservation Gate)
BENCHMARK_PRESERVE = [
    "NVDA", "AAPL", "MSFT", "GOOG", "COST", "LLY", "GWW", "CPRT", "ORLY", "ODFL",
    "CTAS", "V", "MA", "AVGO", "FAST", "CEG", "VST", "CAT", "DE", "FCX", "XOM", "CVX",
    "NUE", "CF", "MOS", "EXEL", "INCY", "BMRN", "ALNY", "PLTR", "SNOW", "CRWD", "NET"
]


def num(v) -> Optional[float]:
    return float(v) if isinstance(v, (int, float)) and math.isfinite(v) else None


def load_json(p: Path, default=None):
    if not p.exists():
        return default
    with p.open("r", encoding="utf-8") as f:
        return json.load(f)


def resolve_period_end(sym: str, years: List[int], period_end_map: Dict[str, Any],
                        fundamentals_ttm: Dict[str, Any]) -> Optional[str]:
    """P3.10: the latest annual period-end date for a ticker — fundamentals_history.json's
    provenance.period_end[sym][latest_fy] when available, else fundamentals_ttm.json's
    fy_leg_end. None when neither resolves (an absence, not a guessed date)."""
    if not years:
        return None
    latest_fy_str = str(years[-1])
    period_end = (period_end_map.get(sym) or {}).get(latest_fy_str)
    if period_end is not None:
        return period_end
    return (fundamentals_ttm.get(sym) or {}).get("fy_leg_end")


def months_since(date_str: Optional[str], now: datetime) -> Optional[float]:
    """Calendar months (30.4368-day average) between a "YYYY-MM-DD" date and `now`. None when
    the date is missing or unparseable — an absence, never a guessed default."""
    if not date_str:
        return None
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        return None
    return (now - d).days / 30.4368


def benchmark_hard_fail(missing_bench: List[str], audit_log: Dict[str, Dict[str, Any]]) -> List[str]:
    """P3.10: the benchmark gate is hard — every preserved name must survive, or be vetoed for
    NOT_TRADABLE (delisted) alone. Anything else vetoed is a build-breaking regression."""
    return [t for t in missing_bench if audit_log.get(t, {}).get("primary_reason") != "NOT_TRADABLE"]


def evaluate_tier1():
    print("=" * 70)
    print("TIER 1 RETAIL HYGIENE & SEC STATUTORY REPORTING FILTER")
    print("=" * 70)

    stocks_data = load_json(STOCKS_JSON, [])
    stocks = {s["symbol"]: s for s in stocks_data if s.get("symbol")}
    fundamentals_raw = load_json(FUNDAMENTALS_JSON, {}) or {}
    fundamentals = fundamentals_raw.get("tickers", {})
    period_end_map = (fundamentals_raw.get("provenance", {}) or {}).get("period_end", {})
    fundamentals_ttm = (load_json(FUNDAMENTALS_TTM_JSON, {}) or {}).get("tickers", {})
    momentum_state = (load_json(MOMENTUM_STATE_JSON, {}) or {}).get("tickers", {})
    cik_map = load_json(CIK_MAP_JSON, {}) or {}

    total_universe = len(stocks)
    print(f"Loaded {total_universe} stocks from universe database.")
    now = datetime.now(timezone.utc)

    survivors: List[str] = []
    alternate_reporting: List[str] = []
    audit_log: Dict[str, Dict[str, Any]] = {}
    veto_tallies: Dict[str, int] = {}

    for sym, s in sorted(stocks.items()):
        mcap = num(s.get("marketCap"))
        price = num(s.get("price"))
        vol = num(s.get("volume"))
        sector = s.get("sector") or "Unknown"

        reasons = []
        flags = []

        # 1. Market Cap Check
        if mcap is None or mcap < MIN_MARKET_CAP:
            reasons.append(f"MARKET_CAP_BELOW_300M (mcap=${(mcap or 0)/1e6:.1f}M)")

        # 2. Price Floor Check
        if price is None or price < MIN_SHARE_PRICE:
            reasons.append(f"PRICE_BELOW_3 (price=${price if price else 0:.2f})")

        # 3. Liquidity ADV Check (P3.6c order, via hygiene_thresholds.resolve_adv_usd):
        #    stocks[t].metrics.adv_20d_usd (new, universe-wide) -> momentum_state adv_20d_usd
        #    (SCR-10) -> snapshot vol*price (flagged adv_single_day) -> none. The 300k check
        #    applies whenever a value resolves, same as before.
        stocks_adv_20d = num((s.get("metrics") or {}).get("adv_20d_usd"))
        mom_adv_20d = num(momentum_state.get(sym, {}).get("adv_20d_usd"))
        adv, adv_flag = resolve_adv_usd(stocks_adv_20d, mom_adv_20d, vol, price)
        if adv_flag is not None:
            flags.append(f"DATA_FLAG: {adv_flag.upper()}")
        if adv is not None and adv < MIN_ADV_DOLLAR:
            reasons.append(f"ADV_BELOW_300K (adv=${adv/1e3:.1f}k)")

        # 4. SEC Statutory Reporting Freshness Check (P3.10: period-end basis, not fiscal year)
        has_cik = sym in cik_map
        fh = fundamentals.get(sym, {})
        years = sorted([int(y) for y in fh.keys()]) if fh else []

        if not years:
            # Check if foreign issuer with alternate reporting
            country = s.get("country") or "US"
            if country != "United States" and mcap and mcap >= MIN_MARKET_CAP and price and price >= MIN_SHARE_PRICE:
                flags.append("DATA_FLAG: ALTERNATE_REPORTING")
                alternate_reporting.append(sym)
            else:
                reasons.append("NO_SEC_FUNDAMENTALS_FILED")
        else:
            period_end = resolve_period_end(sym, years, period_end_map, fundamentals_ttm)
            months_stale = months_since(period_end, now)
            if months_stale is None:
                flags.append("DATA_FLAG: PERIOD_END_UNRESOLVED")
            elif months_stale > STALE_ANNUAL_REPORT_MAX_MONTHS:
                reasons.append(
                    f"SEC_DELINQUENT_STALE_ANNUAL_REPORT (period_end={period_end}, "
                    f"months_since={months_stale:.1f} > {STALE_ANNUAL_REPORT_MAX_MONTHS})"
                )

        # 5. Non-Operating Vehicle / SPAC Check
        industry = (s.get("industry") or "").strip()
        if industry in ("Shell Companies", "Blank Check"):
            reasons.append("NON_OPERATING_SHELL_SPAC")

        # Decision
        if reasons:
            primary_reason = reasons[0].split(" ")[0]
            veto_tallies[primary_reason] = veto_tallies.get(primary_reason, 0) + 1
            audit_log[sym] = {
                "decision": "VETO",
                "primary_reason": primary_reason,
                "reasons": reasons,
                "flags": flags,
                "marketCap": mcap,
                "price": price,
                "sector": sector
            }
        else:
            survivors.append(sym)
            audit_log[sym] = {
                "decision": "PASS",
                "primary_reason": "CLEAN",
                "reasons": [],
                "flags": flags,
                "marketCap": mcap,
                "price": price,
                "sector": sector,
                "latest_fy": years[-1] if years else None
            }

    # Preservation Gate Check (P3.10: hard gate — a benchmark name vetoed for any reason other
    # than NOT_TRADABLE is a build-breaking regression, not a warning)
    missing_bench = [t for t in BENCHMARK_PRESERVE if t not in survivors]
    hard_fail_bench = benchmark_hard_fail(missing_bench, audit_log)
    if missing_bench:
        print(f"\n[FATAL WARNING] Benchmark preservation failed for: {missing_bench}")
        for t in missing_bench:
            print(f"  {t}: {audit_log.get(t)}")
    else:
        print(f"\n[PASS] 100% Benchmark Preservation verified ({len(BENCHMARK_PRESERVE)}/{len(BENCHMARK_PRESERVE)} passed).")

    # Write Outputs
    survivors_data = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "total_universe": total_universe,
        "survivors_count": len(survivors),
        "vetoed_count": len(audit_log) - len(survivors),
        "retention_rate_pct": round(len(survivors) / total_universe * 100.0, 2),
        "survivor_tickers": survivors,
        # P3.10: written per ticker so SCR-03b can stamp fct_veto_detail =
        # "alternate_reporting_unverified" instead of the generic NO_FUNDAMENTAL_HISTORY.
        "alternate_reporting": sorted(alternate_reporting)
    }
    OUT_SURVIVORS_JSON.write_text(json.dumps(survivors_data, indent=2), encoding="utf-8")

    audit_summary = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "total_universe": total_universe,
        "survivors_count": len(survivors),
        "veto_breakdown": veto_tallies,
        "details": audit_log
    }
    OUT_AUDIT_JSON.write_text(json.dumps(audit_summary, indent=2), encoding="utf-8")

    print(f"Survivors: {len(survivors)} / {total_universe} ({survivors_data['retention_rate_pct']}%)")
    print(f"Veto Breakdown:")
    for reason, count in sorted(veto_tallies.items(), key=lambda x: -x[1]):
        print(f"  - {reason:<40}: {count:>5}")
    print(f"Saved survivors to: {OUT_SURVIVORS_JSON}")
    print(f"Saved audit log to: {OUT_AUDIT_JSON}")
    print("=" * 70)

    if hard_fail_bench:
        print(f"[FATAL] Benchmark preservation gate: {hard_fail_bench} vetoed for a reason "
              f"other than NOT_TRADABLE.")
        for t in hard_fail_bench:
            print(f"  {t}: {audit_log.get(t)}")
        sys.exit(1)

    return survivors


if __name__ == "__main__":
    evaluate_tier1()

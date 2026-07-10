"""build_fundamentals_history.py — 10-year fundamentals + value-trap battery
from the SEC companyfacts bulk archive.

Reads companyfacts.zip (SEC XBRL frames, ~19.7K CIK files) directly — no
extraction to disk — for every ticker in stocks.json, builds an annual
fundamentals history (revenue, margins, cash flow, balance sheet, shares),
and computes the value-trap battery the audit found missing:

  - Piotroski F-Score (9 checks, reported with how many were computable)
  - Sloan accruals ratio ((NI - CFO) / avg assets; high = earnings not cash)
  - Net share issuance (1y and 3y CAGR of diluted shares)
  - Beneish M-Score (real 8-ratio computation; replaces the old -2.0
    placeholder; missing ratios neutralized and reported, never invented)
  - 10y revenue/operating-margin arrays (mid-cycle inputs for cyclicals)

Outputs:
  public/data/fundamentals_history.json — ticker -> {years: {fy: {...}}}
  public/data/fundamentals_battery.json — ticker -> battery summary
  (battery is the file scoring code should consume; history is the audit trail)

Usage:
  python scripts/build_fundamentals_history.py                 # full universe
  python scripts/build_fundamentals_history.py --limit 50      # smoke run
  python scripts/build_fundamentals_history.py --tickers NVDA,LLY

Data honesty rules: a metric that cannot be computed is null with its gaps
reported — no neutral-looking defaults.
"""

import argparse
import json
import sys
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import requests

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"
STOCKS_JSON = DATA / "stocks.json"
ZIP_PATH = ROOT / "companyfacts.zip"
CIK_MAP_JSON = DATA / "cik_map.json"
HISTORY_JSON = DATA / "fundamentals_history.json"
BATTERY_JSON = DATA / "fundamentals_battery.json"

SEC_HEADERS = {"User-Agent": "StockScreener/1.0 (contact@example.com)"}
ANNUAL_FORMS = ("10-K", "10-K/A", "20-F", "40-F")
MAX_YEARS = 12  # keep up to 12 fiscal years

# Tag priority lists (us-gaap first, ifrs-full equivalents after — the two
# namespaces are merged with us-gaap winning on name collisions). Foreign
# filers reporting in non-USD units stay uncovered by design: the USD-only
# unit filter prevents currency-mismatched yields (TSM files in TWD).
DURATION_TAGS = {
    "revenue": ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax",
                "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet",
                "Revenue", "RevenueFromContractsWithCustomers"],
    "gross_profit": ["GrossProfit"],
    "operating_income": ["OperatingIncomeLoss", "ProfitLossFromOperatingActivities"],
    "net_income": ["NetIncomeLoss", "ProfitLoss",
                   "ProfitLossAttributableToOwnersOfParent"],
    "ocf": ["NetCashProvidedByUsedInOperatingActivities",
            "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
            "CashFlowsFromUsedInOperatingActivities"],
    "capex": ["PaymentsToAcquirePropertyPlantAndEquipment",
              "PaymentsToAcquireProductiveAssets",
              "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"],
    "da": ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization",
           "DepreciationAmortizationAndAccretionNet",
           "DepreciationAndAmortisationExpense"],
    "sga": ["SellingGeneralAndAdministrativeExpense",
            "GeneralAndAdministrativeExpense"],
    "interest_expense": ["InterestExpense", "InterestExpenseDebt"],
    "shares_diluted": ["WeightedAverageNumberOfDilutedSharesOutstanding",
                       "WeightedAverageNumberOfSharesOutstandingBasic",
                       "WeightedAverageShares", "AdjustedWeightedAverageShares"],
    # Tax fields so fetch_data can derive an effective tax rate for ROIC from SEC data
    # (instead of a daily yfinance stock.financials fetch per ticker — quota killer).
    "pretax_income": ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
                      "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
                      "ProfitLossBeforeTax"],
    "tax_provision": ["IncomeTaxExpenseBenefit", "IncomeTaxExpenseContinuingOperations",
                      "IncomeTaxExpenseIncome"],
}
INSTANT_TAGS = {
    "total_assets": ["Assets"],
    "current_assets": ["AssetsCurrent", "CurrentAssets"],
    "current_liabilities": ["LiabilitiesCurrent", "CurrentLiabilities"],
    "total_liabilities": ["Liabilities"],
    "equity": ["StockholdersEquity",
               "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
               "Equity"],
    "cash": ["CashAndCashEquivalentsAtCarryingValue",
             "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
             "CashAndCashEquivalents"],
    "lt_debt": ["LongTermDebtNoncurrent", "LongTermDebt"],
    "receivables": ["AccountsReceivableNetCurrent", "ReceivablesNetCurrent",
                    "TradeAndOtherCurrentReceivables"],
    "inventory": ["InventoryNet", "Inventories"],
    "ppe_net": ["PropertyPlantAndEquipmentNet", "PropertyPlantAndEquipment"],
    # Altman-Z B-term (retained earnings / total assets) for the SEC-derived Z in fetch_data.
    "retained_earnings": ["RetainedEarningsAccumulatedDeficit", "RetainedEarnings"],
}
SHARES_UNIT = "shares"


def get_cik_map():
    """ticker -> 10-digit CIK string, cached locally."""
    if CIK_MAP_JSON.exists():
        try:
            cached = json.loads(CIK_MAP_JSON.read_text(encoding="utf-8"))
            if cached.get("map"):
                return cached["map"]
        except (OSError, json.JSONDecodeError):
            pass
    print("Fetching SEC CIK mapping ...")
    resp = requests.get("https://www.sec.gov/files/company_tickers.json",
                        headers=SEC_HEADERS, timeout=60)
    resp.raise_for_status()
    mapping = {e["ticker"]: str(e["cik_str"]).zfill(10) for e in resp.json().values()}
    CIK_MAP_JSON.write_text(json.dumps(
        {"fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
         "map": mapping}), encoding="utf-8")
    return mapping


def annual_duration_series(facts, tags, unit_keys=("USD",)):
    """fiscal_year -> value for ~12-month-duration facts from annual filings.

    Tag selection: most RECENT latest-year wins, then most coverage. Tags are
    never mixed within one series — companies switch tags over time (e.g.
    Revenues -> RevenueFromContractWithCustomer...), and both first-tag-wins
    and coverage-only selection picked stale tags (AAPL's SalesRevenueNet has
    11 old years but ends in 2017).
    """
    candidates = []
    for tag in tags:
        units = facts.get(tag, {}).get("units", {})
        best = {}
        for uk in unit_keys:
            for e in units.get(uk, []):
                if e.get("form") not in ANNUAL_FORMS:
                    continue
                start, end = e.get("start"), e.get("end")
                val = e.get("val")
                if not start or not end or val is None:
                    continue
                try:
                    days = (date.fromisoformat(end) - date.fromisoformat(start)).days
                except ValueError:
                    continue
                if not 300 <= days <= 400:
                    continue
                year = int(end[:4])
                cur = best.get(year)
                if cur is None or (e.get("filed") or "") >= (cur[0] or ""):
                    best[year] = (e.get("filed"), val)
        if best:
            candidates.append({y: v for y, (_, v) in best.items()})
    if not candidates:
        return {}
    return max(candidates, key=lambda s: (max(s), len(s)))


def annual_instant_series(facts, tags, unit_keys=("USD",)):
    """fiscal_year -> value for balance-sheet (instant) facts from annual filings.

    Same recency-then-coverage tag selection as annual_duration_series.
    """
    candidates = []
    for tag in tags:
        units = facts.get(tag, {}).get("units", {})
        best = {}
        for uk in unit_keys:
            for e in units.get(uk, []):
                if e.get("form") not in ANNUAL_FORMS:
                    continue
                end = e.get("end")
                val = e.get("val")
                if not end or val is None:
                    continue
                year = int(end[:4])
                key = (end, e.get("filed") or "")
                cur = best.get(year)
                if cur is None or key >= cur[0]:
                    best[year] = (key, val)
        if best:
            candidates.append({y: v for y, (_, v) in best.items()})
    if not candidates:
        return {}
    return max(candidates, key=lambda s: (max(s), len(s)))


def extract_history(facts):
    """Build {fiscal_year: {field: value}} from a CIK's us-gaap facts."""
    series = {}
    for field, tags in DURATION_TAGS.items():
        unit = ("shares",) if field == "shares_diluted" else ("USD",)
        series[field] = annual_duration_series(facts, tags, unit)
    for field, tags in INSTANT_TAGS.items():
        series[field] = annual_instant_series(facts, tags)

    years = set()
    for s in series.values():
        years.update(s.keys())
    if not years:
        return {}
    years = sorted(years)[-MAX_YEARS:]

    history = {}
    for y in years:
        row = {f: series[f].get(y) for f in series}
        # Require at least a revenue or assets figure for the year to count
        if row.get("revenue") is None and row.get("total_assets") is None:
            continue
        ocf, capex = row.get("ocf"), row.get("capex")
        row["fcf"] = (ocf - capex) if (ocf is not None and capex is not None) else None
        history[y] = row
    return history


def safe_div(a, b):
    if a is None or b is None or b == 0:
        return None
    return a / b


def compute_battery(history):
    """Value-trap battery from the two most recent complete fiscal years."""
    years = sorted(history.keys())
    if len(years) < 2:
        return None
    y0, y1 = years[-1], years[-2]
    c, p = history[y0], history[y1]  # current, prior

    battery = {"fiscal_year": y0, "years_available": len(years)}

    # ── Piotroski F-Score ────────────────────────────────────────────────
    checks = {}
    roa_c = safe_div(c.get("net_income"), c.get("total_assets"))
    roa_p = safe_div(p.get("net_income"), p.get("total_assets"))
    if roa_c is not None:
        checks["roa_positive"] = roa_c > 0
    if c.get("ocf") is not None:
        checks["cfo_positive"] = c["ocf"] > 0
    if roa_c is not None and roa_p is not None:
        checks["roa_improving"] = roa_c > roa_p
    if c.get("ocf") is not None and c.get("net_income") is not None:
        checks["cfo_exceeds_ni"] = c["ocf"] > c["net_income"]
    lev_c = safe_div(c.get("lt_debt"), c.get("total_assets"))
    lev_p = safe_div(p.get("lt_debt"), p.get("total_assets"))
    if lev_c is not None and lev_p is not None:
        checks["leverage_decreasing"] = lev_c <= lev_p
    cr_c = safe_div(c.get("current_assets"), c.get("current_liabilities"))
    cr_p = safe_div(p.get("current_assets"), p.get("current_liabilities"))
    if cr_c is not None and cr_p is not None:
        checks["current_ratio_improving"] = cr_c > cr_p
    if c.get("shares_diluted") is not None and p.get("shares_diluted") is not None:
        checks["no_dilution"] = c["shares_diluted"] <= p["shares_diluted"] * 1.02
    gm_c = safe_div(c.get("gross_profit"), c.get("revenue"))
    gm_p = safe_div(p.get("gross_profit"), p.get("revenue"))
    if gm_c is not None and gm_p is not None:
        checks["gross_margin_improving"] = gm_c > gm_p
    at_c = safe_div(c.get("revenue"), c.get("total_assets"))
    at_p = safe_div(p.get("revenue"), p.get("total_assets"))
    if at_c is not None and at_p is not None:
        checks["asset_turnover_improving"] = at_c > at_p

    battery["f_score"] = sum(1 for v in checks.values() if v) if checks else None
    battery["f_score_checks_available"] = len(checks)

    # ── Sloan accruals ───────────────────────────────────────────────────
    if all(x is not None for x in (c.get("net_income"), c.get("ocf"),
                                   c.get("total_assets"), p.get("total_assets"))):
        avg_assets = (c["total_assets"] + p["total_assets"]) / 2
        battery["accruals_ratio"] = round((c["net_income"] - c["ocf"]) / avg_assets, 4) if avg_assets else None
    else:
        battery["accruals_ratio"] = None

    # ── Net share issuance ───────────────────────────────────────────────
    # Split guard: a year-over-year share-count jump of +-50% or more is a
    # stock split / reverse split, not issuance (weighted share counts in
    # filings are NOT retro-adjusted across years). Without this, NVDA's
    # 2024 10-for-1 split reads as 41%/yr dilution.
    sh = {y: history[y].get("shares_diluted") for y in years}
    split_suspected = False
    sh_years = [y for y in years if sh.get(y)]
    for a, b in zip(sh_years, sh_years[1:]):
        r = sh[b] / sh[a]
        if r >= 1.5 or r <= 0.55:
            split_suspected = True
            break
    battery["share_count_split_suspected"] = split_suspected
    if split_suspected:
        battery["net_issuance_1y"] = None
        battery["net_issuance_3y_cagr"] = None
        checks.pop("no_dilution", None)
        battery["f_score"] = sum(1 for v in checks.values() if v) if checks else None
        battery["f_score_checks_available"] = len(checks)
    else:
        battery["net_issuance_1y"] = (
            round(sh[y0] / sh[y1] - 1, 4) if sh.get(y0) and sh.get(y1) else None)
        y3 = next((y for y in years if y <= y0 - 3 and sh.get(y)), None)
        battery["net_issuance_3y_cagr"] = (
            round((sh[y0] / sh[y3]) ** (1 / (y0 - y3)) - 1, 4)
            if sh.get(y0) and y3 else None)

    # ── Beneish M-Score (8 ratios; missing ones neutralized + reported) ──
    ratios = {}
    missing = []

    def ratio(name, value):
        if value is None:
            missing.append(name)
            ratios[name] = 1.0  # neutral
        else:
            ratios[name] = value

    rec_rev_c = safe_div(c.get("receivables"), c.get("revenue"))
    rec_rev_p = safe_div(p.get("receivables"), p.get("revenue"))
    ratio("DSRI", safe_div(rec_rev_c, rec_rev_p))
    ratio("GMI", safe_div(gm_p, gm_c))  # prior / current: >1 = margin deterioration
    aq_c = None
    aq_p = None
    if all(x is not None for x in (c.get("current_assets"), c.get("ppe_net"), c.get("total_assets"))):
        aq_c = 1 - (c["current_assets"] + c["ppe_net"]) / c["total_assets"]
    if all(x is not None for x in (p.get("current_assets"), p.get("ppe_net"), p.get("total_assets"))):
        aq_p = 1 - (p["current_assets"] + p["ppe_net"]) / p["total_assets"]
    ratio("AQI", safe_div(aq_c, aq_p))
    ratio("SGI", safe_div(c.get("revenue"), p.get("revenue")))
    dep_rate_c = None
    dep_rate_p = None
    if c.get("da") is not None and c.get("ppe_net") is not None and (c["da"] + c["ppe_net"]):
        dep_rate_c = c["da"] / (c["da"] + c["ppe_net"])
    if p.get("da") is not None and p.get("ppe_net") is not None and (p["da"] + p["ppe_net"]):
        dep_rate_p = p["da"] / (p["da"] + p["ppe_net"])
    ratio("DEPI", safe_div(dep_rate_p, dep_rate_c))
    sga_c = safe_div(c.get("sga"), c.get("revenue"))
    sga_p = safe_div(p.get("sga"), p.get("revenue"))
    ratio("SGAI", safe_div(sga_c, sga_p))
    lvg_c = None
    lvg_p = None
    if all(x is not None for x in (c.get("lt_debt"), c.get("current_liabilities"), c.get("total_assets"))):
        lvg_c = (c["lt_debt"] + c["current_liabilities"]) / c["total_assets"]
    if all(x is not None for x in (p.get("lt_debt"), p.get("current_liabilities"), p.get("total_assets"))):
        lvg_p = (p["lt_debt"] + p["current_liabilities"]) / p["total_assets"]
    ratio("LVGI", safe_div(lvg_c, lvg_p))
    tata = None
    if all(x is not None for x in (c.get("net_income"), c.get("ocf"), c.get("total_assets"))):
        tata = (c["net_income"] - c["ocf"]) / c["total_assets"] if c["total_assets"] else None
    if tata is None:
        missing.append("TATA")
        tata = 0.0  # neutral for the additive term

    if len(missing) <= 2:  # require at least 6 of 8 real inputs
        m = (-4.84 + 0.92 * ratios["DSRI"] + 0.528 * ratios["GMI"]
             + 0.404 * ratios["AQI"] + 0.892 * ratios["SGI"]
             + 0.115 * ratios["DEPI"] - 0.172 * ratios["SGAI"]
             + 4.679 * tata - 0.327 * ratios["LVGI"])
        battery["m_score"] = round(m, 3)
    else:
        battery["m_score"] = None
    battery["m_score_inputs_missing"] = sorted(missing)

    # ── Cyclical mid-cycle inputs ────────────────────────────────────────
    revs = [(y, history[y]["revenue"]) for y in years if history[y].get("revenue")]
    if len(revs) >= 6:
        (ya, ra), (yb, rb) = revs[max(0, len(revs) - 6)], revs[-1]
        span = yb - ya
        battery["revenue_cagr_5y"] = round((rb / ra) ** (1 / span) - 1, 4) if span > 0 and ra > 0 else None
    else:
        battery["revenue_cagr_5y"] = None
    margins = []
    for y in years:
        m = safe_div(history[y].get("operating_income"), history[y].get("revenue"))
        if m is not None:
            margins.append(m)
    if margins:
        margins_sorted = sorted(margins)
        mid = len(margins_sorted) // 2
        median_m = (margins_sorted[mid] if len(margins_sorted) % 2
                    else (margins_sorted[mid - 1] + margins_sorted[mid]) / 2)
        battery["op_margin_10y_median"] = round(median_m, 4)
        battery["op_margin_latest"] = round(margins[-1], 4)
        battery["op_margin_years"] = len(margins)
    else:
        battery["op_margin_10y_median"] = None
        battery["op_margin_latest"] = None
        battery["op_margin_years"] = 0

    return battery


def main():
    parser = argparse.ArgumentParser(description="Build 10y fundamentals + value-trap battery from companyfacts.zip")
    parser.add_argument("--limit", type=int, default=None, help="Process at most N tickers (smoke runs)")
    parser.add_argument("--tickers", type=str, default=None, help="Comma-separated ticker subset")
    args = parser.parse_args()

    if not ZIP_PATH.exists():
        print(f"FATAL: {ZIP_PATH} not found.")
        sys.exit(1)

    stocks = json.loads(STOCKS_JSON.read_text(encoding="utf-8"))
    universe = [s["symbol"] for s in stocks if s.get("symbol") and "." not in s["symbol"]]
    if args.tickers:
        wanted = {t.strip().upper() for t in args.tickers.split(",")}
        universe = [t for t in universe if t in wanted] or sorted(wanted)
    if args.limit:
        universe = universe[: args.limit]

    cik_map = get_cik_map()
    targets = {t: f"CIK{cik_map[t]}.json" for t in universe if t in cik_map}
    print(f"Universe: {len(universe)} tickers | with CIK: {len(targets)}")

    history_out = {}
    battery_out = {}
    no_entry = 0
    no_history = 0
    processed = 0

    with zipfile.ZipFile(ZIP_PATH, "r") as z:
        names = set(z.namelist())
        for ticker, entry_name in sorted(targets.items()):
            if entry_name not in names:
                no_entry += 1
                continue
            try:
                with z.open(entry_name) as f:
                    data = json.load(f)
            except Exception:
                no_entry += 1
                continue
            facts_all = data.get("facts", {})
            # Merge namespaces; us-gaap wins on name collisions
            facts = dict(facts_all.get("ifrs-full", {}))
            facts.update(facts_all.get("us-gaap", {}))
            history = extract_history(facts)
            if not history:
                no_history += 1
                continue
            history_out[ticker] = {str(y): row for y, row in sorted(history.items())}
            battery = compute_battery(history)
            if battery:
                battery_out[ticker] = battery
            processed += 1
            if processed % 500 == 0:
                print(f"  ... {processed} tickers processed")

    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    HISTORY_JSON.write_text(json.dumps(
        {"generated_at": generated_at, "source": "SEC companyfacts.zip (annual filings)",
         "tickers": history_out}, sort_keys=True), encoding="utf-8")
    BATTERY_JSON.write_text(json.dumps(
        {"generated_at": generated_at,
         "_note": ("Value-trap battery. f_score: 0-9 (check f_score_checks_available); "
                   "accruals_ratio: high positive = earnings not backed by cash; "
                   "m_score: > -1.78 = elevated manipulation risk (Beneish); "
                   "net_issuance_*: positive = dilution."),
         "tickers": battery_out}, indent=1, sort_keys=True), encoding="utf-8")

    print()
    print(f"Tickers with history: {processed} | battery: {len(battery_out)}")
    print(f"No zip entry: {no_entry} | no usable annual history: {no_history}")
    print(f"Written: {HISTORY_JSON.name} ({HISTORY_JSON.stat().st_size:,} bytes)")
    print(f"Written: {BATTERY_JSON.name} ({BATTERY_JSON.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()

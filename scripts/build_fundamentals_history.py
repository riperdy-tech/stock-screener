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
import math
import statistics
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
# TTM lives in its OWN file: fundamentals_history's per-ticker dicts are keyed by fiscal year
# and consumers do int(year) over the keys (valuation_backbone sorts int(y) directly) — a
# non-year key inside would crash them all.
TTM_JSON = DATA / "fundamentals_ttm.json"
QTR_JSON = DATA / "fundamentals_quarterly.json"

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


# ── Scale-error defence ──────────────────────────────────────────────────────────────────────
# SEC filings are not internally consistent. The SAME fiscal period is sometimes reported twice
# with values a clean power of 1000 apart, and since the corrupt value is usually in the LATER
# filing, "most recent wins" picks it every time. Verified against the raw companyfacts:
#     COHR  FY2023 D&A          681,687,000 (10-K)   vs      681,687,000,000 (later 10-K)
#     INVE  FY2021 NetIncome      1,620,000 (10-K)   vs    1,620,000,000,000 (10-K/A)
#     BKTI  FY2020 shares            12,561          and           12,561,000
# One period cannot have two true values 1000x apart, so this is provable corruption rather than
# a judgement call — unlike INVE's genuine restatements, which move a number by 0.3%.
#
# Measured impact before this fix: 672 year-over-year ~1000x transitions across 451 tickers,
# 49% of them in shares_diluted.
#
# NOTE what this deliberately does NOT do: reject values merely for being large relative to the
# series. That was tested and is unsafe — at a 10x bar it flags NVDA's real $120bn net income
# (29x), AMZN's real 20:1 split (21.5x), AMD's Xilinx equity (22.3x) and CRM's margin expansion
# (20.7x). A magnitude filter silently deletes the best names in the book. Only provable
# contradictions and clean power-of-1000 series breaks are touched.
SCALE_STEPS = (1e3, 1e6, 1e9)


def _pow1000_ratio(a, b):
    """Return the power-of-1000 step if |a|/|b| is ~one, else None."""
    if not a or not b:
        return None
    r = abs(a) / abs(b)
    for p in SCALE_STEPS:
        if 0.7 * p <= r <= 1.4 * p:
            return p
    return None


def _pick_consistent(cands, reference):
    """From [(filed, val), ...] for ONE period, pick the value consistent with `reference`.

    Falls back to most-recent when there is no conflict or no reference to judge against —
    identical to the old behaviour, so nothing changes for the 99% that are clean.
    """
    vals = {v for _, v in cands if v is not None}
    if len(vals) < 2:
        return max(cands, key=lambda c: c[0] or "")[1]
    hi, lo = max(vals, key=abs), min(vals, key=abs)
    if _pow1000_ratio(hi, lo) is None:          # ordinary restatement -> keep most recent
        return max(cands, key=lambda c: c[0] or "")[1]
    if reference is None:                        # conflict but nothing to anchor on
        return lo                                # the inflated one is the error in every case seen
    return min(vals, key=lambda v: abs(math.log10(max(abs(v), 1e-9) / max(abs(reference), 1e-9))))


def _normalise_series_scale(series):
    """Rescale years whose value is a clean power of 1000 off the MOST RECENT year.

    Catches the case a per-period contradiction cannot: a company that reported in THOUSANDS for
    years and then switched to units, where each individual year has only one value and nothing
    contradicts it (BKTI reported shares in thousands through FY2022, units from FY2023). The most
    recent filing defines current units, so it is the anchor.
    """
    if len(series) < 3:
        return series
    yrs = sorted(series)
    anchor_y = yrs[-1]
    anchor = series[anchor_y]
    if not anchor:
        return series
    # median magnitude of years already on the anchor's scale, to avoid anchoring on an outlier
    same = [abs(series[y]) for y in yrs if series[y] and _pow1000_ratio(series[y], anchor) is None]
    ref = statistics.median(same) if len(same) >= 2 else abs(anchor)
    out = dict(series)
    for y in yrs:
        v = series[y]
        if not v:
            continue
        p = _pow1000_ratio(ref, v)               # value is p times SMALLER than the current scale
        if p:
            out[y] = v * p
    return out


def annual_duration_series(facts, tags, unit_keys=("USD",)):
    """(fiscal_year -> value, fiscal_year -> [(accn, filed, val), ...]) for ~12-month-duration
    facts from annual filings.

    Tag selection: most RECENT latest-year wins, then most coverage. Tags are
    never mixed within one series — companies switch tags over time (e.g.
    Revenues -> RevenueFromContractWithCustomer...), and both first-tag-wins
    and coverage-only selection picked stale tags (AAPL's SalesRevenueNet has
    11 old years but ends in 2017).

    The second return value carries the WINNING tag's raw per-year candidates with their
    accession ids, so extract_history can assemble each year-row from ONE filing (see the
    row-consistency note there). The resolved series itself is unchanged from the previous
    behaviour.
    """
    candidates = []
    for tag in tags:
        units = facts.get(tag, {}).get("units", {})
        best = {}
        raw = {}
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
                best.setdefault(year, []).append((e.get("filed"), val))
                raw.setdefault(year, []).append((e.get("accn") or "", e.get("filed") or "",
                                                 val, end))
        if best:
            # resolve per-period scale contradictions, then normalise the whole series
            prelim = {y: max(c, key=lambda z: z[0] or "")[1] for y, c in best.items()}
            clean = {y: v for y, v in prelim.items()
                     if sum(1 for _, vv in best[y] if vv is not None) == 1}
            _refvals = [abs(v) for v in clean.values() if v]
            ref = statistics.median(_refvals) if _refvals else None
            resolved = {y: _pick_consistent(c, ref) for y, c in best.items()}
            candidates.append((_normalise_series_scale(resolved), raw))
    if not candidates:
        return {}, {}
    return max(candidates, key=lambda s: (max(s[0]), len(s[0])))


def annual_instant_series(facts, tags, unit_keys=("USD",)):
    """(fiscal_year -> value, fiscal_year -> [(accn, filed, val), ...]) for balance-sheet
    (instant) facts from annual filings.

    Same recency-then-coverage tag selection — and the same raw-candidate side channel —
    as annual_duration_series.
    """
    candidates = []
    for tag in tags:
        units = facts.get(tag, {}).get("units", {})
        best = {}
        raw = {}
        for uk in unit_keys:
            for e in units.get(uk, []):
                if e.get("form") not in ANNUAL_FORMS:
                    continue
                end = e.get("end")
                val = e.get("val")
                if not end or val is None:
                    continue
                year = int(end[:4])
                best.setdefault(year, []).append(((end, e.get("filed") or ""), val))
                raw.setdefault(year, []).append((e.get("accn") or "", e.get("filed") or "",
                                                 val, end))
        if best:
            prelim = {y: max(c, key=lambda z: z[0])[1] for y, c in best.items()}
            clean = {y: v for y, v in prelim.items()
                     if sum(1 for _, vv in best[y] if vv is not None) == 1}
            _refvals = [abs(v) for v in clean.values() if v]
            ref = statistics.median(_refvals) if _refvals else None
            resolved = {y: _pick_consistent([(k[1], v) for k, v in c], ref)
                        for y, c in best.items()}
            candidates.append((_normalise_series_scale(resolved), raw))
    if not candidates:
        return {}, {}
    return max(candidates, key=lambda s: (max(s[0]), len(s[0])))


QUARTERLY_FORMS = ("10-Q", "10-Q/A")
# Flow fields the RS2 base_cf needs fresh (owner earnings = NI + D&A − capex; blend adds revenue;
# fcf derived). Balance-sheet items and averages (shares_diluted is a weighted average — NOT
# additive, the FY + YTD − YTD identity does not hold for it) are deliberately excluded.
TTM_FIELDS = ("revenue", "net_income", "ocf", "capex", "da")


def ttm_snapshot(facts):
    """Trailing-twelve-month flows from 10-Q YTD rows: TTM = FY + YTD_cur − YTD_prior.

    Validated against HWM before implementation (2026-08-08): the zip carries YTD duration rows
    for every needed tag through the 10-Q filed 2026-08-06, and the identity reproduces the
    hand-computed TTM. Date guards make the identity exact rather than approximate:
      * YTD rows start at the fiscal-year start by construction; the current YTD leg must start
        the day after the FY leg ends (±5d), and the prior YTD leg must cover the same fiscal
        span one year earlier (end 350-380d before, duration within 14d of the current leg).
      * Tag selection mirrors annual_duration_series' recency-then-coverage rule and NEVER mixes
        tags across the three legs (HWM's "Revenues" tag is dead — 0 annual rows, 10-Q rows
        ending 2019 — so first-tag-wins would bridge live and dead series).
      * Same-period duplicate filings resolve via _pick_consistent against the annual median,
        and each leg is pow-1000 checked against that median (same scale defence as the annual
        series; magnitude-vs-series filters stay banned — see the scale-error note above).
    A field with no complete triple is absent — honest absence, the engine falls back to FY.
    Returns {"through", "filed", "fy_leg_end", "fields": {...}} or None if nothing computed.
    """
    out = {}
    prov = None
    for field in TTM_FIELDS:
        best = None
        for tag in DURATION_TAGS[field]:
            entries = []
            for e in facts.get(tag, {}).get("units", {}).get("USD", []):
                start, end, val = e.get("start"), e.get("end"), e.get("val")
                if not start or not end or val is None:
                    continue
                try:
                    days = (date.fromisoformat(end) - date.fromisoformat(start)).days
                except ValueError:
                    continue
                entries.append({"form": e.get("form"), "start": start, "end": end,
                                "days": days, "val": val, "filed": e.get("filed") or ""})
            ann = [e for e in entries if e["form"] in ANNUAL_FORMS and 300 <= e["days"] <= 400]
            qtd = [e for e in entries if e["form"] in QUARTERLY_FORMS and 60 <= e["days"] <= 300]
            if not ann or not qtd:
                continue
            # TTM must be FRESHER than the newest annual period: right after a 10-K (no newer
            # 10-Q yet) the formula would happily emit a TTM through last Q3 — STALER than the
            # FY the engine already has, silently presented as fresher.
            if max(e["end"] for e in qtd) <= max(e["end"] for e in ann):
                continue
            ann_med = statistics.median(abs(e["val"]) for e in ann)

            def resolve(rows):
                # duplicate filings of the SAME period -> scale-consistent pick
                return _pick_consistent([(r["filed"], r["val"]) for r in rows], ann_med)

            # current leg: YTD row with the latest end (max duration at that end wins the
            # quarterly-vs-YTD tie; at Q1 they are the same row)
            end_cur = max(e["end"] for e in qtd)
            cur_rows = [e for e in qtd if e["end"] == end_cur]
            dmax = max(e["days"] for e in cur_rows)
            cur_rows = [e for e in cur_rows if abs(e["days"] - dmax) <= 3]
            cur = dict(cur_rows[0]); cur["val"] = resolve(cur_rows)
            # FY leg: latest annual period ending before the current YTD starts, adjacent to it
            fy_rows = [e for e in ann if e["end"] < cur["start"]]
            if not fy_rows:
                continue
            fy_end = max(e["end"] for e in fy_rows)
            if not 0 <= (date.fromisoformat(cur["start"]) - date.fromisoformat(fy_end)).days <= 5:
                continue                       # current YTD does not start right after an FY
            fy_leg = [e for e in fy_rows if e["end"] == fy_end]
            fy = dict(fy_leg[0]); fy["val"] = resolve(fy_leg)
            # prior leg: same YTD span one fiscal year earlier
            pri_rows = [e for e in qtd
                        if abs(e["days"] - cur["days"]) <= 14
                        and 350 <= (date.fromisoformat(cur["end"])
                                    - date.fromisoformat(e["end"])).days <= 380]
            if not pri_rows:
                continue
            pri_end = max(e["end"] for e in pri_rows)
            pri_rows = [e for e in pri_rows if e["end"] == pri_end]
            pri = dict(pri_rows[0]); pri["val"] = resolve(pri_rows)
            # per-leg scale defence: a leg a clean power of 1000 off the annual median is the
            # same corruption the annual series guards against
            legs = []
            for r in (fy, cur, pri):
                v = r["val"]
                p = _pow1000_ratio(ann_med, v)
                legs.append(v * p if p else v)
            ttm_val = legs[0] + legs[1] - legs[2]
            cand = {"val": ttm_val, "through": cur["end"], "filed": cur["filed"],
                    "fy_leg_end": fy_end, "ann_years": len({e["end"][:4] for e in ann})}
            if best is None or (cand["through"], cand["ann_years"]) > (best["through"], best["ann_years"]):
                best = cand
        if best is None:
            continue
        out[field] = best["val"]
        # provenance from the field with the freshest through-date (they should agree; the
        # engine-side audit cross-checks coverage)
        if prov is None or best["through"] > prov["through"]:
            prov = {"through": best["through"], "filed": best["filed"],
                    "fy_leg_end": best["fy_leg_end"]}
    if not out or prov is None:
        return None
    ocf, capex = out.get("ocf"), out.get("capex")
    if ocf is not None and capex is not None:
        out["fcf"] = ocf - capex
    return {"through": prov["through"], "filed": prov["filed"],
            "fy_leg_end": prov["fy_leg_end"], "fields": out}


QTR_FIELDS = ("revenue", "net_income", "gross_profit")


def quarterly_snapshot(facts):
    """Last ~10 SINGLE QUARTERS of the core flow fields, with YoY — the regime-persistence
    evidence served from filings instead of hoped-for from news (AMD 2026-08: a fresh,
    healthy-looking research brief carried none of the +50%/+107% record quarter that had
    been public for three days; filings cannot miss their own numbers).

    Single quarters come from 10-Q duration rows (60-120d). Q4 has no 10-Q: derived as
    FY − YTD-Q3 when both legs share the fiscal-year start (same date guards as the TTM
    identity). Same per-period scale resolution as everywhere else. Returns
    {"quarters": [{"end", "revenue", "net_income", "gross_profit", "yoy_revenue",
    "yoy_net_income"}, ...]} oldest->newest, or None."""
    per_field = {}
    for field in QTR_FIELDS:
        best = None
        for tag in DURATION_TAGS[field]:
            entries = []
            for e in facts.get(tag, {}).get("units", {}).get("USD", []):
                start, end, val = e.get("start"), e.get("end"), e.get("val")
                if not start or not end or val is None:
                    continue
                try:
                    days = (date.fromisoformat(end) - date.fromisoformat(start)).days
                except ValueError:
                    continue
                entries.append({"form": e.get("form"), "start": start, "end": end,
                                "days": days, "val": val, "filed": e.get("filed") or ""})
            singles = {}
            for e in entries:
                if e["form"] in QUARTERLY_FORMS and 60 <= e["days"] <= 120:
                    singles.setdefault(e["end"], []).append((e["filed"], e["val"]))
            ann = [e for e in entries if e["form"] in ANNUAL_FORMS and 300 <= e["days"] <= 400]
            if not singles or not ann:
                continue
            ann_med = statistics.median(abs(e["val"]) for e in ann)
            q = {end: _pick_consistent(c, ann_med) for end, c in singles.items()}
            # derived Q4 = FY − YTD-Q3 (YTD row ending 76-104d before the FY end, same start)
            ytd3 = {}
            for e in entries:
                if e["form"] in QUARTERLY_FORMS and 240 <= e["days"] <= 300:
                    ytd3.setdefault(e["end"], []).append((e["filed"], e["val"], e["start"]))
            for fy_e in ann:
                if fy_e["end"] in q:
                    continue
                for y_end, cands in ytd3.items():
                    try:
                        gap = (date.fromisoformat(fy_e["end"]) - date.fromisoformat(y_end)).days
                    except ValueError:
                        continue
                    if 76 <= gap <= 104 and any(c[2] == fy_e["start"] for c in cands):
                        yv = _pick_consistent([(c[0], c[1]) for c in cands], ann_med)
                        q[fy_e["end"]] = fy_e["val"] - yv
                        break
            cand = {"q": q, "latest": max(q), "n": len(q)}
            if best is None or (cand["latest"], cand["n"]) > (best["latest"], best["n"]):
                best = cand
        if best:
            per_field[field] = best["q"]
    if "revenue" not in per_field:
        return None
    ends = sorted(set().union(*[set(v) for v in per_field.values()]))[-10:]
    rows = []
    for e in ends:
        rows.append({"end": e, **{f: per_field.get(f, {}).get(e) for f in QTR_FIELDS}})
    for i, r in enumerate(rows):
        try:
            e0 = date.fromisoformat(r["end"])
        except ValueError:
            continue
        for p in rows[:i]:
            try:
                lag = (e0 - date.fromisoformat(p["end"])).days
            except ValueError:
                continue
            if 350 <= lag <= 380:
                for f, k in (("revenue", "yoy_revenue"), ("net_income", "yoy_net_income")):
                    # YoY off a NEGATIVE/zero base is meaningless (the exact -17.5%-CAGR trap
                    # the auditor caught the model committing on ARWR) — omit, never invent
                    if r.get(f) and p.get(f) and p[f] > 0:
                        r[k] = round((r[f] / p[f] - 1) * 100, 1)
    return {"quarters": rows} if rows else None


def extract_history(facts):
    """Build {fiscal_year: {field: value}} from a CIK's us-gaap facts."""
    series = {}
    raws = {}
    for field, tags in DURATION_TAGS.items():
        unit = ("shares",) if field == "shares_diluted" else ("USD",)
        series[field], raws[field] = annual_duration_series(facts, tags, unit)
    for field, tags in INSTANT_TAGS.items():
        series[field], raws[field] = annual_instant_series(facts, tags)

    years = set()
    for s in series.values():
        years.update(s.keys())
    if not years:
        return {}
    years = sorted(years)[-MAX_YEARS:]

    history = {}
    for y in years:
        # ── ROW CONSISTENCY (2026-08-08) ────────────────────────────────────────────────
        # Per-field most-recent-wins mixes FILING BASES inside one row: after a divestiture
        # the next 10-K restates comparative revenue to continuing operations, while net
        # income under our tags keeps the original consolidated figure — WDC FY2023 ended up
        # with HDD-only revenue ($6.25B, restated) against the consolidated flash-crash loss
        # (−$1.68B), a margin of two different companies. Measured across the live book: 314
        # basis-suspect conflicts (>30% or sign-flip) on 88 tickers, and no filed-date
        # preference survives them all (original-first breaks ASC-606-style restatements
        # where the later figure is better; latest-first is what mixed WDC). So instead of
        # judging vintages, assemble each year-row from ONE filing: the accession covering
        # the most fields (tie -> latest filed). The per-period/series scale defences above
        # stay authoritative: an accession value that contradicts the resolved series by a
        # clean power of 1000 is refused (COHR-class corrupt filings must not win a row),
        # and a zero contradicted by a nonzero resolved value is a filing artifact (PSMT
        # revenue 0 vs $2.5B), not data.
        # BIN-END ANCHOR. Year bins are calendar end-year (int(end[:4])), and fiscal years
        # ending Jan 1-2 COLLIDE with the prior year's bin: without this anchor the accession-
        # coverage rule installed JNJ FY2016's $16.54B net income as "2017" (JNJ FY2016 ended
        # 2017-01-01), ILMN's FY2022 GRAIL-impairment loss as "2023", YETI FY2021 as "2022" —
        # found by diffing the full rebuild against the previous production file. The bin's
        # canonical period end is its LATEST end date (deterministic — a filed-date anchor
        # ties, because one later 10-K carries BOTH years as comparatives under one filed
        # date): the collision candidate always ends Jan 1-2 of year y, the bin's own fiscal
        # year always ends later in y. Only candidates within 14 days of the anchor may join
        # the accession vote.
        end_ref = None
        for f in series:
            for accn, filed, val, end in raws[f].get(y, []):
                if end_ref is None or end > end_ref:
                    end_ref = end

        def _near_ref(end):
            if end_ref is None:
                return True
            try:
                return abs((date.fromisoformat(end) - date.fromisoformat(end_ref)).days) <= 14
            except ValueError:
                return False

        accns = {}
        for f in series:
            for accn, filed, val, end in raws[f].get(y, []):
                if not _near_ref(end):
                    continue
                a = accns.setdefault(accn, {"fields": set(), "filed": ""})
                a["fields"].add(f)
                a["filed"] = max(a["filed"], filed)
        # Among near-complete accessions, the LATEST wins — measured on the two conflicting
        # classes (2026-08-08): an ERROR restatement re-tags the whole comparative row (Macy's
        # FY-Feb-2024: original 10-K and the restated next-10-K comparative both ~100% field
        # coverage — the later, corrected $45M row must win over the original $105M), while a
        # PERIMETER restatement re-tags a sparse subset (WDC FY2023 post-spin comparative: 48%
        # coverage — excluded, so the row stays consolidated and internally consistent).
        # Coverage-first-then-filed inverted the M case; pure-latest would let WDC's 48% row
        # fragment mix again. The 0.8 bar separates the measured populations.
        chosen = None
        if accns:
            mx = max(len(a["fields"]) for a in accns.values())
            elig = {k: a for k, a in accns.items() if len(a["fields"]) >= 0.8 * mx}
            chosen = max(elig, key=lambda k: (elig[k]["filed"], len(elig[k]["fields"])))
        row = {}
        for f in series:
            v = series[f].get(y)
            if chosen is not None and v is not None:
                cand = [c for c in raws[f].get(y, [])
                        if c[0] == chosen and _near_ref(c[3])]
                if cand:
                    if len({c[2] for c in cand}) > 1:
                        av = _pick_consistent([(c[1], c[2]) for c in cand], v)
                    else:
                        av = cand[0][2]
                    if av != v and _pow1000_ratio(av, v) is None and not (av == 0 and v):
                        v = av
            row[f] = v
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
        # Both endpoints must be POSITIVE, not merely truthy: a negative share
        # count makes the fractional power return a complex number (see the
        # revenue CAGR note below). Undefined -> null.
        battery["net_issuance_3y_cagr"] = (
            round((sh[y0] / sh[y3]) ** (1 / (y0 - y3)) - 1, 4)
            if y3 and (sh.get(y0) or 0) > 0 and sh[y3] > 0 else None)

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
        # rb > 0 is load-bearing, not defensive: a negative TERMINAL revenue
        # (contra-revenue, restatement, mis-tagged XBRL fact) makes rb/ra
        # negative, and a negative float ** a fractional power returns a
        # complex, which round() rejects with TypeError. That killed the whole
        # build weekly from 2026-07-05 — the crash aborted main() before either
        # output file was written, so both silently kept their 06-29 contents.
        # A CAGR to a negative endpoint has no real value: null, per the
        # data-honesty rule above.
        battery["revenue_cagr_5y"] = (
            round((rb / ra) ** (1 / span) - 1, 4)
            if span > 0 and ra > 0 and rb > 0 else None)
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
    ttm_out = {}
    qtr_out = {}
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
            ttm = ttm_snapshot(facts)
            if ttm:
                ttm_out[ticker] = ttm
            qtr = quarterly_snapshot(facts)
            if qtr:
                qtr_out[ticker] = qtr
            processed += 1
            if processed % 500 == 0:
                print(f"  ... {processed} tickers processed")

    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    # SUBSET RUNS MUST NOT TOUCH PRODUCTION. --limit/--tickers used to write the full production
    # files unconditionally: a 60-ticker smoke test replaced the 5,588-ticker
    # fundamentals_history.json that every RS2 valuation reads (2026-08-07; recovered from git).
    # A partial universe silently masquerading as the full one corrupts everything downstream,
    # so subset output goes to *.SUBSET.json and says so.
    global HISTORY_JSON, BATTERY_JSON, TTM_JSON, QTR_JSON
    if args.limit or args.tickers:
        HISTORY_JSON = HISTORY_JSON.with_name("fundamentals_history.SUBSET.json")
        BATTERY_JSON = BATTERY_JSON.with_name("fundamentals_battery.SUBSET.json")
        TTM_JSON = TTM_JSON.with_name("fundamentals_ttm.SUBSET.json")
        QTR_JSON = QTR_JSON.with_name("fundamentals_quarterly.SUBSET.json")
        print(f"SUBSET run ({len(targets)} tickers) -> writing {HISTORY_JSON.name} / "
              f"{BATTERY_JSON.name} / {TTM_JSON.name} — production files untouched")
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

    TTM_JSON.write_text(json.dumps(
        {"generated_at": generated_at,
         "source": "SEC companyfacts.zip (TTM = FY + 10-Q YTD_current - 10-Q YTD_prior)",
         "_note": ("Flow fields only; a field with no complete, date-adjacent FY/YTD/YTD triple "
                   "is absent rather than approximated. 'through' is the TTM window end."),
         "tickers": ttm_out}, sort_keys=True), encoding="utf-8")

    print()
    print(f"Tickers with history: {processed} | battery: {len(battery_out)} | ttm: {len(ttm_out)}")
    print(f"No zip entry: {no_entry} | no usable annual history: {no_history}")
    print(f"Written: {HISTORY_JSON.name} ({HISTORY_JSON.stat().st_size:,} bytes)")
    print(f"Written: {BATTERY_JSON.name} ({BATTERY_JSON.stat().st_size:,} bytes)")
    QTR_JSON.write_text(json.dumps(
        {"generated_at": generated_at,
         "source": "SEC companyfacts.zip (single quarters from 10-Q; Q4 = FY - YTD-Q3)",
         "tickers": qtr_out}, sort_keys=True), encoding="utf-8")
    print(f"Written: {TTM_JSON.name} ({TTM_JSON.stat().st_size:,} bytes)")
    print(f"Written: {QTR_JSON.name} ({QTR_JSON.stat().st_size:,} bytes) — {len(qtr_out)} tickers")


if __name__ == "__main__":
    main()

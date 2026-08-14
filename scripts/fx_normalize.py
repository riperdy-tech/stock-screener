"""fx_normalize: FX-aware statement normalization for foreign-currency filers (2026-08-14).

THE PROBLEM (measured 2026-08-14 across the RS2 live book, 266 names): foreign 20-F filers
are served by Yahoo with income/cash-flow/balance-sheet statements in their REPORTING
currency while every quote-side field (price, marketCap, sharesOutstanding) is USD. FMX
carried TTM revenue 873.5B (MXN) against a USD ~23B market cap; its EV mixed USD mcap with
MXN debt/cash. Census: 8 of 266 live names have info.financialCurrency != USD.

WHAT THIS MODULE DOES
  * Converts statement values to USD for tickers whose statement currency is PROVEN
    (PROVEN_STATEMENT_CCY below — every entry verified against the company's own SEC
    filing, value-for-value; see provenance notes).
  * FLOWS (income statement, cash flow) at the FISCAL-PERIOD-AVERAGE FX rate;
    STOCKS (balance sheet) at the PERIOD-END FX rate — the IAS 21 / ASC 830
    presentation-currency translation convention.
  * Rates: yfinance "{CCY}USD=X" daily closes. Availability measured 2026-08-14 for
    MXN/TWD/EUR/CNY/ILS: 1548 bars each from 2020-09-01 with zero missing windows
    (every 12m window >=257 bars, every 3m window >=63, max gap 5 calendar days) and
    the inverse series agrees with the direct "USD{CCY}=X" series to product==1.00000
    on all 1548 joint days. A period whose rates fail the coverage floor is a STOP for
    that name: the affected values are set to None and the FX block carries a flag —
    NEVER a silent spot-rate substitution.
  * Applies PROVEN share-count perimeter overrides (SHARES_OVERRIDE) so the shares /
    marketCap / statements triplet describes ONE perimeter: the consolidated company.
    The vendor identity guard downstream (fetch_data.py ~line 609) is untouched and
    reconciles marketCap against the corrected share count.
  * Tickers with a currency mismatch that are NOT in the proven table are NOT converted
    (never build to fit unmeasured data) — the detail gets an FX flag for review.

HOW TO EXTEND PROVEN_STATEMENT_CCY (the required proof, all three):
  1. yfinance info.totalRevenue / statement revenue ratio == 1.00 (KeyStats and
     statements share a denomination), AND
  2. the statement value equals the company's SEC-filed figure in the claimed currency
     (companyfacts XBRL, unit-tagged), AND
  3. the share count reconciles to the filed whole-company count (20-F cover) so the
     quote side and the statements describe the same perimeter.
EMBJ is the cautionary tale: financialCurrency says BRL but statements are USD (filed
USD 7,577.5M FY2025 == statement value exactly; Embraer's presentation currency is USD).
Blind conversion by financialCurrency would corrupt a correct name.
"""
import logging
from datetime import datetime, timezone

import pandas as pd

# ── proven statement currencies (2026-08-14 census + SEC verification) ─────────
# ticker -> statement currency. "USD" entries are proven NO-OPs (metadata mismatch).
# Proof for each (KeyStats ratio / SEC filed value == yfinance statement value):
#   FMX  MXN: ratio 0.9992; 20-F FY2024 ifrs Revenue [MXN] 781,585,000,000 == stmt.
#   TSM  TWD: ratio 1.0000; 20-F FY2024 ifrs Revenue [TWD] 2,894,307,700,000 == stmt.
#   SAP  EUR: ratio 1.0000; 20-F FY2025 ifrs Revenue [EUR] 36,800,000,000 == stmt.
#   BWMX MXN: ratio 1.0000; 20-F FY2024 ifrs Revenue [MXN] 14,100,758,000 == stmt.
#   ATAT CNY: ratio 1.0000; 20-F FY2025 us-gaap Revenue [CNY] 9,790,159,000 == stmt.
#   JLHL CNY: ratio 1.0000; 20-F FY2025 us-gaap Revenue [CNY] 252,007,702 == stmt.
#   WILC ILS: KeyStats absent; 20-F FY2025 ifrs Revenue [ILS] 610,605,000 == stmt.
#   EMBJ USD: financialCurrency=BRL but 20-F FY2025 ifrs Revenue [USD]
#             7,577,500,000 == stmt exactly -> statements already USD, DO NOT convert.
PROVEN_STATEMENT_CCY = {
    "FMX": "MXN",
    "TSM": "TWD",
    "SAP": "EUR",
    "BWMX": "MXN",
    "ATAT": "CNY",
    "JLHL": "CNY",
    "WILC": "ILS",
    "EMBJ": "USD",
}

# ── proven whole-company share-count overrides (ADS-equivalent) ────────────────
# Applied to info impliedSharesOutstanding/sharesOutstanding BEFORE the vendor
# identity guard, so the published triplet claims the same perimeter the (converted)
# statements consolidate. Constants are FILED figures, not vendor data; refresh when
# a new 20-F changes the capital structure.
#   FMX: FY2025 20-F cover (filed 2026-04-24): 2,015,185,015 BD Units + 1,417,048,500
#        B Units; 1 ADS = 10 BD Units; BD Unit = 1 Series B + 4 Series D shares,
#        B Unit = 5 Series B. Bylaws: each Series D share receives 125% of the Series B
#        dividend, so economic weight is BD Unit 6.0 vs B Unit 5.0 — validated by the
#        market 2026-08-13: FEMSAUBD.MX 199.09 vs FEMSAUB.MX 166.20, ratio 1.198 vs
#        6/5 = 1.200 (0.2%), and P_ADS == 10 x P_UBD x MXNUSD exactly. ADS-equivalent
#        economic count = (2,015,185,015*6 + 1,417,048,500*5) / 60 = 319,605,876.5.
#        Yahoo's impliedSharesOutstanding (340.68M = raw units/10) values B Units at
#        the BD price, overstating whole-company equity ~6.6%; the guard will keep
#        Yahoo's marketCap visible as Market_Cap_vendor.
#   ATAT: FY2025 20-F cover (filed 2026-04-17): 412,380,886 ordinary = 338,699,969
#        Class A + 73,680,917 Class B; 1 ADS = 3 Class A; Class B economically
#        identical (same rights except voting; 1:1 convertible). ADS-equivalent
#        count = 412,380,886 / 3 = 137,460,295.33. Yahoo served the Class-A-only
#        basis (112.9M ADS) as late as 2026-08-12; this constant pins the perimeter
#        either way.
SHARES_OVERRIDE = {
    "FMX": {
        "shares": (2_015_185_015 * 6 + 1_417_048_500 * 5) / 60,
        "basis": "FEMSA FY2025 20-F cover units, dividend-parity weighted "
                 "(D shares 125% of B per bylaws); 1 ADS = 10 BD Units",
    },
    "ATAT": {
        "shares": 412_380_886 / 3,
        "basis": "Atour FY2025 20-F cover total ordinary (Class A+B, economically "
                 "identical) / 3 Class A per ADS",
    },
}

# Coverage floors, anchored to the 2026-08-14 measurement (observed windows sit at
# 98-101% of expected trading days with max 5-day gaps; floors are set with headroom
# so only a genuinely broken series fails, never a normal one).
MIN_BARS_FRACTION = 0.8   # of expected trading days (5/7 of calendar span)
MAX_GAP_DAYS = 10         # max calendar-day gap inside a window
MAX_END_STALENESS_DAYS = 7  # period-end rate must be within 7 calendar days

_RATE_CACHE = {}  # ccy -> pd.Series (daily closes, tz-naive index) or None


def _rate_series(ccy, earliest_need):
    """Daily {ccy}->USD closes from ~13 months before earliest_need. Cached per run."""
    if ccy in _RATE_CACHE:
        return _RATE_CACHE[ccy]
    try:
        import yfinance as yf
        start = (pd.Timestamp(earliest_need) - pd.Timedelta(days=396)).strftime("%Y-%m-%d")
        h = yf.Ticker(f"{ccy}USD=X").history(start=start, auto_adjust=False)
        s = h["Close"].dropna()
        s.index = s.index.tz_localize(None)
        _RATE_CACHE[ccy] = s if len(s) else None
    except Exception as e:
        logging.warning(f"fx_normalize: {ccy}USD=X history fetch failed ({e}).")
        _RATE_CACHE[ccy] = None
    return _RATE_CACHE[ccy]


def _avg_rate(s, end_date, months):
    """Fiscal-period-average rate for the window of `months` ending end_date.
    None when the window fails the measured coverage floors."""
    end = pd.Timestamp(str(end_date)[:10])
    start = end - pd.DateOffset(months=months) + pd.Timedelta(days=1)
    w = s[(s.index >= start) & (s.index <= end)]
    expected = ((end - start).days + 1) * 5 / 7
    if len(w) < MIN_BARS_FRACTION * expected:
        return None
    gaps = w.index.to_series().diff().dt.days.dropna()
    if len(gaps) and gaps.max() > MAX_GAP_DAYS:
        return None
    return float(w.mean())


def _end_rate(s, end_date):
    """Last close on/before end_date, within the staleness floor."""
    end = pd.Timestamp(str(end_date)[:10])
    prior = s[s.index <= end]
    if not len(prior):
        return None
    if (end - prior.index.max()).days > MAX_END_STALENESS_DAYS:
        return None
    return float(prior.iloc[-1])


# Rows that are NOT currency amounts and must never be FX-scaled. Measured on the
# live frames 2026-08-14 (FMX): income carries "Tax Rate For Calcs", "Basic/Diluted
# Average Shares"; the balance sheet carries "Ordinary Shares Number", "Treasury
# Shares Number", "Share Issued". Per-share EPS rows ARE currency amounts (local
# currency per local share) and are converted.
_NON_CURRENCY_ROW_MARKERS = ("Share", "Tax Rate")


def _convert_frame(df, rate_fn, rates_out):
    """Copy of df with each column's currency rows scaled by its column-date rate.
    Columns whose rate is unavailable are set to NaN (honest null, never
    unconverted local ccy). An absent/empty frame is complete-by-vacuity (nothing
    to convert), NOT partial coverage — JLHL has no quarterly income statement and
    must not be flagged for it."""
    if df is None or getattr(df, "empty", True):
        return df, True
    out = df.copy()
    currency_rows = [r for r in out.index
                     if not any(m in str(r) for m in _NON_CURRENCY_ROW_MARKERS)]
    complete = True
    for col in out.columns:
        r = rate_fn(col)
        rates_out[str(col)[:10]] = r
        if r is None:
            out.loc[currency_rows, col] = float("nan")
            complete = False
        else:
            out.loc[currency_rows, col] = out.loc[currency_rows, col] * r
    return out, complete


def normalize(ticker_symbol, info, income_stmt, q_income_stmt, cash_flow_stmt, bs):
    """Returns (info, income_stmt, q_income_stmt, cash_flow_stmt, bs, fx_meta).

    Non-mismatch names (the USD universe) pass through UNTOUCHED with fx_meta None —
    zero field changes. Proven foreign names get converted copies + an FX metadata
    block. Unproven mismatches get a flag block, no conversion.
    """
    t = (ticker_symbol or "").upper()
    stmt_ccy = PROVEN_STATEMENT_CCY.get(t)
    info_ccy = (info or {}).get("financialCurrency")
    quote_ccy = (info or {}).get("currency")

    if stmt_ccy is None:
        # Not a reviewed name. USD-vs-USD (or unknown) -> untouched, no metadata.
        if info_ccy and quote_ccy and info_ccy != quote_ccy:
            logging.warning(
                f"fx_normalize: {t} statement currency {info_ccy} != quote {quote_ccy} "
                f"but {t} is NOT in the proven table — NOT converting; flagged for review.")
            meta = {"statement_currency": info_ccy, "quote_currency": quote_ccy,
                    "converted": False, "flag": "unreviewed_currency_mismatch",
                    "note": "detected via info.financialCurrency; conversion requires "
                            "the proof procedure in scripts/fx_normalize.py"}
            return info, income_stmt, q_income_stmt, cash_flow_stmt, bs, meta
        return info, income_stmt, q_income_stmt, cash_flow_stmt, bs, None

    # Reviewed name. Perimeter override first (independent of conversion).
    new_info = dict(info or {})
    meta = {"statement_currency": stmt_ccy, "quote_currency": quote_ccy or "USD",
            "converted": False}
    ov = SHARES_OVERRIDE.get(t)
    if ov:
        new_info["impliedSharesOutstanding"] = ov["shares"]
        new_info["sharesOutstanding"] = ov["shares"]
        meta["shares_basis"] = ov["basis"]

    if stmt_ccy == "USD":
        # Proven no-op (EMBJ): statements already USD despite the vendor tag.
        meta["note"] = ("statements proven USD (SEC-filed USD values match); "
                        "vendor financialCurrency tag ignored")
        return new_info, income_stmt, q_income_stmt, cash_flow_stmt, bs, meta

    # Earliest statement date drives how much rate history we need.
    dates = []
    for df in (income_stmt, q_income_stmt, cash_flow_stmt, bs):
        if df is not None and not getattr(df, "empty", True):
            dates.extend(pd.Timestamp(str(c)[:10]) for c in df.columns)
    if not dates:
        meta["flag"] = "no_statement_dates"
        return new_info, income_stmt, q_income_stmt, cash_flow_stmt, bs, meta
    s = _rate_series(stmt_ccy, min(dates) - pd.DateOffset(months=12))
    if s is None:
        # Rates unavailable: NEVER serve local-currency values as USD. Raising makes
        # build_financial_detail return None, so both callers fall back to the cached
        # detail (already converted on a previous run) with a fresh price patch —
        # same failure philosophy as every other fetch error in this pipeline.
        raise RuntimeError(f"fx_normalize: {stmt_ccy}USD=X history unavailable for {t} — "
                           f"refusing to serve unconverted statements")

    rates = {"annual_avg": {}, "quarter_avg": {}, "fy_flows_avg": {}, "period_end": {}}
    ok = True
    inc_c, c1 = _convert_frame(income_stmt, lambda d: _avg_rate(s, d, 12), rates["annual_avg"])
    qinc_c, c2 = _convert_frame(q_income_stmt, lambda d: _avg_rate(s, d, 3), rates["quarter_avg"])
    cf_c, c3 = _convert_frame(cash_flow_stmt, lambda d: _avg_rate(s, d, 12), rates["fy_flows_avg"])
    bs_c, c4 = _convert_frame(bs, lambda d: _end_rate(s, d), rates["period_end"])
    ok = c1 and c2 and c3 and c4

    # info KeyStats used as balance-sheet fallbacks are financialCurrency amounts at
    # the most recent quarter. Convert at the mrq period-end rate when the date is
    # known; otherwise null them (the builder then falls back honestly).
    mrq = new_info.get("mostRecentQuarter")
    mrq_rate = None
    if mrq:
        try:
            mrq_dt = datetime.fromtimestamp(int(mrq), tz=timezone.utc).strftime("%Y-%m-%d")
            mrq_rate = _end_rate(s, mrq_dt)
            if mrq_rate:
                rates["period_end"][mrq_dt] = mrq_rate
        except Exception:
            mrq_rate = None
    for k in ("totalCash", "totalDebt"):
        if new_info.get(k) is not None:
            new_info[k] = new_info[k] * mrq_rate if mrq_rate else None

    meta.update({
        "converted": True,
        "converted_to": "USD",
        "flows_basis": "fiscal_period_average",
        "stocks_basis": "fiscal_period_end",
        "rate_source": f"{stmt_ccy}USD=X yfinance daily close",
        "rates": {k: v for k, v in rates.items() if v},
    })
    if not ok:
        meta["flag"] = "partial_rate_coverage"
        logging.warning(f"fx_normalize: {t} some statement periods lack qualifying FX "
                        f"windows — those values are None, see FX.rates.")
    return new_info, inc_c, qinc_c, cf_c, bs_c, meta

import yfinance as yf
import pandas as pd
import numpy as np
import json
import time
import sys
import logging
import requests
import io
import math
import hashlib
from datetime import datetime
import base64

import os
from dotenv import load_dotenv

# Load .env.local if present
load_dotenv(".env.local")

# Setup logging
# Log to both file (for frontend) and console
log_file = "public/data/scan.log"

# Create handlers
file_handler = logging.FileHandler(log_file, mode='a', encoding='utf-8')
console_handler = logging.StreamHandler(sys.stdout)

handlers = [file_handler, console_handler]

# Supabase Realtime Handler
class SupabaseHandler(logging.Handler):
    def __init__(self):
        super().__init__()
        self.supabase = None
        supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")
        if supabase_url and supabase_key:
            try:
                from supabase import create_client
                self.supabase = create_client(supabase_url, supabase_key)
            except Exception as e:
                print(f"Failed to init Supabase logging: {e}")

    def emit(self, record):
        if not self.supabase:
            return
        log_entry = self.format(record)
        try:
            self.supabase.table("scan_logs").insert({"message": log_entry}).execute()
        except Exception:
            pass

sb_handler = SupabaseHandler()
handlers.append(sb_handler)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=handlers,
    force=True # Force reconfiguration
)

# Prevent Supabase/HTTPX from logging their own requests (avoid infinite loops)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("supabase").setLevel(logging.WARNING)
logging.getLogger("postgrest").setLevel(logging.WARNING)


# Force flush on every log for real-time viewing
def flush_handlers():
    for h in logging.getLogger().handlers:
        h.flush()


import FinanceDataReader as fdr

def get_fdr_tickers():
    """
    Uses FinanceDataReader to get the master list of all US Stocks.
    """
    logging.info("--- FETCHING TICKER LISTS VIA FINANCE DATA READER ---")
    flush_handlers()
    
    # 1. Fetch main exchanges
    try:
        logging.info("Fetching NASDAQ...")
        flush_handlers()
        df_nasdaq = fdr.StockListing('NASDAQ')
        
        logging.info("Fetching NYSE...")
        flush_handlers()
        df_nyse = fdr.StockListing('NYSE')
        
        logging.info("Fetching AMEX...")
        flush_handlers()
        df_amex = fdr.StockListing('AMEX') 

        # 2. Combine them
        df_all = pd.concat([df_nasdaq, df_nyse, df_amex])
        
        # 3. Clean up
        df_all = df_all.drop_duplicates(subset=['Symbol'])
        
        tickers = df_all['Symbol'].tolist()
        
        clean_tickers = []
        for t in tickers:
            t_str = str(t)
            # Skip Preferreds, Warrants, Units safely without killing valid ticker strings like "PRO" or "NEWS"
            if ' ' in t_str or '-PR' in t_str or '.PR' in t_str or '-WS' in t_str or '.WS' in t_str:
                continue
            
            # Normalize for Yahoo (Dot to Dash)
            norm = t_str.replace('.', '-')
            clean_tickers.append(norm)
        logging.info(f"Total Common Stock Tickers: {len(clean_tickers)}")
        flush_handlers()
        return clean_tickers
    except Exception as e:
        logging.error(f"FDR Fetch failed: {e}. Fallback to S&P 600.")
        flush_handlers()
        return [] # Simplified fallback handling for now


def calculate_cagr(end_value, start_value, years):
    if start_value <= 0 or end_value <= 0 or years <= 0:
        return 0.0
    return (end_value / start_value) ** (1 / years) - 1

class StockData:
    def __init__(self, ticker):
        self.ticker = ticker
        self.market_cap = 0.0
        self.price = 0.0
        self.revenue_growth_ttm = 0.0
        self.revenue_growth_qtr_yoy = 0.0
        self.operating_margin_growth = 0.0
        self.gross_margin = 0.0
        self.gross_margin_3yr_avg = 0.0
        self.roic = 0.0
        self.peg_ratio = 100.0 
        self.price_to_sales = 100.0 
        self.sector = "Unknown"
        self.industry = "Unknown"
        self.company_name = ticker
        self.description = "No description available."
        self.insider_ownership = 0.0
        self.float_shares = float('inf')
        self.country = "Unknown"
        self.shares_outstanding_growth_3yr_cagr = 0.0
        self.altman_z_score = None
        self.beneish_m_score = None
        self.net_income = 0.0
        self.operating_cash_flow = 0.0
        self.fail_reasons = []
        self.fail_codes = []

def safe_float(val, default=0.0):
    try:
        if val is None: return default
        return float(val)
    except:
        return default

def peg_fallback(trailing_pe, rev_growth):
    """PEG when Yahoo doesn't supply pegRatio: PE / growth%.

    Undefined for non-positive growth, so return the 100.0 fail sentinel
    (StockData's default; is_potential_100_bagger fails PEG > 1.5). Callers
    used to inline `trailing_pe / (rev_growth * 100)` as a safe_float default —
    Python evaluates that eagerly, so revenueGrowth == 0.0 raised
    ZeroDivisionError inside process_stock's bare except and the ticker was
    dropped from the scan entirely (GRPN, SILO, RLYB). Negative growth was
    worse than a crash: it produced a negative PEG that silently PASSED the
    gate a shrinking company should fail.
    """
    if rev_growth is None or rev_growth <= 0:
        return 100.0
    return trailing_pe / (rev_growth * 100)

def safe_get_df(df, row_name, col_idx):
    """Safely get a value from a DataFrame by row name and column index."""
    try:
        if df is not None and not df.empty and row_name in df.index:
            val = df.loc[row_name].iloc[col_idx]
            if isinstance(val, (int, float)) and not (math.isnan(val) or math.isinf(val)):
                return float(val)
    except:
        pass
    return None

def safe_get_any_df(df, row_names, col_idx):
    """Safely get the first available row value from a DataFrame."""
    for row_name in row_names:
        value = safe_get_df(df, row_name, col_idx)
        if value is not None:
            return value
    return None

# Helper for timeout
def get_session():
    s = requests.Session()
    s.mount('https://', requests.adapters.HTTPAdapter(max_retries=3))
    return s

# ── SEC-first fundamentals (Yahoo-quota saver, 2026-07-10) ─────────────────────
# The old path fetched stock.financials/balance_sheet/cashflow per ticker per day:
# ~3 extra Yahoo requests × 6,598 tickers of QUARTERLY-changing data. Yahoo throttles
# ~2,000-2,500 req/hr/IP, so this was the main driver of the fetch step hitting the
# 6h GitHub job cap (357 min on 2026-07-09). ROIC / gross-margin-trend / Altman-Z are
# now derived from the SEC companyfacts annual history (built weekly, read locally —
# zero Yahoo requests), with the previous stocks.json value carried forward for names
# SEC doesn't cover (foreign filers, new listings).
FUND_HIST = {}          # fundamentals_history.json tickers map (SEC companyfacts, weekly)
EXISTING_DATA_REF = {}  # previous stocks.json rows, keyed by symbol (carry-forward fallback)

# ── defeatbeta bulk source (Yahoo-quota killer, 2026-07-10) ────────────────────
# Daily-refreshed parquet mirror of Yahoo data on Hugging Face (verified
# value-identical vs our cached financials/{T}.json). Names with a fresh price
# there skip Yahoo entirely except a weekly 1-request .info refresh (analyst /
# ownership fields the dataset lacks). DBETA is None when the dataset is stale
# or unreachable -> every name takes the legacy yfinance path below.
import defeatbeta_source
DBETA = None

# .info-only fields carried from the cached detail on non-slot days
_CARRY_INFO_KEYS = {
    "forwardEps": "Forward_EPS_Estimate",
    "priceToBook": "Price_to_Book",
    "fiveYearAvgPE": "PE_5Y_Avg",
    "beta": "Beta",
    "shortPercentOfFloat": "Short_Percent_Float",
    "heldPercentInstitutions": "Held_Percent_Institutions",
    "dividendYield": "Dividend_Yield",
    "payoutRatio": "Payout_Ratio",
}

def pseudo_info(ticker_symbol, cached_detail):
    """Stand-in for yf .info on non-slot bulk days: live price/mcap/shares/EPS
    from defeatbeta, analyst/ownership fields carried from the cached detail."""
    info = {}
    row = DBETA.latest.get(ticker_symbol)
    if row:
        info["currentPrice"] = row["close"]
    mcap = DBETA.market_cap(ticker_symbol)
    if mcap:
        info["marketCap"] = mcap
    if ticker_symbol in DBETA.shares:
        info["sharesOutstanding"] = DBETA.shares[ticker_symbol]
    prev = (EXISTING_DATA_REF.get(ticker_symbol) or {}).get("metrics", {}) or {}
    if prev.get("revenueGrowth") is not None:
        info["revenueGrowth"] = prev["revenueGrowth"]
    cm = (cached_detail or {}).get("Calculated_Metrics", {}) or {}
    # EPS_TTM: carry the .info trailingEps captured at the last slot refresh —
    # the dataset's tailing_eps is basic-EPS-based and drifts from Yahoo's
    # (diluted) trailingEps on some names (CROX -1.38 vs -1.62). Same weekly
    # refresh cadence the detail file already had.
    if cm.get("EPS_TTM") is not None:
        info["trailingEps"] = cm["EPS_TTM"]
    elif ticker_symbol in DBETA.eps_ttm:
        info["trailingEps"] = DBETA.eps_ttm[ticker_symbol]
    for info_key, detail_key in _CARRY_INFO_KEYS.items():
        if cm.get(detail_key) is not None:
            info[info_key] = cm[detail_key]
    return info

def process_stock_bulk(ticker_symbol, info, slot_today):
    """StockData from defeatbeta bulk tables — zero Yahoo calls. `info` is the
    real .info on slot days (weekly analyst/ownership refresh), else pseudo_info.
    Field semantics match process_stock; slow-moving .info-only fields are
    <=7 days old instead of daily."""
    prev_row = EXISTING_DATA_REF.get(ticker_symbol) or {}
    prev_metrics = prev_row.get("metrics", {}) or {}
    prof = DBETA.profile.get(ticker_symbol) or {}
    row = DBETA.latest.get(ticker_symbol) or {}

    data = StockData(ticker_symbol)
    data.company_name = (info.get("longName") if slot_today else None) \
        or prev_row.get("name") or ticker_symbol
    data.description = (info.get("longBusinessSummary") if slot_today else None) \
        or prof.get("summary") or prev_row.get("description") or "No description available."
    data.sector = (info.get("sector") if slot_today else None) \
        or prof.get("sector") or prev_row.get("sector") or "Unknown"
    data.industry = (info.get("industry") if slot_today else None) \
        or prof.get("industry") or prev_row.get("industry") or "Unknown"
    data.country = (info.get("country") if slot_today else None) \
        or prof.get("country") or prev_row.get("country") or "Unknown"

    data.price = safe_float(info.get("currentPrice"), 0.0) or safe_float(row.get("close"), 0.0)
    mcap = safe_float(info.get("marketCap"), 0.0) or safe_float(DBETA.market_cap(ticker_symbol), 0.0) \
        or safe_float(prev_row.get("marketCap"), 0.0)
    data.market_cap = mcap

    # gross margin: Yahoo's grossMargins uses its own cost classification that
    # statement-derived GP/Rev doesn't always match (MEDP 0.29 vs 0.72) — carry
    # the previous run's value between weekly slot refreshes, never re-derive.
    if slot_today and info.get("grossMargins") is not None:
        data.gross_margin = safe_float(info.get("grossMargins"), 0.0)
    else:
        data.gross_margin = safe_float(prev_metrics.get("grossMargin"), 0.0)

    # P/S: price-sensitive, so recompute daily against fresh mcap; TTM revenue
    # from the quarterly statements matched Yahoo's exactly in verification.
    ttm_rev = None
    q = (DBETA.statements.get(ticker_symbol) or {}).get(("income_statement", "quarterly"))
    if q:
        dates = sorted(q, reverse=True)[:4]
        revs = [q[d].get("Total Revenue") for d in dates]
        if len(revs) == 4 and all(v is not None for v in revs):
            ttm_rev = sum(revs)
    if slot_today and info.get("priceToSalesTrailing12Months") is not None:
        data.price_to_sales = safe_float(info.get("priceToSalesTrailing12Months"), 100.0)
    elif mcap and ttm_rev:
        data.price_to_sales = mcap / ttm_rev
    else:
        data.price_to_sales = safe_float(prev_metrics.get("psRatio"), 100.0)

    # .info-only fields: fresh on slot days, previous run's value otherwise
    if slot_today:
        rev_growth = safe_float(info.get("revenueGrowth"), 0.01)
        trailing_pe = safe_float(info.get("trailingPE"), 100.0)
        data.peg_ratio = safe_float(info.get("pegRatio"), peg_fallback(trailing_pe, rev_growth))
        data.insider_ownership = safe_float(info.get("heldPercentInsiders"), 0.0)
        data.float_shares = safe_float(info.get("floatShares"), float("inf"))
        data.revenue_growth_ttm = safe_float(info.get("revenueGrowth"), 0.0)
        data.revenue_growth_qtr_yoy = safe_float(info.get("quarterlyRevenueGrowth"), 0.0)
    else:
        data.peg_ratio = safe_float(prev_metrics.get("pegRatio"), 100.0)
        data.insider_ownership = safe_float(prev_metrics.get("insiderOwnership"), 0.0)
        data.float_shares = safe_float(prev_metrics.get("float"), float("inf"))
        data.revenue_growth_ttm = safe_float(prev_metrics.get("revenueGrowth"), 0.0)
        data.revenue_growth_qtr_yoy = safe_float(prev_metrics.get("revenueGrowth"), 0.0)

    # SEC-first fundamentals: identical to the legacy path
    sec_roic, sec_gm3, sec_alt = sec_fundamentals(ticker_symbol, mcap)
    if str(data.sector).startswith("Financial"):
        sec_roic = None
    data.roic = sec_roic if sec_roic is not None else safe_float(prev_metrics.get("roic"), 0.0)
    data.gross_margin_3yr_avg = sec_gm3 if sec_gm3 is not None else data.gross_margin
    data.altman_z_score = sec_alt if sec_alt is not None else prev_metrics.get("zScore")
    data.beneish_m_score = None
    return data

def load_fund_hist():
    global FUND_HIST
    try:
        with open('public/data/fundamentals_history.json', 'r') as f:
            FUND_HIST = (json.load(f) or {}).get('tickers', {})
        logging.info(f"SEC fundamentals history loaded: {len(FUND_HIST)} tickers.")
    except Exception as e:
        FUND_HIST = {}
        logging.warning(f"fundamentals_history.json unavailable ({e}) — carry-forward only.")

def sec_fundamentals(ticker_symbol, mcap):
    """(roic, gross_margin_3yr_avg, altman_z) from SEC annual history; each field is
    None when its inputs are missing (honest null — never a fabricated default)."""
    yrs_map = FUND_HIST.get(ticker_symbol)
    if not isinstance(yrs_map, dict) or not yrs_map:
        return None, None, None
    years = sorted(yrs_map)
    f0 = yrs_map[years[-1]]
    n = lambda v: v if isinstance(v, (int, float)) else None

    # EBIT: operating income, else NI + tax + interest (same fallback the old yf path used)
    ebit = n(f0.get('operating_income'))
    if ebit is None and n(f0.get('net_income')) is not None:
        ebit = f0['net_income'] + (n(f0.get('tax_provision')) or 0) + (n(f0.get('interest_expense')) or 0)

    # ROIC = NOPAT / (equity + debt - cash); effective tax rate clamped to sanity
    roic = None
    pretax, tax = n(f0.get('pretax_income')), n(f0.get('tax_provision'))
    tax_rate = (tax / pretax) if (pretax and tax is not None) else 0.21
    tax_rate = min(max(tax_rate, 0.0), 0.5)
    eq = n(f0.get('equity'))
    if ebit is not None and eq is not None:
        invested = eq + (n(f0.get('lt_debt')) or 0) - (n(f0.get('cash')) or 0)
        if invested > 0:
            roic = ebit * (1 - tax_rate) / invested
            if abs(roic) > 1.5:
                roic = None   # implausible — tiny invested-capital denominator (e.g. banks: deposits aren't lt_debt)

    # Gross-margin 3yr average (GrossProfit tag is only ~40% covered; caller falls
    # back to the current .info gross margin, same as the old failure path)
    gms = []
    for y in years[-3:]:
        fy = yrs_map[y]
        gp, rev = n(fy.get('gross_profit')), n(fy.get('revenue'))
        if gp is not None and rev:
            gms.append(gp / rev)
    gm3 = (sum(gms) / len(gms)) if gms else None

    # Altman Z (needs retained_earnings — present after the weekly SEC rebuild adds the tag)
    alt = None
    ta, tl = n(f0.get('total_assets')), n(f0.get('total_liabilities'))
    ca, cl = n(f0.get('current_assets')), n(f0.get('current_liabilities'))
    re_, rev = n(f0.get('retained_earnings')), n(f0.get('revenue'))
    if None not in (ta, tl, ca, cl, re_, rev) and ebit is not None and ta > 0 and tl > 0 and mcap:
        alt = (1.2 * (ca - cl) / ta + 1.4 * re_ / ta + 3.3 * ebit / ta
               + 0.6 * mcap / tl + 1.0 * rev / ta)
    return roic, gm3, alt

def process_stock(ticker_symbol):
    try:
        import socket
        socket.setdefaulttimeout(10)
        
        stock = yf.Ticker(ticker_symbol)
        
        # We access .info first, which triggers the fetch
        info = stock.info
        
        mcap = safe_float(info.get('marketCap'), 0)
        
        data = StockData(ticker_symbol)
        data.company_name = info.get('longName', info.get('shortName', ticker_symbol))
        data.description = info.get('longBusinessSummary') or info.get('description', "No description available.")
        data.market_cap = mcap
        data.price = safe_float(info.get('currentPrice'), 0.0)
        data.sector = info.get('sector', 'Unknown')
        data.industry = info.get('industry') or 'Unknown'
        data.country = info.get('country') or 'Unknown'
        
        # Safe extractions
        rev_growth = safe_float(info.get('revenueGrowth'), 0.01)
        trailing_pe = safe_float(info.get('trailingPE'), 100.0)
        
        data.peg_ratio = safe_float(info.get('pegRatio'), peg_fallback(trailing_pe, rev_growth))
        data.price_to_sales = safe_float(info.get('priceToSalesTrailing12Months'), 100.0)
        data.insider_ownership = safe_float(info.get('heldPercentInsiders'), 0.0) 
        data.float_shares = safe_float(info.get('floatShares'), float('inf'))
        data.gross_margin = safe_float(info.get('grossMargins'), 0.0)
        data.revenue_growth_ttm = safe_float(info.get('revenueGrowth'), 0.0)
        data.revenue_growth_qtr_yoy = safe_float(info.get('quarterlyRevenueGrowth'), 0.0)

        # SEC-FIRST fundamentals: ROIC / gross-margin-trend / Altman-Z are quarterly-changing,
        # so they are derived from the local SEC companyfacts history instead of three daily
        # Yahoo statement fetches per ticker (the old stock.financials/balance_sheet/cashflow
        # calls — the main quota eater; see sec_fundamentals). Names SEC doesn't cover
        # (foreign filers, new listings) carry forward the previous run's value; failing
        # that, the old failure-mode defaults apply (roic 0.0, altman None).
        sec_roic, sec_gm3, sec_alt = sec_fundamentals(ticker_symbol, mcap)
        prev_metrics = (EXISTING_DATA_REF.get(ticker_symbol) or {}).get('metrics', {}) or {}
        if str(data.sector).startswith('Financial'):
            sec_roic = None   # invested-capital ROIC is structurally wrong for banks/insurers -> carry forward
        data.roic = sec_roic if sec_roic is not None else safe_float(prev_metrics.get('roic'), 0.0)
        data.gross_margin_3yr_avg = sec_gm3 if sec_gm3 is not None else data.gross_margin
        data.altman_z_score = sec_alt if sec_alt is not None else prev_metrics.get('zScore')

        # Beneish M-Score: not computable from this fetch (needs 2yr of
        # receivables/PP&E/SG&A detail). Null until the SEC companyfacts
        # pipeline provides real inputs. The old -2.0 placeholder read as
        # "no manipulation risk" for every stock.
        data.beneish_m_score = None
        
        return (data, stock)

    except Exception as e:
        return None

def extract_financial_detail(ticker_symbol, yf_ticker):
    """
    Extract detailed financial data from a yfinance Ticker object.
    Returns a dict suitable for saving as JSON, or None on failure.
    Reuses the already-created Ticker object to avoid duplicate API calls.
    """
    try:
        info = yf_ticker.info
        income_stmt = yf_ticker.income_stmt
        q_income_stmt = yf_ticker.quarterly_income_stmt
        cash_flow_stmt = yf_ticker.cash_flow
        bs = yf_ticker.balance_sheet

        # Next earnings date
        next_earnings = None
        try:
            cal = yf_ticker.calendar
            if cal is not None:
                # calendar can be a dict or DataFrame depending on yfinance version
                if isinstance(cal, dict):
                    ed = cal.get('Earnings Date')
                    if ed and len(ed) > 0:
                        next_earnings = str(ed[0])[:10]
                elif isinstance(cal, pd.DataFrame) and 'Earnings Date' in cal.index:
                    ed = cal.loc['Earnings Date'].iloc[0]
                    next_earnings = str(ed)[:10]
        except:
            pass  # Some tickers don't have calendar data

        monthly_closes = []
        try:
            hist = yf_ticker.history(period="2y", interval="1mo")
            if not hist.empty and 'Close' in hist.columns:
                monthly_closes = [float(x) for x in hist['Close'].dropna().tolist()]
        except:
            pass

        return build_financial_detail(ticker_symbol, info, income_stmt, q_income_stmt,
                                      cash_flow_stmt, bs, next_earnings, monthly_closes)
    except Exception as e:
        logging.warning(f"Financial detail extraction failed for {ticker_symbol}: {e}")
        return None

def extract_financial_detail_bulk(ticker_symbol, info, cached_detail, yf_ticker=None):
    """Same detail dict, sourced from the defeatbeta bulk tables (zero Yahoo
    calls). `info` is real .info on slot days, else pseudo_info carry-forward.
    Next earnings date falls back to the cached value — the defeatbeta calendar
    covers fewer names than Yahoo's."""
    try:
        income_stmt = DBETA.statement_frame(ticker_symbol, "income_statement", "annual")
        q_income_stmt = DBETA.statement_frame(ticker_symbol, "income_statement", "quarterly")
        cash_flow_stmt = DBETA.statement_frame(ticker_symbol, "cash_flow", "annual")
        bs = DBETA.statement_frame(ticker_symbol, "balance_sheet", "annual")
        next_earnings = DBETA.next_earnings.get(ticker_symbol) \
            or (cached_detail or {}).get("Next_Earnings_Date")

        # Monthly closes: keep yfinance's dividend-adjusted series (defeatbeta
        # closes are split- but not dividend-adjusted -> 20M-MA drifts high for
        # dividend payers). Slot days re-pull the adjusted history (1 request);
        # between slots reuse the cached series with the LAST point replaced by
        # today's close (the current month has no adjustments yet, so raw ==
        # adjusted there). First-ever run falls back to the raw dataset series.
        monthly_closes = []
        if yf_ticker is not None:
            try:
                hist = yf_ticker.history(period="2y", interval="1mo")
                if not hist.empty and 'Close' in hist.columns:
                    monthly_closes = [float(x) for x in hist['Close'].dropna().tolist()]
            except Exception:
                pass
        if not monthly_closes:
            cached_mc = (cached_detail or {}).get("Monthly_Closes") or []
            live = (DBETA.latest.get(ticker_symbol) or {}).get("close")
            if cached_mc:
                monthly_closes = list(cached_mc)
                if live:
                    monthly_closes[-1] = float(live)
            else:
                monthly_closes = DBETA.monthly.get(ticker_symbol, [])

        return build_financial_detail(ticker_symbol, info, income_stmt, q_income_stmt,
                                      cash_flow_stmt, bs, next_earnings, monthly_closes)
    except Exception as e:
        logging.warning(f"Bulk financial detail failed for {ticker_symbol}: {e}")
        return None

def build_financial_detail(ticker_symbol, info, income_stmt, q_income_stmt,
                           cash_flow_stmt, bs, next_earnings, monthly_closes):
    """Core detail builder — pure function of its inputs so the yfinance and
    defeatbeta paths produce identically-derived numbers."""
    try:
        def extract_income_metrics(df, num_periods):
            if df is None or df.empty:
                return []
            rows = []
            num_cols = min(num_periods, len(df.columns))
            for i in range(num_cols):
                date_str = str(df.columns[i])[:10]
                rows.append({
                    "Date": date_str,
                    "TotalRevenue": safe_get_df(df, "Total Revenue", i),
                    "GrossProfit": safe_get_df(df, "Gross Profit", i),
                    "OperatingIncome": safe_get_df(df, "Operating Income", i) or safe_get_df(df, "EBIT", i),
                    "NetIncome": safe_get_df(df, "Net Income", i),
                    "BasicEPS": safe_get_df(df, "Basic EPS", i),
                    "DilutedEPS": safe_get_df(df, "Diluted EPS", i)
                })
            return rows

        annual_financials = extract_income_metrics(income_stmt, 5)  # Phase 6.1a: extended for real multi-year CAGR
        quarterly_financials = extract_income_metrics(q_income_stmt, 4)

        # Cash flow items
        ocf = safe_get_df(cash_flow_stmt, "Operating Cash Flow", 0)
        capex = safe_get_df(cash_flow_stmt, "Capital Expenditure", 0)
        fcf = safe_get_df(cash_flow_stmt, "Free Cash Flow", 0)
        if fcf is None and ocf is not None and capex is not None:
            fcf = ocf + capex
        sbc = safe_get_df(cash_flow_stmt, "Stock Based Compensation", 0)
        depreciation_amortization = safe_get_any_df(cash_flow_stmt, [
            "Depreciation And Amortization",
            "Depreciation Amortization Depletion",
            "Depreciation",
            "Depreciation & Amortization",
        ], 0)

        # Balance sheet items
        total_cash = safe_get_df(bs, "Cash And Cash Equivalents", 0)
        if total_cash is None:
            total_cash = safe_float(info.get("totalCash"), 0)
        total_debt = safe_get_df(bs, "Total Debt", 0)
        if total_debt is None:
            total_debt = safe_float(info.get("totalDebt"), 0)

        shares = info.get("impliedSharesOutstanding") or info.get("sharesOutstanding") or 0
        market_cap = safe_float(info.get("marketCap"), 0)
        current_price = safe_float(info.get("currentPrice"), 0) or safe_float(info.get("previousClose"), 0)

        # VENDOR IDENTITY GUARD (2026-08-14). price, shares and marketCap arrive in ONE
        # yfinance payload, but Yahoo can serve marketCap on a different share basis than
        # sharesOutstanding (FMX 2026-08-13: whole-company FEMSA cap vs the ADS share count,
        # +73%) or ahead of a stale share count (AMRX +9%, MAMA +14%, same refresh). Every
        # downstream consumer needs the triplet on ONE basis — RS2's data_health gate blocks
        # its entire book when mcap vs price*shares breaks by >2% (same tolerance here).
        # Publish the identity-consistent figure; keep the vendor's for visibility. EV below
        # inherits the corrected value. Detail files rebuild on a rolling ~10-day window, so
        # unguarded this breach lands name by name as windows come due.
        market_cap_vendor = None
        if current_price and shares and market_cap:
            _implied = current_price * shares
            if _implied > 0 and abs(market_cap / _implied - 1) > 0.02:
                market_cap_vendor = market_cap
                market_cap = _implied

        # Enterprise Value
        ev = market_cap
        if total_debt is not None and total_cash is not None:
            ev = market_cap + total_debt - total_cash

        # TTM calculations from quarterly data
        ttm_revenue = None
        if len(quarterly_financials) == 4 and all(q["TotalRevenue"] is not None for q in quarterly_financials):
            ttm_revenue = sum(q["TotalRevenue"] for q in quarterly_financials)
        elif len(annual_financials) > 0:
            ttm_revenue = annual_financials[0]["TotalRevenue"]

        ttm_gp = None
        if len(quarterly_financials) == 4 and all(q["GrossProfit"] is not None for q in quarterly_financials):
            ttm_gp = sum(q["GrossProfit"] for q in quarterly_financials)
        elif len(annual_financials) > 0:
            ttm_gp = annual_financials[0]["GrossProfit"]

        ttm_ebit = None
        if len(quarterly_financials) == 4 and all(q["OperatingIncome"] is not None for q in quarterly_financials):
            ttm_ebit = sum(q["OperatingIncome"] for q in quarterly_financials)
        elif len(annual_financials) > 0:
            ttm_ebit = annual_financials[0]["OperatingIncome"]

        latest_annual_operating_income = annual_financials[0]["OperatingIncome"] if len(annual_financials) > 0 else None
        ebitda = None
        if latest_annual_operating_income is not None and depreciation_amortization is not None:
            ebitda = latest_annual_operating_income + depreciation_amortization

        yoy_rev_growth = safe_float(info.get("revenueGrowth"), 0) * 100
        fcf_margin = 0
        if fcf is not None and ttm_revenue is not None and ttm_revenue > 0:
            fcf_margin = (fcf / ttm_revenue) * 100

        rule_of_40 = yoy_rev_growth + fcf_margin

        ev_sales = (ev / ttm_revenue) if (ev and ttm_revenue and ttm_revenue > 0) else None
        ev_gp = (ev / ttm_gp) if (ev and ttm_gp and ttm_gp > 0) else None
        ev_ebit = (ev / ttm_ebit) if (ev and ttm_ebit and ttm_ebit > 0) else None

        gross_margin_pct = (ttm_gp / ttm_revenue * 100) if (ttm_gp and ttm_revenue and ttm_revenue > 0) else None

        core_anchor = None
        if ev_sales is not None and ev_gp is not None:
            core_anchor = (0.4 * ev_sales) + (0.4 * ev_gp)

        # YouTube Strategy Additional Metrics
        eps_ttm = safe_float(info.get("trailingEps"), None)
        forward_eps = safe_float(info.get("forwardEps"), None)
        price_to_book = safe_float(info.get("priceToBook"), None)
        five_year_avg_pe = safe_float(info.get("fiveYearAvgPE") or info.get("trailingPE"), None)
        beta = safe_float(info.get("beta"), None)

        monthly_closes = monthly_closes or []
        ma_20_month = None
        if len(monthly_closes) >= 20:
            ma_20_month = sum(monthly_closes[-20:]) / 20.0

        detail = {
            "Ticker": ticker_symbol,
            "Data_Fetched_Date": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "Next_Earnings_Date": next_earnings,
            "Price": current_price,
            "Shares_Outstanding": shares,
            "Market_Cap": market_cap,
            "Market_Cap_vendor": market_cap_vendor,
            "Enterprise_Value_EV": ev,
            "Total_Cash": total_cash,
            "Total_Debt": total_debt,
            "SBC_Stock_Based_Comp": sbc,
            "Free_Cash_Flow_TTM": fcf,
            "Operating_Cash_Flow": ocf,
            "Capital_Expenditure": capex,
            "Annual_Income_Statement": annual_financials,
            "Quarterly_Income_Statement": quarterly_financials,
            "Calculated_Metrics": {
                "TTM_Revenue": ttm_revenue,
                "TTM_Gross_Margin_%": gross_margin_pct,
                "YoY_Revenue_Growth_%": yoy_rev_growth,
                "FCF_Margin_%": fcf_margin,
                "Rule_of_40": rule_of_40,
                "EV_to_Sales": ev_sales,
                "EV_to_Gross_Profit": ev_gp,
                "EV_to_EBIT": ev_ebit,
                "Core_Anchor_Multiple_0.4Sales_0.4GP": core_anchor,
                "EPS_TTM": eps_ttm,
                "Forward_EPS_Estimate": forward_eps,
                "Price_to_Book": price_to_book,
                "PE_5Y_Avg": five_year_avg_pe,
                "Monthly_MA_20": ma_20_month,
                "Depreciation_Amortization": depreciation_amortization,
                "EBITDA": ebitda,
                "Beta": beta,
                "Short_Percent_Float": safe_float(info.get("shortPercentOfFloat"), None),
                "Held_Percent_Institutions": safe_float(info.get("heldPercentInstitutions"), None),
                "Dividend_Yield": safe_float(info.get("dividendYield"), None),
                "Payout_Ratio": safe_float(info.get("payoutRatio"), None)
            },
            "Monthly_Closes": monthly_closes
        }

        return sanitize(detail)
    except Exception as e:
        logging.warning(f"Financial detail extraction failed for {ticker_symbol}: {e}")
        return None

def is_potential_100_bagger(stock):
    reasons = []
    codes = []
    
    if not (50_000_000 < stock.market_cap < 2_000_000_000):
        reasons.append(f"Market Cap ${stock.market_cap:,.0f} out of range ($50M-$2B)")
        codes.append("FAIL_MCAP")
    if stock.price >= 25.0:
        reasons.append(f"Price ${stock.price:.2f} >= $25")
        codes.append("FAIL_PRICE")
    if stock.revenue_growth_ttm < 0.20:
        reasons.append(f"Rev Growth {stock.revenue_growth_ttm:.1%} < 20%")
        codes.append("FAIL_GROWTH")
    
    min_gm = 0.50 if 'Technolog' in stock.sector else 0.30
    if stock.gross_margin < min_gm:
        reasons.append(f"Gross Margin {stock.gross_margin:.1%} < {min_gm:.0%}")
        codes.append("FAIL_GM")
    if stock.gross_margin < stock.gross_margin_3yr_avg * 0.95: 
        reasons.append("Gross Margin declining vs 3yr Avg")
        codes.append("FAIL_GM_TREND")
    
    if stock.roic < 0.15: 
        reasons.append(f"ROIC {stock.roic:.1%} < 15%")
        codes.append("FAIL_ROIC")
        
    max_ps = 10.0 if 'Technolog' in stock.sector else 3.0
    if stock.price_to_sales > max_ps:
        reasons.append(f"P/S {stock.price_to_sales:.2f} > {max_ps}")
        codes.append("FAIL_PS")

    if stock.peg_ratio > 1.5: 
        reasons.append(f"PEG {stock.peg_ratio:.2f} > 1.5")
        codes.append("FAIL_PEG")
    if stock.float_shares > 50_000_000:
        reasons.append(f"Float {stock.float_shares:,.0f} > 50M")
        codes.append("FAIL_FLOAT")
    if stock.insider_ownership < 0.15:
        reasons.append(f"Insider Own {stock.insider_ownership:.1%} < 15%")
        codes.append("FAIL_INSIDER")

    stock.fail_reasons = reasons
    stock.fail_codes = codes
    return len(reasons) == 0

# --- Helper for Sanitization ---
def sanitize(obj):
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
    if isinstance(obj, dict):
        return {k: sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize(v) for v in obj]
    return obj

def main():
    print("Starting 100-Bagger Scout...")
    
    # Use FDR (FinanceDataReader) for Master Universe
    tickers = get_fdr_tickers()

    # Today's live listing, kept BEFORE the manual overrides are mixed in: the
    # exchange feed is the authority on what is still listed, and a hand-added
    # name must not be able to vouch for its own tradability.
    listed_today = set(tickers)

    # Optional Manual Overrides
    manual_tickers = ["CELH", "ELF", "XPEL", "MNST", "LNTH", "MEDP", "INMD", "PERI", "CROX"]
    tickers.extend(manual_tickers)
    tickers = list(set(tickers))
    
    import os
    import shutil
    # Create financials directory for per-ticker detail data
    os.makedirs('public/data/financials', exist_ok=True)
    
    # Load existing data to prevent wiping out the database
    existing_data = {}
    if os.path.exists('public/data/stocks.json'):
        try:
            with open('public/data/stocks.json', 'r') as f:
                loaded = json.load(f)
                for item in loaded:
                    existing_data[item['symbol']] = item
            logging.info(f"Loaded {len(existing_data)} existing records.")
            flush_handlers()
        except Exception as e:
            logging.error(f"Failed to load existing stocks.json: {e}")
            flush_handlers()

    # The scan loop below replaces records wholesale, which drops last_listed
    # from every name whose data source still answers. Keep the pre-run stamps
    # so the listing reconciliation can restore them: a name that left the
    # listing must not reset its own absence clock just by still having data.
    prior_last_listed = {sym: rec['last_listed']
                         for sym, rec in existing_data.items() if rec.get('last_listed')}

    # SEC-first fundamentals: local companyfacts history + previous-run carry-forward
    EXISTING_DATA_REF.update(existing_data)
    load_fund_hist()

    # defeatbeta bulk tables (daily HF mirror of Yahoo data). None -> legacy
    # yfinance for the whole run (dataset stale >36h or unreachable).
    global DBETA
    DBETA = defeatbeta_source.load(universe=tickers)
    if DBETA is None:
        logging.warning("defeatbeta unavailable — full legacy yfinance scan (slow).")
    flush_handlers()

    # Write PID to file for control
    with open("public/data/scanner.pid", "w") as f:
        f.write(str(os.getpid()))

    logging.info(f"Scanning Universe: {len(tickers)} stocks.")
    flush_handlers()
    
    processed_count = 0
    passed_count = 0
    skipped_count = 0
    

    try:
        for ticker in tickers[:]:
            # PAUSE LOGIC
            while os.path.exists("public/data/pause.signal"):
                time.sleep(1)
                
            processed_count += 1
            progress_msg = f"[{processed_count}/{len(tickers)}] Scan: {ticker}..."
            print(progress_msg, end="\r")
            if processed_count % 5 == 0 or processed_count == 1:
                logging.info(progress_msg)
                flush_handlers()
            
            cached_detail = None
            try:
                with open(os.path.join('public', 'data', 'financials', f'{ticker}.json'), 'r') as f:
                    cached_detail = json.load(f)
            except Exception:
                pass
            slot_today = (int(hashlib.md5(ticker.encode()).hexdigest(), 16) % 7) == (datetime.now().toordinal() % 7)

            # BULK PATH (defeatbeta): names with a fresh price in the daily HF
            # dataset get everything locally — price/mcap/statements/monthly
            # closes/EPS — so detail is rebuilt DAILY (fresher than the old
            # weekly TTL). Yahoo is touched only on the weekly slot day for the
            # .info-only analyst/ownership fields; between slots those carry
            # forward from the previous run (<=7d old).
            result = None
            detail = None
            used_bulk = False
            if DBETA is not None and DBETA.has_fresh_price(ticker):
                try:
                    info = None
                    yf_t = None
                    if slot_today:
                        try:
                            yf_t = yf.Ticker(ticker)
                            info = yf_t.info
                        except Exception:
                            info, yf_t = None, None   # Yahoo hiccup -> carry-forward week
                    slot_ok = bool(info)
                    if not info:
                        info = pseudo_info(ticker, cached_detail)
                    result = process_stock_bulk(ticker, info, slot_ok)
                    detail = extract_financial_detail_bulk(ticker, info, cached_detail,
                                                           yf_ticker=yf_t) or cached_detail
                    if detail:
                        detail['Price'] = result.price or detail.get('Price')
                        if result.market_cap:
                            detail['Market_Cap'] = result.market_cap
                    used_bulk = True
                except Exception as e:
                    logging.warning(f"Bulk path failed for {ticker} ({e}) — legacy fallback.")
                    result, detail = None, None

            # LEGACY PATH (yfinance): defeatbeta-stale/missing names or dataset
            # outage. TTL-GATED DETAIL: extract_financial_detail hits ~4-5 Yahoo
            # endpoints per ticker; each ticker refreshes on its weekly slot or
            # when its cached financials/{T}.json is >10d old; other days reuse
            # the cache with Price/Market_Cap patched fresh (RS2 Local reads
            # Price from this file — it must never be stale).
            if not used_bulk:
                process_result = process_stock(ticker)
                if not process_result:
                    skipped_count += 1
                    continue
                result, yf_ticker = process_result

                age_days = None
                if cached_detail and cached_detail.get('Data_Fetched_Date'):
                    try:
                        age_days = (datetime.now() - datetime.strptime(
                            str(cached_detail['Data_Fetched_Date'])[:10], '%Y-%m-%d')).days
                    except Exception:
                        pass
                if cached_detail is None or age_days is None or slot_today or age_days > 10:
                    try:
                        detail = extract_financial_detail(ticker, yf_ticker)
                    except Exception:
                        pass
                    if not detail:
                        detail = cached_detail      # fresh fetch failed -> keep serving the cache
                        if detail:                  # ...but never with a stale price
                            detail['Price'] = result.price or detail.get('Price')
                            if result.market_cap:
                                detail['Market_Cap'] = result.market_cap
                else:
                    detail = cached_detail
                    detail['Price'] = result.price or detail.get('Price')
                    if result.market_cap:
                        detail['Market_Cap'] = result.market_cap
                
            # 2. APPLY "100-BAGGER" RULES
            screening_result = is_potential_100_bagger(result)
            
            score = 100 - (len(result.fail_reasons) * 10)
            if score < 0: score = 0

            # 3. STORE RESULT (Pass OR Fail)
            result_obj = {
                "symbol": ticker,
                "name": result.company_name,
                "description": result.description,
                "price": result.price, 
                "marketCap": result.market_cap,
                "peRatio": 0,
                "sector": result.sector,
                "industry": result.industry,
                "country": result.country,
                "score": score,
                "status": "Pass" if screening_result else "Fail", 
                "reasons": result.fail_reasons,
                "failCodes": result.fail_codes,
                "Last_Updated": datetime.now().strftime("%Y-%m-%d %H:%M"),
                "metrics": {
                    "roic": result.roic,
                    "revenueGrowth": result.revenue_growth_ttm,
                    "grossMargin": result.gross_margin,
                    "netIncome": result.net_income,
                    "operatingCashFlow": result.operating_cash_flow,
                    "zScore": result.altman_z_score,
                    "mScore": result.beneish_m_score,
                    "insiderOwnership": result.insider_ownership,
                    "dilution": result.shares_outstanding_growth_3yr_cagr,
                    "psRatio": result.price_to_sales,
                    "pegRatio": result.peg_ratio,
                    "float": result.float_shares,
                    "ocf": detail.get("Operating_Cash_Flow") if detail else None,
                    "capex": detail.get("Capital_Expenditure") if detail else None,
                    "epsTtm": detail.get("Calculated_Metrics", {}).get("EPS_TTM") if detail else None,
                    "forwardEpsEstimate": detail.get("Calculated_Metrics", {}).get("Forward_EPS_Estimate") if detail else None,
                    "priceToBook": detail.get("Calculated_Metrics", {}).get("Price_to_Book") if detail else None,
                    "fiveYearAveragePe": detail.get("Calculated_Metrics", {}).get("PE_5Y_Avg") if detail else None,
                    "monthlyMa20": detail.get("Calculated_Metrics", {}).get("Monthly_MA_20") if detail else None,
                    "monthlyCloses": detail.get("Monthly_Closes", []) if detail else [],
                    "quarterlyEps": [q.get("BasicEPS") if q.get("BasicEPS") is not None else q.get("DilutedEPS") for q in detail.get("Quarterly_Income_Statement", [])] if detail else [],
                    "epsYoyGrowth": None,
                    "revenueYoyGrowth": None,
                    "previousEpsTtm": None,
                    "consecutiveGrowth": 0
                }
            }
            existing_data[ticker] = result_obj

            # Save per-ticker financial detail for AI Prompt Exporter
            if detail:
                try:
                    detail_path = os.path.join('public', 'data', 'financials', f'{ticker}.json')
                    with open(detail_path, 'w') as f:
                        json.dump(detail, f)
                except Exception:
                    pass

            
            if screening_result:
                passed_count += 1
                logging.info(f"FOUND GEM: {ticker}")
                flush_handlers()

            # INCREMENTAL CSV SAVE (Every 5 stocks)
            if processed_count % 5 == 0:
                try:
                    # CSV Data Construction
                    csv_data = []
                    for r in existing_data.values(): 
                        flat = {
                            "Symbol": r['symbol'],
                            "Name": r['name'],
                            "Description": r.get('description', '').replace('\n', ' ').replace('\r', ''),
                            "Price": r['price'],
                            "Market Cap": r['marketCap'],
                            "Sector": r['sector'],
                            "Industry": r['industry'],
                            "Country": r.get('country', 'Unknown'),
                            "Score": r['score'],
                            "Status": r['status'],
                            "Fail Codes": ",".join(r['failCodes']) if r['failCodes'] else "",
                            "Last_Updated": r.get('Last_Updated', ''),
                            "Rev Growth": r['metrics'].get('revenueGrowth'),
                            "Gross Margin": r['metrics'].get('grossMargin'),
                            "ROIC": r['metrics'].get('roic'),
                            "Insider Own": r['metrics'].get('insiderOwnership'),
                            "PEG": r['metrics'].get('pegRatio'),
                            "Z-Score": r['metrics'].get('zScore'),
                            "P/S": r['metrics'].get('psRatio'),
                            "Float": r['metrics'].get('float'),
                            "OCF": r['metrics'].get('ocf'),
                            "CAPEX": r['metrics'].get('capex'),
                            "EPS TTM": r['metrics'].get('epsTtm'),
                            "Forward EPS": r['metrics'].get('forwardEpsEstimate'),
                            "P/B": r['metrics'].get('priceToBook'),
                            "5Y Avg P/E": r['metrics'].get('fiveYearAveragePe'),
                            "20M MA": r['metrics'].get('monthlyMa20'),
                            "Monthly Closes": json.dumps(r['metrics'].get('monthlyCloses', [])),
                            "Quarterly EPS": json.dumps(r['metrics'].get('quarterlyEps', [])),
                            "EPS YoY Growth": r['metrics'].get('epsYoyGrowth'),
                            "Revenue YoY Growth": r['metrics'].get('revenueYoyGrowth'),
                            "Previous EPS TTM": r['metrics'].get('previousEpsTtm'),
                            "Consecutive Growth": r['metrics'].get('consecutiveGrowth', 0)
                        }
                        csv_data.append(flat)
                    
                    temp_csv = 'public/data/stocks.csv.tmp'
                    final_csv = 'public/data/stocks.csv'
                    pd.DataFrame(csv_data).to_csv(temp_csv, index=False)
                    
                    # SAFE ATOMIC SWAP with RETRY
                    def safe_replace(src, dst, max_retries=50):
                        import random
                        for i in range(max_retries):
                            try:
                                if os.path.exists(dst):
                                    os.remove(dst)
                                os.rename(src, dst)
                                return True
                            except OSError:
                                time.sleep(0.1 + random.random() * 0.1)
                        return False

                    if not safe_replace(temp_csv, final_csv):
                         logging.error(f"Could not update {final_csv}. Close Excel if open!")
                         flush_handlers()
                    
                except Exception as e:
                    logging.error(f"Save failed: {e}")
                    flush_handlers()
                    pass

    except KeyboardInterrupt:
        logging.info("Scan stopped by user (Ctrl+C). Exiting safely...")
        flush_handlers()
        sys.exit(0)
    
    logging.info(f"Scan Complete. Processed {processed_count}. Passed {passed_count}. Skipped {skipped_count}.")
    flush_handlers()

    # ── Listing reconciliation ───────────────────────────────────────────
    # This database is carry-forward and never pruned: a name that leaves the
    # exchange listing (acquired, renamed, suspended pending a merger) keeps its
    # last good record and keeps getting scored on frozen data. Nothing is
    # deleted here — we only record what the listing says TODAY, and
    # score_factors.py vetoes names that stay absent (scripts/tradability.py).
    # Runs AFTER the scan because the loop replaces records wholesale.
    #
    # Guarded: a truncated or failed listing fetch would mark the entire
    # universe delisted at once, so below MIN_LISTING_SIZE nothing is stamped
    # and every last_listed simply fails to advance (no name is newly vetoed
    # until the feed recovers).
    MIN_LISTING_SIZE = 5000
    if len(listed_today) < MIN_LISTING_SIZE:
        logging.error(f"Listing fetch returned {len(listed_today)} names (< {MIN_LISTING_SIZE}) — "
                      "skipping listing reconciliation; last_listed not advanced.")
    else:
        today_str = datetime.now().strftime("%Y-%m-%d")
        stamped = carried = seeded = 0
        for sym, rec in existing_data.items():
            if sym in listed_today:
                rec['last_listed'] = today_str
                stamped += 1
            elif prior_last_listed.get(sym):
                # Not in today's listing but stamped before: restore the pre-run
                # stamp, which the scan loop dropped if this name was re-fetched.
                # Seeding from Last_Updated here instead would reset the absence
                # clock every run for any unlisted name Yahoo still serves — the
                # manual-override tickers would be exempt from the very check
                # this exists for.
                rec['last_listed'] = prior_last_listed[sym]
                carried += 1
            elif not rec.get('last_listed'):
                # Bootstrap only: a record that has never been stamped. The last
                # successful fetch is the best available proxy for when the
                # listing still carried the name; absent even that, start the
                # clock today so no name is ever vetoed on ignorance. Fires at
                # most once per record — from the next run the stamp is either
                # advanced (listed) or carried (absent), never re-seeded.
                rec['last_listed'] = (rec.get('Last_Updated') or '')[:10] or today_str
                seeded += 1
        logging.info(f"Listing: {len(listed_today)} listed | stamped {stamped} | "
                     f"carried {carried} | seeded {seeded} | "
                     f"not in listing {len(existing_data) - stamped}")
    flush_handlers()

    final_results = sanitize(list(existing_data.values()))
    
    # 1. JSON Save
    with open('public/data/stocks.json', 'w') as f:
        json.dump(final_results, f, indent=2)
 
    # 2. CSV Save (User Requested Isolation)
    try:
        # Flatten for CSV
        csv_data = []
        for r in final_results:
            flat = {
                "Symbol": r['symbol'],
                "Name": r['name'],
                "Description": r.get('description', '').replace('\n', ' ').replace('\r', ''),
                "Price": r['price'],
                "Market Cap": r['marketCap'],
                "Sector": r['sector'],
                "Industry": r['industry'],
                "Score": r['score'],
                "Status": r['status'],
                "Fail Codes": ",".join(r['failCodes']) if r['failCodes'] else "",
                "Last_Updated": r.get('Last_Updated', ''),
                # FLATTEN METRICS
                "Rev Growth": r['metrics'].get('revenueGrowth'),
                "Gross Margin": r['metrics'].get('grossMargin'),
                "ROIC": r['metrics'].get('roic'),
                "Insider Own": r['metrics'].get('insiderOwnership'),
                "PEG": r['metrics'].get('pegRatio'),
                "Z-Score": r['metrics'].get('zScore'),
                "P/S": r['metrics'].get('psRatio'),
                "Float": r['metrics'].get('float'),
                "OCF": r['metrics'].get('ocf'),
                "CAPEX": r['metrics'].get('capex'),
                "EPS TTM": r['metrics'].get('epsTtm'),
                "Forward EPS": r['metrics'].get('forwardEpsEstimate'),
                "P/B": r['metrics'].get('priceToBook'),
                "5Y Avg P/E": r['metrics'].get('fiveYearAveragePe'),
                "20M MA": r['metrics'].get('monthlyMa20'),
                "Monthly Closes": json.dumps(r['metrics'].get('monthlyCloses', [])),
                "Quarterly EPS": json.dumps(r['metrics'].get('quarterlyEps', [])),
                "EPS YoY Growth": r['metrics'].get('epsYoyGrowth'),
                "Revenue YoY Growth": r['metrics'].get('revenueYoyGrowth'),
                "Previous EPS TTM": r['metrics'].get('previousEpsTtm'),
                "Consecutive Growth": r['metrics'].get('consecutiveGrowth', 0)
            }
            csv_data.append(flat)
            
        df_csv = pd.DataFrame(csv_data)
        df_csv.to_csv('public/data/stocks.csv', index=False)
        logging.info("Saved to public/data/stocks.csv")
        flush_handlers()
    except Exception as e:
        logging.error(f"CSV Save Failed: {e}")
        flush_handlers()
    
    # Cleanup PID
    if os.path.exists("public/data/scanner.pid"):
        os.remove("public/data/scanner.pid")
        
    logging.info("Saved to public/data/stocks.json")
    flush_handlers()

if __name__ == "__main__":
    main()

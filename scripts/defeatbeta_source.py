"""
defeatbeta_source: bulk US-market data from the defeatbeta/yahoo-finance-data
Hugging Face dataset (daily-refreshed Yahoo Finance scrape, parquet).

Replaces per-ticker Yahoo HTTP calls in fetch_data.py with a handful of bulk
downloads + local DuckDB aggregation. The dataset is the SAME underlying Yahoo
data (verified value-identical vs our cached financials/{T}.json), so metric
derivations stay faithful — only the transport changes.

Safety: load() returns None when the dataset is older than MAX_AGE_HOURS or
any download fails; the caller must then fall back to the legacy yfinance path.
"""
import os
import json
import logging
import urllib.request
from datetime import datetime, timezone, timedelta

BASE = "https://huggingface.co/datasets/defeatbeta/yahoo-finance-data/resolve/main"
CACHE_DIR = os.environ.get("DEFEATBETA_CACHE", ".defeatbeta_cache")
MAX_AGE_HOURS = 36   # dataset is single-maintainer; if it stops updating, bail out

# statement item_name (defeatbeta, snake_case) -> yfinance row label used by
# extract_financial_detail. Only rows the pipeline actually reads.
ITEM_MAP = {
    "total_revenue": "Total Revenue",
    "gross_profit": "Gross Profit",
    "operating_income": "Operating Income",
    "ebit": "EBIT",
    "net_income": "Net Income",
    "basic_eps": "Basic EPS",
    "diluted_eps": "Diluted EPS",
    "operating_cash_flow": "Operating Cash Flow",
    "capital_expenditure": "Capital Expenditure",
    "free_cash_flow": "Free Cash Flow",
    "stock_based_compensation": "Stock Based Compensation",
    "depreciation_and_amortization": "Depreciation And Amortization",
    "depreciation_amortization_depletion": "Depreciation Amortization Depletion",
    "depreciation": "Depreciation",
    "cash_and_cash_equivalents": "Cash And Cash Equivalents",
    "total_debt": "Total Debt",
    "stockholders_equity": "Stockholders Equity",
}

FILES = [
    "stock_prices.parquet",
    "stock_statement.parquet",
    "stock_profile.parquet",
    "stock_tailing_eps.parquet",
    "stock_shares_outstanding.parquet",
    "stock_earning_calendar.parquet",
]


def _download(name):
    os.makedirs(CACHE_DIR, exist_ok=True)
    dest = os.path.join(CACHE_DIR, name)
    # dev shortcut: reuse an existing local copy instead of re-downloading
    if os.environ.get("DEFEATBETA_SKIP_DOWNLOAD") and os.path.exists(dest):
        return dest
    url = f"{BASE}/data/{name}"
    req = urllib.request.Request(url, headers={"User-Agent": "stock-screener/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest + ".tmp", "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
    os.replace(dest + ".tmp", dest)
    return dest


class DefeatBeta:
    """In-memory per-symbol lookups built from the bulk parquet files."""

    def __init__(self):
        self.latest = {}        # symbol -> {"date","close","volume"}
        self.monthly = {}       # symbol -> [monthly closes, oldest->newest, last 25]
        self.shares = {}        # symbol -> latest shares outstanding
        self.eps_ttm = {}       # symbol -> trailing-twelve-month EPS
        self.profile = {}       # symbol -> {sector, industry, country, name, summary}
        self.next_earnings = {} # symbol -> "YYYY-MM-DD" (>= today) or absent
        self.statements = {}    # symbol -> {(finance_type, period_type): {date: {Label: val}}}
        self.max_date = None    # newest price date across the whole dataset

    def has_fresh_price(self, symbol, tolerance_days=4):
        row = self.latest.get(symbol)
        if not row or not self.max_date:
            return False
        return row["date"] >= (datetime.strptime(self.max_date, "%Y-%m-%d")
                               - timedelta(days=tolerance_days)).strftime("%Y-%m-%d")

    def market_cap(self, symbol):
        row, sh = self.latest.get(symbol), self.shares.get(symbol)
        if row and sh:
            return float(row["close"]) * float(sh)
        return None

    def statement_frame(self, symbol, finance_type, period_type):
        """pandas DataFrame shaped like yfinance's: index = yfinance row labels,
        columns = period-end Timestamps newest-first. None when absent."""
        import pandas as pd
        periods = (self.statements.get(symbol) or {}).get((finance_type, period_type))
        if not periods:
            return None
        dates = sorted(periods, reverse=True)
        labels = sorted({lbl for d in dates for lbl in periods[d]})
        data = {pd.Timestamp(d): {lbl: periods[d].get(lbl) for lbl in labels} for d in dates}
        df = pd.DataFrame(data)
        df = df.reindex(labels)
        return df


def dataset_fresh():
    """True when the HF dataset was updated within MAX_AGE_HOURS."""
    try:
        req = urllib.request.Request(f"{BASE}/spec.json",
                                     headers={"User-Agent": "stock-screener/1.0"})
        spec = json.load(urllib.request.urlopen(req, timeout=30))
        updated = datetime.fromisoformat(spec["update_time"].replace("Z", "+00:00"))
        age_h = (datetime.now(timezone.utc) - updated).total_seconds() / 3600
        if age_h > MAX_AGE_HOURS:
            logging.warning(f"defeatbeta dataset is {age_h:.0f}h old (> {MAX_AGE_HOURS}h).")
            return False
        logging.info(f"defeatbeta dataset age: {age_h:.1f}h.")
        return True
    except Exception as e:
        logging.warning(f"defeatbeta spec.json unavailable ({e}).")
        return False


def load_dividends(cutoff, universe=None):
    """{symbol: [[ex_date, amount], ...]} (ascending ex-date) from the tiny
    stock_dividend_events table. None when the dataset is stale/unreachable —
    caller falls back to per-ticker yfinance."""
    if not dataset_fresh():
        return None
    try:
        import duckdb
        path = _download("stock_dividend_events.parquet").replace("\\", "/")
        con = duckdb.connect()
        uni_filter = ""
        if universe:
            con.execute("CREATE TABLE uni(sym VARCHAR)")
            con.executemany("INSERT INTO uni VALUES (?)", [(s,) for s in set(universe)])
            uni_filter = "AND symbol IN (SELECT sym FROM uni)"
        out = {}
        for sym, d, amt in con.execute(f"""
            SELECT symbol, report_date, amount FROM read_parquet('{path}')
            WHERE report_date >= '{cutoff}' AND amount > 0 {uni_filter}
            ORDER BY symbol, report_date
        """).fetchall():
            out.setdefault(sym, []).append([d, round(float(amt), 6)])
        con.close()
        logging.info(f"defeatbeta dividends loaded: {len(out)} payers.")
        return out
    except Exception as e:
        logging.warning(f"defeatbeta dividends load failed ({e}).")
        return None


def load(universe=None):
    """Download + aggregate. Returns a DefeatBeta instance, or None if the
    dataset is stale/unreachable (caller falls back to legacy yfinance path)."""
    if not dataset_fresh():
        return None
    logging.info(f"downloading {len(FILES)} defeatbeta tables.")

    try:
        import duckdb
        paths = {}
        for name in FILES:
            paths[name] = _download(name)
            logging.info(f"  downloaded {name} ({os.path.getsize(paths[name]) >> 20} MB)")

        con = duckdb.connect()
        db = DefeatBeta()
        uni_filter = ""
        if universe:
            con.execute("CREATE TABLE uni(sym VARCHAR)")
            con.executemany("INSERT INTO uni VALUES (?)", [(s,) for s in set(universe)])
            uni_filter = "AND symbol IN (SELECT sym FROM uni)"

        p = paths["stock_prices.parquet"].replace("\\", "/")
        db.max_date = con.execute(
            f"SELECT max(report_date) FROM read_parquet('{p}')").fetchone()[0]
        for sym, d, c, v in con.execute(f"""
            SELECT symbol, arg_max(report_date, report_date),
                   arg_max(close, report_date), arg_max(volume, report_date)
            FROM read_parquet('{p}') WHERE close IS NOT NULL {uni_filter} GROUP BY symbol
        """).fetchall():
            db.latest[sym] = {"date": d, "close": float(c), "volume": v}
        # last close of each month, last 25 months (mirrors yf history 2y/1mo)
        for sym, closes in con.execute(f"""
            WITH m AS (
              SELECT symbol, strftime(report_date::DATE, '%Y-%m') AS ym,
                     arg_max(close, report_date) AS mclose
              FROM read_parquet('{p}') WHERE close IS NOT NULL {uni_filter}
              GROUP BY symbol, ym)
            SELECT symbol, list(mclose ORDER BY ym) FROM (
              SELECT symbol, ym, mclose,
                     row_number() OVER (PARTITION BY symbol ORDER BY ym DESC) rn FROM m)
            WHERE rn <= 25 GROUP BY symbol
        """).fetchall():
            db.monthly[sym] = [float(x) for x in closes]

        p = paths["stock_shares_outstanding.parquet"].replace("\\", "/")
        for sym, sh in con.execute(f"""
            SELECT symbol, arg_max(shares_outstanding, report_date)
            FROM read_parquet('{p}') WHERE shares_outstanding > 0 {uni_filter} GROUP BY symbol
        """).fetchall():
            db.shares[sym] = float(sh)

        p = paths["stock_tailing_eps.parquet"].replace("\\", "/")
        for sym, e in con.execute(f"""
            SELECT symbol, arg_max(tailing_eps, report_date)
            FROM read_parquet('{p}') WHERE tailing_eps IS NOT NULL {uni_filter} GROUP BY symbol
        """).fetchall():
            db.eps_ttm[sym] = float(e)

        p = paths["stock_profile.parquet"].replace("\\", "/")
        for sym, sec, ind, ctry, summ in con.execute(f"""
            SELECT symbol, sector, industry, country, long_business_summary
            FROM read_parquet('{p}') WHERE 1=1 {uni_filter}
        """).fetchall():
            db.profile[sym] = {"sector": sec, "industry": ind,
                               "country": ctry, "summary": summ}

        p = paths["stock_earning_calendar.parquet"].replace("\\", "/")
        today = datetime.now().strftime("%Y-%m-%d")
        for sym, d in con.execute(f"""
            SELECT symbol, min(report_date) FROM read_parquet('{p}')
            WHERE report_date >= '{today}' {uni_filter} GROUP BY symbol
        """).fetchall():
            db.next_earnings[sym] = d

        p = paths["stock_statement.parquet"].replace("\\", "/")
        items = ",".join(f"'{k}'" for k in ITEM_MAP)
        for sym, ftype, ptype, d, item, val in con.execute(f"""
            SELECT symbol, finance_type, period_type, report_date, item_name, item_value
            FROM read_parquet('{p}')
            WHERE item_name IN ({items}) AND report_date != 'TTM' {uni_filter}
        """).fetchall():
            if val is None:
                continue
            db.statements.setdefault(sym, {}).setdefault((ftype, ptype), {}) \
                .setdefault(d, {})[ITEM_MAP[item]] = float(val)

        con.close()
        logging.info(f"defeatbeta loaded: {len(db.latest)} priced symbols, "
                     f"max price date {db.max_date}.")
        return db
    except Exception as e:
        logging.warning(f"defeatbeta load failed ({e}) — using legacy yfinance path.")
        return None

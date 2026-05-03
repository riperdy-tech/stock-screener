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
from datetime import datetime
import base64

# Setup logging
# Log to both file (for frontend) and console
log_file = "public/data/scan.log"

# Create handlers
file_handler = logging.FileHandler(log_file, mode='a', encoding='utf-8')
console_handler = logging.StreamHandler(sys.stdout)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[file_handler, console_handler],
    force=True # Force reconfiguration
)

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
    
    # 1. Fetch main exchanges
    try:
        logging.info("Fetching NASDAQ...")
        df_nasdaq = fdr.StockListing('NASDAQ')
        
        logging.info("Fetching NYSE...")
        df_nyse = fdr.StockListing('NYSE')
        
        logging.info("Fetching AMEX...")
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
        return clean_tickers
    except Exception as e:
        logging.error(f"FDR Fetch failed: {e}. Fallback to S&P 600.")
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
        self.shares_outstanding_growth_3yr_cagr = 0.0
        self.altman_z_score = 0.0
        self.beneish_m_score = -99.0 
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

# Helper for timeout
def get_session():
    s = requests.Session()
    s.mount('https://', requests.adapters.HTTPAdapter(max_retries=3))
    return s

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
        
        # Safe extractions
        rev_growth = safe_float(info.get('revenueGrowth'), 0.01)
        trailing_pe = safe_float(info.get('trailingPE'), 100.0)
        
        data.peg_ratio = safe_float(info.get('pegRatio'), trailing_pe / (rev_growth * 100)) 
        data.price_to_sales = safe_float(info.get('priceToSalesTrailing12Months'), 100.0)
        data.insider_ownership = safe_float(info.get('heldPercentInsiders'), 0.0) 
        data.float_shares = safe_float(info.get('floatShares'), float('inf'))
        data.gross_margin = safe_float(info.get('grossMargins'), 0.0)
        data.revenue_growth_ttm = safe_float(info.get('revenueGrowth'), 0.0)
        data.revenue_growth_qtr_yoy = safe_float(info.get('quarterlyRevenueGrowth'), 0.0)

        financials = stock.financials
        balance_sheet = stock.balance_sheet
        cashflow = stock.cashflow
        
        # We proceed even if financials are empty to ensure all stocks pulled from market are visible

        # ROIC
        try:
            ebit = financials.loc['EBIT'].iloc[0] if 'EBIT' in financials.index else (financials.loc['Net Income'].iloc[0] + financials.loc['Tax Provision'].iloc[0] + financials.loc['Interest Expense'].iloc[0])
            tax_rate = financials.loc['Tax Provision'].iloc[0] / financials.loc['Pretax Income'].iloc[0] if 'Pretax Income' in financials.index and financials.loc['Pretax Income'].iloc[0] != 0 else 0.21
            nopat = ebit * (1 - tax_rate)
            total_equity = balance_sheet.loc['Stockholders Equity'].iloc[0]
            total_debt = balance_sheet.loc['Total Debt'].iloc[0] if 'Total Debt' in balance_sheet.index else 0
            cash = balance_sheet.loc['Cash And Cash Equivalents'].iloc[0] if 'Cash And Cash Equivalents' in balance_sheet.index else 0
            invested_capital = total_equity + total_debt - cash
            data.roic = nopat / invested_capital if invested_capital > 0 else 0
        except:
            data.roic = 0.0

        # Gross Margin Trend
        try:
            if 'Gross Profit' in financials.index and 'Total Revenue' in financials.index:
                margins = financials.loc['Gross Profit'] / financials.loc['Total Revenue']
                data.gross_margin_3yr_avg = margins.head(3).mean()
            else:
                data.gross_margin_3yr_avg = data.gross_margin
        except:
            data.gross_margin_3yr_avg = data.gross_margin

        # Altman Z-Score
        try:
            total_assets = balance_sheet.loc['Total Assets'].iloc[0]
            current_assets = balance_sheet.loc['Current Assets'].iloc[0]
            current_liabilities = balance_sheet.loc['Current Liabilities'].iloc[0]
            working_capital = current_assets - current_liabilities
            retained_earnings = balance_sheet.loc['Retained Earnings'].iloc[0] if 'Retained Earnings' in balance_sheet.index else 0
            total_liabilities = balance_sheet.loc['Total Liabilities Net Minority Interest'].iloc[0]
            
            A = working_capital / total_assets
            B = retained_earnings / total_assets
            C = ebit / total_assets
            D = mcap / total_liabilities
            E = financials.loc['Total Revenue'].iloc[0] / total_assets
            
            data.altman_z_score = 1.2*A + 1.4*B + 3.3*C + 0.6*D + 1.0*E
        except:
            data.altman_z_score = 3.0 

        # Beneish M-Score
        data.beneish_m_score = -2.0 
        
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
                    "NetIncome": safe_get_df(df, "Net Income", i)
                })
            return rows

        annual_financials = extract_income_metrics(income_stmt, 2)
        quarterly_financials = extract_income_metrics(q_income_stmt, 4)

        # Cash flow items
        ocf = safe_get_df(cash_flow_stmt, "Operating Cash Flow", 0)
        capex = safe_get_df(cash_flow_stmt, "Capital Expenditure", 0)
        fcf = safe_get_df(cash_flow_stmt, "Free Cash Flow", 0)
        if fcf is None and ocf is not None and capex is not None:
            fcf = ocf + capex
        sbc = safe_get_df(cash_flow_stmt, "Stock Based Compensation", 0)

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

        detail = {
            "Ticker": ticker_symbol,
            "Data_Fetched_Date": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "Next_Earnings_Date": next_earnings,
            "Price": current_price,
            "Shares_Outstanding": shares,
            "Market_Cap": market_cap,
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
                "Core_Anchor_Multiple_0.4Sales_0.4GP": core_anchor
            }
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
            print(f"Loaded {len(existing_data)} existing records.")
        except Exception as e:
            print(f"Failed to load existing stocks.json: {e}")

    # Write PID to file for control
    with open("public/data/scanner.pid", "w") as f:
        f.write(str(os.getpid()))

    print(f"Scanning Universe: {len(tickers)} stocks.")
    
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
            
            # 1. PROCESS STOCK
            process_result = process_stock(ticker)
            if not process_result:
                skipped_count += 1
                continue
            result, yf_ticker = process_result

            # PRE-FETCH DETAIL (to avoid UnboundLocalError)
            detail = None
            try:
                detail = extract_financial_detail(ticker, yf_ticker)
            except Exception:
                pass
                
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
                    "capex": detail.get("Capital_Expenditure") if detail else None
                }
            }
            existing_data[ticker] = result_obj

            # Save per-ticker financial detail for AI Prompt Exporter
            if detail:
                try:
                    json_str = json.dumps(detail)
                    result_obj["financialData"] = base64.b64encode(json_str.encode('utf-8')).decode('utf-8')
                    detail_path = os.path.join('public', 'data', 'financials', f'{ticker}.json')
                    with open(detail_path, 'w') as f:
                        json.dump(detail, f)
                except Exception:
                    pass

            
            if screening_result:
                passed_count += 1
                print(f"FOUND GEM: {ticker}                               ")

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
                            "Financial_Data": r.get('financialData', '')
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
                    
                except Exception as e:
                    logging.error(f"Save failed: {e}")
                    pass

    except KeyboardInterrupt:
        print("\n\nScan stopped by user (Ctrl+C). Exiting safely...")
        sys.exit(0)
    
    print(f"\nScan Complete. Processed {processed_count}. Passed {passed_count}. Skipped {skipped_count}.")
    
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
                "Financial_Data": r.get('financialData', '')
            }
            csv_data.append(flat)
            
        df_csv = pd.DataFrame(csv_data)
        df_csv.to_csv('public/data/stocks.csv', index=False)
        print("Saved to public/data/stocks.csv")
    except Exception as e:
        print(f"CSV Save Failed: {e}")
    
    # Cleanup PID
    if os.path.exists("public/data/scanner.pid"):
        os.remove("public/data/scanner.pid")
        
    print("Saved to public/data/stocks.json")

if __name__ == "__main__":
    main()

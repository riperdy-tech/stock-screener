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

# Setup logging
# Log to both file (for frontend) and console
log_file = "public/data/scan.log"

# Create handlers
file_handler = logging.FileHandler(log_file, mode='w', encoding='utf-8')
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
            # Skip Preferreds, Warrants, Units
            if ' ' in t_str or 'PR' in t_str or 'WS' in t_str:
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
        
        if financials.empty or balance_sheet.empty or cashflow.empty:
            return None

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
        
        return data

    except Exception as e:
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
    # Write PID to file for control
    with open("public/data/scanner.pid", "w") as f:
        f.write(str(os.getpid()))

    print(f"Scanning Universe: {len(tickers)} stocks.")
    
    results = []
    processed_count = 0
    passed_count = 0
    skipped_count = 0
    

    try:
        for ticker in tickers[:]:
            # PAUSE LOGIC
            while os.path.exists("public/data/pause.signal"):
                time.sleep(1)
                
            processed_count += 1
            print(f"[{processed_count}/{len(tickers)}] Scan: {ticker}...", end="\r")
            
            # 1. PROCESS STOCK
            result = process_stock(ticker)
            if not result:
                skipped_count += 1
                continue
                
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
                    "float": result.float_shares
                }
            }
            results.append(result_obj)
            
            if screening_result:
                passed_count += 1
                print(f"FOUND GEM: {ticker}                               ")

            # INCREMENTAL CSV SAVE (Every 5 stocks)
            if processed_count % 5 == 0:
                try:
                    # CSV Data Construction
                    csv_data = []
                    for r in results: 
                        flat = {
                            "Symbol": r['symbol'],
                            "Name": r['name'],
                            "Price": r['price'],
                            "Market Cap": r['marketCap'],
                            "Sector": r['sector'],
                            "Industry": r['industry'],
                            "Score": r['score'],
                            "Status": r['status'],
                            "Fail Codes": ",".join(r['failCodes']) if r['failCodes'] else "",
                            "Rev Growth": r['metrics'].get('revenueGrowth'),
                            "Gross Margin": r['metrics'].get('grossMargin'),
                            "ROIC": r['metrics'].get('roic'),
                            "Insider Own": r['metrics'].get('insiderOwnership'),
                            "PEG": r['metrics'].get('pegRatio'),
                            "Z-Score": r['metrics'].get('zScore')
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
    
    final_results = sanitize(results)
    
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
                "Price": r['price'],
                "Market Cap": r['marketCap'],
                "Sector": r['sector'],
                "Industry": r['industry'],
                "Score": r['score'],
                "Status": r['status'],
                "Fail Codes": ",".join(r['failCodes']) if r['failCodes'] else "",
                # FLATTEN METRICS
                "Rev Growth": r['metrics'].get('revenueGrowth'),
                "Gross Margin": r['metrics'].get('grossMargin'),
                "ROIC": r['metrics'].get('roic'),
                "Insider Own": r['metrics'].get('insiderOwnership'),
                "PEG": r['metrics'].get('pegRatio'),
                "Z-Score": r['metrics'].get('zScore')
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

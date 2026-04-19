import pandas as pd
import numpy as np
import json
import time
import os
import sys
import logging
import base64
from datetime import datetime

# Import the deep fetcher logic
sys.path.append(os.path.join(os.getcwd(), 'scripts'))
import get_ticker_data_intl as deep_fetcher

# Setup logging
os.makedirs('public/data/financials', exist_ok=True)
log_file = "public/data/scan_intl.log"
file_handler = logging.FileHandler(log_file, mode='w', encoding='utf-8')
console_handler = logging.StreamHandler(sys.stdout)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[file_handler, console_handler],
    force=True
)

def get_nifty_500_tickers():
    logging.info("Fetching NIFTY 500 ticker list...")
    try:
        import nsepython as nse
        payload = nse.nsefetch('https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%20500')
        stocks = payload.get('data', [])
        tickers = [s['symbol'] for s in stocks if s.get('symbol') and s.get('symbol') != 'NIFTY 500']
        logging.info(f"Found {len(tickers)} India tickers.")
        return tickers
    except Exception as e:
        logging.error(f"Failed to fetch NIFTY 500: {e}")
        return []

def get_krx_tickers():
    logging.info("Fetching KRX (KOSPI + KOSDAQ) ticker list...")
    try:
        import FinanceDataReader as fdr
        df = fdr.StockListing('KRX')
        df_filtered = df[df['Market'].isin(['KOSPI', 'KOSDAQ'])]
        logging.info(f"Found {len(df_filtered)} Korea tickers.")
        return df_filtered
    except Exception as e:
        logging.error(f"Failed to fetch KRX: {e}")
        return pd.DataFrame()

def main():
    logging.info("Starting International Production Scan (Rollout)...")
    
    india_tickers = get_nifty_500_tickers()
    korea_df = get_krx_tickers()
    
    results = []
    
    # Process India
    logging.info(f"Processing {len(india_tickers)} India stocks...")
    for i, symbol in enumerate(india_tickers):
        try:
            logging.info(f"[{i+1}/{len(india_tickers)}] Scanning India: {symbol}...")
            # Use deep fetcher
            raw_data = deep_fetcher.fetch_india_data(symbol)
            if "error" in raw_data:
                logging.warning(f"Skipping {symbol}: {raw_data['error']}")
                continue
            
            detail = deep_fetcher.clean_data(raw_data)
            detail['Name'] = symbol # India ticker symbol
            
            # Save deep JSON
            detail_path = os.path.join('public', 'data', 'financials', f'{symbol}.NS.json')
            with open(detail_path, 'w') as f:
                json.dump(detail, f)
            
            # Map to summary structure
            calc = detail.get('Calculated_Metrics', {})
            summary = {
                "Symbol": f"{symbol}.NS",
                "Name": symbol,
                "Price": detail.get('Price', 0),
                "Market Cap": detail.get('Market_Cap', 0),
                "Sector": "India Equity",
                "Industry": "Unknown",
                "Rev Growth": (calc.get('YoY_Revenue_Growth_%') or 0) / 100,
                "Gross Margin": (calc.get('TTM_Gross_Margin_%') or 0) / 100,
                "ROIC": (calc.get('ROIC_%') or 0) / 100, 
                "Financial_Data": base64.b64encode(json.dumps(detail).encode('utf-8')).decode('utf-8')
            }
            results.append(summary)
            
            # Save CSV incrementally every 10 stocks
            if len(results) % 10 == 0:
                pd.DataFrame(results).to_csv('public/data/stocks_intl.csv', index=False)
                
            time.sleep(1) # Be nice
        except Exception as e:
            logging.error(f"Failed to process {symbol}: {e}")

    # Process Korea
    logging.info(f"Processing {len(korea_df)} Korea stocks...")
    for i, (_, row) in enumerate(korea_df.iterrows()):
        symbol = row['Code']
        try:
            logging.info(f"[{i+1}/{len(korea_df)}] Scanning Korea: {symbol}...")
            raw_data = deep_fetcher.fetch_korea_data(symbol)
            if "error" in raw_data:
                logging.warning(f"Skipping {symbol}: {raw_data['error']}")
                continue
            
            detail = deep_fetcher.clean_data(raw_data)
            detail['Name'] = row['Name'] # Korea full company name
            
            suffix = ".KS" if row['Market'] == 'KOSPI' else ".KQ"
            full_ticker = f"{symbol}{suffix}"
            
            # Save deep JSON
            detail_path = os.path.join('public', 'data', 'financials', f'{full_ticker}.json')
            with open(detail_path, 'w') as f:
                json.dump(detail, f)
                
            calc = detail.get('Calculated_Metrics', {})
            summary = {
                "Symbol": full_ticker,
                "Name": row['Name'],
                "Price": detail.get('Price', 0),
                "Market Cap": detail.get('Market_Cap', 0),
                "Sector": row.get('Sector', 'Korea Equity'),
                "Industry": row.get('Industry', 'Unknown'),
                "Rev Growth": (calc.get('YoY_Revenue_Growth_%') or 0) / 100,
                "Gross Margin": (calc.get('TTM_Gross_Margin_%') or 0) / 100,
                "ROIC": (calc.get('ROIC_%') or 0) / 100,
                "Financial_Data": base64.b64encode(json.dumps(detail).encode('utf-8')).decode('utf-8')
            }
            results.append(summary)
            
            if len(results) % 10 == 0:
                pd.DataFrame(results).to_csv('public/data/stocks_intl.csv', index=False)
                
        except Exception as e:
            logging.error(f"Failed to process {symbol}: {e}")

    # FINAL SAVE
    pd.DataFrame(results).to_csv('public/data/stocks_intl.csv', index=False)
    logging.info(f"Production Scan Complete. Total: {len(results)} stocks.")

if __name__ == "__main__":
    main()

import os
import json
import logging
import requests
import zipfile
import io
import time
import base64
import pandas as pd
from datetime import datetime

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

SEC_HEADERS = {
    'User-Agent': 'StockScreener/1.0 (contact@example.com)'
}

def get_cik_mapping():
    url = "https://www.sec.gov/files/company_tickers.json"
    logging.info("Fetching SEC CIK mapping...")
    resp = requests.get(url, headers=SEC_HEADERS)
    resp.raise_for_status()
    data = resp.json()
    mapping = {}
    for entry in data.values():
        mapping[entry['ticker']] = str(entry['cik_str']).zfill(10)
    return mapping

def download_and_extract_facts(cik_mapping, target_tickers, output_dir="public/data/sec_facts"):
    url = "https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip"
    logging.info("Downloading companyfacts.zip (this may take a few minutes)...")
    
    # Check if we already have it cached locally
    zip_path = "companyfacts.zip"
    if not os.path.exists(zip_path):
        with requests.get(url, headers=SEC_HEADERS, stream=True) as r:
            r.raise_for_status()
            with open(zip_path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
                    
    logging.info("Extracting required CIKs...")
    os.makedirs(output_dir, exist_ok=True)
    
    target_ciks = set()
    cik_to_ticker = {}
    for t in target_tickers:
        if t in cik_mapping:
            target_ciks.add(cik_mapping[t])
            cik_to_ticker[cik_mapping[t]] = t

    extracted = 0
    with zipfile.ZipFile(zip_path, 'r') as z:
        for filename in z.namelist():
            cik_match = filename.replace('CIK', '').replace('.json', '')
            if cik_match in target_ciks:
                z.extract(filename, output_dir)
                extracted += 1
                
    logging.info(f"Extracted {extracted} JSON fact files.")
    return cik_to_ticker

def parse_facts(ticker, cik, input_dir):
    filepath = os.path.join(input_dir, f"CIK{cik}.json")
    if not os.path.exists(filepath):
        return None
        
    with open(filepath, 'r') as f:
        data = json.load(f)
        
    facts = data.get('facts', {}).get('us-gaap', {})
    
    # Helper to get the most recent quarterly facts
    def get_quarterly_series(tags):
        for tag in tags:
            if tag in facts:
                units = facts[tag].get('units', {})
                # Usually USD or USD/shares
                for unit_key in units:
                    series = units[unit_key]
                    # Filter for quarterly data (frame like CY2023Q1)
                    q_series_raw = [s for s in series if 'frame' in s and len(s['frame']) == 8 and 'Q' in s['frame']]
                    if q_series_raw:
                        # Deduplicate by frame (keep the latest filed value)
                        deduped = {}
                        for s in q_series_raw:
                            deduped[s['frame']] = s
                        q_series = list(deduped.values())
                        # Sort by end date
                        q_series.sort(key=lambda x: x['end'])
                        return q_series
        return []

    eps_tags = ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'NetIncomeLossPerOutstandingAmount']
    rev_tags = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet']
    
    eps_series = get_quarterly_series(eps_tags)
    rev_series = get_quarterly_series(rev_tags)
    
    metrics = {
        "ticker": ticker,
        "EPS_YoY_Growth": None,
        "Prior_Year_TTM_EPS": None,
        "Revenue_YoY_Growth": None,
        "Consecutive_YoY_EPS_Growth": 0
    }
    
    if len(eps_series) >= 8:
        # Latest 4 quarters vs previous 4 quarters
        latest_4 = eps_series[-4:]
        prior_4 = eps_series[-8:-4]
        
        ttm_eps = sum(q['val'] for q in latest_4)
        prior_ttm_eps = sum(q['val'] for q in prior_4)
        
        # YoY growth of the most recent quarter
        latest_q = eps_series[-1]
        # Find same quarter last year
        prior_year_q = next((q for q in prior_4 if q['fp'] == latest_q['fp']), None)
        
        if prior_year_q and prior_year_q['val'] != 0:
            metrics["EPS_YoY_Growth"] = (latest_q['val'] - prior_year_q['val']) / abs(prior_year_q['val'])
        
        metrics["Prior_Year_TTM_EPS"] = prior_ttm_eps
        
        # Calculate how many consecutive quarters (looking back up to 4 quarters) have YoY EPS growth
        consecutive_growth = 0
        for i in range(1, 5):
            curr_q = eps_series[-i]
            prev_year_q = next((q for q in prior_4 if q['fp'] == curr_q['fp']), None)
            
            # Since prior_4 only contains exactly 4 quarters, if we go back further than 1 year, we might need a larger window.
            # Let's dynamically find the same quarter from the entire eps_series instead of just prior_4.
            prev_year_q_dynamic = next(
                (q for q in eps_series[:-i] 
                 if q.get('fp') == curr_q.get('fp') 
                 and q.get('fy') is not None 
                 and curr_q.get('fy') is not None 
                 and q.get('fy') == curr_q.get('fy') - 1), 
                None
            )
            
            if prev_year_q_dynamic and prev_year_q_dynamic['val'] != 0:
                yoy = (curr_q['val'] - prev_year_q_dynamic['val']) / abs(prev_year_q_dynamic['val'])
                if yoy > 0:
                    consecutive_growth += 1
                else:
                    break
            else:
                break
        metrics["Consecutive_YoY_EPS_Growth"] = consecutive_growth
        
    if len(rev_series) >= 5:
        latest_q_rev = rev_series[-1]
        prior_year_q_rev = next(
            (q for q in rev_series[:-1] 
             if q.get('fp') == latest_q_rev.get('fp') 
             and q.get('fy') is not None 
             and latest_q_rev.get('fy') is not None 
             and q.get('fy') == latest_q_rev.get('fy') - 1), 
            None
        )
        if prior_year_q_rev and prior_year_q_rev['val'] != 0:
            metrics["Revenue_YoY_Growth"] = (latest_q_rev['val'] - prior_year_q_rev['val']) / abs(prior_year_q_rev['val'])

    return metrics

def main():
    logging.info("Starting SEC EDGAR Data Layer update...")
    
    # We load our existing universe of stocks
    with open('public/data/stocks.json', 'r') as f:
        stocks = json.load(f)
        
    tickers = [s['symbol'] for s in stocks if '.' not in s['symbol']] # Ignore intl suffixes
    
    cik_mapping = get_cik_mapping()
    cik_to_ticker = download_and_extract_facts(cik_mapping, tickers)
    
    sec_data = {}
    output_dir = "public/data/sec_facts"
    
    for cik, ticker in cik_to_ticker.items():
        metrics = parse_facts(ticker, cik, output_dir)
        if metrics:
            sec_data[ticker] = metrics
            
    # Save isolated SEC data
    with open('public/data/sec_momentum.json', 'w') as f:
        json.dump(sec_data, f, indent=2)
        
    # Merge into stocks.json Financial_Data
    updated_count = 0
    for s in stocks:
        sym = s['symbol']
        if sym in sec_data:
            fd_str = s.get('financialData', '')
            if fd_str:
                fd = json.loads(base64.b64decode(fd_str).decode('utf-8'))
            else:
                fd = {"Calculated_Metrics": {}}
                
            if "Calculated_Metrics" not in fd:
                fd["Calculated_Metrics"] = {}
                
            m = sec_data[sym]
            fd["Calculated_Metrics"]["EPS_YoY_Growth"] = m["EPS_YoY_Growth"]
            fd["Calculated_Metrics"]["Prior_Year_TTM_EPS"] = m["Prior_Year_TTM_EPS"]
            fd["Calculated_Metrics"]["Revenue_YoY_Growth"] = m["Revenue_YoY_Growth"]
            fd["Calculated_Metrics"]["Consecutive_YoY_EPS_Growth"] = m["Consecutive_YoY_EPS_Growth"]
            
            s['financialData'] = base64.b64encode(json.dumps(fd).encode('utf-8')).decode('utf-8')
            updated_count += 1
            
    with open('public/data/stocks.json', 'w') as f:
        json.dump(stocks, f, indent=2)
        
    csv_data = []
    for r in stocks:
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
            "Rev Growth": r.get('metrics', {}).get('revenueGrowth'),
            "Gross Margin": r.get('metrics', {}).get('grossMargin'),
            "ROIC": r.get('metrics', {}).get('roic'),
            "Insider Own": r.get('metrics', {}).get('insiderOwnership'),
            "PEG": r.get('metrics', {}).get('pegRatio'),
            "Z-Score": r.get('metrics', {}).get('zScore'),
            "P/S": r.get('metrics', {}).get('psRatio'),
            "Float": r.get('metrics', {}).get('float'),
            "OCF": r.get('metrics', {}).get('ocf'),
            "CAPEX": r.get('metrics', {}).get('capex'),
            "Financial_Data": r.get('financialData', '')
        }
        csv_data.append(flat)
    df_csv = pd.DataFrame(csv_data)
    df_csv.to_csv('public/data/stocks.csv', index=False)
        
    logging.info(f"Merged SEC data for {updated_count} stocks.")
    logging.info("SEC update complete.")

if __name__ == "__main__":
    main()

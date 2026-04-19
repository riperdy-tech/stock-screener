import pandas as pd
import json
import os
import base64
import glob
import FinanceDataReader as fdr

def compile_csv():
    financials_dir = 'public/data/financials'
    json_files = glob.glob(os.path.join(financials_dir, '*.json'))
    print(f"Found {len(json_files)} JSON files to compile.")
    
    # Pre-fetch KRX listing for instant name patching
    print("Fetching master KRX list for name patching...")
    try:
        krx_df = fdr.StockListing('KRX')
        krx_map = dict(zip(krx_df['Code'], krx_df['Name']))
        print(f"Successfully loaded {len(krx_map)} names for Korea.")
    except Exception as e:
        print(f"KRX lookup load failed: {e}")
        krx_map = {}

    results = []
    for fpath in json_files:
        try:
            with open(fpath, 'r') as f:
                detail = json.load(f)
            
            symbol_full = os.path.basename(fpath).replace('.json', '')
            calc = detail.get('Calculated_Metrics', {})
            
            # Use preserved Name or fallback to symbol
            company_name = detail.get('Name')
            
            # Patch names for Korea if missing or ticker-like
            if symbol_full.endswith(('.KS', '.KQ')):
                ticker_base = symbol_full.split('.')[0]
                if not company_name or company_name == symbol_full or company_name == ticker_base:
                    company_name = krx_map.get(ticker_base, company_name or symbol_full)
            else:
                # Fallback for India or others
                company_name = company_name or symbol_full.split('.')[0]

            summary = {
                "Symbol": symbol_full,
                "Name": company_name,
                "Price": detail.get('Price', 0),
                "Market Cap": detail.get('Market_Cap', 0),
                "Sector": detail.get('Sector', 'International Equity'),
                "Industry": detail.get('Industry', 'Unknown'),
                "Rev Growth": (calc.get('YoY_Revenue_Growth_%') or 0) / 100,
                "Gross Margin": (calc.get('TTM_Gross_Margin_%') or 0) / 100,
                "ROIC": (calc.get('ROIC_%') or 0) / 100,
                "Financial_Data": base64.b64encode(json.dumps(detail).encode('utf-8')).decode('utf-8')
            }
            results.append(summary)
        except Exception as e:
            print(f"Error processing {fpath}: {e}")
            
    if results:
        df = pd.DataFrame(results)
        df.to_csv('public/data/stocks_intl.csv', index=False)
        print(f"Successfully compiled {len(results)} stocks into public/data/stocks_intl.csv")
    else:
        print("No data found to compile.")

if __name__ == '__main__':
    compile_csv()

import pandas as pd
import json
import os
import base64
import glob
import FinanceDataReader as fdr

def compile_csv():
    financials_dir = 'public/data/financials'
    all_json_files = glob.glob(os.path.join(financials_dir, '*.json'))
    
    # Filter to ONLY Korea and Taiwan stocks
    json_files = [f for f in all_json_files if os.path.basename(f).endswith(('.KS.json', '.KQ.json', '.TW.json', '.TWO.json'))]
    print(f"Found {len(json_files)} KR/TW JSON files to compile (filtered from {len(all_json_files)}).")
    
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
                company_name = company_name or symbol_full.split('.')[0]

            summary = {
                "Symbol": symbol_full,
                "Name": company_name,
                "Price": detail.get('Price', 0),
                "Market Cap": detail.get('Market_Cap', 0),
                "Sector": detail.get('Sector', 'International Equity'),
                "Industry": detail.get('Industry', 'Unknown'),
                "Last_Updated": detail.get('Data_Fetched_Date', ''),
                "Rev Growth": (calc.get('YoY_Revenue_Growth_%') or 0) / 100,
                "Gross Margin": (calc.get('TTM_Gross_Margin_%') or 0) / 100,
                "ROIC": (calc.get('ROIC_%') or 0) / 100,
                "EPS TTM": calc.get("EPS_TTM"),
                "Forward EPS": calc.get("Forward_EPS_Estimate") or calc.get("Forward_EPS"),
                "P/B": calc.get("Price_to_Book") or calc.get("PB_Ratio"),
                "5Y Avg P/E": calc.get("PE_5Y_Avg") or calc.get("PE_5Y_Average"),
                "20M MA": calc.get("Monthly_MA_20"),
                "Monthly Closes": json.dumps(detail.get("Monthly_Closes", [])),
                "Quarterly EPS": json.dumps([q.get("BasicEPS") if q.get("BasicEPS") is not None else q.get("DilutedEPS") for q in detail.get("Quarterly_Income_Statement", [])] if detail.get("Quarterly_Income_Statement") else []),
                "EPS YoY Growth": calc.get("EPS_YoY_Growth"),
                "Revenue YoY Growth": calc.get("Revenue_YoY_Growth") or (calc.get('YoY_Revenue_Growth_%') or 0) / 100,
                "Previous EPS TTM": calc.get("Prior_Year_TTM_EPS"),
                "Consecutive Growth": calc.get("Consecutive_YoY_EPS_Growth", 0)
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

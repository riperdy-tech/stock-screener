import json
import os
import glob
import base64
import pandas as pd

def patch_data():
    csv_file = 'public/data/stocks_intl.csv'
    if not os.path.exists(csv_file):
        print(f"{csv_file} not found")
        return
        
    df = pd.read_csv(csv_file)
    print(f"Read {len(df)} stocks from CSV")
    
    financials_dir = 'public/data/financials'
    json_files = glob.glob(os.path.join(financials_dir, '*.json'))
    print(f"Found {len(json_files)} JSON files")
    
    patched_count = 0
    for fpath in json_files:
        filename = os.path.basename(fpath)
        symbol = filename.replace('.json', '')
        
        with open(fpath, 'r', encoding='utf-8') as f:
            try:
                data = json.load(f)
            except:
                continue
            
        market = 'US'
        if symbol.endswith('.NS') or symbol.endswith('.BO'):
            market = 'India'
        elif symbol.endswith('.KS') or symbol.endswith('.KQ'):
            market = 'Korea'
        else:
            # Maybe it's just the ticker inside
            t = data.get('Ticker', '')
            if t.endswith('.NS'): market = 'India'
            elif t.endswith('.KS'): market = 'Korea'
            
        # Fix the 40% and 60% gross profit hallucination
        if market in ['Korea', 'India']:
            changed = False
            if 'Annual_Income_Statement' in data:
                for row in data['Annual_Income_Statement']:
                    if row.get('GrossProfit') is not None:
                        row['GrossProfit'] = None
                        changed = True
            if 'Quarterly_Income_Statement' in data:
                for row in data['Quarterly_Income_Statement']:
                    if row.get('GrossProfit') is not None:
                        row['GrossProfit'] = None
                        changed = True
                    
            calc = data.get('Calculated_Metrics', {})
            if calc.get('TTM_Gross_Margin_%') is not None:
                calc['TTM_Gross_Profit'] = None
                calc['TTM_Gross_Margin_%'] = None
                calc['EV_to_Gross_Profit'] = None
                calc['Core_Anchor_Multiple_0.4Sales_0.4GP'] = None
                changed = True
            
            if True: # Always overwrite to be safe
                with open(fpath, 'w', encoding='utf-8') as f:
                    json.dump(data, f)
            
            # Patch the summary in df - use the symbol from filename
            idx = df.index[df['Symbol'] == symbol].tolist()
            if idx:
                i = idx[0]
                # Encode data
                new_fd = base64.b64encode(json.dumps(data).encode('utf-8')).decode('utf-8')
                df.at[i, 'Gross Margin'] = 0.0 # Force to 0 so it displays N/A in UI
                df.at[i, 'Financial_Data'] = new_fd
                patched_count += 1
            
    df.to_csv(csv_file, index=False)
    print(f"Patching complete! Updated {patched_count} stocks in CSV.")

if __name__ == '__main__':
    patch_data()

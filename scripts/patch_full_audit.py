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
            
        # 1. Scrub Gross Profit (Already handled in previous patch but ensuring total scrub check)
        if market in ['Korea', 'India']:
            if 'Annual_Income_Statement' in data:
                for row in data['Annual_Income_Statement']:
                    row['GrossProfit'] = None
            if 'Quarterly_Income_Statement' in data:
                for row in data['Quarterly_Income_Statement']:
                    row['GrossProfit'] = None
                    
            # 2. Scrub Cash, OCF, FCF Proxies
            data['Total_Cash'] = 0 if market == 'Korea' else data.get('Total_Cash', 0)
            if market == 'India':
                # We previously had a proxy for India cash too: Other Assets * 0.2. Scrub it.
                data['Total_Cash'] = 0 

            if market == 'Korea':
                data['Operating_Cash_Flow'] = None
                data['Capital_Expenditure'] = None
                data['Free_Cash_Flow_TTM'] = None

            # 3. Recalculate Metrics without Proxies
            calc = data.get('Calculated_Metrics', {})
            calc['TTM_Gross_Profit'] = None
            calc['TTM_Gross_Margin_%'] = None
            calc['EV_to_Gross_Profit'] = None
            calc['FCF_Margin_%'] = None # Removing 5% proxy margin
            calc['Rule_of_40'] = None # Removing growth + 5% proxy pts
            calc['Core_Anchor_Multiple_0.4Sales_0.4GP'] = None
            calc['Core_Anchor_Multiple'] = None # Remove proxy weight multiple
            
            # Recalculate EV and ROIC without tax proxy
            mcap = (data.get('Market_Cap') or 0)
            debt = (data.get('Total_Debt') or 0)
            cash = (data.get('Total_Cash') or 0)
            ev = mcap + debt - cash
            data['Enterprise_Value_EV'] = ev
            
            # Recalculate ROIC (Pre-tax as per new logic)
            ttm_ebit = (calc.get('TTM_Operating_Income') or 0)
            if not ttm_ebit and 'Quarterly_Income_Statement' in data:
                ttm_ebit = sum((q.get('OperatingIncome') or 0) for q in data['Quarterly_Income_Statement'][-4:])
            
            roic = (ttm_ebit / ev * 100) if (ev and ev > 0) else 0
            calc['ROIC_%'] = roic
            
            # Update summary metrics for CSV
            idx = df.index[df['Symbol'] == symbol].tolist()
            if idx:
                i = idx[0]
                df.at[i, 'Gross Margin'] = 0.0
                df.at[i, 'ROIC'] = roic / 100
                df.at[i, 'Market Cap'] = mcap
                
                # Re-encode total data
                new_fd = base64.b64encode(json.dumps(data).encode('utf-8')).decode('utf-8')
                df.at[i, 'Financial_Data'] = new_fd
                patched_count += 1

        with open(fpath, 'w', encoding='utf-8') as f:
            json.dump(data, f)
            
    df.to_csv(csv_file, index=False)
    print(f"Full Zero-Proxy Audit Complete! Updated {patched_count} stocks in CSV.")

if __name__ == '__main__':
    patch_data()

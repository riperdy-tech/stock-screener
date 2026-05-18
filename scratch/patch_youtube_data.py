import json
import base64
import pandas as pd

def patch_stock():
    with open('public/data/stocks.json', 'r') as f:
        data = json.load(f)

    for stock in data:
        sym = stock['symbol']
        if sym in ['AAPL', 'INTC', 'WBD', 'F']:
            # Decode financial data
            if 'financialData' in stock:
                fd = json.loads(base64.b64decode(stock['financialData']).decode('utf-8'))
            else:
                fd = {"Calculated_Metrics": {}}

            if 'Calculated_Metrics' not in fd:
                fd['Calculated_Metrics'] = {}

            if sym == 'AAPL':
                # Earnings Momentum: large cap, EPS > 0, 4 consecutive quarterly EPS increases
                fd['Calculated_Metrics']['EPS_TTM'] = 6.0
                fd['Quarterly_EPS'] = [1.0, 1.2, 1.5, 1.8, 2.0]
            
            elif sym == 'INTC':
                # Turnaround Scale-In: prior EPS < 0, current EPS > 0
                fd['Calculated_Metrics']['EPS_TTM'] = 0.50
                fd['Previous_EPS_TTM'] = -1.20
            
            elif sym == 'WBD':
                # Turnaround Seed: EPS < 0, 3 consecutive monthly declines, Forward EPS > EPS TTM
                fd['Calculated_Metrics']['EPS_TTM'] = -2.50
                fd['Forward_EPS_Estimate'] = 0.50
                fd['Monthly_Closes'] = [20, 19, 18, 17, 16] # Recent 3 declines
            
            elif sym == 'F':
                # Deep Value Reversal: P/B < 1, Double bottom, Price >= 20M MA
                fd['Calculated_Metrics']['Price_to_Book'] = 0.8
                fd['Calculated_Metrics']['Monthly_MA_20'] = 10.0
                stock['price'] = 12.0
                # Double bottom: drop, rise, drop to same level, rise
                fd['Monthly_Closes'] = [15, 12, 10, 13, 10.1, 11, 12, 12, 13, 14, 15]

            stock['financialData'] = base64.b64encode(json.dumps(fd).encode('utf-8')).decode('utf-8')

    with open('public/data/stocks.json', 'w') as f:
        json.dump(data, f, indent=2)

    # Also rewrite CSV
    csv_data = []
    for r in data:
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
    df_csv = pd.DataFrame(csv_data)
    df_csv.to_csv('public/data/stocks.csv', index=False)

patch_stock()

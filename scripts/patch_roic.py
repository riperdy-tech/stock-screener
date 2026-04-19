import pandas as pd
import json
import base64
import numpy as np

def patch_roic():
    df = pd.read_csv('public/data/stocks_intl.csv')
    num_patched = 0
    
    for idx, row in df.iterrows():
        fd_b64 = row.get('Financial_Data')
        if pd.isna(fd_b64) or not fd_b64:
            continue
        
        try:
            fd_json = json.loads(base64.b64decode(fd_b64).decode('utf-8'))
            
            # Recalculate ROIC
            ev = fd_json.get('Enterprise_Value_EV', 0)
            quarters = fd_json.get('Quarterly_Income_Statement', [])
            ttm_ebit = sum(q.get('OperatingIncome', 0) for q in quarters) if quarters else 0
            
            if ev and ev > 0:
                roic = (ttm_ebit * 0.75 / ev)
            else:
                roic = 0
                
            # Update dataframe
            df.at[idx, 'ROIC'] = roic
            num_patched += 1
            
        except Exception as e:
            print(f"Failed to patch row {idx}: {e}")
            
    df.to_csv('public/data/stocks_intl.csv', index=False)
    print(f"Sucessfully patched {num_patched} rows in stocks_intl.csv with dynamic ROIC calculations.")

if __name__ == "__main__":
    patch_roic()

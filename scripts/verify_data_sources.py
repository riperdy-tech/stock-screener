import pandas as pd
import os

def verify_files():
    data_dir = 'public/data'
    files = ['stocks.csv', 'stocks_intl.csv']
    
    for f in files:
        path = os.path.join(data_dir, f)
        if not os.path.exists(path):
            print(f"File missing: {path}")
            continue
            
        print(f"\n--- Analyzing {f} ---")
        try:
            df = pd.read_csv(path)
            print(f"Total Rows: {len(df)}")
            print("First 5 Tickers:")
            print(df[['Symbol', 'Name']].head())
            
            # Check for suffixes
            ns_count = df['Symbol'].str.endswith('.NS').sum()
            ks_count = df['Symbol'].str.endswith('.KS').sum()
            kq_count = df['Symbol'].str.endswith('.KQ').sum()
            us_count = len(df) - (ns_count + ks_count + kq_count)
            
            print(f"Stats:")
            print(f"  .NS (India): {ns_count}")
            print(f"  .KS (Korea): {ks_count}")
            print(f"  .KQ (Korea): {kq_count}")
            print(f"  US (No suffix): {us_count}")
            
        except Exception as e:
            print(f"Error reading {f}: {e}")

if __name__ == '__main__':
    verify_files()

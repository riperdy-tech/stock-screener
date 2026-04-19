import pandas as pd
import subprocess
import os

def refresh_banks():
    csv_file = 'public/data/stocks_intl.csv'
    if not os.path.exists(csv_file):
        print("CSV not found")
        return
        
    df = pd.read_csv(csv_file)
    # Identify stocks with 0 Revenue or missing data
    # (In the CSV, we mapped 'Rev Growth' and 'Gross Margin' as decimals)
    to_refresh = df[df['Rev Growth'] == 0]['Symbol'].tolist()
    
    print(f"Found {len(to_refresh)} stocks to refresh with fallback logic.")
    
    for symbol in to_refresh:
        print(f"Refreshing {symbol}...")
        # Call the get_ticker_data_intl.py script for this symbol
        # Usage: python scripts/get_ticker_data_intl.py {symbol}
        # Assuming we need to run it and update the JSONs/CSV
        # Actually, let's just use fetch_data_intl.py to refresh the whole CSV after updating the individual JSONs
        
        try:
            subprocess.run(['python', 'scripts/get_ticker_data_intl.py', '--ticker', symbol], check=True)
        except Exception as e:
            print(f"Failed to refresh {symbol}: {e}")
            
    print("Refresh complete. Now run scripts/fetch_data_intl.py to update the master CSV.")

if __name__ == '__main__':
    refresh_banks()

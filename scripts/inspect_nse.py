import pandas as pd
import requests

def inspect_bank(symbol):
    print(f"Inspecting {symbol} on Screener.in...")
    url = f"https://www.screener.in/company/{symbol}/consolidated/"
    try:
        dfs = pd.read_html(url)
        q_df = dfs[0]
        a_df = dfs[1]
        
        print("\n--- Quarterly Table Index Name ---")
        print(q_df.columns[0])
        print("\n--- Quarterly Table Rows ---")
        print(q_df.iloc[:, 0].tolist())
        
        print("\n--- Annual Table Rows ---")
        print(a_df.iloc[:, 0].tolist())
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect_bank("HDFCBANK")

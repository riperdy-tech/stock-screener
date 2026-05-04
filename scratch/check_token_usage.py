import os
import requests
import json
from dotenv import load_dotenv

load_dotenv(".env.local")

def check_token_usage():
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }

    # Query the ai_reports table
    query_url = f"{url}/rest/v1/ai_reports?select=ticker,usage,cost"
    
    response = requests.get(query_url, headers=headers)
    
    if response.status_code != 200:
        print(f"Error: {response.status_code} {response.text}")
        return

    data = response.json()
    if not data:
        print("No reports found.")
        return

    print(f"{'Ticker':<10} | {'Total Tokens':<15} | {'Cost':<10}")
    print("-" * 40)
    
    max_tokens = 0
    max_ticker = ""

    for report in data:
        usage = report.get('usage') or {}
        total = usage.get('total_tokens', 0)
        ticker = report.get('ticker', 'N/A')
        cost = report.get('cost', 0)
        
        print(f"{ticker:<10} | {total:<15} | ${cost:<10}")
        
        if total > max_tokens:
            max_tokens = total
            max_ticker = ticker

    print("-" * 40)
    print(f"Heaviest Report: {max_ticker} at {max_tokens} tokens.")
    
    if max_tokens > 0:
        utilization = (max_tokens/16384)*100
        print(f"Safe: We are using {round(utilization, 1)}% of the 16k ceiling.")
        if utilization > 80:
             print("ADVICE: You are close to the limit. We should increase to 32,768.")
    else:
        print("No tokens recorded yet.")

if __name__ == "__main__":
    check_token_usage()

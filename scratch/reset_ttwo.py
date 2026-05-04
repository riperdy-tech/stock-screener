import os
import requests
import json
from dotenv import load_dotenv

load_dotenv(dotenv_path='.env.local')

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_KEY")

def reset_report(ticker):
    print(f"Surgically resetting {ticker}...")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }
    
    data = {
        "status": "pending",
        "content": "Reset for regeneration."
    }
    
    target_url = f"{url}/rest/v1/ai_reports?ticker=eq.{ticker}"
    response = requests.patch(target_url, headers=headers, data=json.dumps(data))
    
    if response.status_code in [200, 201, 204]:
        print(f"SUCCESS: {ticker} is now pending.")
    else:
        print(f"FAILED: {response.status_code} - {response.text}")

if __name__ == "__main__":
    reset_report("TTWO")

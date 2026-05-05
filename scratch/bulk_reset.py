import os
import requests
import json
from dotenv import load_dotenv

load_dotenv(dotenv_path='.env.local')

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_KEY")

def bulk_reset_errors():
    print("Searching for all failed reports...")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }
    
    data = {
        "status": "pending",
        "content": "Bulk reset for regeneration."
    }
    
    # Target only reports that are in 'error' status
    target_url = f"{url}/rest/v1/ai_reports?status=eq.error"
    response = requests.patch(target_url, headers=headers, data=json.dumps(data))
    
    if response.status_code in [200, 201, 204]:
        print("SUCCESS: All failed reports have been moved back to the queue.")
    else:
        print(f"FAILED: {response.status_code} - {response.text}")

if __name__ == "__main__":
    bulk_reset_errors()

"""
One-time script: Wipe ALL records from ai_reports table in Supabase.
Run this once to start fresh.
"""
import os
import requests
from dotenv import load_dotenv

load_dotenv(dotenv_path='.env.local')

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_KEY")

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

# Delete ALL rows from ai_reports
res = requests.delete(f"{url}/rest/v1/ai_reports?ticker=neq.XXXXXX_NEVER_MATCHES", headers=headers)

if res.status_code in [200, 204]:
    deleted = res.json() if res.text else []
    print(f"SUCCESS: Wiped {len(deleted)} report(s) from ai_reports.")
else:
    print(f"FAILED: {res.status_code} - {res.text}")

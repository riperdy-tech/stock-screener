"""Check what's currently in the ai_reports queue."""
import os, requests
from dotenv import load_dotenv
load_dotenv(dotenv_path='.env.local')

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_KEY")
headers = {"apikey": key, "Authorization": f"Bearer {key}"}

res = requests.get(f"{url}/rest/v1/ai_reports?select=ticker,status,created_at&order=created_at.desc", headers=headers)
rows = res.json()
if not rows:
    print("Queue is EMPTY — no reports in database at all.")
else:
    for r in rows:
        print(f"  {r['ticker']:10} | {r['status']:12} | {r['created_at']}")

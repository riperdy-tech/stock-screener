import os
import json
import requests
from dotenv import load_dotenv

load_dotenv(".env.local")

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_KEY")

if not url or not key:
    print("Missing Supabase credentials in .env.local")
    exit(1)

# Postgrest headers
headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

# Fetch latest logs
rest_url = f"{url}/rest/v1/scan_logs?select=*&order=id.desc&limit=10"

try:
    res = requests.get(rest_url, headers=headers)
    if res.status_code == 200:
        data = res.json()
        print("Latest Supabase Logs:")
        for row in reversed(data):
            print(f"[{row['created_at']}] {row['message']}")
    else:
        print(f"Error {res.status_code}: {res.text}")
except Exception as e:
    print(f"Error: {e}")

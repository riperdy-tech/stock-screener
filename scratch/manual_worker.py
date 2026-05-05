import os
import requests
import json
import time
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv(dotenv_path='.env.local')

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_KEY")
deepseek_key = os.environ.get("DEEPSEEK_API_KEY")

def run_manual_analysis(ticker):
    print(f"--- MANUAL ANALYSIS START: {ticker} ---")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    
    # 1. Get the prompt
    res = requests.get(f"{url}/rest/v1/ai_reports?ticker=eq.{ticker}&status=eq.pending", headers=headers)
    if not res.json():
        print(f"No pending report found for {ticker}")
        return
    
    job = res.json()[0]
    prompt = job['prompt']
    
    # 2. Call Deepseek
    print(f"Calling Deepseek for {ticker}...")
    ds_res = requests.post(
        "https://api.deepseek.com/chat/completions",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {deepseek_key}"
        },
        json={
            "model": "deepseek-v4-pro",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.6,
            "max_tokens": 8000
        },
        timeout=600
    )
    
    if ds_res.status_code != 200:
        print(f"Deepseek Error: {ds_res.status_code} - {ds_res.text}")
        return

    data = ds_res.json()
    content = data['choices'][0]['message']['content']
    usage = data.get('usage', {})
    
    # 3. Save
    print(f"Saving {ticker} results...")
    update_data = {
        "content": content,
        "status": "completed",
        "usage": usage,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    patch_res = requests.patch(f"{url}/rest/v1/ai_reports?ticker=eq.{ticker}", headers=headers, data=json.dumps(update_data))
    if patch_res.status_code in [200, 204]:
        print(f"SUCCESS: {ticker} is now LIVE.")
    else:
        print(f"Save failed: {patch_res.status_code} - {patch_res.text}")

if __name__ == "__main__":
    for t in ["TTWO", "PAYS"]:
        run_manual_analysis(t)

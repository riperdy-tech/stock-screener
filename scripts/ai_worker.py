import os
import json
import requests
import time
from supabase import create_client
from dotenv import load_dotenv

load_dotenv(".env.local")

def run_worker():
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    deepseek_key = os.environ.get("DEEPSEEK_API_KEY")
    
    if not all([url, key, deepseek_key]):
        print("Missing environment variables.")
        return

    supabase = create_client(url, key)
    
    # 1. First, clear any "zombie" jobs that have been pending for more than 10 minutes
    # This prevents the queue from being blocked by old, failed runs.
    try:
        from datetime import datetime, timedelta, timezone
        ten_mins_ago = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        supabase.table("ai_reports").update({
            "status": "error",
            "content": "Analysis timed out or worker crashed."
        }).eq("status", "pending").lt("created_at", ten_mins_ago).execute()
    except Exception as e:
        print(f"Queue cleanup failed: {e}")

    # 2. Find the oldest legitimate pending request
    res = supabase.table("ai_reports").select("*").eq("status", "pending").order("created_at").limit(1).execute()
    
    if not res.data:
        print("No pending requests found.")
        return
        
    job = res.data[0]
    job_id = job.get('id') # Use internal ID for precision
    ticker = job['ticker']
    prompt = job['prompt']
    
    print(f"Processing analysis for {ticker} (Job ID: {job_id})...")

    # 3. Call Deepseek
    try:
        response = requests.post(
            "https://api.deepseek.com/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {deepseek_key}"
            },
            json={
                "model": "deepseek-v4-pro",
                "messages": [{"role": "user", "content": prompt}],
                "thinking": {"type": "enabled"},
                "temperature": 0.6,
                "max_tokens": 65536
            },
            timeout=600
        )
        
        if response.status_code != 200:
            raise Exception(f"Deepseek API Error ({response.status_code}): {response.text}")
            
        data = response.json()
        message = data['choices'][0]['message']
        content = message['content']
        reasoning = message.get('reasoning_content', '')
        usage = data.get('usage', {})
        
        # Pricing
        input_cost = (usage.get('prompt_tokens', 0) / 1_000_000) * 1.74
        output_cost = (usage.get('completion_tokens', 0) / 1_000_000) * 3.48
        total_cost = input_cost + output_cost

        # 4. Update Supabase
        from datetime import datetime, timezone
        update_data = {
            "content": content,
            "reasoning": reasoning,
            "usage": usage,
            "cost": float(f"{total_cost:.4f}"),
            "status": "completed",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        print(f"Saving results to Supabase for {ticker}...")
        if job_id:
            res = supabase.table("ai_reports").update(update_data).eq("id", job_id).execute()
        else:
            res = supabase.table("ai_reports").update(update_data).eq("ticker", ticker).eq("status", "pending").execute()
            
        print(f"Analysis for {ticker} completed successfully.")

    except Exception as e:
        print(f"CRITICAL ERROR processing {ticker}: {e}")
        error_msg = f"Analysis failed: {str(e)}"
        try:
            if job_id:
                supabase.table("ai_reports").update({"status": "error", "content": error_msg}).eq("id", job_id).execute()
            else:
                supabase.table("ai_reports").update({"status": "error", "content": error_msg}).eq("ticker", ticker).eq("status", "pending").execute()
        except Exception as db_err:
            print(f"Failed to even save the error status to DB: {db_err}")

if __name__ == "__main__":
    run_worker()

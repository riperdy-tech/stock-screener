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
    
    # 1. Find the oldest pending request
    res = supabase.table("ai_reports").select("*").eq("status", "pending").order("created_at").limit(1).execute()
    
    if not res.data:
        print("No pending requests found.")
        return
        
    job = res.data[0]
    ticker = job['ticker']
    prompt = job['prompt']
    
    print(f"Processing analysis for {ticker}...")

    # 2. Call Deepseek
    try:
        # Using the DeepSeek-V4-Pro model with thinking enabled
        response = requests.post(
            "https://api.deepseek.com/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {deepseek_key}"
            },
            json={
                "model": "deepseek-v4-pro",
                "messages": [{"role": "user", "content": prompt}],
                "thinking": {
                    "type": "enabled"
                }
            },
            timeout=600 # V4-Pro thinking can take a while
        )
        
        if response.status_code != 200:
            raise Exception(f"Deepseek API Error ({response.status_code}): {response.text}")
            
        data = response.json()
        message = data['choices'][0]['message']
        content = message['content']
        reasoning = message.get('reasoning_content', '')
        usage = data.get('usage', {})
        
        # Deepseek V4-Pro Pricing (Adjusted based on standard V4 tiers)
        # Input: $1.74 / 1M, Output: $3.48 / 1M
        input_cost = (usage.get('prompt_tokens', 0) / 1_000_000) * 1.74
        output_cost = (usage.get('completion_tokens', 0) / 1_000_000) * 3.48
        total_cost = input_cost + output_cost

        # 3. Update Supabase with results
        supabase.table("ai_reports").update({
            "content": content,
            "reasoning": reasoning,
            "usage": usage,
            "cost": float(f"{total_cost:.4f}"),
            "status": "completed",
            "created_at": "now()" # Update timestamp to when it finished
        }).eq("ticker", ticker).execute()
        
        print(f"Analysis for {ticker} completed and saved.")

    except Exception as e:
        print(f"Error processing {ticker}: {e}")
        supabase.table("ai_reports").update({
            "status": "error",
            "content": f"Analysis failed: {str(e)}"
        }).eq("ticker", ticker).execute()

if __name__ == "__main__":
    run_worker()

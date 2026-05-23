import os
import json
import re
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
        sixty_mins_ago = (datetime.now(timezone.utc) - timedelta(minutes=60)).isoformat()
        supabase.table("ai_reports").update({
            "status": "error",
            "content": "Analysis timed out (60 min+). Please check worker logs."
        }).eq("status", "pending").lt("created_at", sixty_mins_ago).execute()
        # Also clean up stuck 'processing' jobs
        supabase.table("ai_reports").update({
            "status": "error",
            "content": "Analysis timed out (60 min+) while processing."
        }).eq("status", "processing").lt("created_at", sixty_mins_ago).execute()
    except Exception as e:
        print(f"Queue cleanup failed: {e}")

    # 2. Atomically claim a pending job (prevents worker race conditions)
    max_attempts = 3
    job = None
    for attempt in range(max_attempts):
        res = supabase.table("ai_reports").select("*").eq("status", "pending").order("created_at").limit(1).execute()
        
        if not res.data:
            print("No pending requests found.")
            return
            
        candidate = res.data[0]
        job_id = candidate.get('id')
        
        # Atomic claim: only take it if still pending (other workers can't steal it)
        claim = supabase.table("ai_reports").update({"status": "processing"}).eq("id", job_id).eq("status", "pending").execute()
        
        if claim.data and len(claim.data) > 0:
            job = claim.data[0]
            print(f"Claimed job for {job['ticker']} (Job ID: {job_id}) on attempt {attempt + 1}")
            break
        else:
            print(f"Job {job_id} already claimed by another worker, retrying...")
            time.sleep(2)
    
    if not job:
        print("Could not claim any pending job after retries.")
        return
        
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
            timeout=1200
        )
        
        if response.status_code != 200:
            raise Exception(f"Deepseek API Error ({response.status_code}): {response.text}")
            
        data = response.json()
        message = data['choices'][0]['message']
        content = message['content']
        reasoning = message.get('reasoning_content', '')
        usage = data.get('usage', {})

        # --- SMART CLEANER & METADATA EXTRACTION (v3.0) ---
        # Handles both legacy single-line JSON and new multi-line structured JSON
        metadata = {}

        # Extract [DATA_BLOCK] JSON — supports multi-line objects
        # Strategy: find [DATA_BLOCK] tag, capture everything from the first { to the matching }
        block_match = re.search(r'\[DATA_BLOCK\]\s*(\{[\s\S]*?\n\})\s*$', content)

        if not block_match:
            # Fallback: try without trailing newline requirement
            block_match = re.search(r'\[DATA_BLOCK\]\s*(\{[\s\S]*?\})\s*$', content)

        if block_match:
            json_str = block_match.group(1)
            try:
                metadata = json.loads(json_str)
                # Strip [DATA_BLOCK] and its JSON from the main content
                content = content[:block_match.start()].strip()
                print(f"Extracted metadata for {ticker}: {len(json.dumps(metadata))} bytes")
            except json.JSONDecodeError as e:
                print(f"Metadata JSON parse failed for {ticker}: {e}")
                # Salvage: try to fix common DeepSeek JSON errors
                try:
                    json_str_fixed = re.sub(r',\s*}', '}', json_str)  # trailing comma
                    json_str_fixed = re.sub(r',\s*]', ']', json_str_fixed)
                    metadata = json.loads(json_str_fixed)
                    content = content[:block_match.start()].strip()
                    print(f"Salvaged metadata for {ticker} (fixed trailing commas)")
                except:
                    # Last resort: single-line extraction for legacy format
                    fallback = re.search(r'\[DATA_BLOCK\]\s*(\{[^}]+\})', content)
                    if fallback:
                        try:
                            metadata = json.loads(fallback.group(1))
                            content = content[:fallback.start()].strip()
                            print(f"Salvaged legacy single-line metadata for {ticker}")
                        except:
                            pass

        # --- TYPE NORMALIZATION ENGINE ---
        # Recursively ensure all numeric fields are actual numbers,
        # string fields are strings, and known fields have correct types.
        def _coerce_value(val, field_name):
            """Coerce a value to the expected type based on field name."""
            numeric_fields = {
                'conviction', 'upside', 'upside_pct', 'moat_score',
                'target_price', 'current_price', 'intrinsic_value',
                'margin_of_safety_pct', 'core_value', 'execution_value',
                'ecosystem_value', 'drag_value', 'ev_to_sales',
                'ev_to_gross_profit', 'fcf_yield_pct', 'revenue_growth_1y_pct',
                'revenue_growth_3y_cagr_pct', 'eps_growth_1y_pct',
                'free_cash_flow_1y_pct', 'rule_of_40',
                'bear_price', 'base_price', 'bull_execution_price',
                'bull_ecosystem_price', 'expected_price',
                'bear_probability', 'base_probability',
                'bull_execution_probability', 'bull_ecosystem_probability',
                'regime_probability', 'macro_impact_score', 'position_size_pct',
            }
            int_fields = {
                'rate_sensitivity', 'dollar_sensitivity',
            }
            string_fields = {
                'action', 'archetype', 'valuation_engine', 'sector',
                'valuation_status', 'dominant_regime', 'margin_trajectory',
                'rating', 'top_risk', 'top_catalyst', 'model_confidence',
                'moat_direction', 'financial_strength',
            }

            if field_name in int_fields:
                try:
                    return int(float(str(val).replace('%', '').strip()))
                except (ValueError, TypeError):
                    return val
            if field_name in numeric_fields:
                try:
                    return float(str(val).replace('%', '').replace('$', '').replace(',', '').strip())
                except (ValueError, TypeError):
                    return val
            if field_name in string_fields:
                return str(val).strip().upper()
            return val

        def _normalize_dict(d):
            """Recursively normalize all fields in a dictionary."""
            if not isinstance(d, dict):
                return d
            result = {}
            for k, v in d.items():
                if isinstance(v, dict):
                    result[k] = _normalize_dict(v)
                elif isinstance(v, list):
                    result[k] = [_normalize_dict(i) if isinstance(i, dict) else i for i in v]
                else:
                    result[k] = _coerce_value(v, k)
            return result

        metadata = _normalize_dict(metadata)

        # --- BACKWARD COMPATIBILITY: FLATTEN LEGACY FIELDS ---
        # If DeepSeek returned old 5-field format (no nesting), wrap them
        # into the verdict category for backward compatibility
        if 'conviction' in metadata and 'verdict' not in metadata:
            verdict = {}
            for f in ['conviction', 'action', 'upside', 'upside_pct', 'rating',
                       'top_risk', 'top_catalyst', 'position_size_pct',
                       'model_confidence', 'summary']:
                if f in metadata:
                    verdict[f] = metadata.pop(f)
            if verdict:
                metadata['verdict'] = verdict

        # Map legacy field names to new schema
        if 'verdict' in metadata:
            v = metadata['verdict']
            if 'upside' in v and 'upside_pct' not in v:
                v['upside_pct'] = v.pop('upside')
            if 'valuation_status' in metadata and 'valuation' not in metadata:
                metadata['valuation'] = {'valuation_status': metadata.pop('valuation_status')}
            if 'archetype' in metadata and 'classification' not in metadata:
                metadata['classification'] = {'archetype': metadata.pop('archetype')}
                for f in ['sector', 'moat_score', 'moat_direction',
                           'financial_strength', 'valuation_engine', 'summary']:
                    if f in metadata:
                        metadata['classification'][f] = metadata.pop(f)

        # Clean up any leftover markdown fences or formatting artifacts
        content = re.sub(r'^```(?:markdown|json|text)?\s*', '', content, flags=re.MULTILINE)
        content = re.sub(r'```\s*$', '', content)
        content = content.strip()
        # --------------------
        
        # Pricing
        input_cost = (usage.get('prompt_tokens', 0) / 1_000_000) * 1.74
        output_cost = (usage.get('completion_tokens', 0) / 1_000_000) * 3.48
        total_cost = input_cost + output_cost

        # 4. Update Supabase
        update_data = {
            "content": content,
            "usage": usage,
            "cost": float(f"{total_cost:.4f}"),
            "status": "completed",
            "metadata": metadata if metadata else None,
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

import os
import json
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_SERVICE_KEY")
supabase: Client = create_client(url, key)

def check_and_add_column():
    print("Checking ai_reports table...")
    try:
        # Check if metadata column exists by trying to fetch it
        res = supabase.table("ai_reports").select("metadata").limit(1).execute()
        print("Column 'metadata' already exists.")
    except Exception as e:
        print(f"Column 'metadata' likely missing or table issue: {e}")
        print("Note: I cannot run 'ALTER TABLE' directly via the Python client easily without SQL access.")
        print("I will assume we need to handle this. If it's missing, the worker will still save the content but ignore metadata.")

if __name__ == "__main__":
    check_and_add_column()

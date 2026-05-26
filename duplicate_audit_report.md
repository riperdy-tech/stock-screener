# Duplicate Python Scripts Audit Report

## 1. Confirmed Duplicates (Identical Content)

**None found.** No `.py` file exists in both `scripts/` and `scratch/` with identical content.

## 2. Near-Duplicates (Same Name, Different Content)

### 2a. `scripts/ai_worker.py` vs `scratch/ai_worker.py`

**Status:** `scratch/ai_worker.py` does **not exist**. The `list_dir` output for `scratch/` does not include `ai_worker.py`. This is a false alarm from the task description — there is no name collision.

### 2b. `scripts/ai_worker.py` vs `scratch/manual_worker.py` (Functional Near-Duplicate)

These two files serve the **same purpose** (calling DeepSeek API and saving results to Supabase's `ai_reports` table) but are different implementations.

| Aspect | `scripts/ai_worker.py` | `scratch/manual_worker.py` |
|--------|----------------------|---------------------------|
| **Purpose** | Automated queue-based worker | Manual one-off analysis |
| **Queue handling** | Full atomic claim logic with retries, zombie cleanup (60-min timeout) | None — fetches a single pending report by ticker |
| **DeepSeek model** | `deepseek-v4-pro` with `thinking: {"type": "enabled"}`, `max_tokens: 65536` | `deepseek-v4-pro`, no thinking, `max_tokens: 8000` |
| **Metadata extraction** | Sophisticated `[DATA_BLOCK]` parser with type normalization, backward compatibility | None |
| **Error handling** | Comprehensive try/except with DB error status updates | Basic print-and-return |
| **Client library** | `supabase` Python SDK | Raw `requests` with REST API |
| **Timeout** | 1200s | 600s |
| **Target tickers** | Reads from queue (any pending) | Hardcoded `["TTWO", "PAYS"]` |

**Which is more recent/complete?** `scripts/ai_worker.py` is far more complete — it has queue management, metadata extraction, type normalization, and robust error handling. `scratch/manual_worker.py` is a simpler, older debugging/one-off script.

### 2c. `scripts/get_ticker_data.py` — No counterpart in scratch

No `get_ticker_data.py` exists in `scratch/`. No duplicate.

### 2d. `scripts/test_intl.py` vs `scratch/test_deepseek.py` (Name-Pattern Near-Duplicate)

Both are test scripts but test completely different things:

| Aspect | `scripts/test_intl.py` | `scratch/test_deepseek.py` |
|--------|----------------------|---------------------------|
| **What it tests** | Korea (KRX) and India (NSE) data fetching via FinanceDataReader, nsepython, yfinance | Local DeepSeek API endpoint (`/api/deepseek`) |
| **Purpose** | Integration test for international data sources | Smoke test for the AI analysis API |
| **Content overlap** | None | None |

These are **not duplicates** — they test unrelated functionality.

## 3. Other Scratch Files — No Scripts Counterparts

The following `scratch/` files have **no corresponding file** in `scripts/`:

| Scratch File | Purpose |
|---|---|
| `add_buttons_modal.py` | UI modal modification |
| `bulk_reset.py` | Reset all failed reports to pending |
| `check_db.py` | Check if `metadata` column exists in Supabase |
| `check_momentum.py` | Check EPS momentum from stocks.json |
| `check_queue.py` | List current ai_reports queue |
| `check_supabase.py` | Fetch latest scan_logs from Supabase |
| `check_token_usage.py` | Report token usage/cost per ticker |
| `patch_youtube_data.py` | Patch YouTube data |
| `reset_ttwo.py` | Reset TTWO report to pending |
| `update_dashboard.py` | Update dashboard UI |
| `update_modal.py` | Update modal UI |
| `update_prompt_builder.py` | Update prompt builder |
| `update_toast_and_polling.py` | Update toast/polling UI |
| `wipe_reports.py` | Delete all ai_reports records |

None of these have a counterpart in `scripts/`.

## 4. Recommendations

| Pair | Recommendation |
|------|---------------|
| `scripts/ai_worker.py` ↔ `scratch/manual_worker.py` | **Keep `scripts/ai_worker.py`** — it is the production-grade worker. `scratch/manual_worker.py` can be deleted or kept as a debugging utility, but it is functionally superseded. |
| `scripts/test_intl.py` ↔ `scratch/test_deepseek.py` | **Keep both** — they test completely different things. No conflict. |
| All other scratch files | **No action needed** — they are one-off utility/scratch scripts with no scripts/ counterparts. |

## Summary

- **0** confirmed identical duplicates.
- **1** functional near-duplicate pair: `scripts/ai_worker.py` (production) vs `scratch/manual_worker.py` (legacy debug script).
- **0** name-collision duplicates (the task's `scratch/ai_worker.py` does not exist).
- **0** `get_ticker_data.py` duplicates.
- **0** `test_*.py` duplicates across directories.

# AI Deep-Dive Flow Contract

Generated during Phase 11a recon (read-only). Describes the existing AI analysis flow exactly as it works in the codebase as of 2026-05-22.

---

## 1. Trigger Chain

```
User clicks "Generate AI Prompt" in StockDetailModal
  → onAskGemini(ticker) prop fires
  → ScreenerDashboard.handleAiReview(result) called
    → buildPrompt(ticker, result) loads financial data + RS2.txt → constructs full prompt
    → AI modal opens showing the generated prompt
User enters password "poe" and clicks "Run Deepseek"
  → ScreenerDashboard.handleDeepseekRun() fires
    → POST /api/analysis { password, ticker, prompt }
```

**Files**: `StockDetailModal.tsx` (line 173: `onClick={() => onAskGemini && onAskGemini(candidate.symbol)}`), `ScreenerDashboard.tsx` (line 138: `handleAiReview`, line 66: `handleDeepseekRun`)

**Password**: `"poe"` (hardcoded) or `process.env.APP_PASSWORD` (env override)

---

## 2. API Route — ASYNC (returns immediately)

**File**: `app/api/analysis/route.ts`

**Receives**: `POST { password, ticker, prompt }`

**What it does**:
1. Validates password (poe or APP_PASSWORD)
2. **DELETES** any existing `ai_reports` row for the ticker (clears old pending/error)
3. **INSERTS** a new row: `{ ticker, content: "Analysis in progress...", status: "pending", prompt, created_at }`
4. Triggers GitHub Actions workflow via `POST https://api.github.com/repos/riperdy-tech/stock-screener/dispatches` with `event_type: "trigger-ai-analysis"`
5. **Returns immediately**: `{ status: "queued", message: "AI analysis for {ticker} has been started in the cloud." }`

**Sync/Async**: **FULLY ASYNC**. The API route returns in <2 seconds. The actual analysis happens in a separate GitHub Actions runner, minutes later. The caller receives `"queued"` and shows a "thinking..." message.

**Error handling**: If GitHub dispatch fails (missing token, network error), returns `{ status: "error" }` immediately.

---

## 3. Worker — ONE stock per invocation, no batch

**File**: `scripts/ai_worker.py`

**How invoked**: GitHub Actions workflow (`.github/workflows/ai-worker.yml`), triggered by `repository_dispatch: trigger-ai-analysis` or manual `workflow_dispatch`. Runs on `ubuntu-latest`, Python 3.11.

**Processing model**:
- Selects the **oldest single pending job**: `supabase.table("ai_reports").select("*").eq("status", "pending").order("created_at").limit(1)`
- Processes **ONE stock per GitHub Actions run**. No batching.
- Calls **Deepseek API** (`deepseek-v4-pro` model, `temperature=0.6`, `max_tokens=65536`, `timeout=1200s`)
- Extracts `[DATA_BLOCK]` JSON metadata from the response, normalizes types
- Updates Supabase row: `status="completed"`, fills `content`, `usage`, `cost`, `metadata`, `created_at`

**Duration estimate**:
- GitHub Actions spin-up: ~30s
- Deepseek API call: ~60–180s (depends on prompt size and thinking mode)
- **Total per stock: ~90–210 seconds (1.5–3.5 min)**

**Rate/queue handling**:
- Cleans up zombie jobs (pending > 60 min) before processing
- NO explicit rate limiting in the worker
- NO queue or batch mechanism in the worker itself
- Concurrency is governed by GitHub Actions limits (free tier: 20 concurrent jobs)

**Cost**: Deepseek pricing — $1.74/M input tokens, $3.48/M output tokens. Typical per-stock cost: ~$0.50–$1.00 depending on prompt size and response length.

---

## 4. Results Sink — Supabase ai_reports table

**Where results land**: Supabase `ai_reports` table

**Row shape**:
| Column | Type | Description |
|--------|------|-------------|
| `id` | int | Auto-increment PK |
| `ticker` | string | Stock symbol |
| `content` | text | Full analysis text (markdown) |
| `status` | string | `pending` → `completed` / `error` |
| `prompt` | text | The full prompt sent to Deepseek |
| `usage` | jsonb | Token usage `{ prompt_tokens, completion_tokens, total_tokens }` |
| `cost` | float | USD cost of the API call |
| `metadata` | jsonb | Structured JSON extracted from `[DATA_BLOCK]` in response |
| `created_at` | timestamp | When the row was created/updated |

**How frontend reads results**: `StockDetailModal.tsx` `checkReport()` function (polls every 5 seconds via `setInterval`):
1. Tries `/data/reports/{TICKER}.json` (static file — may or may not exist)
2. Queries Supabase `ai_reports` table for this ticker (anon client)
3. Takes the **newest** of file vs database
4. Displays the `content` field as rendered markdown in the modal
5. Also loads `reportHistory` (all reports for this ticker) for the history picker

**Persistence**: Reports stay in Supabase indefinitely (no TTL). Static file mirror may exist at `/data/reports/{TICKER}.json` as a fallback/offline copy.

---

## 5. Prompt Assembly + Priming Insertion Point

**File**: `lib/prompt-builder.ts`, function `buildPrompt(ticker, result)`

**Assembly flow**:
1. Loads financial detail from `/data/financials/{TICKER}.json` → formats with `formatFinancialData()`
2. Loads `RS2.txt` (the v3.2 Integrated Stock Analysis Engine prompt template)
3. Concatenates:
   ```
   {RS2.txt}
   
   ### Company Ticker: {TICKER}
   
   {formatted financial data brief}
   
   [DATA_BLOCK]
   {JSON schema for structured output}
   ```

**Priming insertion point**: The line `### Company Ticker: {TICKER}\n\n` followed by `${dataBrief}`. A reverse engine priming block should be inserted **between** the ticker line and the financial data:

```
### Company Ticker: {TICKER}

[REVERSE ENGINE PRIMING — insert here]
Archetype: {rev_archetype} | Composite: {rev_composite} | Band: {rev_band} | Rank: #{rev_rank}
Quality: {rev_quality} | MoS: {rev_mos} | Survivability: {rev_survivability}
CAGR Proxy: {rev_cagr_proxy}% | DD Proxy: {rev_drawdown_proxy} | Efficiency: {rev_efficiency}x
Data Quality: {rev_data_quality}/5 | Confidence: {rev_route_confidence}
Flags: {rev_flags}
Pro: {rev_pro}
Con: {rev_con}

{formatted financial data brief}
```

**Current state**: `result.reverse` is NOT injected into the prompt. The `buildPrompt()` function only receives `result: ScreeningResult` but does not access `result.reverse`. This is the gap Phase 11b must close.

---

## 6. "What Happens If 25 Stocks At Once?" — Honest Answer

**With the CURRENT code**, if a user triggered analysis on all 25 nominated stocks:

1. **API route**: Each call would succeed — DELETE old row, INSERT new pending row, dispatch GitHub Action. Returns `"queued"` immediately. All 25 calls complete in <2 seconds total.

2. **GitHub Actions**: 25 separate workflow runs would be queued. GitHub Actions free tier allows **20 concurrent jobs**. The first 20 would start immediately; the remaining 5 would queue until slots free.

3. **Worker processing**: Each run processes ONE stock. The 20 concurrent runners would each pick a different pending job (oldest first, but since they start simultaneously they'd race). Processing time: ~2-3 min each. After completion, new runs would pick remaining jobs.

4. **Total wall time**: ~3-6 minutes for all 25 (with 20 concurrent runners, two waves).

5. **Frontend**: Has NO way to track progress across 25 stocks. The modal only polls for ONE ticker at a time (the one currently selected). The user would need to manually open each stock's modal to see if its report is ready.

6. **No deduplication**: If the user triggers the same ticker twice, the first pending row is DELETED and a new one inserted. The old GitHub Action run would fail (row deleted) or complete but the result would be overwritten.

7. **Cost**: 25 × ~$0.50–$1.00 = **~$12–$25 total**.

**Implications for Phase 11b**:
- A "Deep-Dive Top 25" button needs to either (a) batch all 25 into a single GitHub Action run, (b) use a different triggering mechanism that can track progress, or (c) accept the current one-at-a-time approach but add a progress dashboard.
- The prompt MUST be extended with reverse engine priming data for each stock.
- The frontend needs a way to know "which of my 25 are done" — either a batch-job table or a polling endpoint that checks all 25.
- **GitHub Actions throttling is the bottleneck** — triggering 25 separate dispatches works but is fragile. A batch approach (single dispatch that processes all 25 in a loop within the worker) is more reliable.

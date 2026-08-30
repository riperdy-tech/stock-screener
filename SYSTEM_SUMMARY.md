# Stock Screener — System Architecture & Pipeline Summary

## Overview

This is a **Next.js (React/TypeScript) web application** that runs a quantitative stock screening pipeline. It scans thousands of US stocks, applies rigorous value/quality filters, and presents results in an interactive dashboard. The backend scraping is done via **Python scripts** (Yahoo Finance + FinanceDataReader), and AI-powered analysis is available via **DeepSeek** integration.

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      DATA PIPELINE (Python)                      │
│                                                                  │
│  fetch_data.py ──────► 100-Bagger Scout (main screener)          │
│  ai_worker.py ───────► AI Analysis Worker (DeepSeek)            │
│  get_prices.py ──────► Live Price Fetcher                       │
│                                                                  │
│  OUTPUTS:                                                        │
│    public/data/stocks.csv          ← Screener results            │
│    public/data/stocks.json         ← Screener results (JSON)    │
│    public/data/financials/*.json   ← Per-ticker financial detail │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NEXT.JS WEB APP (TypeScript)                  │
│                                                                  │
│  Pages:                                                          │
│    /                  → ScreenerDashboard (screener results)     │
│    /reports           → ReportsDashboard (AI analysis history)   │
│    /youtube-strategy  → YoutubeStrategyDashboard (alt strategy)  │
│                                                                  │
│  API Routes:                                                     │
│    /api/analysis      → Trigger AI analysis via GitHub Actions   │
│    /api/generate-prompt → Build AI prompt from financial data    │
│    /api/live-prices   → Fetch real-time prices via Python        │
│    /api/deepseek      → DeepSeek API proxy                       │
│    /api/gemini        → Gemini API proxy                         │
│    /api/scanner       → Scanner control endpoints                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 The "100-Bagger Scout" (`fetch_data.py`)

### What it does
Scans the **entire US stock market** (NASDAQ + NYSE + AMEX, ~8,000+ tickers) looking for small/mid-cap stocks with 100-bagger potential. Every stock gets processed through two stages: `process_stock()` (core metrics + screening) and `extract_financial_detail()` (deep financial data for AI analysis).

### Data Sources
- **FinanceDataReader** (`fdr`) — pulls all US exchange listings (NASDAQ, NYSE, AMEX), filters out preferred shares, warrants, and units
- **Yahoo Finance** (`yfinance`) — fetches per-ticker financials, balance sheets, cash flow statements, and metadata

---

## 🔍 Data Fetched — In Detail

For **every stock** in the universe, the script performs two rounds of data extraction:

### Round 1: `process_stock(ticker)` — Core Metrics & Screening

This creates a `StockData` object and populates it from `yf.Ticker(ticker).info` and the three core financial statements.

#### From `stock.info` (Yahoo Finance metadata)

| Field | Source Key | Description |
|-------|-----------|-------------|
| `company_name` | `longName` or `shortName` | Full company name |
| `description` | `longBusinessSummary` | Business summary paragraph |
| `market_cap` | `marketCap` | Current market capitalization |
| `price` | `currentPrice` | Current stock price |
| `sector` | `sector` | GICS sector (e.g., Technology, Healthcare) |
| `industry` | `industry` | Industry classification |
| `peg_ratio` | `pegRatio` | Price/Earnings-to-Growth ratio (falls back to `trailingPE / (revenueGrowth × 100)` if missing) |
| `price_to_sales` | `priceToSalesTrailing12Months` | Trailing P/S ratio |
| `insider_ownership` | `heldPercentInsiders` | % of shares held by insiders |
| `float_shares` | `floatShares` | Number of shares in public float |
| `gross_margin` | `grossMargins` | Gross margin (TTM, as decimal) |
| `revenue_growth_ttm` | `revenueGrowth` | YoY revenue growth (TTM, as decimal) |
| `revenue_growth_qtr_yoy` | `quarterlyRevenueGrowth` | Quarterly YoY revenue growth |

#### From Financial Statements (via `stock.financials`, `stock.balance_sheet`, `stock.cashflow`)

| Metric | Calculation | Description |
|--------|------------|-------------|
| **ROIC** | `NOPAT / Invested Capital` | Return on Invested Capital. NOPAT = EBIT × (1 − tax_rate). Invested Capital = Equity + Total Debt − Cash. Falls back to Net Income + Tax + Interest if EBIT unavailable |
| **Gross Margin (3yr avg)** | Mean of latest 3 annual `Gross Profit / Total Revenue` | Detects margin trend deterioration |
| **Altman Z-Score** | `1.2A + 1.4B + 3.3C + 0.6D + 1.0E` | Bankruptcy risk score. A = Working Capital/Assets, B = Retained Earnings/Assets, C = EBIT/Assets, D = Market Cap/Liabilities, E = Revenue/Assets. Defaults to 3.0 on failure |
| **Beneish M-Score** | Defaults to −2.0 | Earnings manipulation score (placeholder, not fully computed) |
| **Net Income** | Latest from income statement | Bottom-line profit |
| **Operating Cash Flow** | Latest from cash flow statement | Cash from operations |
| **Share Dilution** | 3yr CAGR of shares outstanding | Measures shareholder dilution |

---

### Round 2: `extract_financial_detail(ticker, yf_ticker)` — Deep Financial Data

This extracts and computes a comprehensive JSON blob saved to `public/data/financials/{TICKER}.json`. It **reuses the already-fetched** `yf.Ticker` object to avoid duplicate API calls.

#### Raw Financial Statements Extracted

| Statement | Periods | Fields Extracted Per Period |
|-----------|---------|----------------------------|
| **Annual Income Statement** | 2 years | Total Revenue, Gross Profit, Operating Income (or EBIT), Net Income, Basic EPS, Diluted EPS |
| **Quarterly Income Statement** | 4 quarters | Same fields as annual |
| **Cash Flow Statement** | Latest period | Operating Cash Flow, Capital Expenditure, Free Cash Flow, Stock-Based Compensation |
| **Balance Sheet** | Latest period | Cash & Equivalents, Total Debt |

Each period includes a `"Date"` field (YYYY-MM-DD format).

#### Directly Pulled from `info`

| Field | Source | Description |
|-------|--------|-------------|
| `Price` | `currentPrice` (fallback: `previousClose`) | Current stock price |
| `Shares_Outstanding` | `impliedSharesOutstanding` (fallback: `sharesOutstanding`) | Total shares |
| `Market_Cap` | `marketCap` | Market capitalization |
| `Next_Earnings_Date` | `ticker.calendar` → `Earnings Date[0]` | Upcoming earnings date |
| `Total_Cash` | `Cash And Cash Equivalents` (BS, fallback: `info.totalCash`) | Cash on hand |
| `Total_Debt` | `Total Debt` (BS, fallback: `info.totalDebt`) | Total debt |
| `SBC_Stock_Based_Comp` | `Stock Based Compensation` (CF) | Stock-based compensation expense |

#### TTM (Trailing Twelve Month) Computations

All TTM values try **quarterly sum first** (4 quarters), falling back to the most recent annual figure:

| Metric | Method |
|--------|--------|
| `TTM_Revenue` | Sum of last 4 quarters' Total Revenue |
| `TTM_Gross_Margin_%` | TTM Gross Profit / TTM Revenue × 100 |
| `FCF_Margin_%` | Free Cash Flow / TTM Revenue × 100 |
| `Rule_of_40` | YoY Revenue Growth % + FCF Margin % |

#### Enterprise Value & Valuation Multiples

| Metric | Formula |
|--------|---------|
| `Enterprise_Value_EV` | Market Cap + Total Debt − Total Cash |
| `EV_to_Sales` | EV / TTM Revenue |
| `EV_to_Gross_Profit` | EV / TTM Gross Profit |
| `EV_to_EBIT` | EV / TTM EBIT |
| `Core_Anchor_Multiple` | 0.4 × EV/Sales + 0.4 × EV/GP |

#### YouTube Strategy Metrics

| Field | Source |
|-------|--------|
| `EPS_TTM` | `info.trailingEps` |
| `Forward_EPS_Estimate` | `info.forwardEps` |
| `Price_to_Book` | `info.priceToBook` |
| `PE_5Y_Avg` | `info.fiveYearAvgPE` (fallback: `info.trailingPE`) |
| `Monthly_MA_20` | 20-month simple moving average of closing prices |

#### Monthly Price History

Fetched via `ticker.history(period="2y", interval="1mo")`:
- `Monthly_Closes` — array of all monthly closing prices over 2 years (used for moving averages and double-bottom pattern detection in YouTube strategies)

---

### Screening Criteria (all must pass)

| # | Metric | Threshold | Fail Code |
|---|--------|-----------|-----------|
| 1 | **Market Cap** | $50M – $2B | `FAIL_MCAP` |
| 2 | **Price** | < $25 | `FAIL_PRICE` |
| 3 | **Revenue Growth (TTM)** | ≥ 20% | `FAIL_GROWTH` |
| 4 | **Gross Margin** | ≥ 50% (Tech) / ≥ 30% (other) | `FAIL_GM` |
| 5 | **Gross Margin Trend** | Not declining vs 3yr avg | `FAIL_GM_TREND` |
| 6 | **ROIC** | ≥ 15% | `FAIL_ROIC` |
| 7 | **P/S Ratio** | < 10x (Tech) / < 3x (other) | `FAIL_PS` |
| 8 | **PEG Ratio** | < 1.5 | `FAIL_PEG` |
| 9 | **Float Shares** | < 50M | `FAIL_FLOAT` |
| 10 | **Insider Ownership** | ≥ 15% | `FAIL_INSIDER` |

### Scoring & Status
- **Score** = `100 − (number of failures × 10)`, minimum 0
- **Status**: `"Pass"` if zero failures (all 10 checks pass), otherwise `"Fail"`
- Passed stocks are called **"GEM CANDIDATES"** in the UI
- Each stock's `fail_reasons` and `fail_codes` arrays are stored alongside results

---

### Outputs

| File | Format | Contents |
|------|--------|----------|
| `public/data/stocks.csv` | CSV | All ~8K+ stocks with symbol, name, description, price, market cap, sector, industry, score, status, fail codes, and 20+ metric columns (ROIC, gross margin, Z-Score, PEG, P/S, float, OCF, CAPEX, EPS TTM, forward EPS, P/B, 5Y avg P/E, monthly closes JSON, quarterly EPS JSON, etc.) |
| `public/data/stocks.json` | JSON array | Same data as CSV in JSON format for the web app |
| `public/data/financials/{TICKER}.json` | JSON object | Per-ticker deep financial detail — annual/quarterly income statements, cash flow items, balance sheet items, TTM calculations, EV multiples, monthly price history, YouTube strategy metrics |
| `public/data/scan.log` | Text log | Real-time scanner progress log with timestamps |

### Incremental Saving
The CSV and JSON are saved **incrementally every 5 stocks** with atomic file-swap logic to prevent corruption if the scanner is interrupted mid-run. A `public/data/scanner.pid` file is written for process control, and a `public/data/pause.signal` file can be created to pause the scanner.

---

## 🤖 AI Analysis Pipeline (`ai_worker.py`)

### What it does
Runs **DeepSeek V4 Pro** AI analysis on individual stocks using a comprehensive prompt built from the stock's financial data (the `financials/{TICKER}.json` detail + screening metrics).

### Flow
1. User clicks "Ask AI" on a stock in the dashboard (enters password `poe`)
2. Frontend calls `/api/analysis` → inserts a `pending` job into Supabase (`ai_reports` table)
3. Triggers a **GitHub Actions workflow** (`trigger-ai-analysis`)
4. GitHub runner executes `ai_worker.py`:
   - Clears zombie jobs (pending > 60 min)
   - Picks up the oldest pending job from Supabase
   - Calls DeepSeek API with the full analysis prompt (including reasoning/thinking tokens, temperature 0.6, max 65536 tokens)
   - Parses the response, extracts a `[DATA_BLOCK]` JSON with scores/ratings
   - Updates the Supabase row with the AI analysis
5. Frontend polls Supabase and displays results when complete

### The AI Prompt (`RS2.txt` + `lib/prompt-builder.ts`)
- **RS2.txt**: A comprehensive system prompt defining the "Integrated Investment Analysis Engine v2.0" — a rigorous framework covering valuation, probability, behavioral finance, and self-criticism across 4 pillars (Time Axis, Probability Axis, Psychological Axis, Self-Criticism Axis)
- **prompt-builder.ts**: Dynamically injects the stock's financial data (income statements, cash flows, ratios, price history) into the prompt

---

## 🌐 Web Application Pages

### 1. `/` — ScreenerDashboard
The main dashboard showing screener results:
- **Stock Cards** with symbol, price, sector, score, pass/fail badges
- **Filter Sidebar** — filter by sector, market cap, score, status (Pass/Fail/GEM/COMPOUNDER)
- **Search** by ticker or name
- **Market Switcher** — US, India, Korea, Taiwan, International
- **Stock Detail Modal** — deep dive into metrics, with "Ask AI" button
- **Log Console** — real-time scanner log viewer
- **Live Prices** — fetched via Python `get_prices.py`

### 2. `/reports` — ReportsDashboard
Shows **AI analysis history** from Supabase:
- List of analyzed stocks with their AI-generated reports
- Rendered in Markdown with scores and recommendations

### 3. `/youtube-strategy` — YoutubeStrategyDashboard
An **alternative screening strategy** based on YouTube trader methodologies:
- **Earnings Momentum**: Large-cap blue chips with rising quarterly EPS
- **Deep Value Reversal**: Undervalued stocks with monthly double-bottom confirmation
- **Turnaround Seed**: Negative EPS, falling price, improving forward EPS
- **Turnaround Scale-In**: Actual EPS flipped from negative to positive
- Uses the same underlying `stocks.csv` data, evaluated through `lib/youtube-strategy.ts`

---

## 📁 Key Files Reference

| File | Purpose |
|------|---------|
| `scripts/fetch_data.py` | Main screener — 100-bagger criteria, all data fetching, financial detail extraction |
| `scripts/ai_worker.py` | DeepSeek AI analysis worker |
| `scripts/get_prices.py` | Live price fetcher (called by API) |
| `RS2.txt` | AI analysis system prompt (Investment Engine v2.0) |
| `lib/blueprint.ts` | TypeScript types & quantitative thresholds |
| `lib/data-service.ts` | CSV parsing & data fetching for the frontend |
| `lib/prompt-builder.ts` | Builds AI prompts from financial data |
| `lib/youtube-strategy.ts` | Alternative strategy evaluation logic |
| `components/ScreenerDashboard.tsx` | Main dashboard UI |
| `components/StockDetailModal.tsx` | Stock detail popup with AI trigger |
| `components/FilterSidebar.tsx` | Filter controls |
| `components/ReportsDashboard.tsx` | AI reports history view |
| `components/YoutubeStrategyDashboard.tsx` | Alternative strategy view |
| `public/data/stocks.csv` | Screener output (~8K+ stocks, all with scores) |
| `public/data/stocks.json` | Same data in JSON |
| `public/data/financials/*.json` | Per-ticker detailed financials |

---

## 🔄 Data Flow Summary

```
FinanceDataReader (ticker universe: NASDAQ + NYSE + AMEX)
        │
        ▼
Yahoo Finance (fundamentals per ticker via yfinance)
        │
        ▼
fetch_data.py ──────────────────────────────────────────────┐
   │                                                        │
   ├─► process_stock()                                      │
   │     ├─ stock.info (price, mcap, sector, ratios...)     │
   │     ├─ stock.financials (income statement)             │
   │     ├─ stock.balance_sheet (assets, equity, debt)      │
   │     ├─ stock.cashflow (OCF, capex, FCF)                │
   │     ├─ ROIC, Z-Score, Gross Margin Trend              │
   │     └─ is_potential_100_bagger() → Pass/Fail + Score   │
   │                                                        │
   └─► extract_financial_detail()                           │
         ├─ Annual + Quarterly Income Statements (2yr/4q)   │
         ├─ Cash Flow items (OCF, CAPEX, FCF, SBC)          │
         ├─ Balance Sheet (cash, debt, shares)              │
         ├─ TTM calculations (Revenue, GP, EBIT, margins)   │
         ├─ EV multiples (Sales, GP, EBIT)                  │
         ├─ Monthly price history (2yr, 1mo candles)        │
         └─ YouTube strategy metrics (EPS, P/B, MA-20)      │
        │                                                   │
        ▼                                                   │
   OUTPUTS                                                  │
   ├─► stocks.csv / stocks.json ──► ScreenerDashboard UI    │
   └─► financials/{TICKER}.json ──► AI Prompt Builder       │
                                          │                 │
                                          ▼                 │
                          ai_worker.py (DeepSeek)           │
                                 │                          │
                                 ▼                          │
                          Supabase ──► ReportsDashboard      │
```

---

## 🚀 How to Run

```bash
# Run the scanner
python scripts/fetch_data.py

# Web App
npm run dev
```

Batch files are also provided: `run_scanner.bat` for the main scanner.

---

## 🔗 Scoring Chain & Validation Loop (June 2026)

After any data fetch, scoring MUST run through the orchestrator (CI does this
automatically; locally use `run_chain.bat`):

```
fetch_data.py / fetch_sec_data.py / build_fundamentals_history.py   (data)
        │
        ▼
scripts/run_chain.py        ← enforced order + hard invariants
  1. fetch_macro_state --apply      (FRED flags; soft-fail)
  2. score_reverse                  (quality/value/survivability + forensic flags)
  3. score_paradigm                 (theme membership × momentum v2 × economics gate)
  4. invariants: reverse coverage ≥90%, nominations ≥1, artifact freshness,
     universe/theme drift warnings → chain_manifest.json
  5. appends dated nominations → reverse_nomination_log.jsonl
        │
        ▼
scripts/build_portfolio_plan.py     (sized, capped, exit-ruled decision sheet)
scripts/backfill_outcomes.py        (weekly: forward returns vs IWM/SPY)
```

Key files added in the June 2026 overhaul:
| File | Purpose |
|------|---------|
| `scripts/run_chain.py` | Orchestrator + data-integrity invariants (fixes the stale-merge bug where fetch wiped reverse scores) |
| `scripts/build_fundamentals_history.py` | SEC companyfacts ETL: 10y fundamentals + Piotroski F / Sloan accruals / real Beneish M / net issuance (replaces placeholder Z/M scores) |
| `scripts/backfill_outcomes.py` | Forward-return measurement of logged signal cohorts vs IWM/SPY — the system's only honest "does it make money" meter |
| `scripts/build_portfolio_plan.py` + `portfolio_config.json` | Position sizing, sector/theme caps, macro de-risk, exit triggers (decision support, not execution) |
| `public/data/chain_manifest.json` | Last chain run: steps, invariant results, counts |
| `public/data/fundamentals_battery.json` | Per-ticker value-trap battery consumed by reverse Stage 8 flags |

Momentum is **v2** (12-1 skip-month + 52w-high proximity + 6m return,
`paradigm_config.json → momentum.version`). Hot-theme thresholds use baseline
membership + hysteresis (fixes the 40↔146 ai_compute oscillation). Beneish/
Altman placeholders are gone — missing data is null, never silently safe.

---

## 🧪 Factor Lab + Decision Cockpit (June 2026 revamp)

The primary ranking engine is now **Factor Lab** (`scripts/score_factors.py`):
sector-neutral winsorized z-scores across six factors (value, quality,
momentum, low-vol, revisions, theme), composite weights **calibrated from
measured rank-IC** in the point-in-time backtest (`factor_ic.json` →
`calibrate_factor_weights.py` → `scripts/factor_weights.json`, recalibrated
monthly via `factor-recalibration.yml`). Hard vetoes preserve the anti-Nikola
floor. `score_unified.py` is retired from the chain (kept on disk).

`scripts/build_valuation_models.py` adds reverse-DCF expectations models for
research_now/watchlist names: implied growth vs demonstrated 5y CAGR →
expectations gap. The math is mirrored client-side in `lib/dcf.ts` for the
interactive workbench, and injected into the AI prompt by `prompt-builder.ts`.

**Frontend**: `/` is the **Decision Cockpit** (`components/CockpitDashboard.tsx`)
— Rankings (factor table + contribution bars + DCF gap), Research Queue,
Portfolio (rendered plan + allocation charts), Validation (backtest equity
curve, quarterly excess, per-factor IC history, live outcome table; recharts).
The four legacy lenses are unchanged at **/lenses**. Factor signals are
forward-logged (`factor_signal_log.jsonl`) and evaluated by
`backfill_outcomes.py` as the `factor_research_now` source.

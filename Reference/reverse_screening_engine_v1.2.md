# Reverse Screening Engine v1.2
## Integration Edition — built to slot into the `stock-screener` repo

This version integrates **coherently into your existing system** as a **second, parallel screen** alongside the existing 100-bagger screen:
`fetch_data.py` (8K-ticker scan) → `score_reverse.py` (NEW — this engine) → `stocks.csv` (enriched) → ScreenerDashboard (filter/rank) → `ai_worker.py` / v3.2 deep-dive.

It is a **scoring and routing layer** that consumes data your scanner already produces and feeds the deep engine you already trigger from the dashboard. It does **not** modify, replace, or absorb the 100-bagger screen — the two screens run side by side over the same raw data.

---

# 0. What changed across versions

| v1.0 (standalone) | v1.1 (folded in) | v1.2 (parallel — this version) |
|---|---|---|
| Assumed a fresh fundamentals fetch | Reused existing CSV/JSON | Same — no new scraping |
| Treated 100-bagger as replaceable | Folded 100-bagger in as "Lane M" | **100-bagger stays fully separate and untouched.** No Lane M. |
| Generic implementation options | New `score_reverse.py` post-processor | **Decided: raw §3.3 fields added to `fetch_data.py`'s fetch; ALL scoring in separate `score_reverse.py`.** |
| Abstract candidate list | New CSV columns + dashboard view | Same + decided "Deep-dive top N" one-click action |
| Ignored existing Score | Reconciled Score as sub-input | Existing Score belongs to the 100-bagger screen only; reverse engine has its own independent score |

### Two decisions locked in v1.2

1. **The 100-bagger screen and the reverse engine are two independent screens.** They share only the raw data layer. The 100-bagger keeps its `score`/`status`/`fail_codes`/GEM identity exactly as-is. The reverse engine adds its own `rev_*` columns and its own filter mode. A user picks which screen to view in the dashboard.
2. **Fetch vs. score split.** The new raw fields the engine needs (§3.3) are pulled inside `fetch_data.py`, because that is where the live `yf.Ticker` network object already exists — fetching them there is nearly free and avoids a second scrape. But **all scoring math lives in a separate `score_reverse.py`** that reads the CSV/JSON from disk, so re-scoring after a threshold change takes seconds instead of re-scraping 8,000 tickers. This is the same fetch/consume seam your repo already uses for `ai_worker.py`.

---

# 1. How it fits your architecture

```
┌────────────────────────────────────────────────────────────────┐
│ fetch_data.py  (UNCHANGED — expensive scrape, run occasionally) │
│   scans ~8K tickers via FinanceDataReader + yfinance            │
│   writes: stocks.csv, stocks.json, financials/{TICKER}.json     │
└───────────────────────────┬────────────────────────────────────┘
                            │  (reads existing outputs, no re-scrape)
                            ▼
┌────────────────────────────────────────────────────────────────┐
│ score_reverse.py  (NEW — cheap math, run anytime, seconds)      │
│   Stage 0  use existing universe + add missing-field handling   │
│   Stage 1  hard eliminators (archetype-suspended)               │
│   Stage 2  archetype routing  ← NEW capability                  │
│   Stage 3  archetype-specific quality score                     │
│   Stage 4  margin-of-safety proxy                               │
│   Stage 5  drawdown survivability                               │
│   Stage 6  CAGR / drawdown / efficiency proxies                 │
│   Stage 7  composite score + haircuts                           │
│   Stage 8  behavioral flags                                     │
│   Stage 9  top-N + diversification                              │
│   writes BACK new columns into stocks.csv / stocks.json         │
└───────────────────────────┬────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────────┐
│ ScreenerDashboard  (EXTENDED — reuses FilterSidebar)            │
│   new sortable columns: archetype, composite, MoS, survivability│
│   new filter mode: "Reverse Engine" alongside Pass/Fail/GEM     │
│   new action: "Deep-dive top N" → existing Ask-AI flow          │
└───────────────────────────┬────────────────────────────────────┘
                            │  (top N survivors)
                            ▼
┌────────────────────────────────────────────────────────────────┐
│ ai_worker.py / v3.2  (UNCHANGED — your deep engine)            │
│   runs full v3.2 analysis on the nominated survivors            │
└────────────────────────────────────────────────────────────────┘
```

**Design principle:** the expensive thing (scraping 8K tickers) runs rarely, inside `fetch_data.py`. The reverse engine is pure arithmetic on already-fetched data in a **separate** `score_reverse.py`, so it re-runs in seconds whenever you tune a threshold. The new raw fields the engine needs (§3.3) are added to `fetch_data.py`'s fetch step — because that is where the live network object already is — but no scoring happens there. This is the same fetch/consume separation your repo already uses between `fetch_data.py` and `ai_worker.py`.

---

# 2. The 100-bagger screen stays a separate, parallel screen

The 100-bagger screen is **not touched**. It is a specialist hunting one thing — small-cap, micro-float, high-growth moonshots — and it does that well. v1.2 leaves its code, its 10 criteria, its `score`/`status`/`fail_codes`, and its GEM CANDIDATE identity completely intact.

The reverse engine is a **second screen** that runs over the *same raw data* but covers the *broad* universe the 100-bagger structurally cannot see: quality compounders, cyclicals, financials, REITs/infrastructure, and the rest of archetypes A–I.

### 2.1 Why two screens instead of one

The 100-bagger's gates (price < $25, float < 50M, market cap < $2B) are not bad — they are *deliberately narrow*. They define the moonshot hunt. Folding them into the reverse engine (as v1.1 tried) muddied both: the moonshot screen lost its clean identity, and the reverse engine inherited gates irrelevant to a $40 compounder. Keeping them apart is cleaner:

| | 100-bagger screen | Reverse engine |
|---|---|---|
| Universe | Small-cap micro-float growth | Broad (all archetypes A–I) |
| Output | `score`, `status`, GEM | `rev_composite`, `rev_archetype`, `rev_band` |
| Logic | Fixed 10-criterion pass/fail | Archetype-routed graded scoring |
| Identity in UI | "GEM CANDIDATES" mode | "Reverse Engine" mode |
| Owner | Untouched, as built | New `score_reverse.py` |

### 2.2 The only shared thing: raw data

Both screens read the same `stocks.csv` + `financials/{TICKER}.json`. A stock can appear in *both* (e.g. a micro-cap that is a 100-bagger GEM *and* scores well as a reverse-engine Archetype B). The dashboard shows whichever screen's lens you select; nothing forces them to agree. They are two independent opinions over one dataset.

### 2.3 No reconciliation, no inheritance

The reverse engine does **not** read `fail_codes` as inputs, does **not** treat a 100-bagger pass/fail as a routing signal, and does **not** overwrite the existing Score. The two scores are independent by design. (This is the cleanest consequence of the parallel decision: a 100-bagger fail tells the reverse engine nothing, because the 100-bagger was only ever testing for one archetype.)

---

# 3. Data mapping — what you already have vs. what we add

This is the heart of integration. Every reverse-engine input maps to an existing field, a derivable field, or a NEW field to add to `fetch_data.py`.

### 3.1 Already in `stocks.csv` / `financials/*.json` (no work)

| Reverse-engine need | Existing field |
|---|---|
| Market cap, price, sector, industry | `market_cap`, `price`, `sector`, `industry` |
| Revenue growth TTM | `revenue_growth_ttm` |
| Gross margin + 3yr trend | `gross_margin`, 3yr avg gross margin |
| ROIC | `ROIC` |
| Bankruptcy risk | `Altman Z-Score` |
| Dilution | `Share Dilution` (3yr CAGR shares) |
| Float, insider ownership | `float_shares`, `insider_ownership` |
| Valuation multiples | `peg_ratio`, `price_to_sales`, `EV_to_Sales`, `EV_to_EBIT`, `Core_Anchor_Multiple` |
| FCF + margin | `FCF`, `FCF_Margin_%` (in financials JSON) |
| Cash, debt | `Total_Cash`, `Total_Debt` |
| EV | `Enterprise_Value_EV` |
| Rule of 40 | `Rule_of_40` |
| EPS, forward EPS, P/B, 5Y P/E | `EPS_TTM`, `Forward_EPS_Estimate`, `Price_to_Book`, `PE_5Y_Avg` |
| Price history (drawdown calc) | `Monthly_Closes` (2yr monthly) |

(Note: the 100-bagger's `score`/`status`/`fail_codes` are deliberately **not** consumed — the two screens are independent per §2.3.)

### 3.2 Derivable from existing data (compute in `score_reverse.py`, no new scrape)

| Reverse-engine need | How to derive |
|---|---|
| Net debt / EBITDA | `(Total_Debt − Total_Cash) / TTM_EBIT-proxy` (EBIT in financials JSON; EBITDA ≈ EBIT + D&A if D&A available, else use EBIT as conservative proxy and flag) |
| FCF yield | `FCF / Market_Cap` |
| EV/EBITDA vs history | Have `EV_to_EBIT`; EBITDA version needs D&A (see §3.3) |
| Max drawdown (10Y proxy) | Computed from `Monthly_Closes` (only 2yr available — see §3.3 limitation) |
| Beta | Not stored; compute from `Monthly_Closes` vs an index series, or add (see §3.3) |
| Owner earnings proxy | `Net Income + D&A − maintenance capex`; capex is in JSON, D&A needs adding |

### 3.3 NEW fields to add to `fetch_data.py` (the "we can add functions" part)

These unlock full archetype coverage. None require a new data source — all are available from the `yf.Ticker` object already being fetched.

| New field | yfinance source | Unlocks |
|---|---|---|
| `interest_expense` | income statement | Interest coverage (Stage 1, Stage 5 rate-shock) |
| `depreciation_amortization` | cash flow statement | True EBITDA, owner earnings |
| `ebitda` | `info.ebitda` or computed | ND/EBITDA, EV/EBITDA |
| `beta` | `info.beta` | Drawdown proxy (Stage 6) |
| `dividend_yield` + `payout_ratio` | `info.dividendYield`, `info.payoutRatio` | Archetype A/H MoS, distribution safety |
| `revenue_3y` and `revenue_5y` | financials (extend from 2yr to 5yr) | Multi-year CAGR, mid-cycle (Stage 3 cyclical) |
| `operating_margin_history` (5yr) | financials | Cyclical mid-cycle margin (Stage 3) |
| `short_percent_of_float` | `info.shortPercentOfFloat` | Behavioral flag (Stage 8) |
| `held_percent_institutions` | `info.heldPercentInstitutions` | Crowding flag (Stage 8) |
| `country`, `exchange` | `info.country`, listing | Diversification caps (Stage 9) |
| `auditor_opinion` / `going_concern` | filings (best-effort; flag if unavailable) | Hard eliminator (Stage 1) |
| `recurring_revenue_pct` | segment data if available (often unavailable — flag) | Archetype D routing |
| Sector classification → archetype hint | already have `sector`/`industry` | Archetype routing (Stage 2) |

For financial institutions (Archetype G) and REITs/infra (Archetype H), specialized fields (CET1, NPL, AFFO, occupancy) are **rarely in yfinance**. v1.2 handles this gracefully: see §6.4 (degraded scoring for data-sparse archetypes).

### 3.4 Backward-compatibility rule

`score_reverse.py` must run even if §3.3 fields are absent (i.e., before you extend `fetch_data.py`). Every NEW field has a fallback:

```
if field missing:
    mark data_quality penalty for that stock
    use most conservative substitute (e.g. EBIT for EBITDA)
    set archetype-specific component to "limited" not "fail"
```

This means you can ship the reverse engine **today** against the current CSV, then progressively enrich `fetch_data.py` to sharpen it. The engine degrades, it does not break.

---

# 4. New CSV columns written by `score_reverse.py`

These are appended to `stocks.csv` / `stocks.json`, consumed by the dashboard. All prefixed `rev_` to avoid collision with existing columns.

| Column | Type | Stage | Meaning |
|---|---|---|---|
| `rev_archetype` | string (A–I) | 2 | Primary archetype |
| `rev_archetype_secondary` | string / null | 2 | Transition tag |
| `rev_quality` | 0–100 | 3 | Archetype-specific quality |
| `rev_mos` | 0–100 | 4 | Margin-of-safety proxy |
| `rev_survivability` | 0–100 | 5 | Drawdown survivability |
| `rev_impairment_prob` | 0–1 | 5 | Permanent impairment probability |
| `rev_cagr_proxy` | % | 6 | Expected 3–5Y CAGR estimate |
| `rev_drawdown_proxy` | % (neg) | 6 | Expected bear drawdown estimate |
| `rev_efficiency` | float | 6 | CAGR / |drawdown| |
| `rev_composite` | 0–100 | 7 | Master score, post-haircut |
| `rev_band` | string | 7 | High / Solid / Watchlist / Monitor / Reject |
| `rev_rank` | int | 7 | Rank within current universe |
| `rev_flags` | string (CSV) | 8 | Behavioral flags fired |
| `rev_data_quality` | 0–5 | 15 | Data quality score |
| `rev_pro` | string | 14 | One-line "why it passed" |
| `rev_con` | string | 14 | One-line "why it might still fail" |
| `rev_nominated` | bool | 9 | In the top-N deep-dive queue |

The existing `score`, `status`, `fail_codes` columns are untouched. The dashboard can show either system.

---

# 5. Stage 0 — Universe (uses your existing scan)

No new scraping. The universe IS the ~8K rows in `stocks.csv`. Stage 0 only filters which rows the reverse engine *scores*:

| Filter | Reject from scoring if |
|---|---|
| Missing core data | `price`, `market_cap`, or `sector` null |
| Liquidity proxy | `market_cap` below floor (default $300M; configurable, lower than 100-bagger's $50M so we don't pre-exclude) |
| Type | Identified ETF/fund and ETF mode off |
| Stale | No recent financials in JSON |

Note: Stage 0 floor is intentionally *looser* than the 100-bagger's $2B ceiling, because the reverse engine must see large-cap compounders the 100-bagger screen throws away.

---

# 6. Stage 1 — Hard Eliminators (archetype-suspended)

Reject from nomination (still scored and visible, but `rev_band = Reject`) if any universal eliminator fires, unless the stock's archetype suspends it.

### 6.1 Universal eliminators (mapped to your fields)

| Eliminator | Threshold | Field used |
|---|---|---|
| Bankruptcy risk | Altman Z < 1.8 | `Altman Z-Score` (you already compute) |
| Leverage | Net debt / EBITDA > 4.0x | derived (§3.2) |
| Coverage | Interest coverage < 2.0x | NEW `interest_expense` (§3.3); skip if missing + flag |
| Dilution | Share dilution 3yr CAGR > 10% | `Share Dilution` |
| Cash burn | FCF < 0 for available years AND no growth path | `FCF` history |
| Data quality | `rev_data_quality` < 2 | computed |

### 6.2 Archetype suspensions (same as v1.0 §5.2)

Banks (G) skip leverage/coverage; infrastructure (H) allows higher leverage with AFFO coverage instead; option-led (E) and binary (F) allow negative FCF with runway requirements; cyclicals (C) apply eliminators on mid-cycle not current metrics.

### 6.3 Independence from the 100-bagger screen

The reverse engine's Stage 1 is fully independent of the 100-bagger screen (§2.3). It does not read `fail_codes`, and a 100-bagger fail is never a reverse-engine reject. The existing `score`/`status`/`fail_codes` columns are untouched and belong solely to the 100-bagger screen. A large compounder that fails the 100-bagger on `FAIL_PRICE`/`FAIL_FLOAT`/`FAIL_MCAP` is scored normally here as Archetype B.

### 6.4 Degraded scoring for data-sparse archetypes

Banks (G) and REITs/infra (H) lack specialty fields in yfinance. Rather than mis-score them on inappropriate generic metrics:

```
if archetype in (G, H) and specialty_fields_missing:
    rev_quality   = score only the dimensions with data
    rev_data_quality = cap at 3
    rev_composite ×= 0.85   (ambiguity-style haircut)
    rev_con = "Specialty financials unavailable; v3.2 must verify capital/AFFO"
```

This way a bank is still surfaced for v3.2 review, but flagged as needing the deep engine to fetch what the scanner can't.

---

# 7. Stage 2 — Archetype Routing (the new capability)

Routes each stock to one of A–I (v3.2 §7). Uses fields you already have: `sector`, `industry`, growth, margins, FCF, dividend. (There is no moonshot lane — the 100-bagger screen handles moonshots separately, per §2.)

### 7.1 Routing logic (in priority order)

```
1. If sector in {Financial Services} and is bank/insurer/broker       → G
2. If sector in {Real Estate, Utilities} or industry in {pipeline,
   REIT, infrastructure}                                              → H
3. If identified ETF/fund                                             → I
4. If revenue < $50M and gross margin negative / pre-profit           → E
5. If clinical-stage / pre-approval (biotech industry + no revenue)   → F
6. If industry in deep-cyclical set {mining, steel, semis equip,
   autos, shipping, oil&gas E&P, chemicals}                           → C
7. If recurring_revenue_pct ≥ 20% (if known) OR hardware+services     → D
8. If FCF>0 and ROIC > WACC+5% and rev CAGR > 8% and margins stable   → B
9. Else (stable, low growth, mature)                                  → A
```

Note: a stock can be a 100-bagger GEM *and* be routed here as Archetype B or E — the two screens are independent and may both surface the same name (§2.2).

### 7.2 Transition + ambiguity

Same as v1.0 §6.2–6.3: transitions get a secondary tag and a confidence haircut; ambiguous archetypes default to the most conservative scoring engine and a −15% composite haircut.

---

# 8. Stage 3 — Archetype-Specific Quality (0–100)

Uses the v1.0 §7 rubrics (A/B, C, D, E, F, G, H, I), scored from your existing fields. There is no separate moonshot rubric — micro-cap growth names route to E or B and are scored on those rubrics, while the 100-bagger screen scores them on its own criteria in parallel.

### 8.1 Field mapping for the A/B rubric (worked example)

The A/B quality rubric (v1.0 §7.1) maps cleanly to fields you already compute:

| Dimension | Metric | Your field |
|---|---|---|
| Returns on capital | ROIC vs WACC | `ROIC` vs §12.1 WACC table |
| Growth quality | 3Y revenue CAGR + margin trend | `revenue_growth_ttm`, 3yr gross margin trend |
| Cash generation | FCF margin + conversion | `FCF_Margin_%`, `FCF` vs Net Income |
| Balance sheet | Net cash / ND-EBITDA + coverage | `Total_Cash`, `Total_Debt`, derived ND/EBITDA |

The other archetype rubrics (C, D, E, F, G, H, I) map the same way; where a rubric needs a field you don't yet have (NRR for D, occupancy for H, CET1 for G), that dimension scores as "limited" and triggers the §6.4 data-quality cap rather than a false zero.

---

# 9. Stages 4–9 — unchanged in logic, mapped to your data

These carry over from v1.0 with field mappings; logic is identical so I summarize the integration points only.

| Stage | v1.0 reference | Integration note |
|---|---|---|
| 4 — MoS proxy | §8 | Uses `EV_to_Sales`, `EV_to_EBIT`, `Core_Anchor_Multiple`, `peg_ratio`, `FCF yield`, `PE_5Y_Avg`, `Price_to_Book`. You already compute the anchor multiples — strong starting point. Reverse-DCF needs growth + WACC assumption (add a simple WACC table by sector). |
| 5 — Survivability | §9 | Leverage stress needs `interest_expense` (§3.3). Z-Score (`Altman Z-Score`) is a ready-made survivability input. Drawdown history limited to 2yr from `Monthly_Closes` — extend to 5yr in `fetch_data.py` for a better signal. |
| 6 — CAGR/DD/Efficiency | §10 | CAGR proxy uses `revenue_growth_ttm`, `Forward_EPS_Estimate` vs `EPS_TTM`, dilution drag from `Share Dilution`. Drawdown proxy uses `beta` (§3.3) + leverage + concentration. |
| 7 — Composite + haircuts | §11 | Same formula and six haircuts. `rev_data_quality` haircut leans on the §3.4 missing-field tracking. |
| 8 — Behavioral flags | §12 | `short_percent_of_float`, `held_percent_institutions` (§3.3), `insider_ownership`, recent dilution from `Share Dilution`. |
| 9 — Top-N + diversification | §13 | Diversification caps use `sector` (have) and `country` (§3.3). Writes `rev_nominated = true` for the top 20–30. |

### 9.1 Composite formula (restated for reference)

```
Base Composite =
   0.30 × CAGR score + 0.25 × MoS + 0.20 × Quality
 + 0.15 × Survivability + 0.10 × Efficiency

Final = Base × (impairment haircut) × (data-quality haircut)
            × (transition haircut) × (base-rate haircut)
            × (macro haircut) × (adversarial haircut)
```

---

# 10. Frontend integration (ScreenerDashboard)

Reuses what you already built. Minimal new surface area.

### 10.1 FilterSidebar additions

The 100-bagger screen keeps its existing Pass/Fail/GEM/COMPOUNDER modes untouched. Add the reverse engine as a **new, separate screen mode** the user switches into:

| New control | Behavior |
|---|---|
| Screen mode: **Reverse Engine** | New mode beside the existing 100-bagger modes; sorts by `rev_composite`, shows `rev_*` columns |
| Archetype filter | Multi-select A–I (`rev_archetype`) |
| Min composite slider | Filter `rev_composite ≥ X` |
| Min MoS slider | Filter `rev_mos ≥ X` |
| Min survivability slider | Filter `rev_survivability ≥ X` |
| Band filter | High / Solid / Watchlist / Monitor / Reject (`rev_band`) |
| "Nominated only" toggle | Show `rev_nominated == true` |

These are the same filter-component patterns already in `FilterSidebar.tsx` — new fields, same UI primitives. No new framework. The two screens are mutually exclusive *views*; switching modes swaps which columns and sorts drive the table.

### 10.2 New columns in the stock cards / table

In Reverse Engine mode, show `rev_archetype`, `rev_composite`, `rev_band`, `rev_efficiency`, and `rev_flags` as a badge row. In 100-bagger mode, the existing `score`/`status`/GEM badges show as today. A stock that appears in both screens can show a small secondary badge indicating the other screen also flagged it.

### 10.3 The deep-dive action

In `StockDetailModal.tsx` you already have the "Ask AI" trigger (password `RSYS` → `/api/analysis` → `ai_worker.py`). Add:

| New action | Behavior |
|---|---|
| "Deep-dive top N" button (dashboard header) | Takes the current `rev_nominated` set (or top N by `rev_composite`), enqueues each into the existing `/api/analysis` flow as a batch |
| Per-stock "Run v3.2" (in modal) | Same as existing Ask AI, but pre-fills the prompt with `rev_pro` / `rev_con` so the deep engine starts primed |

This is the wiring that makes the reverse engine actually feed v3.2: the top survivors flow into the deep-analysis pipeline you've already built, instead of you hand-picking tickers.

### 10.4 Prompt priming (v3.2 hand-off)

`prompt-builder.ts` already injects financial data into the AI prompt. Extend it to inject the reverse-engine hand-off schema (v1.0 §14): archetype, composite, the pro/con lines, active flags. This tells v3.2 *why* this stock was nominated, so §1 scope and §21 red-team start from the reverse engine's findings instead of blank.

---

# 11. Build order (concrete, incremental)

Each step ships independently and adds value. You can stop at any step and still have something better than today.

| Step | Work | Ships |
|---|---|---|
| **1** | Write `score_reverse.py` reading current `stocks.csv` + `financials/*.json`. Implement Stages 0–4 + 7 with existing fields only (archetype routing, quality, MoS proxy, composite). Missing-field fallbacks per §3.4. | Ranked, archetype-tagged `rev_composite` column on today's data — no scanner change. |
| **2** | Add `rev_*` columns to the dashboard table + the Reverse Engine filter mode in FilterSidebar. | Interactive archetype-aware filtering in the UI. |
| **3** | Extend `fetch_data.py` with §3.3 fields (interest expense, D&A, EBITDA, beta, dividend, 5yr history, short interest). | Sharper Stages 1, 5, 6 — real leverage/survivability/drawdown. |
| **4** | Implement Stages 5, 6, 8, 9 fully (survivability, CAGR/DD proxies, behavioral flags, diversification + nomination). | Full funnel: top-N nomination with `rev_nominated`. |
| **5** | Wire "Deep-dive top N" → `/api/analysis`, and prompt priming in `prompt-builder.ts`. | One-click hand-off from reverse engine to v3.2. |
| **6** | Calibration loop (§13): log nomination scores vs v3.2 outcomes, tune thresholds. | Self-improving thresholds, versioned to v1.2+. |

Step 1 alone replaces "scroll through 8,000 stocks" with "sort by composite, filter by archetype" — the original problem solved on day one, before any scanner changes.

---

# 12. WACC and base-rate tables to add

The MoS reverse-DCF and the CAGR base-rate ceiling need two small lookup tables. These live in `score_reverse.py` (or a config JSON) and are the only "assumptions" the engine injects.

### 12.1 Sector WACC table (starting defaults — calibrate over time)

| Sector | Default WACC |
|---|---|
| Technology | 11% |
| Healthcare | 10% |
| Consumer Discretionary | 10% |
| Consumer Staples | 8% |
| Industrials | 9% |
| Financials | 10% (cost of equity) |
| Energy | 11% |
| Materials | 10% |
| Utilities | 7% |
| Real Estate | 8% |
| Communication Services | 10% |

Adjust per stock with a size premium (small-cap +1–2%) and a leverage adjustment.

### 12.2 Base-rate ceilings (v3.2 §9, for CAGR sanity)

Carry over v3.2 §9 priors directly: sustaining >25% revenue CAGR for 5 years requires strong evidence; option-led 5-year survival 40–60%; platform transition success 20–30%; etc. Any `rev_cagr_proxy` implying growth above the relevant ceiling fires the Base Rate Red haircut (§9.1 / v1.0 §11.2).

---

# 13. Calibration loop (integrated with your Supabase)

You already store AI reports in Supabase (`ai_reports`). Extend it to close the loop:

| New Supabase field | Captured when |
|---|---|
| `rev_composite_at_nomination` | nomination time |
| `rev_rank_at_nomination` | nomination time |
| `v32_execution_opinion` | after `ai_worker.py` completes |
| `forward_return_12m` | backfilled later |
| `drawdown_realized` | backfilled later |

Quarterly: check whether high-`rev_composite` names cluster in v3.2's "High-Conviction Accumulate" tier, whether survivability predicted realized drawdowns, and which archetype rubrics are miscalibrated. Adjust Stage 3–6 thresholds → bump to v1.3.

This reuses your existing Supabase reporting infrastructure rather than adding storage.

---

# 14. What we are explicitly adding to your project (the "we can add functions" list)

Consolidated so you can scope it:

**New file:** `scripts/score_reverse.py` (the engine).
**New file (optional):** `scripts/reverse_config.json` (WACC table, thresholds, archetype maps).
**Extend `fetch_data.py`:** the §3.3 fields (all from the already-fetched `yf.Ticker` object — incremental, no new data source, no new API key).
**Extend frontend:** Reverse Engine filter mode + `rev_*` columns (FilterSidebar.tsx, ScreenerDashboard.tsx, StockDetailModal.tsx) + "Deep-dive top N" action.
**Extend `prompt-builder.ts`:** inject reverse-engine hand-off into the v3.2 prompt.
**Extend Supabase schema:** calibration fields (§13).

**New batch file (optional):** `run_reverse.bat` to invoke `score_reverse.py` after a scan.

Nothing here requires replacing existing functionality. The 100-bagger screen, the AI worker, the dashboard, the YouTube strategy view — all keep working unchanged.

---

# 15. Mandatory rules (carried from v1.0, plus integration rules)

1–15. (All v1.0 §16 rules apply: never recommend a buy, archetype before scoring, no single quality rubric for all, survivability ≠ volatility, efficiency in the ranking, data-quality haircut mandatory, diversification caps mandatory, base-rate sanity on MoS, no archetype-irrelevant Stage-1 rejects, flags-not-rejects in Stage 8, watchlist mandatory, report low/high survivor counts, re-run quarterly, scores expire at 90 days.)

**Integration-specific additions:**

16. `score_reverse.py` must never trigger a re-scrape. It reads `fetch_data.py` outputs only.
17. The existing `score` / `status` / `fail_codes` columns are never overwritten.
18. The reverse engine must run against the current CSV even with §3.3 fields absent (graceful degradation, §3.4).
19. The reverse engine and the 100-bagger screen are independent (§2). The reverse engine never reads `fail_codes` and a 100-bagger fail is never a reverse-engine reject. The same stock may legitimately appear in both screens.
20. Specialty-data-sparse archetypes (G, H) are surfaced with a data-quality cap, never silently dropped or mis-scored on generic metrics.
21. v3.2 hand-off must include `rev_pro` and `rev_con` so the deep engine starts primed, never blind.

---

# 16. Final mission (unchanged)

The reverse engine exists so that every v3.2 deep-dive is spent on a stock with a real chance of passing v3.2. In your system specifically: it turns "scroll through 8,000 rows" into "sort 8,000 rows by archetype-aware composite, filter to ~25, one-click deep-dive the survivors." It is triage, not decision. Success metric: the nominated top-25 produce more "High-Conviction Accumulate" v3.2 outcomes than the raw 100-bagger GEM list does.

---

*Companion to: Integrated Stock Analysis Engine v3.2 (your `ai_worker.py` deep engine)*
*Integrates with: `riperdy-tech/stock-screener` (`fetch_data.py`, ScreenerDashboard, Supabase)*
*Version: 1.2 — Integration Edition (parallel-screen architecture)*
*Status: Methodology + integration plan. Build order in §11.*

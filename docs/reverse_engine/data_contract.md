# Reverse Engine Data Contract

Generated during Phase 0 recon for the Reverse Screening Engine. This file records the actual repo/data shapes observed before implementation. It intentionally separates the current `scripts/fetch_data.py` writer contract from the already-existing `public/data/stocks.csv`, because they differ.

## Source Files Inspected

- Scanner: `scripts/fetch_data.py`
- Live CSV: `public/data/stocks.csv`
- Live JSON: `public/data/stocks.json`
- Sample financial detail: `public/data/financials/AAPL.json`
- CSV parser/data service: `lib/data-service.ts`

## `stocks.csv` Header

Actual live header in `public/data/stocks.csv`:

```csv
Symbol,Name,Description,Price,Market Cap,Sector,Industry,Score,Status,Fail Codes,Last_Updated,Rev Growth,Gross Margin,ROIC,Insider Own,PEG,Z-Score,P/S,Float,OCF,CAPEX,Financial_Data
```

Important mismatch: the current `scripts/fetch_data.py` no longer writes `Financial_Data`, and its code appends additional YouTube-strategy columns after `CAPEX`. A fresh run of the current scanner is expected to replace the live header with the code-derived header below.

## Columns Written By `scripts/fetch_data.py`

The incremental-save path and final-save path write the same column names in the same order.

| Order | Column | Type / unit | Computation / source |
|---:|---|---|---|
| 1 | `Symbol` | string ticker | `r['symbol']`, the normalized Yahoo ticker from the FDR universe/manual list. |
| 2 | `Name` | string | `longName`, else `shortName`, else ticker from `yf.Ticker.info`. |
| 3 | `Description` | string | `longBusinessSummary`, else `description`, with newlines removed. |
| 4 | `Price` | number, currency/share | `info.currentPrice`, default `0.0`. |
| 5 | `Market Cap` | number, currency | `info.marketCap`, default `0`. |
| 6 | `Sector` | string | `info.sector`, default `Unknown`. |
| 7 | `Industry` | string | `StockData.industry`; initialized to `Unknown` and not populated elsewhere in current `fetch_data.py`. |
| 8 | `Score` | integer 0-100 | `100 - (10 * fail_reason_count)`, floored at 0. |
| 9 | `Status` | string | `Pass` if `is_potential_100_bagger` returns true, else `Fail`. |
| 10 | `Fail Codes` | comma-separated string | Join of 100-bagger failure codes. |
| 11 | `Last_Updated` | string datetime `YYYY-MM-DD HH:MM` | Current scanner time when the row is processed. |
| 12 | `Rev Growth` | decimal ratio | `info.revenueGrowth`, default `0.0`. Example: `0.24` means 24%. |
| 13 | `Gross Margin` | decimal ratio | `info.grossMargins`, default `0.0`. |
| 14 | `ROIC` | decimal ratio | NOPAT divided by invested capital from yfinance financials/balance sheet. |
| 15 | `Insider Own` | decimal ratio | `info.heldPercentInsiders`, default `0.0`. |
| 16 | `PEG` | number | `info.pegRatio`, else trailing P/E divided by revenue growth percent. |
| 17 | `Z-Score` | number | Altman Z-score computed from balance sheet, market cap, and revenue; default `3.0` on failure. |
| 18 | `P/S` | number | `info.priceToSalesTrailing12Months`, default `100.0`. |
| 19 | `Float` | number, shares | `info.floatShares`, default infinity in memory. |
| 20 | `OCF` | number, currency | `Operating_Cash_Flow` from financial detail JSON. |
| 21 | `CAPEX` | number, currency | `Capital_Expenditure` from financial detail JSON; yfinance capex is usually negative. |
| 22 | `EPS TTM` | number, currency/share | `Calculated_Metrics.EPS_TTM` from financial detail; sourced from `info.trailingEps`. |
| 23 | `Forward EPS` | number, currency/share | `Calculated_Metrics.Forward_EPS_Estimate`; sourced from `info.forwardEps`. |
| 24 | `P/B` | number | `Calculated_Metrics.Price_to_Book`; sourced from `info.priceToBook`. |
| 25 | `5Y Avg P/E` | number | `Calculated_Metrics.PE_5Y_Avg`; `info.fiveYearAvgPE` else `info.trailingPE`. |
| 26 | `20M MA` | number, currency/share | 20-month moving average from 2-year monthly yfinance history. |
| 27 | `Monthly Closes` | JSON array string of numbers | Monthly close prices from `yf_ticker.history(period="2y", interval="1mo")`. |
| 28 | `Quarterly EPS` | JSON array string of numbers/nulls | Basic EPS else Diluted EPS from quarterly income statement rows. |
| 29 | `EPS YoY Growth` | null currently | Hardcoded `None` in current scanner. |
| 30 | `Revenue YoY Growth` | null currently | Hardcoded `None` in current scanner. |
| 31 | `Previous EPS TTM` | null currently | Hardcoded `None` in current scanner. |
| 32 | `Consecutive Growth` | integer | Hardcoded `0` in current scanner. |

Live-only column not written by current code:

| Column | Type / unit | Note |
|---|---|---|
| `Financial_Data` | base64-encoded JSON string | Present in the current checked data. Current `fetch_data.py` writes per-ticker JSON files and `stocks.json` instead of this CSV column. |

## Financial Detail JSON Structure

Sample inspected: `public/data/financials/AAPL.json`.

Observed real structure:

```text
root: object
  Ticker: string, ticker symbol
  Data_Fetched_Date: string, "YYYY-MM-DD HH:MM"
  Next_Earnings_Date: string or null, "YYYY-MM-DD"
  Price: number
  Shares_Outstanding: number
  Market_Cap: number
  Enterprise_Value_EV: number
  Total_Cash: number or null
  Total_Debt: number or null
  SBC_Stock_Based_Comp: number or null
  Free_Cash_Flow_TTM: number or null
  Operating_Cash_Flow: number or null
  Capital_Expenditure: number or null
  Annual_Income_Statement: array[up to 2] of objects
    Date: string, "YYYY-MM-DD"
    TotalRevenue: number or null
    GrossProfit: number or null
    OperatingIncome: number or null
    NetIncome: number or null
  Quarterly_Income_Statement: array[up to 4] of objects
    Date: string, "YYYY-MM-DD"
    TotalRevenue: number or null
    GrossProfit: number or null
    OperatingIncome: number or null
    NetIncome: number or null
  Calculated_Metrics: object
    TTM_Revenue: number or null
    TTM_Gross_Margin_%: number or null
    YoY_Revenue_Growth_%: number
    FCF_Margin_%: number
    Rule_of_40: number
    EV_to_Sales: number or null
    EV_to_Gross_Profit: number or null
    EV_to_EBIT: number or null
    Core_Anchor_Multiple_0.4Sales_0.4GP: number or null
```

Current `scripts/fetch_data.py` code can also write these additional financial JSON keys, but the inspected `AAPL.json` did not contain them:

```text
Annual_Income_Statement[].BasicEPS
Annual_Income_Statement[].DilutedEPS
Quarterly_Income_Statement[].BasicEPS
Quarterly_Income_Statement[].DilutedEPS
Calculated_Metrics.EPS_TTM
Calculated_Metrics.Forward_EPS_Estimate
Calculated_Metrics.Price_to_Book
Calculated_Metrics.PE_5Y_Avg
Calculated_Metrics.Monthly_MA_20
Monthly_Closes
```

## Reverse Engine Field Mapping

Statuses use the requested terms:

- `EXISTS`: present as a real CSV column or financial JSON key, or present in `stocks.json` where noted.
- `DERIVABLE`: can be calculated from existing fields without another scrape.
- `MISSING`: not present and not safely derivable from current stored data.

| Reverse field | Status | Actual field(s) / derivation | Notes |
|---|---|---|---|
| `market_cap` | EXISTS | CSV `Market Cap`; financial JSON `Market_Cap`; `stocks.json.marketCap` | Currency units. |
| `price` | EXISTS | CSV `Price`; financial JSON `Price`; `stocks.json.price` | Currency/share. |
| `sector` | EXISTS | CSV `Sector`; `stocks.json.sector` | Defaults to `Unknown`. |
| `industry` | EXISTS | CSV `Industry`; `stocks.json.industry` | Current scanner initializes `Industry` as `Unknown`; no yfinance assignment found in `fetch_data.py`. |
| `revenue_growth_ttm` | EXISTS | CSV `Rev Growth`; financial JSON `Calculated_Metrics.YoY_Revenue_Growth_%` | CSV is decimal ratio; JSON metric is percent points. |
| `gross_margin` | EXISTS | CSV `Gross Margin`; financial JSON `Calculated_Metrics.TTM_Gross_Margin_%` | CSV is decimal ratio; JSON metric is percent points. |
| `gross_margin_3yr_trend` | MISSING | N/A | Current scanner computes `gross_margin_3yr_avg` in memory for the 100-bagger fail check but does not persist it; inspected financial JSON has only 2 annual periods. |
| `ROIC` | EXISTS | CSV `ROIC`; `stocks.json.metrics.roic` | Decimal ratio. |
| `altman_z` | EXISTS | CSV `Z-Score`; `stocks.json.metrics.zScore` | Number. |
| `share_dilution` | EXISTS | `stocks.json.metrics.dilution` | Not written to current CSV; current value is initialized to `0.0` and no real share-count CAGR computation was found. Treat quality as limited/UNCLEAR. |
| `float_shares` | EXISTS | CSV `Float`; `stocks.json.metrics.float` | Shares. |
| `insider_ownership` | EXISTS | CSV `Insider Own`; `stocks.json.metrics.insiderOwnership` | Decimal ratio. |
| `peg_ratio` | EXISTS | CSV `PEG`; `stocks.json.metrics.pegRatio` | Number. |
| `price_to_sales` | EXISTS | CSV `P/S`; `stocks.json.metrics.psRatio` | Number. |
| `ev` | EXISTS | financial JSON `Enterprise_Value_EV`; live CSV `Financial_Data.Enterprise_Value_EV` after base64 decode | Not a standalone current CSV column. |
| `ev_to_sales` | EXISTS | financial JSON `Calculated_Metrics.EV_to_Sales`; live CSV `Financial_Data.Calculated_Metrics.EV_to_Sales` | Number. |
| `ev_to_ebit` | EXISTS | financial JSON `Calculated_Metrics.EV_to_EBIT`; live CSV `Financial_Data.Calculated_Metrics.EV_to_EBIT` | May be null if EBIT is unavailable/non-positive. |
| `core_anchor_multiple` | EXISTS | financial JSON `Calculated_Metrics.Core_Anchor_Multiple_0.4Sales_0.4GP`; live CSV `Financial_Data.Calculated_Metrics.Core_Anchor_Multiple_0.4Sales_0.4GP` | Number or null. |
| `fcf` | EXISTS | financial JSON `Free_Cash_Flow_TTM`; live CSV `Financial_Data.Free_Cash_Flow_TTM` | Currency. |
| `fcf_margin` | EXISTS | financial JSON `Calculated_Metrics.FCF_Margin_%`; live CSV `Financial_Data.Calculated_Metrics.FCF_Margin_%` | Percent points. |
| `total_cash` | EXISTS | financial JSON `Total_Cash`; live CSV `Financial_Data.Total_Cash` | Currency or null. |
| `total_debt` | EXISTS | financial JSON `Total_Debt`; live CSV `Financial_Data.Total_Debt` | Currency or null. |
| `eps_ttm` | EXISTS | code-derived CSV `EPS TTM`; code-derived financial JSON `Calculated_Metrics.EPS_TTM` | Not present in inspected live CSV/AAPL JSON. Present in current writer code. |
| `forward_eps` | EXISTS | code-derived CSV `Forward EPS`; code-derived financial JSON `Calculated_Metrics.Forward_EPS_Estimate` | Not present in inspected live CSV/AAPL JSON. Present in current writer code. |
| `price_to_book` | EXISTS | code-derived CSV `P/B`; code-derived financial JSON `Calculated_Metrics.Price_to_Book` | Not present in inspected live CSV/AAPL JSON. Present in current writer code. |
| `pe_5y_avg` | EXISTS | code-derived CSV `5Y Avg P/E`; code-derived financial JSON `Calculated_Metrics.PE_5Y_Avg` | Not present in inspected live CSV/AAPL JSON. Present in current writer code. |
| `monthly_closes` | EXISTS | code-derived CSV `Monthly Closes`; code-derived financial JSON `Monthly_Closes` | Not present in inspected live CSV/AAPL JSON. Present in current writer code as 2-year monthly closes. |
| `net_debt_to_ebitda` | DERIVABLE | `(Total_Debt - Total_Cash) / EBITDA proxy` | True EBITDA is missing. Conservative proxy can use `OperatingIncome`/EBIT from financial JSON, but this is not true EBITDA. |
| `fcf_yield` | DERIVABLE | `Free_Cash_Flow_TTM / Market_Cap` | Use financial JSON `Free_Cash_Flow_TTM` and `Market_Cap`. |
| `interest_expense` | MISSING | N/A | Used transiently in ROIC fallback in `process_stock`, but not persisted. |
| `depreciation_amortization` | MISSING | N/A | Not persisted in CSV, financial JSON, or observed `stocks.json`. |
| `ebitda` | MISSING | N/A | Not persisted. Can only use EBIT/OperatingIncome as a conservative proxy, not true EBITDA. |
| `beta` | MISSING | N/A | Not persisted. |
| `dividend_yield` | MISSING | N/A | Not persisted. |
| `payout_ratio` | MISSING | N/A | Not persisted. |
| `revenue_5yr_history` | MISSING | N/A | Financial JSON stores up to 2 annual revenue periods and up to 4 quarterly periods. |
| `operating_margin_5yr` | MISSING | N/A | Financial JSON stores up to 2 annual operating income/revenue periods; no 5-year history. |
| `short_percent_of_float` | MISSING | N/A | Not persisted. |
| `held_percent_institutions` | MISSING | N/A | Not persisted. |
| `country` | MISSING | N/A | Not persisted. Some descriptions contain headquarters text, but that is not a reliable field. |
| `exchange` | MISSING | N/A | Not persisted. |
| `auditor_opinion` | MISSING | N/A | Not persisted. |
| `going_concern` | MISSING | N/A | Not persisted. |
| `recurring_revenue_pct` | MISSING | N/A | Not persisted. |

## Frontend / Backend Integration Paths

| Role | Exact path |
|---|---|
| Dashboard component | `components/ScreenerDashboard.tsx` |
| Filter sidebar component | `components/FilterSidebar.tsx` |
| Stock detail modal | `components/StockDetailModal.tsx` |
| Data-service / CSV parser | `lib/data-service.ts` |
| Prompt builder | `lib/prompt-builder.ts` |
| AI worker | `scripts/ai_worker.py` |
| `/api/analysis` route | `app/api/analysis/route.ts` |

Additional related files discovered but not required by the packet:

- Stock card component: `components/StockCard.tsx`
- Shared stock type/blueprint: `lib/blueprint.ts`

## Phase 0 Notes / Risks

- The live CSV has `Financial_Data`; current `fetch_data.py` does not write it. Any Phase 1+ script should preserve existing columns and should not assume the live CSV has already been regenerated by the latest scanner code.
- Several fields exist in current source code output but not in the inspected live artifacts. They should be treated as optional until a fresh scanner run confirms them in `public/data/stocks.csv` and per-ticker financial JSON.
- `Industry` exists as a column, but current US scanner code does not populate it from yfinance; most rows may remain `Unknown`.
- `share_dilution` exists in `stocks.json.metrics.dilution`, but the scanner currently initializes it to `0.0` and does not compute real dilution. Reverse-engine use should treat this as low-confidence until fixed.
- The per-ticker financial JSON currently gives enough data for EV, EV/Sales, EV/EBIT, FCF, FCF margin, cash/debt, and basic TTM revenue/margins, but not enough for true 5-year history, true EBITDA, interest coverage, short interest, country/exchange diversification, or institutional-crowding flags.

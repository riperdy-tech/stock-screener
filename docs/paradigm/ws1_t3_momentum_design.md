# WS1-T3: Theme-Momentum Signal -- Design Doc + Build Plan

> **Task:** Design the price-history acquisition strategy and momentum computation for the
> paradigm scoring engine. No implementation.
> **Working directory:** `Stock Screener/`
> **Status:** Design only.

---

## Recommendation Summary

**Recommended: Use the existing yfinance `history(period="2y", interval="1mo")` call already
present in `scripts/fetch_data.py` (line ~412) to acquire monthly close data for all ~6602
stocks, store it as a single `public/data/price_history.json` file keyed by ticker, then
compute per-stock momentum scores from that snapshot using four weighted lookback windows
(1m, 3m, 6m, 12m) with relative strength measured against the full universe median, and
aggregate to the theme level via a simple mean of member scores, writing the result into
`pdm_momentum_score` on each stock's paradigm object.**

---

## 1. Price-History Acquisition Strategy

### Reality check: history already exists (partially)

The repo already fetches monthly close data. In `scripts/fetch_data.py`, lines 409-417:

```python
monthly_closes = []
ma_20_month = None
try:
    hist = yf_ticker.history(period="2y", interval="1mo")
    if not hist.empty and 'Close' in hist.columns:
        monthly_closes = [float(x) for x in hist['Close'].dropna().tolist()]
        if len(monthly_closes) >= 20:
            ma_20_month = sum(monthly_closes[-20:]) / 20.0
except:
    pass
```

This data is already persisted in two places:
- `stocks.json` -> each stock's `metrics.monthlyCloses` array (24 monthly closes, newest last)
- `public/data/financials/{TICKER}.json` -> `Monthly_Closes` array

**However**, this data is only fetched during the full scanner run (`fetch_data.py`), which
processes all ~6602 stocks. The per-ticker financial JSON files may not exist for all stocks
(the scanner writes them conditionally -- see `fetch_data.py` line ~637). And the
`monthlyCloses` array in `stocks.json` is only 24 entries (2 years), which is enough for
1m/3m/6m/12m lookbacks but not for longer windows.

### Strategy comparison

| Strategy | Pros | Cons | Recommendation |
|---|---|---|---|
| **yfinance bulk download** (via `yf.download(tickers, period="2y", interval="1mo")`) | Already used in `get_prices.py` pattern; no new dependencies; deterministic per snapshot date | Rate limits on 6602 tickers; yfinance may throttle; single-batch download of 6602 tickers may fail | **Primary recommendation** -- use the existing per-ticker `history()` pattern already in `fetch_data.py`, not a bulk download |
| **Supabase storage** | Centralized; queryable; survives redeploys | Requires Supabase credentials (`.env.local`); adds network dependency; not currently used for price history | Not recommended for this task -- adds operational complexity for a deterministic offline computation |
| **Polygon.io** | High-quality data; adjustable lookback | Requires paid API key; new dependency; violates "no new network calls in scoring" | Not recommended -- overkill for monthly closes; yfinance is free and already integrated |
| **Existing `financials/{TICKER}.json` files** | Already on disk; no fetch needed | May be stale or missing for many tickers; only 24 months of data | **Fallback** -- use as cache, re-fetch only missing tickers |

### Recommended approach

**T3a: Write a standalone `scripts/fetch_price_history.py`** that:

1. Reads the list of tickers to fetch from `paradigm_scores.json` (all keys = all stocks).
2. For each ticker, calls `yf.Ticker(ticker).history(period="3y", interval="1mo")` to get
   36 monthly closes (3 years gives us 12m lookback + 2 years of history for MA calculations).
3. Stores the result in a single `public/data/price_history.json` file with schema:
   ```json
   {
     "snapshot_date": "2026-05-24",
     "fetched_at": "2026-05-24T12:00:00Z",
     "prices": {
       "NVDA": [12.34, 13.56, ...],
       "AMD": [98.76, 101.23, ...]
     }
   }
   ```
4. Uses the same `yfinance` library already in `requirements.txt` (no new dependencies).
5. Is callable standalone: `python scripts/fetch_price_history.py`.

**Rationale:** This is a separate pre-compute step (not scoring), so it does not violate the
"no network calls in scoring" constraint. The existing `fetch_data.py` already does this per
ticker during the full scanner run, but extracting it into a dedicated script makes the
momentum computation independent of the full scanner.

---

## 2. Storage Shape

### File format and location

| Property | Value |
|---|---|
| **File** | `public/data/price_history.json` |
| **Format** | JSON object with `snapshot_date`, `fetched_at`, and `prices` keys |
| **Schema** | See above |
| **Expected size** | ~6602 tickers x 36 floats = ~237,672 numbers, ~2-3 MB uncompressed |
| **Refresh cadence** | Weekly (or on-demand before each paradigm scoring run) |
| **Backward compat** | The existing `metrics.monthlyCloses` in `stocks.json` is NOT modified; this is a new file |

### Schema detail

```json
{
  "snapshot_date": "2026-05-24",
  "fetched_at": "2026-05-24T12:00:00Z",
  "prices": {
    "NVDA": [34.56, 35.12, 33.89, ...],
    "AAPL": [178.23, 180.45, 179.12, ...]
  }
}
```

- `snapshot_date`: The date of the last close in the data (used for determinism).
- `fetched_at`: When the data was actually fetched (for audit).
- `prices`: Dict keyed by ticker symbol, values are arrays of monthly close prices
  **oldest first** (index 0 = 36 months ago, index -1 = most recent close).
  This ordering convention matches the existing `monthlyCloses` in `stocks.json` which is
  **newest first** (see `stocks.json` line ~30 for NNOX: `[7.34, 8.62, ...]` where 7.34 is
  the oldest). **Important:** The design doc proposes oldest-first for the new file to make
  lookback indexing intuitive (index `-1` = latest, index `-12` = 12 months ago), but the
  implementation should be consistent. The existing `monthlyCloses` is newest-first.

### Why not per-ticker files?

The existing `financials/{TICKER}.json` pattern stores per-ticker data, but for momentum
computation we need random access to all tickers' histories simultaneously (for universe
median calculations). A single file is simpler and faster for this use case.

---

## 3. Universe Scoping

### Options

| Option | Count | Pros | Cons |
|---|---|---|---|
| **All 6602 stocks** | ~6602 | Complete; no edge cases; future-proof | Slowest fetch; ~2/3 of data never used for paradigm scoring |
| **Only tagged stocks** (pdm_themes non-empty) | ~414 (estimated from `paradigm_scores.json`) | Fastest; minimal data | Misses stocks that may be tagged later; cannot compute universe-relative strength properly |
| **Tagged + seed tickers + seed_adjacent** | ~500-600 | Covers all current and near-future tagged stocks | Still misses universe-relative context |
| **All stocks with reverse object** | ~6602 (most have reverse) | Same as all stocks | No benefit over all stocks |

### Recommendation

**Fetch for all 6602 stocks.** Rationale:

1. **Universe-relative strength** (Q4 below) requires knowing the median return of ALL
   stocks, not just tagged ones. If we only fetch tagged stocks, we cannot compute whether
   a stock is in the top quartile of momentum.
2. **The fetch is already done** by `fetch_data.py` for all stocks. The new
   `fetch_price_history.py` script will simply replicate this for the specific purpose of
   momentum computation.
3. **Storage is cheap** (~2-3 MB for 6602 x 36 floats).
4. **Future-proofing:** New theme tags (WS1-T2 updates) won't require re-fetching history.

**Trade-off acknowledged:** Fetching 6602 tickers from yfinance at 1 request per ticker
takes ~30-60 minutes with rate limiting. This is acceptable for a weekly pre-compute step.

---

## 4. Momentum Computation

### Formula

For each stock, compute a **composite momentum score** as the weighted sum of returns over
four lookback windows, then normalize to a 0-100 scale.

#### Step 1: Raw returns per window

Let `P[i]` be the monthly close price at index `i` (oldest-first convention in the new file).

| Window | Lookback months | Return formula | Weight |
|---|---|---|---|
| 1-month | 1 | `(P[-1] / P[-2]) - 1` | 0.10 |
| 3-month | 3 | `(P[-1] / P[-4]) - 1` | 0.20 |
| 6-month | 6 | `(P[-1] / P[-7]) - 1` | 0.30 |
| 12-month | 12 | `(P[-1] / P[-13]) - 1` | 0.40 |

Weights favor longer windows (12m > 6m > 3m > 1m) to reduce noise, consistent with the
academic literature on momentum factor construction (Jegadeesh & Titman 1993, Asness 2014).

#### Step 2: Relative strength (cross-sectional ranking)

Raw returns are not directly comparable across stocks because they are influenced by
overall market movements. Instead, convert each raw return to a **percentile rank** against
the full universe:

```
rank_1m  = percentile(raw_return_1m, all_raw_returns_1m)  # 0.0 to 1.0
rank_3m  = percentile(raw_return_3m, all_raw_returns_3m)
rank_6m  = percentile(raw_return_6m, all_raw_returns_6m)
rank_12m = percentile(raw_return_12m, all_raw_returns_12m)
```

Then the composite raw momentum score is:

```
raw_momentum = (0.10 * rank_1m) + (0.20 * rank_3m) + (0.30 * rank_6m) + (0.40 * rank_12m)
```

This produces a value in [0.0, 1.0] where 0.5 is the universe median.

#### Step 3: Normalize to 0-100

```
pdm_momentum_score = round(raw_momentum * 100)
```

This gives a score of ~50 for a median-momentum stock, ~90+ for top-decile momentum, and
~10- for bottom-decile.

#### Alternative: SPY-relative vs universe-relative

| Method | Pros | Cons |
|---|---|---|
| **Universe-relative (recommended)** | Captures stock-specific momentum; not biased by sector beta | Requires full universe data |
| **SPY-relative** | Simpler; controls for market beta | A stock that is down 5% while SPY is down 10% looks like it has positive momentum, which is misleading |
| **Sector-relative** | Controls for sector rotation | Requires sector classification for all stocks; more complex |

**Recommendation: Universe-relative.** It is the standard approach in factor investing and
does not require any additional data beyond the price history itself.

### Handling missing data (newly listed stocks)

- If a stock has fewer than 13 monthly closes (needed for 12m lookback), use only the
  available windows and re-weight proportionally.
- If a stock has fewer than 2 monthly closes, set `pdm_momentum_score = null` and add
  `"insufficient_history"` to `pdm_flags`.
- Example: A stock listed 4 months ago has closes for months [-4, -3, -2, -1]. Use 1m
  (weight 0.10) and 3m (weight 0.20). Re-normalize: 1m weight = 0.10/0.30 = 0.33,
  3m weight = 0.20/0.30 = 0.67. The 6m and 12m windows are skipped.

---

## 5. Breadth Computation

### Formula

For each theme, compute the **percentage of tagged members whose current price is above
their N-day moving average**.

```
breadth_theme = (count of theme members where price > MA_N) / (total theme members) * 100
```

Where:
- `price` = the latest monthly close (`P[-1]`)
- `MA_N` = the N-month simple moving average of monthly closes
- `N` = 10 months (suggested; aligns with the existing `monthlyMa20` which is a 20-month MA,
  but 10 months is more responsive for momentum signals)

### Weight in composite score

The breadth score is a **separate field** (`pdm_breadth_score`) stored at the theme level
in a new `paradigm_momentum.json` file (or appended to `paradigm_scores.json`). It is NOT
stored per stock.

The composite `pdm_momentum_score` for a stock is:

```
pdm_momentum_score = 0.70 * stock_momentum + 0.30 * theme_breadth
```

Where:
- `stock_momentum` = the per-stock momentum score from Q4 (0-100)
- `theme_breadth` = the breadth score for the stock's primary theme (0-100)

If a stock has no primary theme, `pdm_momentum_score = stock_momentum` (breadth weight = 0).

### Why 70/30 split?

The stock-level momentum is the primary signal (empirically stronger). The breadth component
adds a "rising tide lifts all boats" adjustment: if most members of a theme have positive
momentum, the theme is likely in a genuine up-cycle, not just a single-stock anomaly.

---

## 6. Per-Stock vs Per-Theme

### Recommendation: Per-stock score, with theme-level aggregation

**Each tagged stock gets its own `pdm_momentum_score`.** The score lives on the stock's
paradigm object (in `stocks.json` and `paradigm_scores.json`), not at the theme level.

Rationale:

1. **The existing schema already has `pdm_momentum_score` per stock** (see
   `score_paradigm.py` line 33: `"pdm_momentum_score": None`). Changing to theme-level
   would require a schema change.
2. **The frontend displays per-stock data.** The `lib/data-service.ts` and
   `lib/blueprint.ts` files show that scores are consumed per ticker, not per theme.
3. **A theme-level score can always be derived** by averaging member scores. Storing it
   per stock gives more flexibility (e.g., sorting stocks within a theme by momentum).

**Theme-level aggregation** (for breadth and for the operator dashboard) is computed on the
fly or stored in a separate `paradigm_momentum.json` file with schema:

```json
{
  "ai_compute": {
    "member_count": 23,
    "mean_momentum": 67.3,
    "median_momentum": 71.0,
    "breadth_pct": 78.3,
    "top_momentum": ["NVDA", "MRVL", ...],
    "bottom_momentum": ["INTC", ...]
  },
  ...
}
```

---

## 7. Determinism + Caching

### Snapshot dating

The momentum computation is deterministic given a fixed price history snapshot. The
`price_history.json` file contains a `snapshot_date` field that records the date of the
last close in the data. The momentum computation script reads this date and writes it into
the paradigm scores as metadata.

### Run-to-run reproducibility

1. The `fetch_price_history.py` script writes `price_history.json` with a `snapshot_date`.
2. The momentum computation script (`score_momentum.py`) reads this file and computes scores.
3. If the same `price_history.json` is used, the same scores are produced (deterministic).
4. If a new `price_history.json` is fetched (new snapshot), scores may change -- this is
   expected and correct.

### Caching strategy

- `price_history.json` is the cache. Re-fetch only when a new snapshot is needed.
- The momentum computation script checks if `price_history.json` exists and is newer than
  a configurable threshold (default: 7 days). If not, it warns but does not auto-fetch
  (the operator runs `fetch_price_history.py` explicitly).
- The paradigm scoring pipeline (`score_paradigm.py`) reads `pdm_momentum_score` from
  `paradigm_scores.json` if it is already populated, and skips momentum computation.
  To force recompute, delete `paradigm_scores.json` or pass a `--force` flag.

---

## 8. Build Sequence (PR-sized sub-tasks)

### T3a: Price-history fetcher

**Scope:** New script `scripts/fetch_price_history.py`

- Reads all tickers from `paradigm_scores.json` (or a configurable list).
- For each ticker, calls `yf.Ticker(ticker).history(period="3y", interval="1mo")`.
- Writes `public/data/price_history.json` with `snapshot_date`, `fetched_at`, `prices`.
- Handles rate limiting (1 request per ticker, with 0.5s delay between requests).
- Handles errors gracefully (missing tickers, network failures) -- logs warnings, continues.
- **Files touched:** New file only. No modifications to existing scripts.
- **Estimated size:** ~200 lines.
- **Dependencies:** `yfinance` (already in requirements).

### T3b: Momentum computation

**Scope:** New script `scripts/score_momentum.py`

- Reads `public/data/price_history.json`.
- For each stock in `paradigm_scores.json`, computes:
  - Raw returns for 1m, 3m, 6m, 12m windows.
  - Cross-sectional percentile ranks against the full universe.
  - Weighted composite score (0-100).
  - Handles missing data (newly listed stocks).
- Writes `pdm_momentum_score` into each stock's paradigm object in `stocks.json` and
  `paradigm_scores.json`.
- **Files touched:** `scripts/score_momentum.py` (new), `stocks.json` (modified),
  `paradigm_scores.json` (modified).
- **Estimated size:** ~250 lines.
- **Dependencies:** None beyond stdlib + `json`.

### T3c: Breadth computation

**Scope:** Extend `scripts/score_momentum.py` (or a separate `scripts/score_breadth.py`)

- Reads the updated `paradigm_scores.json` (with `pdm_momentum_score` populated).
- For each theme, computes:
  - `breadth_pct` = % of members with price > 10-month MA.
  - `mean_momentum`, `median_momentum` for the theme.
- Writes `public/data/paradigm_momentum.json` with theme-level aggregates.
- **Files touched:** `scripts/score_momentum.py` (extended) or new `scripts/score_breadth.py`,
  `public/data/paradigm_momentum.json` (new).
- **Estimated size:** ~100 lines.

### T3d: Wire into `score_paradigm.py`

**Scope:** Modify `scripts/score_paradigm.py` to call momentum computation as a post-step.

- After membership tagging, call `score_momentum.compute()` (or shell out to the script).
- This is optional -- the momentum script can also be run standalone. But wiring it in
  makes the paradigm pipeline a single command.
- **Files touched:** `scripts/score_paradigm.py` (add ~5 lines to call momentum after
  membership tagging).
- **Estimated size:** ~5 lines.

### Alternative: Merge T3b + T3c

If preferred, T3b and T3c can be merged into a single `scripts/score_momentum.py` that
computes both per-stock momentum and theme-level breadth in one pass. This reduces the
number of PRs from 4 to 3.

**Recommended PR split:** 3 PRs (T3a, T3b+T3c merged, T3d).

---

## Comparison Table: Price-History Acquisition Strategies

| Strategy | Data source | New deps? | Speed | Deterministic? | Storage | Complexity |
|---|---|---|---|---|---|---|
| **yfinance per-ticker** (recommended) | yfinance | None (already used) | ~30-60 min for 6602 tickers | Yes (per snapshot) | ~2-3 MB JSON | Low |
| **yfinance bulk download** | yfinance | None | ~2-5 min (single HTTP request) | Yes | ~2-3 MB JSON | Medium (batch may fail for 6602 tickers) |
| **Supabase** | Supabase DB | `supabase` py lib (already used for logging) | Fast (DB query) | Yes (if snapshot table) | DB table | High (schema migration, credentials) |
| **Polygon.io** | Polygon REST API | `polygon` or `requests` | Fast (bulk endpoint) | Yes | ~2-3 MB JSON | Medium (API key, new vendor) |
| **Existing financials JSON** | `public/data/financials/*.json` | None | Instant (already on disk) | Yes (stale data) | Already stored | Lowest (but data may be incomplete) |

---

## Worked Example: `ai_compute` Theme

### Setup

- **Theme:** `ai_compute` (AI Compute Infrastructure)
- **Seed tickers** (from `paradigm_config.json`): NVDA, AMD, AVGO, TSM, ASML, AMAT, KLAC,
  LRCX, MU, MRVL, ARM, SMCI, ANET, DELL, CRDO
- **Tagged members** (from `paradigm_scores.json`): Let's assume 23 tagged members including
  the 15 seeds plus 8 keyword/GICS matches (e.g., INTC, QCOM, etc.)

### Step 1: Fetch price history

Run `python scripts/fetch_price_history.py`. For each of the 23 tickers, fetch 36 monthly
closes from yfinance. Store in `price_history.json`.

### Step 2: Compute per-stock momentum

For NVDA (illustrative prices, oldest first):

| Month | Close |
|---|---|
| -36 (3 years ago) | 150.00 |
| ... | ... |
| -13 (12 months ago) | 450.00 |
| -7 (6 months ago) | 600.00 |
| -4 (3 months ago) | 700.00 |
| -2 (1 month ago) | 800.00 |
| -1 (latest) | 850.00 |

Raw returns:
- 1m: (850/800) - 1 = +6.25%
- 3m: (850/700) - 1 = +21.43%
- 6m: (850/600) - 1 = +41.67%
- 12m: (850/450) - 1 = +88.89%

Now compute percentile ranks against all 6602 stocks. Suppose:
- 1m rank: 0.75 (top 25%)
- 3m rank: 0.85 (top 15%)
- 6m rank: 0.90 (top 10%)
- 12m rank: 0.95 (top 5%)

Raw momentum = (0.10 * 0.75) + (0.20 * 0.85) + (0.30 * 0.90) + (0.40 * 0.95)
             = 0.075 + 0.170 + 0.270 + 0.380
             = 0.895

pdm_momentum_score = round(0.895 * 100) = **90**

For INTC (illustrative, declining):

| Window | Return | Rank |
|---|---|---|
| 1m | -2.1% | 0.30 |
| 3m | -8.5% | 0.20 |
| 6m | -15.3% | 0.15 |
| 12m | -30.0% | 0.10 |

Raw momentum = (0.10 * 0.30) + (0.20 * 0.20) + (0.30 * 0.15) + (0.40 * 0.10)
             = 0.030 + 0.040 + 0.045 + 0.040
             = 0.155

pdm_momentum_score = round(0.155 * 100) = **16**

### Step 3: Compute breadth

For each of the 23 members, check if latest close > 10-month MA.

Suppose 18 of 23 are above their 10-month MA:
- breadth_pct = 18/23 * 100 = **78.3%**

### Step 4: Compute composite per-stock score

For NVDA:
- stock_momentum = 90
- theme_breadth = 78.3
- pdm_momentum_score = 0.70 * 90 + 0.30 * 78.3 = 63.0 + 23.5 = **86**

For INTC:
- stock_momentum = 16
- theme_breadth = 78.3
- pdm_momentum_score = 0.70 * 16 + 0.30 * 78.3 = 11.2 + 23.5 = **35**

### Expected output range

| Score range | Interpretation |
|---|---|
| 80-100 | Strong momentum (top quintile) |
| 60-79 | Above-average momentum |
| 40-59 | Median momentum |
| 20-39 | Below-average momentum |
| 0-19 | Weak momentum (bottom quintile) |

---

## Open Questions for the Operator

1. **Lookback window weights.** The proposed weights (1m=0.10, 3m=0.20, 6m=0.30, 12m=0.40)
   favor longer windows. Should the 12m window be capped at 11 months to avoid overlapping
   with the 6m window? (The 12m return includes the 6m return period, which introduces
   autocorrelation. A common fix is to use 12-1 month momentum, i.e., return from 12 months
   ago to 1 month ago, skipping the most recent month.) **Recommendation:** Use 12-1 month
   momentum (skip the most recent month for the 12m window) to reduce short-term reversal
   noise, consistent with the academic literature.

2. **Breadth MA period.** The proposed 10-month MA is a heuristic. Should it be configurable
   per theme? For fast-moving themes like `ai_compute`, a shorter MA (e.g., 5 months) may
   be more responsive. For slow-moving themes like `nuclear_renaissance`, a longer MA (e.g.,
   20 months) may be more appropriate. **Recommendation:** Start with 10 months for all
   themes, tune after observing results.

3. **Breadth weight in composite.** The proposed 70/30 split (stock momentum / theme breadth)
   is a starting point. Should it be adjustable per theme? For concentrated themes with few
   members (e.g., `quantum_computing` with ~5 members), breadth is noisy and should be
   downweighted. **Recommendation:** Use a formula: breadth_weight = min(0.30, sqrt(n_members)
   / 20). For 5 members: sqrt(5)/20 = 0.11. For 23 members: sqrt(23)/20 = 0.24. Cap at 0.30.

4. **Universe for percentile ranking.** Should the percentile rank be computed against all
   6602 stocks, or only against stocks with a reverse object (~6602, same set), or only
   against paradigm-tagged stocks (~414)? **Recommendation:** All 6602 stocks, because the
   momentum factor is most robust when computed against the broadest universe. The tagged
   subset is too small and biased.

5. **International stocks.** The current `fetch_data.py` handles US stocks via yfinance.
   International stocks (Korea, Taiwan) use `FinanceDataReader` and may not have the same
   `history()` interface. Should momentum be computed for international stocks? If yes, what
   data source? **Recommendation:** Defer international momentum to a follow-up task. The
   initial implementation covers only US stocks (the ~6602 in `stocks.json`).

6. **Snapshot dating convention.** The `snapshot_date` in `price_history.json` should be the
   date of the last close in the data. But yfinance's `history()` returns data with the
   timestamp of the close date. Should we use the last close date from the data, or the
   current date when the fetch was run? **Recommendation:** Use the last close date from the
   data (e.g., if the last monthly close is dated 2026-05-23, snapshot_date = "2026-05-23").
   This ensures that two fetches on the same day produce the same snapshot_date if the
   market has not moved.

7. **Should the momentum script be integrated into `score_paradigm.py` or run separately?**
   Integration makes the pipeline a single command but couples the momentum computation to
   the membership tagging. Separation allows independent debugging and re-runs.
   **Recommendation:** Keep separate (`scripts/score_momentum.py`), with an optional
   integration hook in `score_paradigm.py` that calls it if the price history file exists.

---

## Appendix: Key file references

| File | Lines | Relevance |
|---|---|---|
| `scripts/fetch_data.py` | 409-417 | Existing monthly close fetch pattern (`yf_ticker.history(period="2y", interval="1mo")`) |
| `scripts/fetch_data.py` | 634 | `monthlyCloses` stored in `stocks.json` metrics |
| `scripts/fetch_data.py` | 459 | `Monthly_Closes` stored in per-ticker financial JSON |
| `scripts/get_prices.py` | 1-50 | Existing yfinance batch download pattern (`yf.download()`) |
| `scripts/score_paradigm.py` | 33 | `pdm_momentum_score` field (currently null) |
| `scripts/score_paradigm.py` | 1-30 | IO pattern: `load_json`, `write_json`, additive-only |
| `scripts/paradigm_config.json` | 1-30 | 9 themes with seed_tickers and gics_industries |
| `public/data/paradigm_scores.json` | (entire file) | 414+ tagged stocks with `pdm_momentum_score: null` |
| `public/data/stocks.json` | (entire file) | ~6602 stocks, each with `metrics.monthlyCloses` (24 entries, newest first) |
| `scripts/score_reverse.py` | 935-936, 1280 | Existing use of `Monthly_Closes` for drawdown computation |
| `lib/data-service.ts` | 1-200 | Frontend consumes scores per ticker from `stocks.json` |
| `lib/blueprint.ts` | 1-50 | TypeScript interfaces for stock data (no paradigm fields yet) |
| `docs/reverse_engine/data_contract.md` | (entire file) | Existing data contract conventions |

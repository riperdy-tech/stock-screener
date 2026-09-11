# RS2 / Stock-Screener — Full System Audit & Handoff Brief

**Purpose.** Self-contained briefing for an AI asked to do deep research on this system.
It covers the entire pipeline from raw data ingestion to portfolio recommendation, every
finding from a read-only audit, the proposed fixes, and an explicit record of what is
measured versus inferred versus unknown.

**Compiled** 2026-09-10. **Data as of** 2026-09-09 post-close. **Repos:** `riperdy-tech/stock-screener`
(pipeline + web desk), `riperdy-tech/rs2-local` (LLM depth engine, runs on operator's PC).
Read-only audit; no code was modified. Line references are to `origin/main` as of 2026-09-09.

**Domain.** US equities. Long-only. Real money mirrored to a Korea Investment & Securities
(KIS) account. Paper ledgers on a NAV=100 base, cost model 25 bps/side (the real KIS
commission, raised from 10 bps in commit `35f9dfd456`).

---

## 0. HOW TO READ THIS DOCUMENT

Claims are tagged:

- **[MEASURED]** — computed from repository files; reproducible (see §11).
- **[COUNTERFACTUAL]** — the pipeline re-run with one input changed, result observed.
- **[CODE]** — established by reading source; not a statistical claim.
- **[INFERRED]** — reasoning not verified against data.
- **[UNKNOWN]** — open.

**Nothing in this document is validated against realised returns.** The 10-year price cache
is absent from the repo (gitignored) and market-data egress was blocked during the audit,
so no backtest could be run. Every claim is about *construction soundness*, not profitability.
Treat any performance number as descriptive of a short historical window, never as a forecast.

**Three claims in this audit were made and then retracted.** They are recorded in §10 so a
reviewer can see the failure modes and check whether the surviving claims share them.

---

## 1. SYSTEM OVERVIEW

Two books trade off the same upstream pipeline:

| Book | Ledger key | UI label | Selection gate | Size |
|---|---|---|---|---|
| Quant | `equal` | (quant equal) | `fct_band == "research_now"` (top 3%) | 54 names |
| AI | `rn_depth` | **RS2 AI** (`lib/desk/nav.ts:36`) | LLM depth verdict `direction == "undervalued"` | 35 names |

Both are equal-weighted. The real KIS account mirrors the `equal` ledger by default
(`docs/KIS_SYNC.md`; `KIS_LEDGER` env var can point elsewhere).

**Critical structural fact [CODE].** The LLM depth engine only ever analyses names the quant
screener has already banded `research_now` or `watchlist` (`rs2-local/depth_membership.py:31`).
Any bias in the screener becomes a hard ceiling on the AI book. The AI cannot pick what it
never sees.

---

## 2. THE PIPELINE, STAGE BY STAGE

Orchestrated by `scripts/run_chain.py`. Order:

```
fetch_data.py            → stocks.json, price_history.json, fundamentals_*.json
fetch_macro_state.py     → macro_state.json  (FRED: BAA10Y, DGS10, NFCI, T10Y2Y, HY OAS)
score_reverse.py         → reverse_scores.json   (staged eliminator + survivability/quality/data-quality)
score_paradigm.py        → paradigm_scores.json  (theme/regime context)
score_factors.py         → factor_scores.json    (5-factor composite → bands)  ← THE FILTER
build_valuation_models.py→ valuation_models.json (reverse-DCF implied growth)
build_portfolio_plan.py  → portfolio_plan.json   (suggested plan; caps 25% sector / 30% theme)
build_momo_plan.py       → portfolio_plan_momo.json
track_paper_portfolios.py→ paper_ledgers.json    (advances all ledgers)
```

Running **separately on the operator's PC** (repo `rs2-local`), publishing back into the
screener repo:

```
depth_membership.py   → daily RN+WL membership snapshot, dwell computation
depth_triggers.py     → event queue (8-K, earnings filing, >8% price move, dwell, rotation)
depth_pipeline.py     → per-name LLM run (~1.3h median), produces IV band
orchestrate_depth.py  → sweep driver → publishes depth_overlay.json
valuation_backbone.py → port of build_valuation_models.py, primes the LLM prompt
```

### 2.1 Data gathering
`fetch_data.py` uses yfinance plus SEC companyfacts. ~6,917 tickers carry a reverse record.
`price_history.json` holds **24 monthly closes per ticker** (5,435 tickers with a full 24).
This is the *only* price history in the repo. The backtest's 10-year monthly cache
(`backtest_prices.json`) is **gitignored and absent**.

**Data-integrity note [MEASURED].** Monthly series are broadly time-aligned — GOOG/GOOGL
correlate at 0.999, JPM/BAC at 0.883, V/MA at 0.822 — but per-ticker noise exists: XOM/CVX
correlate at 0.016, which is not credible. Treat individual series as usable, occasional
series as corrupt.

### 2.2 The reverse engine (`score_reverse.py`)
Staged eliminator producing `rev_survivability`, `rev_quality`, `rev_data_quality` (0–5).
Rejects here become a hard veto downstream (`fct_veto = "reverse_engine_reject"`).

**[MEASURED] Veto rates by sector** (of the 6,917 population):
Utilities 87.8%, Healthcare 75.8%, Energy 69.5%, Financial Services 69.1%, Basic Materials
66.4%, Comm. Services 66.2%, Real Estate 62.2%, Consumer Cyclical 60.9%, Technology 59.4%,
Consumer Defensive 59.0%, Industrials 58.7%.

`stage1_eliminators` hard-rejects any name with `rev_data_quality < 2` (`score_reverse.py:284`).

### 2.3 The factor screener (`score_factors.py`) — THE CRITICAL STAGE
Five pillars, each built from sub-metrics, each **z-scored within GICS sector**
(`sector_neutral_z`, `MIN_SECTOR_GROUP = 15`):

| Pillar | Sub-metrics |
|---|---|
| value | fcf_yield, owner_yield, ebit_yield, earnings_yield (4) |
| quality | rev_quality, gm_stability, neg_accruals, f_score (4) |
| momentum | skip_12_1, high_52w (2) |
| revisions | analyst estimate revisions pillar (1) |
| lowvol | neg_vol = −σ(monthly returns) (1) |

Pillar z = `mean_of_available(subs)`. Composite `cz` = mean of available pillars.
`REQUIRED_FACTORS = (value, quality, momentum)`; missing any → `insufficient_factors`.

Then (`score_factors.py:411-433`):
```
pct   = universe-wide percentile of cz            (0-100)
final = pct × survivability × data_quality × forensic     ← line 418
re-rank on final → fct_percentile → bands
BANDS = {research_now: 97, watchlist: 90, monitor: 70}    ← line 68
```
Haircuts (`score_factors.py:405-407`):
- survivability = `0.7 + 0.3 × (rev_survivability/100)`, default 0.7 if missing
- data_quality  = `min(1.0, 0.8 + 0.04 × rev_data_quality)`, default 0.8 if missing
- forensic      = 0.85 if a single forensic flag fired, else 1.0

**[MEASURED] Funnel:** 6,917 population → 1,693 scored → 169–170 banded (top 10%).

### 2.4 The depth queue and LLM analysis
Queue = names banded `research_now` ∪ `watchlist`. Per-name cost ~1.3h median, ~11.6
names/day capacity. Re-run triggers (`DEPTH_ORCHESTRATOR_CADENCE_20260825.md` §3): 8-K filed,
earnings filing, price >8% from verdict price, boundary/dwell, 90-day rotation floor.

**Hysteresis constants (§4 of that doc):** entry dwell 5 trading days, exit-review dwell 3
days, retire dwell 15 days, post-run cooldown 7 days, freshness bar 21 days. **These govern
which name gets RE-ANALYSED — not the trading signal.**

**The verdict rule (`depth_pipeline.py:169-174`) [CODE]:**
```python
if   price > ivs[-1]: d = "overvalued"     # above the whole IV band
elif price < ivs[0]:  d = "undervalued"    # below the whole IV band
else:                 d = "hold"
```
`scheme = "band_direction_v1"`. §2 of the cadence doc mandates a **daily 08:00 free pass that
recomputes price-vs-band direction on all 170 names with no model** and republishes
`depth_overlay.json`. **The verdict is therefore a live function of price against a static
band, with no hysteresis.**

### 2.5 Portfolio construction (`track_paper_portfolios.py`)
```python
def depth_targets(factor, depth):        # line 165
    names = [t for t,e in factor.items()
             if e.get("fct_rank") is not None
             and not (e.get("fct_veto") or e.get("fct_llm_veto"))
             and depth.get(t, {}).get("direction") == "undervalued"]
    weight = 100.0 / max(len(names), MIN_EQUAL_NAMES)   # MIN_EQUAL_NAMES = 8
    return {t: weight for t in names}
```
**No sector cap. No position cap. No holding period. No correlation logic.** The `equal`
sleeve is the same shape, gated on `fct_band == "research_now"`.

By contrast `build_portfolio_plan.py:60-61` caps sectors at 25% and themes at 30%, and
`build_momo_plan.py` caps sectors at 30% — but those govern the *suggested plan* and the
retired `plan/plan2/plan3` ledgers, not the two live books.

### 2.6 Execution
`scripts/sync_kis_portfolio.py` reconciles the chosen ledger's target weights into the KIS
account with limit orders. Dry-run by default; `--execute` required; real accounts also need
`--confirm-real`. Reconciliation, not trade-replay: missed runs and partial fills self-heal.

---

## 3. THE TRIGGERING EVENT

**2026-09-08: RS2 AI fell 2.015% in one session** (NAV 99.7988 → 97.7882), its worst day
since the 2026-08-25 restart (prior worst −0.63%). The quant book fell 0.914%.

**[MEASURED] Attribution.** NAV reconstructs exactly as Σ(shares × marks) — verified against
three independent snapshots. Mark-to-market on the carried book explains −2.000 pts; trading
and costs explain −0.014.

| Sector | Weight | Contribution |
|---|---|---|
| Healthcare | 40.0% | −88 bps |
| Consumer Cyclical | 17.1% | −55 bps |
| Technology | 17.1% | −49 bps |
| Industrials | 17.1% | 0 bps |

27 of 35 names fell. It was a rotation, not a selloff: measured midday against the prior
close, SOXX +2.58% and DRAM +3.41% while SPY −0.32% and IWM −0.07%. The book holds **zero
semiconductors and zero computer hardware** across its 24 industries, so it took the entire
downside of the rotation and none of the upside. Credit was calm (HY OAS 2.68%, NFCI −0.558).

---

## 4. WHERE THE CONCENTRATION COMES FROM

**[MEASURED] Sector share at each pipeline stage:**

| Sector | Universe (scored, n=1693) | Screener band (n=170) | Depth verdict (n=33) | In book (n=35) |
|---|---|---|---|---|
| Healthcare | 11.2% | 31.2% | 33.3% | 40.0% |
| Technology | 16.8% | 30.0% | 27.3% | 17.1% |
| Industrials | 15.5% | 12.9% | 12.1% | 17.1% |
| Consumer Cyclical | 10.5% | 12.4% | 18.2% | 17.1% |
| Financial Services | 22.9% | 1.8% | 0.0% | 0.0% |
| Real Estate | 5.1% | 0.6% | 0.0% | 0.0% |
| Basic Materials | 4.8% | 0.6% | 0.0% | 0.0% |
| Energy | 3.8% | 0.0% | 0.0% | 0.0% |
| Utilities | 0.4% | 0.0% | 0.0% | 0.0% |

Almost the entire distortion enters at **universe → band**. Healthcare gains 2.78×,
technology 1.79×; financials collapse to 0.08×; energy and utilities to zero. **The LLM is
picking sensibly from a menu already narrowed to healthcare and software.**

---

## 5. FINDINGS

### F10 — THE FILTER DOES NOT WEIGHT WHAT IT CLAIMS **[MEASURED]** ★ largest structural finding

`factor_weights.json` declares `equal_weight_robust5`, 0.2 per pillar, citing
DeMiguel-Garlappi-Uppal (2009) on 1/N. That is not what the code produces.

Each pillar is `mean_of_available(sub-metrics)`. Averaging k correlated z-scores shrinks
dispersion roughly as 1/√k_eff. Pillars with more sub-metrics end up with less cross-sectional
spread, and therefore less influence on a composite that is then ranked cross-sectionally.

| Pillar | Sub-metrics | Nominal weight | sd of pillar z | **Effective weight** |
|---|---|---|---|---|
| revisions | 1 | 20% | 0.759 | **35.4%** |
| momentum | 2 | 20% | 0.535 | 24.9% |
| quality | 4 | 20% | 0.402 | 18.7% |
| lowvol | 1 | 20% | 0.356 | 16.6% |
| **value** | **4** | **20%** | **0.094** | **4.4%** |

**Confirmed independently by discrimination power.** Mean pillar z of banded names minus
non-banded:

| Pillar | Gap (in-band − rest) |
|---|---|
| revisions | +0.697 |
| quality | +0.446 |
| momentum | +0.371 |
| lowvol | +0.197 |
| **value** | **+0.025** |

A 0.025σ gap is indistinguishable from removing value from the model. **The screen that
selects candidates for an intrinsic-value engine barely uses value**, and its largest
effective input is `revisions` — the pillar with 13% coverage, no point-in-time history, and
no way to validate it in the existing backtest.

The operator's own cadence doc (2026-08-25 §1) independently observed this:
> Quant composite weighting (what RN membership rewards): revisions 0.173, momentum 0.096,
> lowvol 0.086, value 0.066, quality 0.062. **Value is nearly the smallest weight** — quant RN
> and our intrinsic-value verdict measure *different things*.

**[COUNTERFACTUAL] Re-standardising each pillar to unit variance before combining:**
75 of 169 selected names change (56% overlap). Sector mix moves:

| Sector | Universe | As shipped | Re-standardised |
|---|---|---|---|
| Healthcare | 11.2% | 24.3% | **45.6%** |
| Technology | 16.8% | 34.3% | 12.4% |
| Financial Services | 22.9% | 3.6% | 5.9% |
| Industrials | 15.5% | 10.1% | 14.8% |

**Important: this fix makes concentration WORSE, not better.** It must ship with a sector cap.

### F-A — THE TOP BAND IS ANTI-PREDICTIVE **[MEASURED, weak sample]**

`public/data/rs2_verdict_outcomes.json` grades point-in-time verdicts against realised forward
returns. 600 graded verdict-horizons at 30 days; 252 remain after excluding
`research_cited == false` (the pre-2026-08-06 fabricated-research era). Window: June–July 2026,
one regime. The file's own caveats say these are descriptive, not evidence of edge.

Excess vs IWM, 30-day, clean rows:

| Band at analysis | n | Excess (obs-wt) | t | Name-weighted |
|---|---|---|---|---|
| watchlist | 145 | +0.58% | +0.55 | +0.66% |
| monitor | 15 | −0.54% | −0.18 | −0.54% |
| **research_now** | **75** | **−3.42%** | **−2.07** | **−4.12%** |

Cross-tabulated with the depth verdict:

| Combination | n | Excess | t | Win rate |
|---|---|---|---|---|
| **watchlist + undervalued** | 29 | **+9.14%** | +4.98 | 76% |
| research_now + fair | 32 | +1.99% | +0.88 | 62% |
| research_now + undervalued | 14 | −1.55% | −0.54 | 64% |
| watchlist + overvalued | 50 | −3.91% | −2.09 | 36% |
| **research_now + overvalued** | 28 | **−10.92%** | −3.90 | 11% |

All measured edge sits in *watchlist + undervalued*. None sits in the top band, which is
exactly what the `equal` book trades. Raw (non-excess) returns were negative across all bands,
so part of this is a falling-market window.

### F1 — TURNOVER **[MEASURED]**

| Book | Window | Turnover/yr | Cost/yr | Avg hold |
|---|---|---|---|---|
| RS2 AI | whole ledger ex-inception | 45.1× | 11.3 NAV pts | — |
| RS2 AI | last 5 sessions | 34.3× | 8.6 NAV pts | 6.0 d |
| RS2 AI | last 3 sessions | 31.6× | 7.9 NAV pts | — |
| Quant | whole ledger ex-inception | 15.0× | 3.7 NAV pts | 15.8 d |

**Trend is improving** (holding period doubled from 3.3 to 6.0 days) and matches the Aug 25
dwell work, which the cadence doc says "warms up over 5–15 days." Aug 25 + 15 = Sep 9.
Note the rn_depth ledger was created 2026-08-26 with inception backdated to 08-25, so **its
entire life is the post-revamp period — there is no pre-revamp baseline inside it.**

**Root cause [CODE + MEASURED].** Verdict = live price vs static band, recomputed daily, no
hysteresis. Across 6 consecutive sweeps (Sep 7 20:10 → Sep 9 08:07), 17 direction flips, of
which 5 occurred with price within 1% of the band edge:

| Ticker | From → To | Price | Band low | % to edge |
|---|---|---|---|---|
| M | undervalued → hold | 23.05 | 23.00 | 0.22% |
| CAH | undervalued → hold | 248.61 | 248.00 | 0.25% |
| ACA | undervalued → overvalued | 145.48 | (high 145.00) | 0.33% |
| CF | overvalued → hold | 133.35 | (high 134.00) | 0.49% |
| KFY | hold → undervalued | 85.35 | 86.00 | 0.76% |

Median price move between sweeps: 2.52%. Hysteresis suppression: ±2% → 29% of flips,
±5% → 47%, ±10% → 65%, ±15% → 82%. Flips beyond ~10% are genuine re-analyses (band moved).

**THE FIX ALREADY EXISTED AND WAS DELETED.** Commit `bf1877d5e9` (2026-08-04),
*"F-04 exit hysteresis to stop boundary churn"*: entry gate unchanged, held names retained
until a looser exit band, bearish/veto always hard-exits, 7 unit tests. Commit message records
a git-history replay benchmark at 0.25%/side: **"nets more than the hard cliff post-anchor and
cuts trades ~30%."** Removed by the 2026-08-26 depth migration (`9eedead6c3`) on this premise,
still present at `track_paper_portfolios.py:191`:
> The depth gate reads the FROZEN `direction` verdict — constant until the producer re-runs —
> so there is no daily cliff to churn across, and nothing for a hysteresis to protect.

That premise is contradicted by §2 of the operator's own cadence spec (daily price-vs-band
recompute on all 170 names). The cliff moved from margin-of-safety to the band comparison.

### F4 — DATA-QUALITY HAIRCUT PUNISHES ACCOUNTING CONVENTION **[COUNTERFACTUAL]**

`calculate_data_quality` (`score_reverse.py:179`) starts at 5 and deducts one point each for:
missing financial detail; missing Total_Debt/Total_Cash; **missing or non-positive EBITDA/EBIT
denominator**; **missing Free_Cash_Flow_TTM**; unknown sector/industry. Banks, insurers and
REITs do not report EBITDA or FCF — absent *by accounting convention*, scored identically to a
negligent filer.

| Sector | dq raw (of 5) | Resulting multiplier |
|---|---|---|
| Financial Services | 1.6 | 0.863 |
| Basic Materials / Energy / Utilities | 2.0 | 0.878–0.880 |
| Real Estate | 2.2 | 0.889 |
| Technology | 4.0 | 0.959 |
| Healthcare | 4.5 | 0.978 |
| Industrials | 4.7 | 0.989 |
| Consumer Defensive | 4.8 | 0.994 |

Because the haircut multiplies a percentile, it caps the reachable ceiling: a financial can
never exceed ~86 on a 0–100 scale regardless of merit. A second, harsher channel: stage-1 hard
rejects `dq < 2`, and financials average 1.6.

**[COUNTERFACTUAL] Removing only the dq haircut, re-ranking, top decile:**

| Sector | As shipped | No dq haircut | Universe |
|---|---|---|---|
| Basic Materials | 0.0% | 4.7% | 4.8% |
| Energy | 0.0% | 2.4% | 3.8% |
| Financial Services | 1.8% | 3.6% | 22.9% |
| Real Estate | 0.6% | 1.8% | 5.1% |
| Healthcare | 31.4% | 24.3% | 11.2% |

33 of 169 names swap. It fully explains the exclusion of basic materials and energy; it does
**not** reopen financials.

**Note:** an archetype carve-out already exists — the EBITDA deduction is skipped for
archetypes G/H, and `survivability_leverage_score` substitutes an Altman-Z proxy. So the issue
was recognised; the carve-out is keyed on archetype not sector and does not cover the FCF
deduction.

### F5 — rs2-local ALREADY SOLVED THIS; THE SCREENER DID NOT **[CODE]**

`rs2-local/valuation_backbone.py` routes balance-sheet financials by industry
(`PB_ROE_INDUSTRIES = ("bank","insurance","mortgage")`, excluding insurance brokers) to a
**P/B-ROE model**, and rate-regulated utilities (`REGULATED_UTILITY_INDUSTRIES = ("regulated",)`)
to a **justified-P/B model** with explicit `UTIL_COE = 0.07`. Its comments record the motivating
measurement: *58 of 116 utilities returned negative base cash flow* under the owner-earnings
DCF. Credit Services (V/MA) and Capital Markets deliberately stay on the reverse-DCF as
asset-light fee businesses.

This is substantially the sector-specific remedy F4 calls for, already built — but financials
die at F4 in the screener before the depth engine ever sees them.

### F2 — OVERLOADED WACC / COST-OF-EQUITY TABLE **[MEASURED]**

`build_valuation_models.py` solves for the growth a price implies:
```
base_cf = net income + D&A − capex     → LEVERED (net income is after interest)
target  = market capitalisation        → EQUITY value        ✓ correctly paired
rate    = sector WACC                  → FIRM-level rate     ✗ mismatched
```
Fallbacks inherit it: filing FCF = OCF − capex, and under US GAAP interest paid sits in
operating activities. A levered flow discounted to equity value requires **cost of equity**.

**The table is overloaded, not simply wrong.** `sector_wacc` (in `scripts/reverse_config.json`:
Tech 11, Healthcare 10, Cons Disc 10, Cons Staples 8, Industrials 9, Financials 10, Energy 11,
Materials 10, Utilities 7, Real Estate 8, Comm Svcs 10) is used as a **true WACC** in ROIC-spread
scoring at `score_reverse.py:489, :655, :754` (`roic − wacc`), which is textbook-correct and
requires a genuine WACC. But `rs2-local/valuation_backbone.py:172` documents the opposite intent:
> labelled WACC for historical continuity with the screener, but in THIS engine's equity framing
> they function as a COST-OF-EQUITY proxy — base_cf = NI + D&A − capex is net of interest…
> Pairing that flow with a true firm-level WACC and enterprise value was tried (2026-08-07),
> proven to double-count the debt claim, and reverted.

One table, two mutually exclusive definitions. Read as WACC it is right for ROIC and too low
for the DCF; read as Ke it is right for the DCF and too low for ROIC.

**[MEASURED] Impact under the WACC reading.** Reimplementation reproduced all 167 shipped
values to within 5×10⁻⁵ before any change. Substituting
`Ke = (WACC − Kd(1−t)·D/V) / (E/V)` with Kd = 5.5%, t = 21%, across 85 names with leverage data:

| Statistic | Value |
|---|---|
| Median debt / (debt + mcap) | 4.4% |
| Median implied-growth understatement | 0.81 pts |
| Mean | 1.02 pts |
| 90th percentile | 2.20 pts |
| Worst case (BMY) | 4.12 pts |
| Names biased bullish | 83 of 85 |

Only 4 of 84 verdict bands change (MMSI, EMR, TGT, TT), all more demanding. **But the error
scales with leverage** — illustrative, base_cf 100, priced at a reported 6%:

| Profile | D/V | WACC | Ke | Reported g | True g | Shift |
|---|---|---|---|---|---|---|
| current book median | 4% | 10.0% | 10.3% | 6.0% | 6.6% | +0.65 |
| typical industrial | 20% | 9.0% | 10.2% | 6.0% | 9.1% | +3.12 |
| utility / REIT | 40% | 8.0% | 10.4% | 6.0% | 13.0% | +7.03 |
| levered REIT | 55% | 8.0% | 12.5% | 6.0% | 18.0% | +11.98 |

**Sequencing consequence:** the book's low leverage is *a consequence of F4*. Fix sector
coverage first and you admit levered sectors where this error is 3–10× larger. **Fix the
discount rate before widening sector coverage.**

**Three copies of the same math exist:** `scripts/build_valuation_models.py`, `lib/dcf.ts`
(frontend workbench), `rs2-local/valuation_backbone.py`. The reverse-DCF is **still live** —
`run_chain.py:117` runs it with a soft invariant; only the desk *surfaces* were retired
(`74dc8d6e2d`). `lib/prompt-builder.ts` (unchanged since 2026-07-06) still primes the LLM with
implied growth and the expectations gap, and `rs2-local/rs2_data.py` does the same locally. So
the bias reaches RS2 AI's reasoning inputs. It does **not** reach the quant book, which never
reads `valuation_models.json`.

### F7 — ANALYST COVERAGE ACTS AS AN UNDECLARED BONUS **[MEASURED]**

Revisions coverage by sector (scored names): Technology 51%, Utilities 17%, Industrials 15%,
Comm Services 12%, Healthcare 11%, Energy 6%, Consumer Cyclical 4%, Financial Services 1%,
Real Estate 0%, Consumer Defensive 0%.

`mean_of_available` scores a name on the remainder rather than penalising a missing factor, and
where revisions *is* present its z is strongly positive. So **being covered is itself a lift**.

**[COUNTERFACTUAL]** Dropping revisions entirely: Technology's top-decile share 20.4% → 9.9%;
Healthcare *rises* 21.6% → 28.4%; Financials 1.6% → 2.3%.

**[INFERRED, contested]** The neglected-firm literature finds firms with *fewer* analysts earn
*higher* average returns, which would make this lift anti-predictive. The effect is contested
and may be size/liquidity. The sign is genuinely **[UNKNOWN]** in this universe.

### F3 — NO DIVERSIFICATION CONSTRAINT **[CODE + MEASURED]**

`depth_targets()` applies no sector, position or correlation limit; only `MIN_EQUAL_NAMES = 8`
as a concentration floor producing a cash residual when the panel is small.

**[MEASURED] But concentration barely affects variance.** Over 24 months of monthly returns,
average pairwise correlation across the 35 holdings is **0.074**; diversification ratio 3.16;
average single-name vol 32.5%.

| Composition | Annualised vol | Max drawdown (24m) |
|---|---|---|
| As held | 10.3% | −6.7% |
| 25% sector cap | 10.4% | −6.8% |
| 20% sector cap | 10.6% | −6.3% |

**[COUNTERFACTUAL] Sep-8 outcome under each cap variant** (single day, not a backtest):

| Configuration | Return | Difference | Cash |
|---|---|---|---|
| As held | −2.001% | — | 0.0% |
| 25% cap, redistribute | −1.874% | +0.13 pts | 0.0% |
| 30% cap, redistribute | −1.923% | +0.08 pts | 0.0% |
| 25% cap, hold cash | −1.673% | +0.33 pts | 15.0% |
| 30% cap, hold cash | −1.782% | +0.22 pts | 10.0% |

The cash variants look better only because they were out of the market on a down day.
**A sector cap reduces concentration; on this evidence it does not improve returns.**

Resulting weights under a 25% cap with redistribution: Healthcare 40.0→25.0, Industrials
17.1→19.0, Cons Cyclical 17.1→19.0, Technology 17.1→19.0, Comm Services 5.7→10.2, **Consumer
Defensive 2.9→8.0 (a single stock at 8%)** — a new single-name concentration.

**Implementation trap:** capping by *name count* does not work. Keeping the best 8 healthcare
names of 35 and equal-weighting the 29 survivors leaves healthcare at 27.6%, still over cap.
The cap must be applied to **weights** and iterated until every sector clears.

### F8 — THE BACKTEST CANNOT ANSWER THE QUESTIONS ASKED OF IT **[CODE + MEASURED]**

`scripts/backtest_lite.py`: 37 quarterly formations, 2017-03 → 2026-03, ~2,600 names each.
Its composite is **value/quality/momentum only** (`WEIGHTS` at line 59). Low-volatility is
computed but feeds only the IC diagnostic, and is computed **market-wide** — there is no
sector-neutral variant anywhere in the file. **So the harness has only ever measured the
low-vol treatment production discards, and never the one production uses.**

Headline (survivorship-inflated; the report's own note says expect ~half):

| | Strategy (top decile) | IWM | SPY | QQQ |
|---|---|---|---|---|
| CAGR | 13.58% | 10.19% | 15.07% | 21.19% |
| Max drawdown | −30.9% | −30.7% | −23.9% | −32.6% |

**[MEASURED] Factor ICs recomputed from the stored series** (not the shipped summary):

| Factor | Mean IC | sd | t | 95% interval | Positive quarters |
|---|---|---|---|---|---|
| Low volatility | +0.0454 | 0.192 | 1.44 | −0.016 to +0.107 | 59.5% |
| Value | +0.0434 | 0.104 | 2.54 | +0.010 to +0.077 | 56.8% |
| Quality | +0.0340 | 0.095 | 2.18 | +0.004 to +0.064 | 62.2% |
| Momentum | +0.0346 | 0.126 | 1.67 | −0.006 to +0.075 | 70.3% |

Split-half: lowvol −0.0026 / +0.0909; momentum −0.0037 / +0.0709; value +0.0120 / +0.0732;
quality +0.0409 / +0.0274. **Quality is the only stable factor.** The shipped drift report
presents lowvol as strongest by mean IC — true, and misleading, because it never shows dispersion.

**[INFERRED]** The survivorship note says results are an upper bound, but for low-volatility
specifically the bias plausibly runs the *other* way: missing delisted names are
disproportionately high-volatility and their collapse would have strengthened the signal.
Unverifiable here — `last_listed` in `tradability.py` only covers names still in the file.

### F9 — BENCHMARK CLOSES WRITTEN AS NULL **[MEASURED]**

The 2026-09-08 post-close refresh wrote `benches: {IWM: null, SPY: null, QQQ: null, SOXX: null,
DRAM: null}` for every ledger. `compute_summary` filters to non-null rows, so NAV runs through
Sep 8 while benchmarks stop at Sep 4. The reported `excess_vs_bench_pct` of −1.14% vs IWM is
therefore wrong by a full day of market move. `backfill_benches()` should self-heal on the next
successful run; if it does not, the benchmark fetch is failing silently.

---

## 6. LIVE PERFORMANCE (context, not evidence)

| Book | Window | Cumulative | Ann. vol | Max DD | Sharpe |
|---|---|---|---|---|---|
| Quant `equal` | 2026-06-12 → 09-09 | −6.00% | 12.3% | −10.25% | −1.36 |
| RS2 AI `rn_depth` | 2026-08-25 → 09-09 | −3.19% | 11.5% | −2.38% | n/a |

Both books are losing. Cost drag explains roughly a quarter to a third of it. Samples are
far too short for inference.

---

## 7. THE ARCHITECTURAL QUESTION

The pipeline uses a **momentum/revisions-weighted quant screen** to select the 170 candidates
that an **intrinsic-value LLM engine** then analyses. F10 shows value carries 4.4% effective
weight in that screen. F-A shows its top band underperforms by 3–4% over 30 days. The operator's
own cadence doc states the two stages "measure different things."

Options, unranked (no evidence exists to choose between B and C):

| Option | Meaning | Cost |
|---|---|---|
| A | Keep structure; fix pillar standardisation (F10) + add sector cap (F3) | Moderate. Still a momentum screen feeding a value engine. |
| B | Re-purpose the screen: select the depth queue on value dispersion, not composite rank | Rethinks what the band means; UI is built around it. |
| C | Decouple: quant screen governs tradability/capacity only; queue selection driven by valuation spread + event triggers | Largest change, cleanest logic. The trigger system is already half of it. |
| D | Patch only, no structural change | Cheapest; leaves the mismatch intact. |

---

## 8. PROPOSED FIXES, CONSOLIDATED

| # | Fix | Touches | Evidence | Expected effect | Effort |
|---|---|---|---|---|---|
| F1 | Restore F-04 exit hysteresis, retargeted to the band cliff | RS2 AI | **Strongest** (own benchmark) | +2 to +4 NAV pts/yr | Low |
| F9 | Fix null benchmark closes | Reporting | Measured | Excess figures become correct | Low |
| F10 | Standardise each pillar z to unit variance before combining | Both | **Measured, largest** | Declared design becomes true; 75/169 names change | Medium |
| F3 | Sector cap (weight-based, iterated) | RS2 AI | Measured | Tail risk down; vol flat; returns flat | Medium |
| F2 | Split WACC / cost-of-equity into two tables | RS2 AI | Strong logic | Valuations more demanding | Low-med |
| F4 | Separate absent-by-convention from absent-by-failure in dq | Both | Counterfactual | Restores 2 sectors; −7 pts healthcare | Medium |
| F5 | Port P/B-ROE routing into the screener | Both | Proven in rs2-local | Genuinely reopens financials/REITs/utilities | High |
| F7 | Handle revisions coverage bias | Both | Measured; sign unknown | Unknown direction | Low |
| F8 | Extend backtest to score low-vol both ways | Measurement | n/a | Settles the open question | Blocked on data |
| F6 | Retarget book to watchlist + undervalued | RS2 AI | **Weakest** (n=29, one regime) | Unquantifiable | Low |

**Recommended order:** F1 → F9 → (F10 + F3 together) → F2 → (F4 + F5 together) → F7, F8 → F6 last or never.

**Two hard dependencies:**
1. **F2 before F4/F5** — the discount-rate error scales with leverage; widening sectors first imports a larger error than it removes.
2. **F3 with F10** — re-standardisation raises healthcare from 24.3% to 45.6%. Shipping F10 alone makes lopsidedness worse.

**Do NOT** overwrite `sector_wacc` when doing F2 — three ROIC-spread call sites in
`score_reverse.py` depend on it being a true WACC. Add a second table.

---

## 9. OPEN QUESTIONS FOR DEEP RESEARCH

1. **Is `mean_of_available` across a variable sub-metric count defensible at all?** F10 shows it silently reweights. What is the correct construction — unit-variance standardisation, rank-averaging, or something else? What does the literature say about composite construction with heterogeneous sub-metric counts?
2. **Should a quant screen select the analysis queue for a value engine?** See §7. Is there precedent for decoupling capacity management from candidate selection?
3. **Is the `research_now` underperformance real or a 2-month artifact?** Short-term reversal on a momentum-tilted screen is a plausible mechanism. How would you test it with 24 months of monthly closes and no daily data?
4. **What is the correct sector treatment for financials in a factor model** — exclusion, sector-specific metrics (NIM/ROTCE/ROA/efficiency), or a separate valuation model? AQR's QMJ normalises against sector benchmarks; is that sufficient?
5. **Does the survivorship bias direction argument hold for low-volatility?** See F8.
6. **Is a 25% sector cap right for a 35-name equal-weighted book?** That is 8–9 names. The number was inherited from a June 2026 audit of a different construction method.
7. **What is the sign of the analyst-coverage bias in this universe?** See F7.
8. **Do any of these fixes improve returns, or only diversify?** Untested and untestable here.

---

## 10. RETRACTIONS — READ THESE BEFORE TRUSTING ANYTHING ABOVE

Three claims were made during this audit and then withdrawn. They share a failure mode:
a correct measurement with an invented normative conclusion attached.

**R1. "Sector-neutralising low volatility inverts the signal." RETRACTED.**
The measurement stands: scored financials have median annualised vol 0.228 versus healthcare's
0.386, yet are awarded low-vol z of +0.08 against healthcare's +0.56, because healthcare's
sector population (median vol 0.724) is full of speculative biotech. The *interpretation* was
wrong. The low-volatility anomaly persists within sectors and is not a sector effect; sector-
neutral construction may outperform. Asness, Porter & Stevens (2000) found the same for value:
characteristics are reliably priced within industry and neutralising industry bets raises
risk-adjusted returns. **The repo's sector-neutral z-scoring is mainstream practice.**
What survives: the pipeline neutralises *inputs* then discards that by pooling into a global
ranking. Sector neutrality in the literature is a property of the *portfolio*.

**R2. "Replace the WACC table with a cost-of-equity table." WRONG — would break ROIC scoring.**
Three call sites depend on it being a true WACC. Add a second table.

**R3. "Turnover control saves 5–8 NAV pts/yr." Marked down to 2–4.**
The Aug 25 dwell work already captured most of it. Turnover fell 45× → ~32×, holding period
3.3 → 6.0 days. Also: the original framing implied a pre-revamp baseline that does not exist.

**Epistemic tiering of everything else:**

| Layer | Trust |
|---|---|
| Measurements (funnel, haircuts, coverage, ICs, turnover, DCF reproduction) | High — reproducible; DCF reproduced 167 values to 5×10⁻⁵ before any change |
| Counterfactuals (re-ranked tables, growth shifts, cap outcomes) | Medium — arithmetic sound, but rest on choices: top-decile as band proxy, Kd 5.5%, tax 21% |
| Interpretations ("this is a defect", "do X") | Lowest — this layer already failed three times |

---

## 11. REPRODUCTION

All measurements read only these files at `origin/main` for 2026-09-09 post-close:

| File | Fields used |
|---|---|
| `public/data/factor_scores.json` | `fct_z`, `fct_contributions`, `fct_haircuts`, `fct_composite`, `fct_percentile`, `fct_band`, `fct_rank`, `fct_vol`, `fct_veto` |
| `public/data/stocks.json` | `sector`, `industry` |
| `public/data/depth_overlay.json` | `direction`, `iv_band_low`, `iv_band_high`, `price` |
| `public/data/paper_ledgers.json` | `nav_series`, `state.holdings`, `last_marks`, `trades`, `summary` |
| `public/data/reverse_scores.json` | `rev_survivability`, `rev_data_quality` |
| `public/data/factor_ic.json` | per-formation IC series |
| `public/data/rs2_verdict_outcomes.json` | `graded[]` — stance, band_at_analysis, excess_iwm_pct, research_cited |
| `public/data/price_history.json` | 24 monthly closes per ticker |
| `public/data/valuation_models.json` | `implied_growth`, `assumptions`, `expectations_gap_pts` |
| `public/data/fundamentals_history.json` | `lt_debt`, `cash`, `net_income`, `da`, `capex`, `fcf`, `ocf` |

**Methods.**
- *Counterfactual band membership:* recover pre-haircut percentile as `fct_composite ÷ (survivability × data_quality × forensic)`, substitute the changed input, re-rank, take top decile (research_now + watchlist = top 10%).
- *Day attribution:* NAV = Σ(shares × marks); reproduces stored values exactly across three snapshots.
- *Effective weights (F10):* sd of each pillar's z across the scored set, normalised to sum 1. Cross-checked against the in-band minus out-of-band mean-z gap.
- *Turnover:* Σ|trade value| ÷ 100 ÷ trading days × 252; cost = turnover × 25 bps.
- *Risk:* portfolio monthly return series computed directly from weights (no covariance estimation), then vol and max drawdown as sample statistics. 23 monthly observations.
- *Cost of equity:* `Ke = (WACC − Kd(1−t)·D/V) / (E/V)`, Kd = 5.5%, t = 21%, D = `lt_debt`, V = D + market cap.

**Environment limits during the audit.** No backtest was run. `backtest_prices.json` (10-year
monthly cache) is gitignored and absent. Market-data egress was refused for Yahoo (two hosts),
Stooq, Alpha Vantage and Financial Modeling Prep. Longest offline series is 24 monthly closes,
which after a 12-month momentum lookback leaves ~3 usable formation dates. Publisher egress was
also blocked (link.springer.com), so literature findings rest on search-result summaries and
abstracts rather than full texts — the specific "14% information ratio improvement" figure for
sector-neutral low-risk construction should be verified by a reviewer with journal access.

---

## 12. KEY FILE MAP

| Path | Role |
|---|---|
| `scripts/run_chain.py` | Pipeline orchestrator, step order, invariants |
| `scripts/fetch_data.py` | yfinance + SEC ingestion |
| `scripts/score_reverse.py` | Eliminators, survivability, `calculate_data_quality:179`, `dq<2` reject:284, ROIC hurdles:489/655/754 |
| `scripts/score_factors.py` | The filter. `sector_neutral_z:98`, `BANDS:68`, `REQUIRED_FACTORS:70`, pillar assembly:334-343, haircuts:405-407, `final = pct × …`:418 |
| `scripts/factor_weights.json` | Declares equal weighting (see F10) |
| `scripts/reverse_config.json` | `sector_wacc` table (see F2) |
| `scripts/build_valuation_models.py` | Reverse-DCF (see F2) |
| `scripts/build_portfolio_plan.py` | Suggested plan; sector cap 25% / theme cap 30% at :60-61 |
| `scripts/track_paper_portfolios.py` | Ledgers. `MIN_EQUAL_NAMES:143`, `depth_targets:165`, removed-hysteresis note:191 |
| `scripts/backtest_lite.py` | Backtest. `WEIGHTS:59`, `monthly_vol:217`, lowvol IC only:403 |
| `scripts/sync_kis_portfolio.py` | Real-money execution |
| `lib/desk/nav.ts` | `rn_depth` labelled "RS2 AI" at :36; equal_llm history splice |
| `lib/dcf.ts` | Frontend mirror of the reverse-DCF |
| `lib/prompt-builder.ts` | Primes the LLM with implied growth / expectations gap (:312) |
| `rs2-local/depth_pipeline.py` | Verdict rule `band_direction_v1` at :169-174 |
| `rs2-local/depth_membership.py` | `IN_BANDS = ("research_now","watchlist")` at :31 |
| `rs2-local/valuation_backbone.py` | DCF port; WACC-as-Ke note :172; P/B-ROE routing :194-210 |
| `rs2-local/DEPTH_ORCHESTRATOR_CADENCE_20260825.md` | Run criteria, dwell constants, daily 08:00 free pass |
| `rs2-local/CLAUDE.md` | Standard of proof; records the 2026-08-07 EV double-count incident |

**Relevant commits.**
`bf1877d5e9` (08-04) F-04 exit hysteresis added, benchmarked ~30% fewer trades ·
`9169231bc0` (08-26) rn_depth ledger added ·
`9eedead6c3` (08-26) depth migration, F-04 removed ·
`74dc8d6e2d` (08-26) reverse-DCF *surfaces* retired (engine still runs) ·
`951b8a16ed` (08-27) plan/plan2/plan3 retired ·
`35f9dfd456` (07-21) cost model 10 → 25 bps/side.
Nothing after 2026-08-28 touches scoring, ledger or trading logic — Aug 29 onward is
admin/control-tower/KIS/CI infrastructure only.

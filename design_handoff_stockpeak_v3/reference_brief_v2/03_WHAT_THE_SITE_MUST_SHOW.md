# 03 — What the site must show: information architecture, page by page

Priority tags: **MUST** (the redesign is incomplete without it) · **SHOULD** (strong expectation) ·
**MAY** (designer's call). "Data:" lines name the files/fields from `04_DATA_CONTRACTS.md`.
"Today:" lines say what the live site (v0.3.0, `origin/main`) does now so the designer knows what is
being replaced, kept or added — see also `06_LEGACY_VS_CURRENT.md`.

The design must satisfy the **three questions** every visit is really asking:

1. **What does the machine believe right now?** (verdicts, what to buy / hold / avoid, what is waiting)
2. **Why — and how far should I trust it?** (the stated disagreement with the price, the evidence,
   how the runs agreed, what would prove it wrong, whether anything is stale or blocked)
3. **Has it been right?** (the public, append-only scoreboard, with honest sample sizes)

## Proposed information architecture

```
Masthead:  STOCKPEAK · Underwriting Desk     [Desk]  [Track record]  [Portfolio]  [Macro]  [Handbook]   ⋯ [Lenses, On-demand, Archive]   EN/KO/ZH   login
Freshness strip (every page):  prices as of · book scored · latest verdict · system health ●
Notice banner (conditional):  analyst-rebuild notice / stale-data warning / paused

/               DESK            the verdicts + the funnel + what changed          (default view)
/t/[ticker]     STOCK           the full case for one company                      (deepest page)
/track          TRACK RECORD    the public scoreboard + the AI book ledger        (today: a tab on /; may become its own route)
/portfolio      MY PORTFOLIO    user's holdings checked against the machine       (today: a tab on /)
/macro  (new)   BACKDROP        regime, cost of capital, shocks, how it feeds the screen
/help           HANDBOOK        how the system works, glossary, colour key, FAQ   (EN/KO/ZH)
/ondemand       ON-DEMAND       verdicts the operator requested on any ticker     (kept)
/status (new, may be a drawer)   SYSTEM HEALTH   invariants, stamps, alerts       (public, read-only)
/lenses, /reports, /youtube-strategy   legacy → keep reachable under an "Archive" link, visibly marked retired
/admin          untouched (operator ruled out of scope)
```

Routes may be tabs or pages — the designer chooses — but each *surface* below must exist.

---

## A. App shell (every page)

- **MUST** Masthead with brand, nav, language toggle (en/ko/zh), login/logout (Supabase email+password).
- **MUST** **Freshness strip** with three *separate* stamps — *prices as of* (`stocks.json`/live
  quotes), *book scored* (`factor_scores.generated_at`), *latest verdict published*
  (`depth_overlay.generated_at`) — each turning amber when stale beyond its expected cadence (prices
  intraday; book ≤ ~1 trading day; verdicts depend on phase) and a **system-health dot** derived from
  `chain_manifest.ok`, `paper_ledgers.alerts[]` (errors), `discount_rate_source != anchor`, MRI
  `degraded`, and follow-up staleness. Clicking opens the health detail.
- **MUST** **Conditional notice banner**: a single place for system-level messages (analyst being
  rebuilt; analyst paused; data stale; cloud-backstop rows present). Today it is a hard-coded constant
  (`DESK_NOTICE`); the design should treat it as data-driven with severity levels.
- **MUST** Standing disclaimer reachable from every page (footer) — see `05_`.
- **SHOULD** A compact **headline stat line** that tells the truth in one breath, e.g.
  `AI VERDICTS 24 ON RECORD · 0 PASS THE GATE · 161 ON THE LIST · 3,047 SCORED` (this is what the
  status strip shows today; keep that candour).
- **SHOULD** Mobile: bottom tab bar (today: Rankings / Track / Portfolio / More→Handbook), stacked
  cards instead of wide tables. Tables never scroll horizontally; long transcript lines wrap.

---

## B. Desk (home) — "what does the machine believe right now?"

**B1. Intro band (MUST).** One headline sentence that states the product's logic, one live status
line, and the funnel. Reference copy (reword freely, keep the meaning): *"A quant screen narrows the
market to a shortlist; an AI analyst values each name; code checks every verdict before it counts."*
The live status line must say plainly when nothing qualifies — e.g. **"AI ANALYST: NO VERDICT PASSES
THE GATE"** (amber) vs **"n ACTIONABLE VERDICTS"** (green).

**B2. The funnel (MUST).** Five steps, each a count that doubles as a filter (click to filter the
list to that step; click again to clear): **US stocks checked → pass the safety filters → make the
list → AI verdicts on record → pass the gate**. Counts derive from `factor_scores` + `depth_overlay`
(`band_counts`, `scored_count`, `actionable_count`). The final steps may legitimately read `0` — design
the empty tail well. (Also worth showing: *held in the AI book*.)

**B3. Lens switcher (MUST).** Today: **Underwriting Desk** (AI lens, default) and **Quant
Pre-Screen**. Add (SHOULD) a **Compare / "Where they split"** lens: names where the screen and the
analyst disagree, ordered by size of disagreement, each with *why they split* — this was in the
earlier prototype and is the best expression of "two independent opinions".

**B4. Underwriting Desk lens — grouped sections (MUST).** Grouping logic (from `lib/desk/rankings.ts`
`aiSections`; reuse, extend with *Waiting*):

| Section | Rule | Meaning to the reader |
| --- | --- | --- |
| **Research now — AI picks that pass the gate** | has a verdict, `actionable`, `direction == undervalued` (and in Phase C: `buy_paused === false`, `entry_timing_now == buy_now`) | The machine's current buy candidates. Ranked by margin of safety (AI rank 1..N). |
| **Waiting** *(new, Phase C)* | actionable `undervalued` but held back: `buy_paused` true/null, or `entry_timing_now ∈ {wait_for_momentum, avoid}` | Cheap but not yet — **show the reason** ("waiting for trend to turn", "earnings release pending re-analysis", "follow-up data stale"). |
| **Watchlist** | verdict is `hold` or `overvalued` (and not blocked) | No edge today / expensive. `hold` is an answer. |
| **Blocked by the gate** | `actionable === false` | Verdict kept for the record, **never a recommendation**; show `actionable_reasons` in plain English. Group by reason? (designer's call: e.g. "made by the old analyst" is by far the biggest bucket today.) |
| **Awaiting underwriting** | on the list (`research_now`) but no verdict yet | Queued for the GPU. In Phase B this is the *majority* of the list: show queue position (`fct_rank`) and a progress bar for the baseline run, never an error look. |
| **Disqualified** | `fct_veto` / `fct_llm_veto` | Dimmed; `✕ VETOED · reason`. |

Each row/card (MUST show): rank · company + ticker + industry · **verdict word in verdict colour
with its one-line subline** · **price against the value band** (the band strip: band shaded, median
tick, price tick; label `$158–166 · MED 162`) · **median gap / margin of safety** · **size hint**
with *why* (the four `size_components`) · **why it's on the list** (Quality / Value / Trend) · a
promoted/demoted marker (▲ AI PROMOTED / ▼ AI DEMOTED vs the screen) · price · market cap · freshness
of the verdict (age in days; stale > 14 days is a visible smell). Optional per-row: entry timing,
thesis status chip (intact / breached / unknown), `held` marker if in the AI book.

**Honest-edge cases the row must handle** (see `05_`): single-run verdicts (band collapses to a
point); `spread_pct` null; blocked + undervalued (grey, reason inline); a legacy-analyst row; a row
whose live price has moved outside the band since the verdict (show "price now outside the band";
direction itself is frozen at verdict time — the desk never recomputes it).

**B5. Quant Pre-Screen lens (MUST).** The full ranked list of everything the screen considered:
rank · stock · composite percentile · **score mix** (Quality / Value / Trend contributions) · **band**
(Research now / Watchlist / Pass / Vetoed) · the AI verdict (compact) · price · mcap, paged. Filters:
funnel step, verdict, band, sector, industry, search. *This is the funnel, not the product* — style it
as the secondary lens. Flags (`falling_knife`, forensic warnings) as small chips.

**B6. "What changed" feed (SHOULD, new).** A short daily changelog the operator scans first:
names that entered/left the book (`band_transitions`), new verdicts and direction changes, verdicts
that flipped actionable↔blocked, new vetoes on held names, follow-up escalations ("re-analysis
queued: 8-K earnings release"), AI book trades. Source: diff of consecutive artifacts (needs a small
data addition — see `08_`) or, minimally, `band_transitions` + overlay dates.

**B7. Macro backdrop strip (SHOULD).** Regime name + 5-way probability bar + confidence + as-of +
shock flags + cost-of-capital number, linking to `/macro`. Must show low confidence honestly (today:
goldilocks 30 %, confidence 0.03 → "weak signal — context only").

**B8. Filters (SHOULD).** Verdict, step, band, sector, industry, search. The old filter list included
"High Conviction (≥12/15)", "Wide Moat", "Asymmetric", "2-run consensus", "3-run escalated" — these are
old-analyst framings; replace with filters that match the new vocabulary: *verdict · blocked reason ·
entry timing · size · held · promoted/demoted · has valid crux · thesis status · sector/industry*.

---

## C. Stock page `/t/[ticker]` — "the full case" (the most important page)

Top bar (MUST): ← back (returns to the previous lens/filters) · ticker + name · sector/industry ·
price (live) with "verdict struck at $X on DATE" · TradingView link · `held` / `AI promoted` markers.
Banner (MUST when blocked): **"BLOCKED BY THE GATE — {plain-English reasons}. This verdict is kept
as a record. It is not a recommendation."** Banner (MUST for legacy analyst): "Made by the old
analyst — kept for the record." Banner (SHOULD when `followup_status` ≠ ok): reanalysis queued / break
condition met / follow-up data stale.

**Left column — the verdict and its reasoning (in this reading order):**

1. **Verdict block (MUST).** Kicker: `RS2 ANALYSIS · VERDICT DATE · N RUNS` (real numbers from the row).
   Verdict word (UNDERVALUED / FAIR / OVERVALUED / NOT USABLE / —) in its colour + one-line subline
   ("every run above the price") + `(+X % margin of safety)`.
2. **Band chart hero (MUST).** Price against the plausible-value band: shaded band, median tick, one
   dot per run, price tick, `$low / $high` labels, "TODAY" and "AT VERDICT" prices, the **Street
   range** (`street_fence`) as a thin secondary band (SHOULD), and bear/base/bull markers when scenario
   values exist. Single-run → a point with "one run" label.
3. **The disagreement — the crux (MUST; NEW — nothing like it exists on the site today).**
   Headline: *"What the price gets wrong."* For each `crux` entry: the input in plain words (growth in
   years 3–5, cost of equity, fade length, terminal returns…), **the value the market price implies**
   vs **the analyst's value** (a two-marker number-line is ideal; `price_implied[input].reachable ==
   false` means "no value of this input alone explains the price"), and the analyst's argument with the
   **quoted filing evidence** (`reason`). Mark clearly when `crux_valid` is false ("no valid stated
   disagreement → verdict held at FAIR"), when `at_default` is true, and show "evidence quote verified
   against the source" where applicable. This is the main reasoning the page exists to expose.
4. **Stat row (MUST).** Median value + gap vs price · run spread (+ "runs agree tightly / disagree") ·
   **size hint with the four-bucket breakdown** · plausible runs `n_basis / samples_run`. Plus (SHOULD)
   bear/bull/skew and the quarter-Kelly *cap* (labelled as an upper bound).
5. **Timing (SHOULD).** `entry_timing` / `entry_timing_now`, `momentum_view`, and the flip/break
   conditions in words ("buy when 6-month momentum turns positive").
6. **What would prove this wrong (MUST).** `thesis_invalidation_triggers[]` in plain language and the
   machine-checkable `invalidation_rules[]` with live status from `thesis_checks[]` (current value vs
   threshold, intact/breached/unknown). Re-entry tranches (starter/core limits) here or in sizing.
7. **What we're watching (MUST in Phase C; NEW).** From `watch_items[]`: one line per item — status
   chip (reported / not found / unclear), side (would break / would confirm the thesis), the
   **verbatim quote + source + date**, a **"verified" tick or an "unverified" mark**, `checked_at`;
   plus `followup_status`, `buy_paused` + reasons, and "held — verdict being re-checked" for carried
   names. Honest empty state: "No watch items yet — the daily follow-up has not run on this name."
8. **Evidence & integrity (SHOULD).** Declared inputs (cost of equity source vs the macro anchor,
   terminal method, fade years), integrity stamps (calculator used & matched, fiduciary audit PASS,
   input-scope proofs), flags (plain-English), analyst-version stamp (pack revision / gate / model),
   brief age, price source — as a compact, scannable evidence table, not prose.
9. **Analyst thesis (SHOULD).** The headline bullets parsed from the memo (today's `thesis.ts`), with
   the action recommendation hidden when blocked.
10. **Run transcripts (MUST, keep).** Per-run raw memo, tabs per run, collapsible, wraps long lines,
    never scrolls horizontally, rejected runs marked ("guard intercept" / "token limit"). Consider an
    outline built from the memo's section headings.

**Right column — the screen and the numbers:**

1. **HOW IT GOT HERE (MUST, keep & extend).** A step path: *passed safety filters → door & top % →
   band & rank → AI verdict (or "waiting for the analyst")* + one plain sentence + the five z-score
   bars (Quality / Momentum / Revisions / Value / Expectations gap as "Top n % (+z σ)"), with missing
   pillars shown as missing. Include flags and, if vetoed, the veto reason prominently.
2. **Expectations / reverse-DCF panel (SHOULD; today built but not rendered anywhere).** From
   `valuation_models.json`: "at today's price the market needs **X %/yr** growth for 5 years then a fade;
   the company has delivered **Y %** → gap **Z pts**", the assumptions (cost of capital + source,
   terminal growth), and an interactive "change an assumption" workbench (client-side recompute) — the
   screener's most distinctive idea. Honest null: "no model: negative base cash flow".
3. **Key financials & quality (SHOULD).** P/E, forward P/E, P/S, P/B, PEG, growth, margins, ROIC, FCF
   yield, cash conversion, Altman Z, insider ownership; forensic tag row (F-score / accruals / Beneish)
   as *warnings*, never as a score.
4. **Price chart (MAY).** 400 days from `daily_closes.json` with the value band overlaid and the
   verdict date marked — a very natural, currently-missing visual.
5. **Verdict history (SHOULD).** A timeline of this company's verdicts (old and new analyst), their
   direction/band, and, once graded, what happened after (`depth_outcomes.graded[]`).
6. **Book membership (SHOULD).** If held in the AI book / equal book / user's portfolio: entry date,
   entry price, now, P&L (today's cross-reference to the paper ledgers).

---

## D. Track Record — "has it been right?"

The public, append-only record. Framing (MUST): *"If the machine is wrong, this page says so —
publicly and permanently."* Never present a thin sample as evidence.

- **D1. Honesty banner (MUST).** Today's text (rewrite freely): the AI book's history so far comes from
  the old analyst, which was ruled invalid; since 2026-09-24 it has held only cash because nothing passes
  the gate; **when the new analyst goes live the AI record restarts from zero and this history is
  archived.** Design for both an **archived record** view and a **fresh record "since {date}"** view,
  with an explicit "record reset" marker on the timeline.
- **D2. Book cards (MUST).** `rn_depth` (AI book), `equal` (control — the book that answers "does the
  AI earn its cost?"), `mine` (signed-in only). Each: cumulative return, vs IWM/SPY/QQQ excess, max
  drawdown, win rate, open positions, avg hold, **observations count next to every ratio**. CAGR and
  Sharpe are *not meaningful* at ~36 observations — de-emphasise or hide with an explanation until n is
  large.
- **D3. Growth chart (MUST).** NAV (start 100) vs benchmarks (IWM primary; SPY, QQQ, SOXX, DRAM),
  toggle chips, window presets (ALL/6M/3M/1M) + from/to, crosshair tooltip, **"what-if cost" input**
  (per-side bps; default from `config.cost_bps`, persisted), mark the AI-book record-reset date.
- **D4. The ledger (MUST).** Current holdings (ticker, entered, entry, now, P&L), daily activity (one
  row per day incl. "no changes · N held"; buys/sells with price and **reason**), closed round trips
  (entry/exit/return/hold days/**post-exit return**), searchable full trade history (append-only).
- **D5. Verdict scoreboard (MUST in structure, grows over time; NEW — no view reads
  `depth_outcomes.json` today).** The graded-calls panel: per horizon (30/91/182/365 d) — how many
  verdicts graded vs pending, mean/median excess vs IWM, % beat IWM (name-weighted first), by
  direction / entry timing / size hint, plus the **ablation question** ("within one screener stance,
  does the analyst's opinion add ranking power?"). Always show: `caveats[]`, "N graded · N pending", and
  the method note (entry = first close on/after the verdict; same dates for the benchmark; graded only
  after the horizon elapses). **Today every graded row is the old invalid analyst → render as "legacy,
  inconclusive" and make the pending counts the headline.**
- **D6. "Sold too early" postmortem (SHOULD, keep).** Round trips with >10 % post-exit gain, shown as a
  strip of plain sentences. Honest self-criticism is the brand.
- **D7. Method & limits (SHOULD).** What a paper book is, costs assumed, why the control book exists,
  what "not yet proven" means. Link to Handbook.

---

## E. My Portfolio — "check my holdings against the machine"

Keep: manual holdings entry (ticker + value, or bulk paste of a broker export, `CASH n`), local-only
storage by default, optional Supabase snapshot when signed in (drives the private `mine` ledger).
Per holding show: weight, **the machine's stance** (NO COVERAGE · ✕ VETOED · NO ANALYSIS YET · BLOCKED
(+reason) · REDUCE (overvalued) · FAIR · BUY (undervalued, with size) · NO PLAUSIBLE RUN), thesis
status / "what we're watching" summary, and an alignment note. Footer: totals, cash %, sector
concentration warnings. **Removed from this page on purpose: the old "suggested plan"/Kelly sizing
table and theme allocation** (retired engines). **MAY** add "what the AI book holds today" as a
reference.

## F. Macro backdrop `/macro` — the "weather" the machine uses (NEW surface)

Purpose: show the first stage of the chain so a reader understands *where the sector/discount-rate
context comes from* and how little the machine claims about it.
- **MUST** Current regime (5 names) with probabilities, reported vs raw leader, confidence, as-of,
  `explanation[]` bullets, active shocks, **honest strength label**, and the engine's own disclaimer
  ("not investment advice; not validated for forecasting"). Stale (>45 days) → visibly stale.
- **SHOULD** The seven dimension scores (growth, inflation, policy, credit/liquidity, yield curve,
  monetary liquidity, housing) as a compact bar set with validity/coverage.
- **SHOULD** Cost of capital: implied equity risk premium, implied cost of equity, ERP percentile vs
  history, `degraded` flag — and a sentence "this is the discount rate the analyst anchors to".
- **SHOULD** "How the macro read is used": sector slots flat at 8 (no proven sector edge), turbulence
  flag feeds position size, regime printed to the analyst as dated facts. *Spell out what is switched
  off and why* — honesty about a negative result is a feature.
- **MAY** Regime history timeline (needs data not currently published to `public/data`).

## G. Handbook `/help` — "how it works" (keep, update; EN/KO/ZH)

Today's 17 sections are sound; revise to cover the full chain (MRI → screen → analyst → follow-up →
books → grading), the crux idea, the gate and its reasons, the three data phases (rebuild /
baseline / steady state), **what changes at go-live** (AI record restarts), and the honest "what is
not proven". Keep: workflow diagram, searchable glossary popups (100 terms, 13 categories), colour
key, FAQ, disclaimer. **SHOULD** use the end-to-end diagram in `02_THE_SYSTEM_END_TO_END.md` as the
basis for an illustrated "the chain" explainer on the landing view (first-time visitor path).

## H. Status / system health (SHOULD, new)

A read-only panel (drawer from the health dot, or `/status`): the three freshness stamps with expected
cadence, `chain_manifest.invariants[]` (name + pass/fail), `paper_ledgers.alerts[]`, MRI health
warnings, discount-rate source, analyst state (running / paused / baseline n of N), queue depth. Plain
words, no operator controls (admin stays separate). It is the answer to "is anything broken?" and the
trust anchor for everything else.

## I. On-demand `/ondemand` (keep)

Operator-requested verdicts on any ticker, kept visibly **separate from the book** ("this name is not
in the book; it never enters the paper portfolios"). Request form is password-gated (unchanged).
Reuse the Stock page components; show the request list with direction, band, spread, date.

## J. Archive (legacy) (keep reachable, de-emphasised)

`/lenses` (100-bagger / reverse / YouTube screens, already bannered "Legacy lenses — not the current
system"), `/reports` (AI archive from Supabase), `/youtube-strategy`, and the "Old pipeline records
(retired August 2026)" panel on the stock page (`Rs2AnalysisPanel`). Put them behind one "Archive"
entry, each with a clear retired badge. They must not compete visually with the current desk.

---

## What is explicitly NOT in scope

`/admin` (operator-only, GitHub OAuth, control tower — ruled untouched); any order entry or "buy" button;
user-facing "Ask the AI to analyse this now" (the old Ask-AI lane was removed; on-demand is operator-only);
the retired Kelly suggested-plan, theme/paradigm UI, equal-weight "Factor Lab" scored composite.

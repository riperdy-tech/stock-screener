# 02 — The system end to end (MRI → screener → analyst → follow-up → books → grading)

Claude Design only sees this repository. The site is the last stage of a longer chain that lives in
three other repositories. This document explains the whole chain in plain language so the site can
present it faithfully. Everything below is true as of **2026-10-05** unless stated otherwise. Where a
piece is built but not yet live, it says so — the design has to work for both the "today" state and the
"steady state" (see §9).

```
 FRED economic data ─► ① MRI  (weather station)  ─┬─ regime + sector read ─┐
                                                  └─ cost-of-capital anchors│
                                                                           ▼
 exchange lists, SEC filings, ──────────────────────► ② SCREENER (this repo: data + maths)
 Yahoo prices, analyst data                               universe ~7,000 → hygiene → two/three doors
                                                          → ~160-name "book": research_now + watchlist
                                                                           │ factor_scores.json
                                                                           ▼
                                                      ③ ANALYST "RS2" (local AI on one GPU)
                                                          researches + values each name, 2 independent runs
                                                          → direction verdict + range + crux + sizing
                                                                           │ depth_overlay.json, depth_reports/
                                                                           ▼
                                                      ④ FOLLOW-UP (daily watcher)
                                                          checks each held / candidate name, queues re-analysis
                                                                           │
                                                                           ▼
                                  ⑤ BOOKS  paper portfolios (rn_depth = the AI book, equal = control, mine = yours)
                                  ⑥ GRADING  every verdict scored vs IWM/SPY/QQQ at 30/91/182/365 days
                                                                           │
                                                                           ▼
                                             ⑦ THIS WEBSITE (stockpeak.net) renders the files
```

The handoffs are **files and git commits only** — no stage calls another stage's code. That is why
the site can be a pure reader of `public/data/*`, and why each file must show its own provenance and
freshness (`generated_at`, `asof`, source tags).

---

## ① MRI — the macro "weather station" (macro-regime-indicator repo)

**What it is.** A transparent, rules-based engine that turns US economic statistics (FRED) into a
picture of the macro environment. It is *context*, not a forecast and not a trading signal; its own
disclaimer says it is not investment advice and not a validated predictor. Historical outputs use
revised data, not point-in-time vintages.

**What it publishes** (copied into this repo as `public/data/mri/*.json`):

| File | Meaning |
| --- | --- |
| `current_regime.json` | One of five regimes — **goldilocks · reflation · tightening · stagflation · recession** — with a probability for each, a `confidence`, the seven dimension scores (growth, inflation, policy, credit/liquidity, yield curve, monetary liquidity, housing) with the top supporting/opposing dimensions, `data_health_warnings`, and an `active_shocks_on_date` list. There is both a *raw* leader and a *reported* (transition-filtered) regime so labels do not whipsaw. |
| `cost_of_capital_anchor.json` | The market's implied equity risk premium and implied cost of equity (the "price of money"), with percentile vs history. As of 2026-10-04: implied ERP 4.03 %, implied cost of equity 9.27 %, ERP at the 48th percentile of its history, `degraded: false`. The analyst and the screener use this as their discount-rate anchor. |
| `long_run_growth_anchor.json` | The long-run nominal growth (terminal-growth) anchor. |
| `sector_multiple_bands.json` | Regime-conditional justified-multiple bands by sector. |
| `current_sector_ranking.json` | Sector macro scores (experimental layer). |
| shock register | Seven alarms (fear, credit, rates, oil, dollar, jobs, inflation). Only one proved useful: a VIX ≥ 30 "turbulence" flag that predicts higher near-term market turbulence. It feeds position sizing. As of the last read all alarms were off except an oil-shock label. |

**Honest state.** The macro engine is *deliberately humble*: current reported regime is goldilocks at
~30 % probability with a confidence of ~0.03 — i.e. "weak signal". Tests showed the regime read cannot
yet pick sectors with statistical skill (t ≈ 1.5 against a bar of 2.0), so **sector tilting of the
screener is switched off**: every sector gets the same number of research slots
(`sector_quota_source: neutral_no_validated_edge`). The site should show the regime as context with its
confidence and age — and must not present it as a call on the market. Every anchor leg whose input is
missing is `null` with a reason, never back-filled.

**What the site should do with it.** A compact "Macro backdrop" element: regime + probability bars +
confidence + as-of date + shock flags + the cost-of-capital number, each with its freshness. A stale
read (older than 45 days) must be visibly stale. See `03_WHAT_THE_SITE_MUST_SHOW.md`.

---

## ② The screener — universe → "book" (this repo's Python in `scripts/`, run on GitHub Actions)

Several times each weekday, in the cloud, a chain fetches and scores everything. It is a **funnel of
filters with different jobs, not one blended score**. The weak signals (theme, macro, news) are used as
context and sizing, never added into the score.

| Stage | What it does | Count (2026-10-04) |
| --- | --- | --- |
| 0 | Universe scan of NASDAQ/NYSE/AMEX common stock | ≈ 6,972 |
| 1 | **Hygiene** — too small (< $300 M cap), penny (< $3), no SEC filings, shell/SPAC, delinquent filer, delisted, illiquid | ≈ 3,925 vetoed in total |
| 2 | **Forensic / solvency vetoes** (tight; large caps get *flags*, not vetoes) | included above |
| 3 | **Doors** (below), sector-relative scoring, cluster diversification, no sector > 18 % of the book | ≈ 3,047 scored |
| 4 | **Bands** — `research_now` (top priority queue), `watchlist`, `pass`, `vetoed` | 60 / 101 / 2,886 / 3,925 |

**The doors.** A company can earn a place by being excellent or by being mispriced; averaging the two
describes neither. Each door has its own formula and percentile; a company needs to clear **one**.

- **Door 1 — Compounder:** quality + momentum + estimate revisions (sector-relative z-scores).
- **Door 2 — Value / expectations gap:** value + expectations gap + quality. A "falling-knife" floor
  keeps steep-decline names out of this door.
- **Door 3 — Trend leaders:** steady (not one-jump) universe-wide momentum leaders that neither door
  alone would surface (e.g. AMD, MU). Up to 20 extra places.
- A name that clears Door 1 **and** Door 2 in the top decile is a "double-door champion" (small
  tie-break bonus).

All raw metrics are scored **relative to the company's own GICS sector**; banks, insurers and REITs get
different arithmetic (earnings yield, ROE, bounded gap) because the standard cash-flow maths is
meaningless for them. Hysteresis keeps a name in its band until it falls clearly out, to stop churn.

**The expectations gap — the screener's most powerful idea (and a big visual opportunity).** Instead of
"what is it worth?", it runs the maths backwards: *at today's price, what growth must the company
deliver to justify it?* — then compares that to the growth it has actually delivered. Price implies
15 %/yr vs 4 % delivered → the market assumes an acceleration nobody has shown. Price implies 2 % vs
9 % delivered → the market is paying for less than the company gives. The site has a "reverse DCF
workbench" for this per stock (`valuation_models.json`).

**Why a name is in the book — "How it got here."** Every row carries which door(s) nominated it, its
percentile, its sector/cluster/archetype, its per-pillar z-scores (quality, momentum, revisions, value,
expectation gap), and a list of **flags** (`falling_knife`, `forensic_red_flag`, `momentum_missing`,
`revisions_missing`, …) that annotate but do not gate. A vetoed row carries `fct_veto` and
`fct_veto_detail` — *the reason it was disqualified*. These reasons are user-facing content.

Key file: `factor_scores.json` (the "book") — see `04_DATA_CONTRACTS.md`.

---

## ③ The analyst "RS2" — the depth underwriting (rs2-local repo, a local LLM on one GPU)

This is where real money is decided. It exists because an LLM is a good analyst and an unreliable
calculator: **the AI researches the company and chooses every valuation input; Python does every
calculation; code checks the result.** Roughly 2 hours of GPU time per company, strictly one at a time,
so the screener exists to make sure the GPU is never pointed at a company that was never worth it.

**The analysis, per name:**

1. **Research brief** — web research (a local search engine) with cited sources, plus the company's own
   SEC filings placed verbatim in the briefing ("PRIMARY SOURCES": latest earnings release, segment
   tables, recent filings). The model also searches *while it reasons* (bounded), and every query and
   page it read is saved so a verdict can be re-examined against exactly what it saw.
2. **Independent valuation runs** — two independent seeded runs. (The frozen design: both must agree on
   direction and sit within 30 % of each other; an earlier design used 2-then-3 runs with a 15 %
   early-stop. The published row records `samples_run`, `n_basis`, `converged`, `early_stop`,
   `spread_pct` — show whatever the row says rather than hard-coding "3 runs".)
3. **The desk** — all arithmetic is done by a calculator tool: a three-stage DCF (explicit growth, a
   declared fade, terminal value both by Gordon growth and by exit multiple), a reverse DCF two ways,
   cost of equity tied to the MRI anchor (±150 bp or an explained deviation), SBC counted once, etc.
4. **The crux (the key new idea).** A buy or sell call must state *the one input the price gets wrong*:
   which input (e.g. "years 3–5 revenue growth"), the price-implied value of that input, the analyst's
   own value, and quotes from the company's filings supporting it. Code verifies every quote against
   the named source. **No valid crux → the verdict is `hold`.** The valuation formula's reference value
   is context only and never the reason for a call.
5. **The verdict is a direction against the band.**

   ```
   price BELOW the whole plausible-value band, with ≥ 10 % margin of safety → undervalued  (every run says it's worth more)
   price ABOVE the whole band, with ≥ 10 % margin                          → overvalued   (every run says: don't buy)
   price INSIDE the band (or margin too thin)                             → hold         (the uncertainty contains the price: no edge — a decision, not a refusal)
   no complete parseable valuation                                        → not usable    (a malfunction, never a verdict)
   ```

   `hold` is a real answer. Spread between runs maps to **position size**
   (`size_hint`: quarter / half / full — the most conservative of four buckets: run dispersion, margin
   of safety, conviction, and the macro turbulence flag), never to pass/fail.
6. **The contract** that comes out (all machine-readable): bull / base / bear value, probability-
   weighted sizing (quarter-Kelly), payoff skew, two re-entry tranche prices, **falsifiable
   thesis-invalidation rules** (e.g. "operating margin below 5 % for two consecutive quarters", written
   *before* the position exists), `entry_timing` (`buy_now` / `wait_for_momentum` / `avoid`),
   `momentum_view` (`confirming` / `neutral` / `contradicting`) and a "flip condition" for waiting
   names, the declared cost-of-equity source, and flags.
7. **Gate-on-read — `actionable`.** After a verdict is written, a gate re-judges it every time the
   overlay is rebuilt and sets `actionable` (true/false) plus `actionable_reasons`. A verdict that is
   not actionable is **still published and still shown** (never dropped), but it can never be bought
   (never enters the paper book). Reasons are a closed vocabulary and are user-facing content, e.g.:
   `not_usable`, `single_sample`, `high_dispersion`, `fiduciary_fail`, `kelly_on_overvalued`,
   `outside_street_fence` (value far outside the analyst-consensus range), `mos_beyond_150pct`,
   `directional_without_valid_crux`, `desk_not_used`, `sample_failed`,
   `consensus_data_unavailable`, `depleting_producer_unsupported`, `input_scope_stamps_missing`,
   `pre_v3.1_gates` (written by an older analyst version), `non_production_row`, `mode_instability`.
   See `04_DATA_CONTRACTS.md` for the plain-English gloss of each.
8. **Divergence is recorded, not hidden.** The screener and the analyst are two independent opinions.
   If the analyst rates a watchlist name undervalued (and it clears floors: actionable, top-30 %
   quant percentile, ≥ 10 % margin, thesis not breached) the row is marked **promoted**; an
   overvalued call demotes; a *low-quality overvalued* name can be rejected outright. The one rule it
   cannot break: **a quant veto is never overridden** — the AI can promote a good company, it cannot
   rescue a dangerous one. The screener's view and the analyst's view must be visible side by side
   ("quant says X, analyst says Y, here is why they split") — this is the core of the system's value;
   if the AI only ever agreed with the screen it would be expensive decoration.

**Status of the analyst — important for the design.** The analyst has been *rebuilt* (Phase 4, frozen
2026-10-04, "pack revision 21", Qwen 3.8 model). It passed its acceptance test on companies it had
never seen. But **nothing is merged to production yet**: production still runs the *old* analyst
(pack revision ≤ 16 / the rows currently in `depth_overlay.json`, all `pre_v3.1_gates`, **0
actionable**). The new analyst must first complete a **baseline run of ~160 names** (≈ 11 GPU-days),
after which the daily follow-up system goes live. So the site must be designed to look right while the
book fills from 0 verdicts up to ~160 (see §9 and `05_`).

---

## ④ Follow-up — the daily watcher ("Part 2"; built, in acceptance testing, not yet live)

Every verdict ends with a watch-list (the memo's SECTION 8 monitoring rules) and a thesis-invalidation
trigger. Every day, for each **held** name and each **buy candidate**:

1. **Gather** (no GPU): new SEC 8-Ks with item codes, other filings, company news not seen before, and
   whether the latest closes sit inside or outside the verdict's value band.
2. **Code floor** — exact signals that *always* queue a re-analysis whatever any model says: an
   earnings release (8-K 2.02); bankruptcy / restatement / delisting / change-of-control style items
   (1.03, 2.06, 3.01, 4.02, 5.01); a thesis-invalidation rule that has just become true; a quant-screen
   veto appearing on a held name; two closes on the far side of the value band.
3. **The local model's read** — checks each watch item against the day's material and answers only
   "re-analyse now" or "nothing new". It is never shown the verdict or any valuation figure. Every
   quote it cites must be found verbatim in the named source (code-checked), dates and thresholds are
   checked by code.
4. **Effects** — `buy_paused` (no *new* buys while a break/floor event/escalation/avoid-timing is
   pending; fail-closed `null` if the follow-up data is older than 36 h), a re-analysis jumps the queue,
   and every name is re-analysed at least every **14 days**. **Monitoring never sells.** A held name is
   kept while its newest verdict says `own`; a processing failure on a held name *carries* the last good
   verdict for at most two failures or 21 days (`hold_carry_ok`).

Published per name: `watch_items` (id, text, status = reported/not/unclear, side = break/confirm, quote,
source, date, `verified` flag, `checked_at`), `followup_status` (`ok` / `reanalysis_queued` /
`break_condition_met` / `unknown`), `followup_asof`, `buy_paused` + `buy_paused_reasons`,
`holding_state` (`own` / `do_not_own` / `unusable`), `hold_carry_ok`, `carry`, `thesis_status`
(`intact` / `breached` / `unknown`), `thesis_checks`, `entry_timing_now`.

On the site this becomes: **"What we're watching"** on every stock page, a **"Waiting"** group in the
rankings (undervalued names held back by a pause or entry timing, *with the reason*), and a
"held — verdict being re-checked" label for carried names.

---

## ⑤ The books — where verdicts meet (paper) money

`paper_ledgers.json` holds simulated portfolios marked to market daily from inception **2026-06-12**,
trade-on-change only, with a per-side cost recorded in `config.cost_bps`, benchmarked to IWM (primary),
SPY, QQQ (plus SOXX, DRAM series).

| Book | Contents | Why it exists |
| --- | --- | --- |
| **`rn_depth`** — "the AI book" | Equal-weight basket of every `research_now`/`watchlist` name that carries an **actionable, undervalued** verdict with `buy_paused === false`, fresh follow-up (≤ 36 h) and `entry_timing == buy_now`. A held name stays while `holding_state == own` or `hold_carry_ok`. | The product's honest "if you followed the machine" record. |
| **`equal`** — control | Equal-weight basket of every `research_now` name, no AI involved | The scientific control: does the AI tier earn its cost over the arithmetic alone? |
| **`mine`** — the operator's holdings | Read from the user's My-Portfolio entries, **unitised like a fund** so deposits/withdrawals never fake performance | "Did I beat my own system?" |

Retired and frozen (do not present as live): `plan`, `plan2` (Kelly books), `plan3` (momentum sleeve),
and the `*_llm` overlay books. As of the 2026-10-04 snapshot `rn_depth` holds **0 positions** (it moved
to cash because the old analyst's verdicts are all non-actionable) with NAV 95.76 vs start 100, 52
closed round trips; `equal` holds a full basket. **Per the operator's ruling, at go-live the AI paper
record is reset and the old one archived** — the design should expect an "archived record" view and a
fresh "since [date]" record.

A real-money mirror into a brokerage account exists in code but is **halted** (`KIS_HALT`) and the
website does not control it — do not design an "execute trade" UI. (The `/admin` page has a halt
switch; the operator ruled the admin page is out of scope.)

---

## ⑥ Grading — the scoreboard that keeps everything honest

`depth_outcomes.json` grades every analyst verdict against forward returns at **30 / 91 / 182 / 365
days** versus IWM (primary), SPY and QQQ.

Rules that make it unforgiving (the UI should surface them as method notes):
- Entry = first close **on or after** the verdict date (you cannot act before a verdict exists).
- Exit = last close on or before verdict date + horizon.
- The benchmark uses the **same** actual entry and exit dates.
- A horizon is graded only after it has fully elapsed (a 3-day shortfall guard skips truncated windows).
- Repeat verdicts on one name are correlated, not independent samples — name-weighted statistics first.

Cuts it produces: by `direction`, by `entry_timing`, by `size_hint`, a `m` tercile (where the price sits
in the band), and **the single most important cut — the ablation: within one screener stance, does the
analyst's opinion add any ranking power?** If not, the expensive tier adds nothing over the arithmetic.
As of today every graded verdict is from the *old, invalid* analyst (`pre_v3.1_gates`), the file carries
a `caveats` block saying so, and **no conclusion may be drawn from it yet**. The design must show the
caveats prominently and show "N graded / N pending" so thin samples cannot be mistaken for evidence.

---

## ⑦ Operations the reader should feel but not manage

- **Two clocks.** The cloud clock (GitHub Actions, several runs per weekday, post-close refresh at
  21:05 UTC) refreshes prices, re-scores and rebuilds the book. The PC clock (one GPU, every 4 hours)
  produces verdicts. GitHub delivers cron jobs 0–9 hours late, so freshness is gated and *every
  artifact carries a timestamp*. The site should show "prices as of", "book scored", "latest verdict" as
  three separate stamps.
- **Red buttons.** The analyst can be paused (e.g. the operator gaming on the same GPU) and a cloud
  stand-in exists as a backstop (stamps rows `arm: cloud_api`, degraded — no local research brief).
  Rows from the backstop should be visibly marked as lower-grade if they appear.
- **Guards** exist for stale/corrupt inputs (listing circuit-breakers, freshness gates, publish
  invariants). When one trips, the symptom the user sees is *stale data* — hence the loud freshness UI.

---

## ⑧ Numbers worth putting on the "How it works" funnel (live-derived, do not hard-code)

Derive from `factor_scores.json` / `depth_overlay.json` / `paper_ledgers.json` at render time:
`universe` → `scored` → `book` (research_now + watchlist) → `analyst-underwritten` (verdict count) →
`actionable` → `held in the AI book`. As of 2026-10-04 that reads roughly **6,972 → 3,047 → 161 →
24 (old analyst) → 0 → 0**. That "→ 0" is the true state of the machine today and the design should
make the empty tail dignified, not hidden.

## ⑨ Three phases of data the design must survive

| Phase | When | What the data looks like | What the UI must do |
| --- | --- | --- | --- |
| **A. Today (transition)** | now | Screen is current and rich. Overlay has ~24 *old-analyst* rows, all non-actionable. AI book in cash. Track record has the old record. | Show the book and the funnel confidently; label every old-analyst verdict "legacy analyst — not actionable"; show "new analyst baseline in progress". |
| **B. Baseline fill** | after production cutover, ~1–2 weeks | New-analyst verdicts arrive a few per day (≈ 1h45 each) → 0..160. Many names have a screen row but no verdict yet. | A progress element ("37 of 161 underwritten"); sort/group so awaiting-verdict names are clearly "queued", not "failed". |
| **C. Steady state** | later | Daily follow-up live; every nominated name refreshed ≤ 14 days; waiting/paused/held groups populated; AI book reset with a clean "since" date; grading starts accumulating. | Full design. |

A good design is one the operator can open on day 1 of phase B without it looking broken.

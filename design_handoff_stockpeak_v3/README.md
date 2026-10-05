# Handoff: Stockpeak v3 front end ("Institutional Light")

Repo: `riperdy-tech/stock-screener` (Next.js 14.2 App Router, React 18, TypeScript strict, Tailwind 3).
Design date: 2026-10-05. Proposed app version for this release: **0.4.0** (`lib/changelog.ts`).

Read this README fully, then `FIELD_MAP.md`, then `PLACEHOLDERS_AND_DATA_REQUESTS.md`. The product
brief this design implements is in `reference_brief_v2/` (identical to `design_brief_stockpeak_v2/` in the
repo). **Where this README and the brief disagree, this README wins for visuals and layout; the brief
wins for data meaning, honesty rules and scope.**

---

## 0. Rules for the implementer (read first, follow literally)

1. **Do not invent data.** Every number on screen must come from a field named in `FIELD_MAP.md`
   (which uses the exact names from `reference_brief_v2/04_DATA_CONTRACTS.md`). If a field is missing
   or `null`, render `—` (and the reason if the file gives one). Never `0` for missing. `0` / `0.0` is a
   real value and must render as `0`.
2. **Many values in the prototype and screenshots are placeholders.** Tickers `AAA`–`HHH`, `TICK`,
   `Company · Industry`, every `n`, every Phase C number, every portfolio holding, and several DDI
   screener values are illustrative. The complete list is in `PLACEHOLDERS_AND_DATA_REQUESTS.md`. Do
   not copy any of them into code, tests or fixtures as if real.
3. **Do not add features, sections, filters or copy that are not in this README.** If something seems
   missing, write it under "Open questions" in your PR description. Do not fill the gap yourself.
4. **Do not resurrect retired concepts**: conviction /15 as a headline, Kelly % as a weight, "N-run
   deliberation", "2-run consensus / 3-run escalated", theme/paradigm, the five-pillar equal-weight
   Factor Lab, the "suggested plan", `plan`/`plan2`/`plan3`/`*_llm` books, "Ask AI". (Brief `06_`.)
5. **Removed on purpose in this design:** the Quant Pre-Screen lens and the Compare / "Where they split"
   lens are **not** on the Desk. Do not add lens switch chips. (The brief listed them; the operator
   overruled it.)
6. **Old-analyst verdicts are not shown on the Desk.** Rows whose verdict is from the old analyst
   (`gate_version == null` or `actionable_reasons` contains `pre_v3.1_gates` / `pre_valid_analyst`) are
   excluded from every Desk list and from the "AI verdicts" funnel count. They appear only on the stock
   page under "Verdict history". The Desk shows exactly one quiet line counting them (section 3.9).
7. Never recompute a verdict from a live price. `direction` is frozen at verdict time.
8. Do not touch `/admin`, `public/data/*`, `.env*`, CI or deployment config. Do not edit data files.
9. All user-facing strings go through `t()` in `lib/i18n.ts` (en / ko / zh). Leave room for ~35 %
   longer Korean strings: no fixed-width text boxes; let labels wrap.
10. No new npm dependencies unless listed in section 9.

## 1. About the design files

The files in `prototype/` are **design references built in HTML**, not production code. Recreate them in
the existing codebase (`components/desk/*`, `lib/desk/*`, `app/*`) using its patterns: functional
components, hooks, Tailwind classes, `@/` imports, inline SVG for charts (the current approach).

`prototype/Stockpeak Wireframes.dc.html` opens directly in a browser (it needs `support.js` beside it).
It is an exploration canvas with nine "turns" stacked newest-first. **Only turns 7, 8 and 9 are the
approved design.** Turns 1–6 are superseded explorations. Ignore them, including the handwritten
Kalam/Space Mono wireframe styling and the dark themes in turn 3.

| Approved | What it is | Screenshot |
| --- | --- | --- |
| 8a | Desk (home), Phase A (today) | `screenshots/01`, `02`, `03` |
| 8b | Desk (home), Phase C (steady state) | `screenshots/04` |
| 7a | Desk table row, expanded | `screenshots/11` |
| 9a | Stock page `/t/[ticker]` | `screenshots/05` |
| 9b | Track record `/track` | `screenshots/06` |
| 9c | My portfolio | `screenshots/07` |
| 9d | Macro `/macro` | `screenshots/08` |
| 9e | System-health drawer | `screenshots/09` |
| 9f | Handbook `/help` | `screenshots/10` |

Lineage, for context only: visual style = option 3d; funnel = 4b; Desk layout = 2a; funnel detail
panels = 2b (step 3) and 2c (step 2); table = 6b plus the expand panel from 6c.

## 2. Fidelity

**High fidelity for visual language** (colours, type, rules, spacing, component anatomy): match it.
**Medium fidelity for exact pixel layout**: the prototype is 1120 px wide and desktop-only, so follow
the responsive rules in section 7 rather than the frame width. Copy text is final except where
`PLACEHOLDERS_AND_DATA_REQUESTS.md` says otherwise.

## 3. Design tokens

This **replaces** the dark tokens in brief `07_` §7.3. The site becomes a **light** theme. Colour
meanings stay as the brief defines them (one meaning per colour).

### 3.1 Colour

| Token | Value | Use, and only this |
| --- | --- | --- |
| `bg` | `#fafbfc` | page canvas |
| `surf` | `#eef1f5` | inset panels, selected funnel step, expanded row, empty-state fills, crux panel |
| `ink` | `#141a22` | primary text, section rules (1 px), price ticks, active nav underline (2 px) |
| `ink-2` | `#374151` | secondary text and labels |
| `off` | `#6b7280` | muted text, column headers, blocked / vetoed / not-counting states, footnotes |
| `line` | `rgba(20,26,34,.10)` | row dividers, input borders, inactive chip borders |
| `track` | `#e6eaf0` | every bar/band track |
| `acc` | `oklch(.50 .06 245)` | links, interactive affordances ("show how", "Open full case ›"), the "on the list" bar, selected-regime bar |
| `pos` | `oklch(.50 .07 165)` | UNDERVALUED, gains, FULL size, positive gap, "passes the gate", ok dots |
| `neg` | `oklch(.52 .10 35)` | OVERVALUED, losses, negative gap, price-implied marker in the crux, error dots |
| `fair` | `#374151` (= ink-2) | FAIR (internal `hold`) |
| `warn` | `oklch(.55 .08 80)` | notices, stale stamps, HALF/QUARTER size, waiting/paused, warning dots |
| Door: Compounder | `#a774d6` | Door 1 marker square, quality pillar |
| Door: Value gap | `#149c82` | Door 2 marker square, value pillar |
| Door: Trend leader | `#fb9dbb` | Door 3 marker square, momentum pillar |
| Door: Double door | `#374151` | double-door marker square |
| Pillar: Revisions | `#c0a2de` | revisions pillar bar |
| Pillar: Expectations gap | `#72bca8` | exp-gap pillar bar |
| Neutral bars | `#c9d1db`, `#aeb8c5`, `#8fa3b8`, `#cfd6df` | non-semantic bars (reason counts, Street range, non-leading regimes) |

Derived fills: band segment = `color-mix(in oklch, <verdict colour> 28%, transparent)` with 1 px side
borders in the verdict colour. Warning banner = `color-mix(in oklch, warn 10%, bg)` + 2 px left border
in `warn`. Blocked banner = `surf` + 2 px left border in `off`.

Accessibility: every coloured state also carries a word (UNDERVALUED, BLOCKED…) or a glyph. Don't use
colour as the only signal. Check contrast ≥ 4.5:1 for any text colour you add.

### 3.2 Type (Google Fonts)

- UI: **Instrument Sans** 400 / 600 / 700.
- Data, numbers, stamps, column headers, chips: **Geist Mono** 400 / 600, tabular figures.
- No third font. No icon font. Glyphs are text: `› ▾ ▴ ● ✓ ✕ ◆ → ↻ Δ ▲ ▼`.

| Role | Spec |
| --- | --- |
| Brand "Stockpeak" | Instrument Sans 700, 16 px, letter-spacing −.01em |
| Tagline (beside brand) | Instrument Sans 400, 12 px, `ink-2`: exactly `Screened by math. Valued by AI.` |
| Nav items | 13 px; active = `ink` 600 with 2 px `ink` underline (inset box-shadow); others `ink-2` |
| Page title | 22–24 px 700, −.01em |
| Verdict word (stock page) | 28 px 700, verdict colour |
| Section header | 14 px 600 (`b`), on a 1 px `ink` top rule, 10–14 px padding-top; optional 12 px `ink-2` subline; optional count right-aligned in mono `ink` |
| Funnel numbers | Geist Mono 600, 24 px, −.02em |
| Big stats | Geist Mono 600, 17–30 px |
| Body | 13–13.5 px, line-height 1.4–1.55 |
| Mono micro text | Geist Mono 11 px, letter-spacing .03em |
| Floor | **11 px minimum everywhere**, including chart ticks and mobile |

### 3.3 Shape and spacing

Radius **0** everywhere. No shadows (the only box-shadows are the 2 px inset underlines). No gradients
except the diagonal-stripe chart placeholder, which does not ship. No animation beyond hover background
(`surf`). Page padding 24 px × 28 px. Vertical rhythm between blocks: 16 px. Row padding 8 px vertical.
Gaps: 6 / 8 / 10 / 12 / 14 / 16 / 24 / 32 px.

## 4. App shell (every page)

Screenshot: top of any `screenshots/*`.

1. **Masthead row** (flex, space-between, wraps; bottom 1 px `line`, 8 px padding-bottom):
   left: brand + tagline (baseline-aligned, gap 10). right: `Desk · Track record · Portfolio · Macro ·
   Handbook · ⋯ · EN · KO · ZH · Log in`, gap 18. `⋯` opens a menu with **On-demand** and **Archive**
   (legacy lenses, AI archive, YouTube strategy; each marked "retired"). `/admin` keeps its existing
   entry; don't restyle it.
2. **Freshness strip** (mono 11 px, `ink-2`, gap 18, wraps):
   `prices as of {MM-DD HH:mm}` · `book scored {MM-DD}` · `latest verdict {…}` · `health ●` · right-
   aligned `macro: {regime} {p} % · {strength label} · CoE {x} % ›` (links to `/macro`).
   Each stamp turns `warn` with a leading `●` when stale (cadences in section 8). The health dot is
   `pos` / `warn` / `neg` and opens the health drawer (9e).
3. **Notice banner** (conditional): warning style. Phase A copy, exactly:
   `The AI analyst is being rebuilt. No new verdicts until it goes live.`
   Data-driven with severity (`info`/`warn`/`error`). Replace the `DESK_NOTICE` constant with a typed
   source (`lib/desk/notice.ts`: `{severity, message_key, since}`).
4. **Footer disclaimer** (mono 11 px, `off`, 1 px `line` top rule): short form
   `StockPeak publishes the output of a research system. Not investment advice. Track records are paper
   (simulated) portfolios with assumed costs over a short period. Full disclaimer ›` linking to the full
   text in brief `05_` §5.2 (keep every claim).

## 5. Screens

### 5.1 Desk `/` — screenshots 01–04, 11

Top to bottom:

**a. Gate status line.** Mono 11 px 600. Phase A: `● AI analyst: no verdict passes the gate` in `warn`.
Once `actionable_count > 0`: `● {n} actionable verdicts · paper record since {date}` in `pos`.

**b. Funnel (approved 4b).** Horizontal row of five steps separated by a `›` glyph (22 px, `off`). Each
step: number (mono 24 px 600), label (12 px `ink-2`), optional drop-off line (mono 11 px `off`). Zero
values render in `ink-2`, not green. No chevron shapes, no filled arrows, no coloured boxes (the
operator rejected them). 1 px `line` under the row.

| # | Number | Label | Drop-off line |
| --- | --- | --- | --- |
| 1 | universe size | `US stocks` | — |
| 2 | `scored_count` | `pass safety` | `{band_counts.vetoed} vetoed` |
| 3 | `research_now + watchlist` | `make the list` | `{band_counts.pass} no door` |
| 4 | rebuilt-analyst verdicts on list names | `AI verdicts` | Phase A: `analyst not live`; else `{queued} queued` |
| 5 | rebuilt-analyst rows with `actionable === true` | `pass the gate` | Phase C: `{held} held` |

Selected step: `surf` background + 2 px `ink` bottom underline. Hover: `surf`. Default selection =
step 3. **Clicking a step only selects it** (changes the summary panel below, collapsed). It does
**not** filter the table in this release.

**c. Step summary panel** (one, for the selected step). `surf` fill, 12 × 14 px padding, whole panel
clickable. Row 1: bold 14 px title + mono subline + right-aligned link `▾ show how` / `▴ collapse` in
`acc`. Row 2: chips (7 px colour square + mono label). Clicking toggles the detail panel directly
below it (1 px `line` border, no top border, 14 × 16 px padding). Content per step:

| Step | Summary title / subline | Detail content |
| --- | --- | --- |
| 1 | `Where 6,972 comes from` / `every US-listed common stock` | three boxes NASDAQ / NYSE / AMEX with counts (data request), refresh note `Re-scanned several times each weekday; post-close refresh 21:05 UTC.`, ticker search |
| 2 | `How 6,972 became 3,047` / `{vetoed} failed a safety filter` | horizontal bars per veto reason, counts from grouping rows by `fct_veto`; total line `= {vetoed} vetoed · large caps get flags, not vetoes`; ticker search returns `✕ vetoed · {plain-English fct_veto}` (screenshot 03) |
| 3 | `How 3,047 became 161` / `clear one door · sector-relative · ≤18 % per sector` | flow: `{scored} scored` → four door bars (Compounder, Value gap, Double door, Trend leader (wildcard, ≤20)), widths proportional to counts → `{rn} research now` / `{wl} watchlist`; line `{pass} cleared no door → Pass`; then "Who came which way" table with filter chips `all · Door 1 · Door 2 · Double · Door 3`, columns ticker / route (colour square + door name) / in plain words / band (screenshot 02) |
| 4 | `How 161 become verdicts` / `the analyst values each listed name` | progress bar `{n} of {book} underwritten · no ETA promised`, note `One company at a time on one GPU, about 1 h 45 min each. Order = screen priority.`, top 3 of the queue by `fct_rank` |
| 5 | `How a verdict passes the gate` / `automatic checks before a verdict counts` | sentence about re-checking; table of gate reasons: plain English / code / count of rebuilt-analyst rows with that reason; `+ {k} more reasons in the Handbook ›` |

Door counts: count list rows by `fct_nominated_doors`. A row with `DOUBLE_DOOR_CHAMPION` counts as
Double door only, not in Door 1 or 2. `DOOR_3_TREND_LEADER` = Trend leader. Precedence: Double → Door 1
→ Door 2 → Door 3. **Confirm this rule with the operator** (open question 1). "In plain words"
sentences are templates keyed by door, filled only with real fields (percentile from
`fct_percentile`, gap from `valuation_models.expectations_gap_pts`); if a field is null, use the bare
template with no number.

**d. Filter row.** Left: one static label chip `Underwriting Desk` (filled `ink`, text `bg`). Right:
`Verdict ▾ · Door ▾ · Sector ▾ · Search` (1 px `line` border, mono 11 px). Nothing else. Any active
filter shows `showing {k} of {n} · clear` above the table (never hide rows silently).

**e. Desk table (approved 7a).** One table for all sections. 11-column CSS grid, column gap 12 px:

```
150px 70px 104px 120px 54px 62px 70px 120px 54px 76px 16px
company | price | verdict | IV band | MoS | size | timing | door | pct | Q M R V G | chevron
```

Group header row above the column headers, on the same grid: `MARKET` spans column 2; `AI ANALYST`
spans columns 3–7; `SCREENER` spans 8–10. Each has a 1 px `ink` underline. Column headers: mono 11 px
`off`, `white-space: nowrap`.

Cells:
- **company**: ticker 600 + company · industry (11 px `ink-2`, single line, ellipsis).
- **price**: latest price, mono `ink`.
- **verdict**: mono 600 in verdict colour: `UNDERVALUED` / `FAIR` / `OVERVALUED` / `NOT USABLE` /
  `BLOCKED` (`off`) / `AWAITING` (`ink-2`).
- **IV band**: band strip (12 px track, band segment, 2 px `ink` price tick extending 3 px above and
  below) + mono label `$52–58 · MED 55`; single run → `$37.55 · one run` and a ≥2 px point; no verdict
  → empty track + `queue #{fct_rank}`. x-range per row = min(price, low) … max(price, high), padded 8 %.
- **MoS**: `mos_vs_median_pct` signed, colour by sign (grey when blocked).
- **size**: `FULL` (`pos`) / `HALF` / `QUARTER` (`warn`) / `—`.
- **timing**: `buy now` / `wait: trend` / `paused: {short reason}` (`warn`) / `avoid` / `single run`
  (blocked) / `—`.
- **door**: 7 px colour square + door name, mono 11 px `ink-2`. **No bordered chip.**
- **pct**: `top {100 − fct_percentile} %`.
- **Q M R V G**: five 7 × 22 px bars on `track`, centred at 50 %, bar height = min(50 %, |z| × 22 %),
  growing up for positive and down for negative, coloured by pillar. `null` pillar = dashed `off`
  outline, no fill.
- **chevron**: `▾` / `▴`.

Text equivalent for screen readers (required): `"$52–58, median 55; price $42.10, below the band"`.

**Row expand (approved 6c panel).** Clicking anywhere on a row toggles an in-place panel. Several
rows can be open. The open row and its panel get the `surf` background. Panel: two columns, gap 24 px,
padding 12 × 14 px 16 px. Each column has a mono `off` heading and a 120 px label / value grid:
- **AI ANALYST**: value band · margin of safety (`{x} % vs verdict price`) · size hint (`{bucket} · {the
  four size_components buckets}`) · runs (`{n_basis} of {samples_run} usable · spread {spread_pct} %`) ·
  timing · thesis · verdict age · the crux (one line: `price implies {implied} …; analyst {own}`).
- **SCREENER**: route (door + pct) · band · rank · pillars (bars + `Q +1.4 · M +0.9 · …`, missing as `—`) ·
  expectations gap · market cap · flags (plain English) · then the link `Open full case ›` (`acc`) to
  `/t/{ticker}?from=…`.
For an AWAITING row, show only the SCREENER column; the analyst column says `No verdict yet · queue
#{fct_rank}`.

**f. Sections (in this order; header style from 3.2).** Each section is a group of rows in the table.

| Section | Rule | Header subline |
| --- | --- | --- |
| Research now | rebuilt-analyst verdict, `actionable`, `direction == undervalued`, not waiting | `pass the gate · ranked by margin of safety` |
| Waiting (Phase C) | actionable undervalued but `buy_paused !== false` or `entry_timing_now ∈ {wait_for_momentum, avoid}` | `cheap, held back · reason shown` |
| Watchlist | rebuilt-analyst verdict `hold` / `overvalued`, actionable | `no edge today, or expensive` |
| Blocked by the gate | rebuilt-analyst verdict, `actionable === false` | `kept for the record · never a recommendation` |
| Awaiting underwriting | on the list, no rebuilt-analyst verdict | `queued by priority` |
| Disqualified | `fct_veto` / `fct_llm_veto` on a list name | `vetoed on the list · reason shown` |

Empty Research now (Phase A), exact copy in a 1 px dashed `line` box, `ink-2`:
`The rebuilt analyst hasn't published yet. 161 names are queued; verdicts appear here as they pass the
gate.` ("161" = live book size.) Awaiting underwriting shows the first 5 rows by `fct_rank` and then a
`Show all {n} ›` link.

**g. Hidden-legacy line** (Phase A and B only, mono 11 px `off`):
`{n} old-analyst verdicts not shown on the Desk · each remains on its stock page under "Earlier verdicts"`

**h. "Since yesterday" (Phase C, 8b).** 2 px `line` left border block above the table: bold `Since
yesterday` + one mono line of events. **This needs `changes.json` (data request).** Until it exists, show
only `band_transitions` counts (`▲ {entered} entered the list · ▼ {left} left`), or omit the block.

### 5.2 Stock page `/t/[ticker]` — screenshot 05 (DDI fixture)

Two columns: `minmax(0,1fr) 340px`, gap 32 px, top-aligned.

Top bar: `← Desk · {section}` (`acc`, returns to the previous URL state) · ticker 24 px 700 · name ·
sector · industry (`ink-2`) · spacer · price (mono 18 px 600) · `price as of {price_asof} ·
{price_source}` · `TradingView ↗`.

Blocked banner (blocked style) when `actionable === false`:
`Blocked by the gate — {plain-English actionable_reasons, joined with "; "}. Kept as a record. Not a
recommendation.` Add the `instability` delta when present (as in the screenshot). Also show a warning
banner when `followup_status` ≠ `ok` (Phase C).

**Left column, in this order:**
1. Kicker (mono 11 px `off`): `RS2 ANALYSIS · {date} · {n_basis} OF {samples_run} RUNS · {REBUILT ANALYST
   | OLD ANALYST} · PACK {pack_revision} · GATE {gate_version}`. Verdict word 28 px (grey if blocked) +
   subline (e.g. `one run — a point, not a range · size capped`).
2. **Band hero**, 112 px tall: Street range (`street_fence`) as a 4 px `#cfd6df` bar above, labelled
   `street $low–high`; 40 px `track`; bear / bull as dashed `off` verticals labelled `bear {bear_iv}` /
   `bull {bull_iv}` (right-most label right-anchored so it never wraps); one 10 px square per usable run
   (from `depth_reports/{T}.samples[].iv` where `plausible`); band segment when low ≠ high; 2 px `ink`
   price tick; labels below `TODAY ${live}` and on the next line `at verdict ${price}`; `ONE RUN $x` or
   `MED $x` under the median. x-range = min of all values … max, padded.
3. **What the price gets wrong** (section header, subline `the crux`). `surf` panel per `crux[]` entry:
   input name in plain words (15 px 600) + right-aligned `crux valid · at default value` flags; a number
   line with two 10 px diamonds, `neg` = `price implies {implied}` (above the line), `ink` =
   `analyst {own}` (below the line); then `reason` as a quote (13 px, 2 px `line` left border, verbatim,
   truncated with "…" only where the source is truncated); then one mono line listing `price_implied`
   inputs with `reachable: false`: `Other inputs — … : no value of any one alone explains the price.`
   If `crux_valid === false`: `No valid stated disagreement → verdict held at FAIR`.
4. Stat row (4 columns, top and bottom 1 px `line`): median value · run spread · size hint · usable runs.
   Then a label/value grid: size buckets, upper bound (`quarter-Kelly cap {kelly_fraction_pct} % (a
   ceiling, not a suggestion)`), bear · bull · skew, re-entry tranches.
5. Timing: entry timing + momentum view, flip condition, break rule (render `{metric, comparator,
   threshold, window_days}` objects in words; see `FIELD_MAP.md`).
6. What would prove this wrong (subline `thesis status: {thesis_status | unknown}`):
   `thesis_invalidation_triggers[]` as text, then a 4-column table rule / threshold / window / now from
   `invalidation_rules[]` + `thesis_checks[]` (now = `current_value`, else `— unknown`).
7. What we're watching: `watch_items[]` rows (Phase C) — status, side, verbatim quote, source, date,
   `verified` ✓ or "unverified", `checked_at`. Empty state exactly: `No watch items yet — the daily
   follow-up has not run on this name.` (dashed box).
8. Evidence & integrity: label/value grid (cost of equity + source + `coe_minus_anchor`, terminal
   method/g/fade/RONIC, calculator `desk_calls` + `desk_iv_match`, `fiduciary_verdict`, research brief
   age, flags in plain English).
9. `Analyst thesis ▸` (collapsed; existing `thesis.ts` bullets; hide action text when blocked).
10. `Run transcripts ▸` (keep existing `TranscriptViewer`: tabs per run, pre-wrap, wrap anywhere,
    never horizontal scroll).

**Right column:**
1. How it got here: 4 lines with glyphs `✓` / `●` (safety filters · door + top % · band + rank · AI
   verdict state), one plain sentence for the door (template, as on the Desk), then five pillar bars
   (label 76 px, centred track, `+0.6 σ` or `missing`).
2. Expectations: `At today's price the market needs {implied_growth} %/yr growth for {stage1_years}
   years; the company has delivered {hist_*_cagr_5y} %.` + link to the existing workbench. Null model →
   `No model: {skip reason}`.
3. Price, 400 days: chart from `daily_closes.json` with value band overlaid and verdict date marked
   (MAY in the brief; build last).
4. Key financials (label/value), forensic tags as warnings only.
5. Verdict history: one line per verdict, newest first; old-analyst rows in `off` with `old analyst`
   tag. **Needs per-ticker history (data request)**; fallback: newest verdict plus `instability.prior_iv`
   if present.
6. Book membership: entry date/price/P&L per book, or `not held in any book`.

### 5.3 Track record `/track` — screenshot 06

Title `Track record` + subline `If the machine is wrong, this page says so — publicly and permanently.`
Warning banner (Phase A) exactly:
`The AI book's history so far comes from the old analyst, which was ruled invalid. Since 2026-09-24 it
has held only cash, because nothing passes the gate. When the rebuilt analyst goes live, the AI record
restarts from zero and this history is archived.`

Record switch chips: `Archived record · old analyst` / `Since go-live` + mono
`· paper (simulated) · {cost_bps} bps per side · since {inception}`.

Verdict scoreboard (first, before returns): three big counts (mono 30 px) `{valid graded}` graded from
the valid analyst · `{graded_verdict_horizons}` graded · legacy, inconclusive · `{pending}` pending; four
horizon tiles (30 d / 91 d / 182 d / 365 d) from `gradeable_counts_per_horizon`; **`caveats[]`
rendered verbatim**, one per line with `· `; method line. Show no mean-excess or %-beat headline while
the valid count is 0.

Paper books: three columns, 2 px `ink` top rule each. AI book (`rn_depth`) and Control (`equal`): 3 × 2
stat grid: return, vs IWM, max drawdown, win rate (`of {closed_trades} closed`), open, avg hold, with
`{observations} obs` under return and vs IWM. My book: signed-out text `Log in and add holdings on
Portfolio to track your own record against the machine.` Then mono `CAGR and Sharpe hidden: not
meaningful at {observations} observations.`

Growth of 100: series chips (AI book, Control, IWM, SPY, QQQ), window presets ALL/6M/3M/1M, `cost {n}
bps ▾`. Keep the existing `NavChart` interactions; restyle to tokens. Benchmarks are raw price levels:
normalise to the window start. Mark the record-reset date with a vertical rule labelled `RECORD RESET`.

Ledger (AI book): date / side / ticker / price / reason in plain words (`left_rank` → `left the ranked
list`, `entered_rank` → `entered the ranked list`); days with no trade → `no changes · {n} held`. Link
`Holdings · closed round trips · full history · sold too early ▸` (existing sections, restyled).

### 5.4 My portfolio — screenshot 07

Keep the current behaviour (local storage `myPortfolio_v1`, optional Supabase snapshot). Input row:
ticker, value $, `Add` (filled), `Paste broker export`. Table: holding / weight / machine's stance /
watching · note. Stance vocabulary (brief `03_` §E): `NO COVERAGE · ✕ VETOED · {reason} · NO ANALYSIS
YET · BLOCKED · {reason} · REDUCE (overvalued) · FAIR · BUY · {size} · NO PLAUSIBLE RUN`, coloured by
verdict tokens. Footer: total, cash %, sector concentration warning (`warn`) and `AI book holds today:
{cash | n names}`. No Kelly plan, no theme allocation.

### 5.5 Macro `/macro` — screenshot 08

Kicker `MACRO BACKDROP · AS OF {date} · BUILT {built_at}`; title `{Reported regime}, {p} % — {strength
label}`; subline `Confidence {confidence}. The machine uses this as background, not as a call on the
market.` Left column: regime probability bars (leader in `acc`, others `#aeb8c5`), `explanation[]`
bullets in plain words, shocks (`active_shocks_on_date` with a `warn` dot; others listed as off),
`data_health_warnings[]` verbatim. Right column: cost of capital (implied ERP + percentile, implied cost
of equity + `degraded`), sentence `This is the discount rate the analyst anchors to.`, "How the machine
uses it" (OFF sector tilt with the reason; ON turbulence flag; ON regime as dated facts), MRI
`disclaimer`. Stale (> 45 days) → stamps in `warn`.

Strength label rule (proposal, confirm with the operator, open question 3): confidence < 0.10 → `weak
signal, context only`; 0.10–0.30 → `moderate signal`; > 0.30 → `clear signal`.

### 5.6 System health drawer — screenshot 09

Right-side drawer, 420 px, 1 px `ink` left border, opened from the health dot on any page; `✕ close`.
Sections: Freshness (three stamps with expected cadence and a coloured dot), Analyst (state, baseline
`{n} of {N}`, real-money mirror `halted`), Alerts (`paper_ledgers.alerts[]`: severity dot, date, plain
detail), Checks (`chain_manifest.invariants[]` pass/fail, discount-rate source, MRI warnings count,
follow-up state). Read-only; no controls.

### 5.7 Handbook `/help` — screenshot 10

Keep the existing 17-section content and glossary popups; restyle. New top band: six steps in a grid
with 1 px `line` dividers (Macro · Screener · Analyst · Gate · Follow-up · Grading, each with a one-line
subline). Left nav 220 px; content max-width ~700 px. Add the new sections and glossary terms from brief
`03_` §G and `07_` §7.5 in all three languages.

### 5.8 Not redesigned here (reuse the shell + tokens)

`/ondemand` (reuse the stock page with the banner `This name is not in the book; it never enters the
paper portfolios.`), Archive pages (add a `retired` tag in `off`), `/admin` (untouched).

## 6. Interactions and state

| Where | State | Notes |
| --- | --- | --- |
| Desk funnel | `selectedStep: 1..5` (default 3), `stepOpen: boolean` (default false) | Clicking a step sets `selectedStep` and closes the panel. Clicking the summary toggles `stepOpen`. Keep both in the URL (`?step=3&how=1`) so back/forward work. |
| Desk table | `expanded: Set<ticker>` | Toggle per row; not persisted. Keyboard: row is a button (`aria-expanded`), Enter/Space toggles. |
| Desk filters | verdict, door, sector, search | URL params; show `showing k of n · clear`. |
| Track record | record epoch (archived / since go-live), series toggles, window, cost bps | cost persists in `desk.commission` (existing key). |
| Health drawer | open/closed | Esc closes; focus trap. |
| Data | existing fetch layer; `depth_overlay.json` re-poll every 25 s and on focus (existing) | Render the Desk verdict sections before the 7,000-row `factor_scores` work finishes; skeleton rows (`track`-coloured bars), no layout jump; a failure in one file must not blank the page. |

Hover: rows and funnel steps get the `surf` background. Focus: 1 px `acc` outline, 2 px offset.
No transitions.

## 7. Responsive

Breakpoints: ≥1024 desktop as designed; 640–1023 tablet; <640 mobile (test at 375 px). **No horizontal
scroll at any width.**
- Masthead: nav collapses into a bottom tab bar on mobile: `Desk · Track · Portfolio · More`.
- Freshness strip wraps; the macro item moves to its own line.
- Funnel: wraps to 2–3 per line; `›` separators hidden when wrapping.
- Desk table on tablet: drop `timing`, `pct`, then `Q M R V G` (in that order). On mobile, each row is a
  stacked card: line 1 ticker + verdict + price; line 2 band strip full width + IV label; line 3 MoS ·
  size · door. The expand panel stacks its two columns.
- Stock page: right column moves below the left column, in the same order.
- Track book cards stack; horizon tiles become 2 × 2.

## 8. Phases and staleness

Design must work for Phase A (today), B (baseline fill) and C (steady state); brief `05_` §5.3. 8a = A,
8b = C. Phase B = 8a's layout with: funnel step 4 shows the real rebuilt-verdict count; step 4 summary
shows the progress bar; verdicts fall into sections by the normal rules; Awaiting underwriting is the
largest section, never styled as failed. Detect the phase from data, not a flag: A = 0 rebuilt rows;
B = some rebuilt rows and no follow-up fields; C = follow-up fields present.

Stale thresholds: prices — older than the last trading session close during market hours; book —
> 1 trading day; verdict — any rebuilt row older than 14 days gets an `age` smell in `warn`;
follow-up — `followup_asof` > 36 h → `buy_paused` unknown, shown as paused; MRI — > 45 days.

## 9. Implementation notes

- Fonts: replace Hanken Grotesk / Spline Sans Mono with Instrument Sans / Geist Mono via `next/font/google`.
  Update `tailwind.config.js` colours to the section 3.1 tokens (keep semantic names: `pos`, `neg`,
  `warn`, `off`, `acc`, `fair`, `ink`, `ink-2`, `surf`, `track`, `line`). Update `lib/desk/tone.ts` to
  match.
- Reuse and restyle: `BandStrip` (cells.tsx, currently unused — make it the hero cell), `BandChartHero`,
  `TranscriptViewer`, `NavChart`, `TrackView`, `MyPortfolio`, `RankingsView` (strip the lens chips),
  `aiSections` in `lib/desk/rankings.ts` (add Waiting; exclude old-analyst rows from the Desk).
- Delete from the Desk: the `QuantLens` mount and the lens toggle. Keep the file in place for now.
- New components (suggested names): `FreshnessStrip`, `HealthDrawer`, `NoticeBanner`, `Funnel`,
  `FunnelStepPanel` (+ one detail per step), `DeskTable`, `DeskRow`, `RowExpand`, `PillarBars`,
  `DoorMark`, `CruxPanel`, `Scoreboard`, `BookCard`, `MacroPage`.
- Add a 0.4.0 entry to `lib/changelog.ts` in plain English.
- `npm run build` and TypeScript strict must pass. `npm run lint` is known broken; don't fix it here.

## 10. Open questions (ask the operator; don't guess)

1. Door precedence for counting / labelling a name with several doors (proposed in 5.1c).
2. Should a funnel step also filter the Desk table? (Not in this design.)
3. Macro strength-label thresholds (proposed in 5.5).
4. Show the hidden-legacy line on the Desk at all, or drop it? (Currently shown.)
5. Where On-demand lives in the `⋯` menu vs a nav item.

## 11. Files

```
design_handoff_stockpeak_v3/
  README.md                          this file
  FIELD_MAP.md                       every on-screen value → contract field
  PLACEHOLDERS_AND_DATA_REQUESTS.md  every illustrative value in the prototype + data requests
  screenshots/01…11                  approved screens (1x PNG)
  prototype/Stockpeak Wireframes.dc.html + support.js   open in a browser; turns 7–9 only
  reference_brief_v2/                the product brief + real fixtures
```

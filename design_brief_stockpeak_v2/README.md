# Stockpeak revamp — design brief for Claude Design

**Snapshot date: 2026-10-05.** Written by the operator's engineering agent from the live system, for a
designer who can only see this repository. Everything the design must know about the *rest* of the
system (the macro engine, the screener's maths, the AI analyst, the daily follow-up, the paper books,
the grading) is in this folder, because none of it is visible from `stock-screener` alone.

> **The ask, in two sentences.** Redesign stockpeak.net so that it is the same *idea* as today's site —
> a dense, honest "research desk" showing a quant screen, an AI analyst's verdicts and a public paper
> scoreboard — but built around the **new, rebuilt system** (macro backdrop → dual-door screen → the
> analyst's stated disagreement with the price → daily follow-up → graded track record) instead of the
> legacy system the current pages still half-describe. The design must stay truthful: today the rebuilt
> analyst has published **no verdicts that pass its own gate**, the AI paper book is in cash, and nothing
> has yet been proven — the site has to look right in that state *and* as the book fills.

> **Correction, 2026-10-05 evening.** This brief was written when the overlay held only old-analyst rows (phase A).
> By that evening the rebuilt analyst had begun publishing single-run acceptance verdicts to the site (pack 21,
> gate 8; 12 rows, all blocked by the gate, 0 actionable), so the live state is **phase B**, not A. Wherever the
> text says "today = phase A", read it as "phase B, early". The site's phase is detected from data
> (`lib/desk/phase.ts`), not from this document.

## Read in this order

| # | File | Read it for |
| --- | --- | --- |
| 1 | [`01_PRODUCT_AND_PRINCIPLES.md`](01_PRODUCT_AND_PRINCIPLES.md) | What Stockpeak is, who uses it, the six product principles, voice, what it is not |
| 2 | [`02_THE_SYSTEM_END_TO_END.md`](02_THE_SYSTEM_END_TO_END.md) | **The whole chain in plain language**: MRI → screener → analyst → follow-up → books → grading, with today's numbers and the three data phases |
| 3 | [`03_WHAT_THE_SITE_MUST_SHOW.md`](03_WHAT_THE_SITE_MUST_SHOW.md) | Information architecture and a MUST/SHOULD/MAY spec for every surface (Desk, Stock page, Track record, Portfolio, Macro, Handbook, Status…) |
| 4 | [`04_DATA_CONTRACTS.md`](04_DATA_CONTRACTS.md) | Every file and field the site can read, with meaning and UI guidance (+ the gate-reason glossary) |
| 5 | [`05_STATES_AND_HONESTY_RULES.md`](05_STATES_AND_HONESTY_RULES.md) | The twelve honesty rules, the disclaimer, empty/blocked/stale states, banned phrasings |
| 6 | [`06_LEGACY_VS_CURRENT.md`](06_LEGACY_VS_CURRENT.md) | Old → new concept map; what exists on `main` and what to keep/replace/drop; why the two older design handoffs are stale |
| 7 | [`07_VISUAL_LANGUAGE_AND_VOCABULARY.md`](07_VISUAL_LANGUAGE_AND_VOCABULARY.md) | Visual language to keep (tokens, colour meanings, signature components) and the UI vocabulary incl. new terms |
| 8 | [`08_CONSTRAINTS_AND_ENGINEERING.md`](08_CONSTRAINTS_AND_ENGINEERING.md) | Hard constraints, stack, data volume, false assumptions, data requests, **the deliverables and an acceptance checklist** |
| — | [`fixtures/`](fixtures/) | **Real, trimmed data** for every contract — build the prototype against these, not invented data |

## The brief on one page

**The product.** A public research desk and honest scoreboard for one investing system. It scans every
US-listed company (~7,000), narrows them by deterministic maths to ~160 (a "book": `research_now` +
`watchlist`), has a local AI analyst underwrite each name (value band, margin of safety, a *stated
disagreement with the price*, falsifiable "what would prove me wrong"), watches every held or candidate
name daily, and grades every call against forward returns versus IWM/SPY/QQQ. The site renders the files
those pipelines publish; it computes almost nothing.

**The central design ideas to express.**
1. *The AI verdict is the product; the quant screen is the funnel.* Lead with verdicts; show the screen as
   the explanation of how a name reached the analyst.
2. *A verdict is a direction against a value band* — price below the whole band = undervalued, inside =
   fair (no edge — a real answer), above = overvalued. Run disagreement sets **size**, never pass/fail.
3. *The crux:* the one input the price gets wrong — the price-implied value vs the analyst's value, with
   quoted filing evidence. **New; nothing like it exists on the site yet; it is the page's main reasoning.**
4. *The gate:* a verdict that fails automatic checks is **blocked — still shown, reason given, never a
   recommendation.** Today *every* published verdict is blocked (they are from the old analyst).
5. *Monitoring never sells:* a daily watcher can only say "re-analyse now" or "nothing new" and pause new
   buys. The UI must never imply news triggers a sale.
6. *Honesty is structural:* freshness stamps, observation counts, caveats, "paper record", "not yet
   proven", missing-is-missing.

**What is new vs the live site (v0.3.0).** Crux panel · "What we're watching" · Waiting group ·
freshness strip + health · macro backdrop page · graded-verdict scoreboard (the data exists, no view reads
it) · reverse-DCF expectations panel (built, not rendered) · Compare lens · what-changed feed · record-
reset/archive handling · price chart with value band · verdict history. **What to remove as headlines:**
conviction/15, Kelly %, "N-run deliberation", theme/paradigm, equal-weight five-pillar mix, suggested plan.

**The three states to design for:** (A) *today* — rich screen, old-analyst verdicts all blocked, AI book
in cash; (B) *baseline fill* — new verdicts trickling in, most names "awaiting underwriting"; (C) *steady
state* — daily follow-up live, waiting/held populated, AI record reset, scoreboard accumulating.

## Paste-ready prompt

> You are redesigning stockpeak.net (repo `stock-screener`, Next.js 14 + Tailwind, dark editorial
> "research desk", radius 0, Hanken Grotesk + Spline Sans Mono). Read `design_brief_stockpeak_v2/README.md`
> and every file it links, in order, then study `fixtures/`. Produce the deliverables in `08_` §8.5
> (a handoff README, a clickable desktop+mobile HTML prototype driven by the real fixtures with a
> phase A/B/C switch, a states board, and a component inventory) in a new folder
> `design_handoff_stockpeak_v3/`. Keep the visual language in `07_`, meet every MUST in `03_`, obey every
> rule in `05_`, build only on the CURRENT data in `04_`, and do not build on the stale August handoffs or
> any retired concept in `06_`. Where you need data that does not exist, list it as a data request with a
> fallback; do not invent fields or numbers. Do not touch `/admin`, `public/data`, secrets, CI or
> deployment config.

## Where this came from (so it can be re-derived when it goes stale)

Facts were read from the live files on 2026-10-05, not from memory: the system map
(`stocks-workspace/docs/system-map/`), the review/phase plans (`stocks-workspace/docs/review_2026-09-22/`,
especially `STATUS.md`, `PHASE_4_AMENDMENTS.md`, `PHASE_6_FOLLOWUP.md`), the analyst code (`rs2-local/`:
`depth_gates.py`, `depth_pipeline.py`, `thesis_monitor.py`), the published artifacts in
`public/data/` on `origin/main`, and the site code on `origin/main` (`components/desk`, `lib/desk`,
`app/`). Numbers that move daily (counts, regime, NAV) are examples as of the snapshot date — derive them
from the files at render time. The fixtures are real excerpts except `watch_items_example.json`, which is
explicitly illustrative because the follow-up system is not yet live.

**Staleness warning for this brief:** the analyst rebuild is *frozen but not in production*; the
follow-up system is *built but not live*; `KIS_HALT` (real-money mirror) and `DEPTH_PAUSED` (analyst
sweep) are on. When go-live happens, update `02_` §3–§4 and `05_` §5.3 first.

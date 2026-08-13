# Changelog

User-facing changes are mirrored in the header version button (Cockpit), sourced
from `lib/changelog.ts` — keep the two in sync.

## [0.2.1] — 2026-08-13

### Non-tradable names removed from the quant and RS2 lanes

**What:** `score_factors.py` gained a `not_tradable` veto (engine:
`scripts/tradability.py`). A vetoed name loses `fct_band`, and — through the
veto guardrail already in `apply_llm_overlay()` — its RS2/LLM band too, so it
cannot be ranked, planned, sized, or ordered by any downstream consumer.

**Why:** `stocks.json` is a carry-forward database and is **never pruned**.
`fetch_data.py` scans today's NASDAQ/NYSE/AMEX listing and writes results into
the previous run's records, so a name that leaves the listing (acquired, taken
private, ticker renamed, suspended pending a merger) keeps its last good record
forever and keeps scoring on frozen fundamentals.

**Evidence:** CPRX left the listing after the 2026-07-16 scan and was never
fetched again. Twenty-five days later it was still `fct_rank` 6 with a
`research_now` band in **both** lanes, held by `equal` and `equal_llm`, and RS2
was still publishing conviction 13.0 / "Initiate Position" against a price
frozen at the deal. KIS was the first component in the stack to notice, on
2026-08-13, when it refused the buy with 거래정지종목 — four weeks late. On that
date `stocks.json` carried **231** records absent from the live listing; 6 of
them still had a live quant band (AVNS, BK, CPRX, EA, JHG, MASI).

**Detection is preemptive, not reactive.** `fetch_data.py` now stamps
`last_listed` on every record from the exchange listing it already fetches each
run; a name absent for more than `grace_days` (5) is vetoed. No broker
round-trip, no price-staleness heuristics, no extra API.

**Two safety valves**, because the failure mode of this check is catastrophic
(a truncated listing feed makes the entire universe look delisted):
- `fetch_data.py` skips the whole reconciliation when the listing returns fewer
  than 5,000 names — `last_listed` simply fails to advance and nothing is newly
  vetoed until the feed recovers.
- `tradability.scan()` drops the automatic path entirely when more than 10% of
  the universe reads as unlisted, and says so loudly in the run log.
Unknown listing state is never a verdict, and a name that returns to the listing
is un-vetoed on the next run.

**Manual list:** `scripts/not_tradable.json` covers names that are still listed
but untradable anyway (a halt, or a broker-side gap — the GRDN/JLHL/WILC class
in `docs/KIS_SYNC.md`). Seeded with CPRX. This is the audit's F-11 proposal
("maintain an explicit exclude-list for KIS-untradable names so the ledger and
account agree on the investable set"), previously declined.

**Held names are not force-sold.** A vetoed name has `fct_band = None`, which
`track_paper_portfolios.py` reads as *unevaluated* rather than *departed*, so it
is carried, not liquidated — correct for a suspended name, which cannot be sold
anyway. Exit it manually once the tape reopens.

**Implementation:** `scripts/tradability.py` (pure, stdlib-only), a listing
stamp in `fetch_data.py`, a veto branch in `score_factors.py` writing
`fct_veto='not_tradable'` + `fct_veto_detail`. Covered by 15 unit tests in
`scripts/test_tradability.py`.

## [0.2.0] — 2026-08-04

### equal_llm churn fix — exit hysteresis (F-04)

**What:** `scripts/track_paper_portfolios.py` now retains a held `equal_llm` name
that has slipped out of the strict `research_now` gate until it falls below a
looser **exit band**, instead of selling it the moment it crosses the cliff.

- **Entry unchanged** — a name still enters only on the strict gate
  (`score_factors.apply_llm_overlay`: deep MoS ≥ 30 / MoS ≥ 15 & conviction ≥ 9.5).
- **Exit band (new)** — a held name is retained while live MoS ≥ 10 **or**
  (conviction ≥ 9.0 with MoS ≥ 10 or a fresh buy), and always while deep-value
  MoS ≥ 25. Below that it sells via the normal 2-run leaver path.
- **Hard exits preserved** — a bearish/hard-sell verdict (AVOID/SELL/REDUCE/TRIM/
  EXIT/SHORT or stance `overvalued`) or a quant veto still exits immediately;
  hysteresis only buffers the *numeric* boundary.
- **Scope:** `equal_llm` only. The quant `equal` ledger (F-07) is untouched.

**Why:** F-04 was the dominant remaining churn engine after the F-01 verdict-
stability (anchor) fix. Live MoS is recomputed daily against moving prices, so a
name near MoS 15 / conviction 9.5 oscillated in and out of the book on ordinary
price noise — paying two sides of cost each round-trip, and mechanically selling
into strength.

**Evidence:** git-history replay (`scratchpad/hyst_bench.py`, `hyst_sweep.py`,
validated vs production `fct_band_llm` at 0.859 Jaccard). At 0.25%/side the
hysteresis book nets more than the hard cliff (~+0.5pt over the post-anchor
window) and cuts `equal_llm` trades ~30%; the exit-threshold sweep shows a
plateau at MoS-exit 8–12 that degrades if widened past that.

**Implementation:** new `llm_hold_qualifies()` helper + target-set retention in
`track_paper_portfolios.py`; thresholds `HYST_EXIT_MOS/DEEP/CONV = 10/25/9.0`.
Live-MoS/staleness/bearish logic mirrors `score_factors.apply_llm_overlay` — kept
in sync via comments. Covered by 7 unit tests in
`scripts/test_track_paper_guards.py`.

**UI:** added a header version button (left of the `?` help button) that opens
this changelog, sourced from `lib/changelog.ts`.

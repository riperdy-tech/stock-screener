# Changelog

User-facing changes are mirrored in the header version button (Cockpit), sourced
from `lib/changelog.ts` — keep the two in sync.

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

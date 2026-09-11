# Grading horizon defect — FOUND AND FIXED 2026-09-11

**Status: resolved.** The current `rs2_verdict_outcomes_extended.json` is sound. This note is
kept because the defect is instructive and the guard must not be removed.

## What was wrong

The documented methodology is "exit = last close on or before verdict date + horizon." That
is correct only when the price series extends past `date + h`. `outcome_price_cache.json`
ends 2026-09-04 while verdicts run to 2026-08-19, so the rule silently degenerated to "last
close available." A row labelled 60 days could be a 16-day holding period, with no error.

First generation, before the fix:

| Label | Rows | Median actual days | Held under 80% of label |
|---|---|---|---|
| 30d | 1046 | 29 | 13% |
| 60d | 659 | 36 | **72%** |

## Why the guard is correct, not just convenient

The decisive evidence came from the original 600 graded rows. Their exit-minus-entry gaps are
**strictly 28 to 30 days, never below 28**, even though the cache would have permitted shorter
gaps. The original grader therefore treated an unreached horizon as *pending*, not as
gradable on a truncated stand-in. The guard restores documented behaviour rather than
inventing a new rule.

## The fix

`scripts/grade_verdicts_offline.py` skips a horizon when the resolved exit falls more than 3
calendar days short of `date + h`, reusing the method's own 3-day benchmark-alignment
tolerance. After the fix:

| Label | Rows | Median actual days | Min | Under 80% of label |
|---|---|---|---|---|
| 30d | 859 | 29 | 23 | 1 |
| 60d | 115 | 58 | 51 | 0 |

**Do not remove this guard.** If the price cache is later extended past `date + h` for all
verdicts, the guard becomes a no-op and the 60-day sample grows on its own.

## Two coverage caveats that remain

**Thin price coverage.** Only 118 of the 626 cached tickers extend into the 2026-06-29 to
2026-08-19 verdict window. The other 505 cover mid-May to mid-June, before any verdict exists.
Extending the cache is the single cheapest way to grow this dataset.

**One ticker dominates.** ELMD accounts for 97 of the 859 rows at 30 days, roughly 11% of the
sample, from same-day repeat verdicts. GD, VCYT and NOVT contribute 12 to 13 each. Read the
name-weighted figures first; the observation-weighted ones overstate significance.

## Verification that passed

All 600 rows overlapping the original `rs2_verdict_outcomes.json` reproduce it exactly, zero
mismatches on `excess_iwm_pct`. Five rows were independently re-graded and matched to
rounding.

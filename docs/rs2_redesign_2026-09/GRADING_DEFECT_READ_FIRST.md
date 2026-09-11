# Defect in `rs2_verdict_outcomes_extended.json` — fix before using the 60d rows

**Found 2026-09-11 by validation, before any use.** The 30-day rows are usable with a
small filter. **The 60-day rows are not usable as they stand.**

## What is wrong

The documented methodology is "exit = last close on or before verdict date + horizon."
That is correct when the price series extends past `date + h`. It does not here:
`outcome_price_cache.json` ends 2026-09-04 and verdicts run to 2026-08-19.

When the series ends early, the rule silently degenerates to "last close available," so a
row labelled 60 days can be a 16-day holding period. The label and the reality diverge with
no error raised.

Measured actual holding periods against the labels:

| Label | n | Median actual days | Held under 80% of label |
|---|---|---|---|
| 30d | 1046 | 29 | 133 (13%) |
| **60d** | **659** | **36** | **476 (72%)** |

Holding-day deciles for the 60d bucket: 17, 24, 36, 51, 58.

**Consequence.** Comparing the 60d bucket to the 30d bucket to test whether the edge decays
is meaningless. You would be comparing a 29-day average against a 36-day average and calling
it 30 versus 60. That comparison was the main reason for computing the 60d horizon at all.

## The fix

In `scripts/grade_verdicts_offline.py`, require the exit date to actually reach the horizon
before emitting a row:

```python
MIN_FRACTION = 0.9
actual_days = (exit_date - entry_date).days
if actual_days < horizon * MIN_FRACTION:
    skip("exit_date does not reach the labelled horizon")
```

Also emit `horizon_actual_days` on every row so the divergence can never be silent again.

Expected yield after the fix: 30d largely intact, 60d falling to roughly 100 rows. A smaller
honest sample beats a large mislabelled one.

## What the validation did confirm

All 600 rows that overlap the original `rs2_verdict_outcomes.json` reproduce it exactly,
zero mismatches on `excess_iwm_pct`. The entry-side logic and the benchmark arithmetic are
correct. The defect is purely in the exit-side horizon guard.

## Until it is fixed

- The 30d rows may be used after filtering to `actual_days >= 24`.
- The 60d rows must not be used for anything.
- Do not draw any conclusion about edge decay from this file.

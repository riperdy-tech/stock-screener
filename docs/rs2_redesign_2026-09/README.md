# RS2 Redesign — session output, 2026-09-08 → 2026-09-11

Output of a read-only audit and redesign session run in Claude Code on the web.
No pipeline code was modified. Everything here is analysis and design.

## Read in this order

| File | What it is |
|---|---|
| `RS2_SYSTEM_AUDIT_HANDOFF.md` | **Start here.** Full system description end to end, every measured finding, reproduction method. Self-contained — an AI reading it cold needs nothing else. |
| `RS2_GROUND_UP_REDESIGN.md` | The attention-allocation architecture. Six tiers, four supporting literatures, capacity arithmetic. |
| `RS2_MERGED_PLAN.md` | Reconciles the above with the external Opus recommendations. Adds the evidence-tier discipline that decides what may be acted on now. |
| `rs2-sector-audit-brief.md` | Earlier sector-concentration brief. Superseded in part — carries a retraction notice. |
| `rs2-research-findings.md` | Literature review that retracted one finding and surfaced the discount-rate issue. |

## Decisions already settled

- QQQ profit level is an aspiration, not a design input. The method does not bend to reach it.
- Book size 30.
- Zero cash preference. When the queue is short, size up existing holdings rather than adding a marginal name.
- Local and cloud depth engines are treated as interchangeable. Closed question.

## State of work at handoff

**Settled by measurement**
- Effective pillar weights are not the declared ones: value 4.4% against a nominal 20%, revisions 35.4%.
- Conviction discriminates: top tercile +3.81% excess vs IWM at 30d, bottom −6.94%. Note conviction runs 0–15 with median ~9.5, so these are above/below median, not extremes.
- Turnover on the AI book ran 45× annualised at inception, ~32× on the last sessions measured.
- The verdict rule `price < min(IV band)` is structurally biased against wide bands.

**In flight at handoff**
- Offline grading of the pending verdict horizons. ~525 rows gradeable at 30d (about 242 new) and ~102 at 60d, all from `public/data/outcome_price_cache.json`, which covers 2026-05-18 to 2026-09-04 and includes IWM, SPY and QQQ. No network needed. The 60-day horizon has never been computed and tests whether the edge decays past a month.

**Blocked on the local machine**
- Breakdown of the ~80-minute per-name depth cost. Needs `cache/depth_orchestrate.log` in the `rs2-local` repo, which is not committed. This decides whether a cheap triage tier is a config change (one sample, low thinking level) or a build.

## Next actions

1. Finish the offline grading and read the edge profile by sector, size, coverage, band width and conviction. Everything downstream depends on knowing where the analyst has edge.
2. Run the 80-minute breakdown locally.
3. Ship the four internal contradictions: null benchmark closes, exit hysteresis, pillar standardisation with the sector cap, and the second discount table. These need no market evidence because in each case the code contradicts its own documentation.

## Caveat that applies to everything here

No claim in these documents has been validated against realised returns. The ten-year
price cache is absent and market-data egress was blocked during the session. Everything is
a claim about construction soundness, not profitability. Both live books were losing at the
time of writing.

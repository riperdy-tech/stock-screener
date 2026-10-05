# 05 — States, honesty rules and the copy that must survive the redesign

The machine behind this site is deliberately strict about what it claims. The design's biggest risk is
not ugliness — it is **accidentally making the system look more certain, more proven, or more complete
than it is.** Every rule below exists because something specific went wrong or because the system's own
audit demanded it.

## 5.1 The twelve honesty rules (apply to every surface)

1. **Missing is missing.** `null` → "—" / "not available" (+ the reason when the file gives one). Never
   `0`, never an interpolated or defaulted number, never a silently shorter table. (`0.0` is a real
   value — a 0 % return is not "no data".)
2. **A blocked verdict is shown, labelled, and explained.** `actionable === false` → grey treatment,
   "BLOCKED" label, plain-English reasons, never styled like a recommendation, never counted in "AI
   picks". It stays on the page ("kept for the record").
3. **A veto is shown with its reason.** Disqualified names appear dimmed with `✕ VETOED · reason`; the
   AI cannot override a veto and the UI must not imply it can.
4. **The verdict is frozen at verdict time.** Direction is the pipeline's judgement of *price at
   verdict date* vs the value band. The site shows today's price beside it, flags "price now outside the
   band", and **never recomputes the verdict from a live price.** (Margin of safety may be shown against
   today's price as a display figure; label which price it uses.)
5. **Counts are real counts.** Never write "3 runs" — write `samples_run` / `n_basis`. A single run is
   shown as a point value with "one run — size capped", never as a range.
6. **Stamp provenance on anything an old analyst produced.** `pack_revision` / `gate_version` /
   `model` identify the generation. Old-analyst rows (`gate_version` null) read "made by the old
   analyst — kept for the record". `arm: cloud_api` rows read "cloud stand-in — degraded (no local
   research)".
7. **A paper record is a paper record.** Always "paper", "simulated", with the cost assumption stated
   and the observation count beside every ratio. Annualised CAGR/Sharpe on ~36 observations are noise —
   de-emphasise.
8. **Never imply the machine has been proven.** The scoreboard shows graded vs pending counts, the
   `caveats[]` verbatim, and the "legacy / inconclusive" label while only old-analyst rows are graded.
   Do not show a green "AI beats the market" headline from a thin or invalid sample; do not show a red
   one either — show the count.
9. **Never imply the machine acts on news.** Monitoring never sells. News/8-K events appear as "re-analysis
   queued" or "no new information", never "sell signal". A held name is only removed by a new verdict.
10. **Stale is loud.** Every stamp has an expected cadence; beyond it the stamp turns amber and the
    health dot changes. `followup_asof` > 36 h or missing → `buy_paused` is *unknown* and displays as
    paused/unknown, never as buyable. MRI anchors/regime older than 45 days → visibly stale.
11. **No personalised advice.** The site presents a research system's output. "Buy"/"reduce" are the
    machine's *stance labels* on a research list, always beside the standing disclaimer. No "you should".
12. **Say what is switched off, and why.** Sector tilting is off (no validated edge); sector/regime read
    is low-confidence; the Kelly column is a cap; the cloud backstop is disabled; real-money mirroring is
    halted. Presenting negative results plainly is part of the brand's credibility.

## 5.2 The standing disclaimer (reword for length, keep every claim)

> StockPeak publishes the output of a research system. It is not investment advice, not a
> recommendation to buy or sell any security, and not personalised to your circumstances. Verdicts are
> model outputs about whether a price sits above or below a range of estimated values; they can be
> wrong. Track records shown are **paper (simulated) portfolios**, include assumed costs, cover a short
> period, and have not been shown to predict future returns. Historical macro data are revised data, not
> point-in-time. Do your own research; you can lose money.

## 5.3 The three data phases and what each looks like (design all three)

| Phase | Data reality | Required UI behaviour |
| --- | --- | --- |
| **A. Today (transition)** | ~24 old-analyst verdicts, all blocked; 0 actionable; AI book in cash since 2026-09-24; rebuilt analyst not in production | Banner "The AI analyst is being rebuilt. No new verdicts until it goes live; the verdicts below are kept for the record." Research-now section shows a *dignified empty state* ("No verdict passes the gate right now") that points to *why* (all remaining verdicts are from the old analyst) and *what happens next* (baseline run). Funnel tail reads 0. Blocked group holds the legacy verdicts. |
| **B. Baseline fill** | New-analyst verdicts trickle in (~1h45 of GPU per name; ~160 names → ~11 GPU-days). Most book names have no verdict yet. | Progress element ("N of 161 underwritten", ETA is not promised). "Awaiting underwriting" is the biggest group and reads as *queued*, ordered by priority (`fct_rank`). New verdicts appear in blocked/watchlist/research-now by the normal rules. No "failed" styling for names merely not reached yet. |
| **C. Steady state** | Daily follow-up live; every name refreshed ≤ 14 days; waiting/paused/held populated; AI record reset; grading accumulating | Full design incl. Waiting group, What we're watching, record-reset markers, graded scoreboard growing. |

Also design for **unknown phase** — if `gate_version` mixes (old + new rows coexist during the
baseline), each row carries its own provenance label; do not assume the whole overlay is one
generation.

## 5.4 Empty, partial and degraded states — checklist

- No verdicts at all (`count: 0`) · all verdicts blocked · one verdict · verdict but no depth report
  bundle (transcripts unavailable) · verdict with `direction: null` (not usable).
- Company on the list but not in `valuation_models` (negative base cash flow / no market cap → "no
  model: reason").
- `fct_z` pillars null (e.g. revisions missing for uncovered names) — show missing, not zero.
- Price missing/stale for a name (paper ledger `stale_marks[]`) — flag stale mark.
- `paper_ledgers.alerts[]` contains errors (e.g. snapshot ahead of as-of) — surface them.
- Discount rate fell back to constant (`discount_rate_source != anchor`) — a quiet "using fallback
  discount rate" tag on expectation-gap numbers.
- Macro read stale or `degraded` — label it; do not hide the element.
- Signed-out user (no `mine` book, no snapshot) vs signed-in; Supabase not configured (the app already
  degrades to local data — keep that).
- Language switch: all strings via i18n; Korean strings are noticeably longer — leave room.
- Slow/failed data fetch: skeletons, not layout jumps; per-file failure shouldn't blank the whole page.

## 5.5 Language that must not appear (and what to write instead)

| Don't write | Write |
| --- | --- |
| "AI picks beat the market" / "alpha" | "Paper record since {date}: {n} observations" |
| "Strong buy" / "Top pick" | "Undervalued — every run above the price" + size hint |
| "Conviction 13/15" as the lead | the crux sentence; conviction as a small detail |
| "Kelly says 24.75 % of your portfolio" | "Upper bound (quarter-Kelly cap): 24.75 %" |
| "Sell signal" (from news) | "Re-analysis queued" |
| "Predicts the market" (macro) | "Context only — weak signal" |
| "3 runs agree" (hard-coded) | "{n_basis} of {samples_run} runs usable · spread {x} %" |
| "Proven" / "validated" / "backtested" | "Not yet proven — {graded} graded, {pending} pending" |

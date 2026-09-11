# RS2 Rebuild — Merged Plan

**What this is.** A single plan reconciling two independent redesign proposals: the Opus
recommendations document and the attention-allocation redesign. Where they agree, that is
noted as independent corroboration. Where they conflict, this document picks and says why.

**Compiled** 2026-09-10. Supersedes the fix ordering in both source documents.
Companion to `RS2_SYSTEM_AUDIT_HANDOFF.md` and `RS2_GROUND_UP_REDESIGN.md`.

> **Not reviewed:** the DeepSeek deep-research output. Egress to `chat.deepseek.com` is
> blocked from this environment. Paste or export it and this plan should be re-checked
> against it before anything is built.

---

## 1. THE EVIDENCE DISCIPLINE (read this first)

Both source documents make the same mistake in opposite directions: they mix findings of
wildly different evidential strength into one action list. This plan sorts every proposed
change into three tiers, and the tier determines whether you may act now.

| Tier | Standard of proof | May act |
|---|---|---|
| **A — Internal contradiction** | The code contradicts its own documentation, or is arithmetically inconsistent. No market evidence required. | **Now** |
| **B — Design change under monitoring** | Sound reasoning plus corroborating literature. Effect measurable but not yet measured. | **Yes, with instrumentation** |
| **C — Rests on the 2-month graded window** | n = 14–134, June–July 2026, one falling regime. The source file's own caveats say descriptive, not evidence of edge. | **No, until point-in-time backtest** |

**The single most important line in this plan:** the recommendation to stop mirroring the
`research_now` band to real money, and the recommendation to run a book off
`watchlist + undervalued`, are both **Tier C**. The Opus document leads with them while its
own caveats call the evidence weak. Do not act on n=75 and n=29 from one falling two-month
regime, in either direction.

**What to do about real money instead.** Every Tier A change below reduces risk regardless
of whether the band finding is real. Ship those. That addresses the live exposure without
betting on a result you cannot yet support.

---

## 2. WHERE THE TWO DOCUMENTS AGREE (independent corroboration)

These were reached separately and should be treated as the most reliable conclusions
available:

1. **Decouple candidate selection from return ranking.** The screen's job is recall of
   plausibly mispriced names; the LLM is the precision stage.
2. **F10 is the central internal finding.** Declared equal weighting is false; value carries
   4.4% effective weight.
3. **F10 and F3 must ship together.** Re-standardisation raises healthcare to 45.6%.
4. **F2 precedes F4 and F5.** The discount-rate error scales with leverage.
5. **Sector routing belongs upstream**, in the screener, not only in `rs2-local`.
6. **Missing-by-convention must route, not penalise.**
7. **Turnover control via hysteresis is the highest-confidence quick win.**

---

## 3. THE MERGED ARCHITECTURE

Seven stages. Sources marked: **[O]** Opus, **[A]** attention-allocation, **[M]** merged here.

**Stage 0 — Tradability gate [O+A, agree]**
Hard-exclude only on tradability, capacity, liquidity and data-existence grounds. No quality
judgment. This retires the reverse engine's role as a return filter, which currently vetoes
59–88% of names per sector.
*Calibrate the liquidity floor to real KIS fills, not reported volume.* **[A]**

**Stage 1 — Sector-routed valuation prior with honest uncertainty [M]**
Opus made routing a separate downstream stage; it belongs inside the prior, because the
routing decision *is* what makes the prior computable for a bank.
Per name produce a distribution, not a score: `μ` (point mispricing) and `σ` (uncertainty).
- Route by business type: banks/insurers/mortgage → P/B-ROE (ROTCE, NIM, efficiency);
  regulated utilities → justified-P/B with explicit cost of equity; REITs → FFO/AFFO/NAV;
  asset-light → reverse-DCF; Credit Services and Capital Markets stay on DCF as fee businesses.
  **Port `rs2-local/valuation_backbone.py` upward — it already does most of this.**
- `σ` from ensemble dispersion across 3–5 cheap methods, not from a formula. **[A]**
- Signal set: expectations gap (implied vs achievable growth) as the lead, corroborated by
  FCF/EBIT/earnings yield and intangible-adjusted value. **[O]**
- Value-trap guards: quality overlay (QARP) and momentum. **[O]**

**Stage 2 — Priority index, not a composite rank [M]**
Rank by expected information gain, approximating Weitzman's reservation value:
opportunity × uncertainty × actionability × freshness, with a staleness decay and an
exploration bonus for never-analysed names. **[A]**

**The Miller/Diether-Malloy-Scherbina correction — this is the fix to Opus's Stage 1. [A]**
Opus proposes ranking by valuation spread. High dispersion predicts *lower* returns via
short-sale constraints, so in a long-only book that selects for overvaluation. Your live
split of 105 overvalued / 60 hold / 34 undervalued is that mechanism running.
**Rank on the left tail, not the mean:** `(P5 of the ensemble IV estimates − price) / price`.
A name qualifies only if even the pessimistic model says it is cheap. This converts the
overvaluation skew from a hazard into a filter.

**Stage 3 — Cheap LLM triage [A; absent from Opus]**
A 5–10 minute bounded pass on ~4,000 names/year returning a coarse IV range, a confidence,
and one line of reasoning. Escalate to Stage 4 on **low confidence** or **large divergence
from the Stage 1 prior** — never on predicted return.
**Infrastructure already exists:** the DeepSeek cloud arm runs depth analysis off-peak, three
names concurrently, on a job time budget. It is currently a backstop for the same 170-name
queue. Repoint it.

*Why this stage is not optional.* Opus passes 20–30% of the universe straight to the deep
queue: roughly 700–1,000 names against ~2,750 analyses/year at 80 minutes each. That queue
takes ~90 days to clear, colliding with your own 90-day staleness floor. The triage tier is
what makes a wide funnel compatible with the capacity constraint.

**Stage 4 — Deep analysis [M]**
Keep the engine; it measurably works. Two changes, one from each source:
- **Replace the band-crossing rule with a continuous score [A]:**
  `m = (median_IV − price) / (band half-width)`. Comparable across names of different
  uncertainty, degrades gracefully, doubles as a sizing input. This fixes the structural bias
  that makes a wide band almost unable to produce a buy (median width 15.9% undervalued vs
  41.3% overvalued).
- **Add a margin-of-safety buffer and hysteresis on top of it [O]:** enter below
  (threshold − buffer), exit above (threshold + buffer). Opus is right that this is the
  turnover lever; it is right *on top of* the continuous score, not instead of it.

**Stage 5 — Construction [M]**
- **Size on `m × conviction`, quarter-Kelly, hard per-name cap.** Conviction is the
  strongest measured signal in the dataset and is currently unused. **[A]**
- Weight-based sector cap, iterated to convergence, start 25%. **[O+A]**
- 8% single-name cap, so redistribution cannot create a new concentration. **[O]**
- 20–30 name target book. **[O]**

**Stage 6 — Outcome grading feeding Stage 2 [A; absent from Opus]**
Train the priority index to predict **whether analysis pays**, not whether the stock rises.
The labels exist: 600 graded and 6,567 pending verdict-horizons. This is the Bayesian-
optimisation surrogate and the highest-value unused asset in the repository.

**Stage 7 — Validation harness [O; absent from mine]**
Take this section wholesale from the Opus document:
- Survivorship-free point-in-time prices including delisted, PIT fundamentals, PIT estimates.
- Costs at 25 bps/side. Quarterly rebalance. Multi-regime span including 2008, 2020, 2022.
- Deflated Sharpe (Bailey & López de Prado), probability of backtest overfitting via CSCV,
  combinatorial purged cross-validation with embargo, minimum-backtest-length check.
- **LLM contamination controls:** evaluate verdict stages only post-training-cutoff, or with
  ticker/company/date anonymisation. Backtest quant stages over full history.
- **Pre-register pass/fail thresholds before running.**
- Data: Sharadar SF1/SEP (or Norgate for prices) plus EDGAR companyfacts as free baseline.

---

## 4. THE ACTION LIST, TIERED

### Tier A — internal contradictions, ship now

| Change | Why it needs no market evidence |
|---|---|
| **F9** benchmark nulls | NAV runs to Sep 8, benchmarks stop Sep 4. Reported excess is arithmetically wrong. |
| **F1** restore exit hysteresis | Removed on a premise contradicted by your own cadence spec §2. Your own benchmark: ~30% fewer trades, nets more than the hard cliff. |
| **F10** pillar standardisation | `factor_weights.json` declares 0.2 each; actual is value 4.4%, revisions 35.4%. Declared behaviour ≠ actual behaviour. |
| **F3** weight-based sector cap | Ships with F10 by dependency. Also fixes the name-count implementation trap (29 survivors still leave healthcare at 27.6%). |
| **F2** split the WACC table | One table serving two mutually exclusive definitions. Add a second; do not overwrite — three ROIC call sites depend on it. |

**Real-money position:** ship Tier A. It cuts turnover cost and caps the 40% healthcare
concentration that produced the −88 bps on Sep 8. That addresses the live exposure without
acting on Tier C evidence.

### Tier B — design changes, build with instrumentation

| Change | Instrument it with |
|---|---|
| Stage 0 tradability gate | Coverage: what fraction of 6,600 survives, by sector |
| Stage 1 routed prior | Fraction receiving a valid (μ, σ); σ calibration vs realised revision |
| Stage 2 priority index v0 | Run in parallel with the current screen; measure queue overlap |
| Stage 3 triage tier | **Does triage confidence predict deep-analysis conviction?** Cheapest experiment in the plan; if no, the cascade fails and you learn it for 8 minutes a name |
| Stage 4 continuous `m` | Re-grade verdict history under the new rule |
| Stage 5 conviction sizing | Realised spread between high- and low-conviction holdings |
| Stage 6 feedback loop | Out-of-sample lift of priority v1 over v0 |
| F4 + F5 convention-aware dq and routing | Sector coverage before/after |

### Tier C — do not act until the Stage 7 backtest clears

- Stop mirroring `research_now` to real money.
- Build a book on `watchlist + undervalued`.
- Retire the quant book to paper.
- Drop or keep any factor on the strength of the June–July window.

---

## 5. BUILD ORDER

| Phase | Work | Gate to next phase |
|---|---|---|
| 0 | Tier A in one release | CI green; turnover and concentration measured for two weeks |
| 1 | **Grade the 6,567 pending horizons** | You know where the analyst has edge by sector, size, coverage, band width, conviction |
| 2 | Stage 0 + Stage 1 | Valid (μ, σ) coverage above an agreed floor across all sectors |
| 3 | Stage 2 v0, shadow mode | Queue overlap with the current screen quantified |
| 4 | Stage 3 triage | Triage confidence correlates with deep conviction |
| 5 | Stage 4 + Stage 5 | Turnover economic at 25 bps; concentration within caps |
| 6 | Stage 6 feedback | Priority v1 beats v0 out of sample |
| 7 | Stage 7 harness + PIT data | Pre-registered thresholds met |
| 8 | Tier C decisions | Only now |

**Phase 1 is the one people skip and should not.** Every stage after it routes work toward
where the analyst has edge. You do not currently know where that is, and the labels are
sitting unused.

---

## 6. OPEN AND UNRESOLVED

1. **DeepSeek research not reviewed** — egress blocked. Re-check this plan against it.
2. **Does RS2's edge survive outside well-covered momentum names?** Its +3.81% high-conviction
   excess was earned on the current universe. Thin small caps are untested and plausibly worse.
3. **Can Stage 1 produce an honest σ?** Ensemble spread is a proxy, not a posterior. Shared
   input errors understate it.
4. **Is 8-minute triage informative?** Phase 4 exists to answer this. If not, the cascade
   collapses to random sampling within the priority ranking.
5. **The left-tail rule is untested.** It is a reasoned mitigation for the dispersion anomaly,
   not a measured one.
6. **Both live books are losing.** Quant −6.00%, RS2 AI −3.19%. The null hypothesis that none
   of this produces alpha remains live and no part of this plan refutes it.
7. **The 50% return target** came from the brief to Opus, not from the audit. On its face it is
   incompatible with an 8% name cap and quarter-Kelly sizing. Resolve it explicitly rather than
   letting it sit as an unstated constraint.

---

## 7. ONE PARAGRAPH

Ship the five internal contradictions now, because they need no market evidence and they cut
both the turnover bleed and the concentration that caused the September 8 loss. Then grade
your 6,567 pending verdict outcomes, because every architectural decision downstream depends
on knowing where your analyst actually has edge and you have never looked. Then rebuild the
funnel to allocate 80-minute analyses by expected information gain rather than by predicted
return, insert a cheap triage tier using cloud infrastructure you already built for another
purpose, rank on the pessimistic tail rather than the mean so that screening on uncertainty
does not simply select for overvaluation, and close the loop so the priority function learns.
Build the validation harness with deflated Sharpe, purged cross-validation and LLM
contamination controls before you let any of it touch real money. And do not, in the meantime,
restructure a real-money book on the strength of twenty-nine observations from one falling
two-month regime — which is the one recommendation both source documents flag as weak and only
one of them then makes anyway.

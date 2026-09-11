# Ground-Up Redesign: An Attention-Allocation Engine for Equity Valuation

**Brief.** The existing quant→RS2 structure is abandoned. This document proposes a
replacement designed from first principles around the binding constraint: RS2 deep analysis
costs ~80 minutes per name, the universe is ~6,600 names, and you can afford roughly
11–13 analyses per day.

**Compiled** 2026-09-10. Companion to `RS2_SYSTEM_AUDIT_HANDOFF.md`.
Evidence tags: **[MEASURED]** from the repo · **[LIT]** from published research ·
**[DESIGN]** proposed · **[UNKNOWN]** open.

---

## 1. THE REFRAME

The current system asks: *which stocks will outperform?* It answers with a five-factor
composite, takes the top decile, and hands 170 names to the analyst.

That is the wrong question. The screener is not the thing that makes money — the deep
analysis is. The screener's only job is **deciding where to spend 80 minutes.** Those are
different objectives and they have different optimal solutions.

> **The correct objective: maximise expected discovered mispricing per unit of analyst time.**

Formally, the value of analysing stock *i* is
```
V_i  =  P(materially mispriced)  ×  E[|mispricing| | mispriced]  ×  P(we detect it)  ×  P(we can act)
```
Note what is absent: expected return. A stock with a high predicted return that everyone
already agrees about is worthless to analyse — the analysis changes nothing. A stock whose
value is genuinely uncertain, where 80 minutes of work would resolve that uncertainty, is
valuable to analyse **even if its prior expected return is zero.**

This single change — from ranking on predicted return to ranking on *expected information
gain* — reorganises the entire pipeline.

---

## 2. WHY THE CURRENT DESIGN CANNOT WORK

Four measured facts, all from your own repository.

**2.1 The screen barely uses valuation. [MEASURED]**
`factor_weights.json` declares equal weighting. Because each pillar is
`mean_of_available(sub-metrics)` and averaging k correlated z-scores shrinks dispersion by
roughly 1/√k, effective weights are:

| Pillar | Sub-metrics | Nominal | Effective |
|---|---|---|---|
| revisions | 1 | 20% | 35.4% |
| momentum | 2 | 20% | 24.9% |
| quality | 4 | 20% | 18.7% |
| lowvol | 1 | 20% | 16.6% |
| **value** | 4 | 20% | **4.4%** |

Discrimination gap between banded and unbanded names: revisions +0.697σ, quality +0.446σ,
momentum +0.371σ, lowvol +0.197σ, **value +0.025σ**. Value is not selecting anything.

**You are using a momentum-and-analyst-coverage screen to choose candidates for an
intrinsic-value engine.** Your own cadence document says the two stages "measure different
things."

**2.2 The top band is anti-predictive. [MEASURED, weak sample]**
30-day excess vs IWM, clean rows (n=252, June–July 2026, one regime):
research_now −3.42% (t=−2.07, name-weighted −4.12%), watchlist +0.58%, monitor −0.54%.

**2.3 The verdict rule is structurally biased against uncertainty. [MEASURED]**
`direction = undervalued` requires `price < min(IV band)`. The wider the band, the
harder that is. Median `spread_pct` by verdict across 198 live names:

| Verdict | n | Median band width |
|---|---|---|
| undervalued | 33 | **15.9%** |
| hold | 60 | 39.0% |
| overvalued | 105 | 41.3% |

The engine can only say "buy" about names it is already confident in. Per §3.3 below, that
is precisely where mispricing is *least* likely to persist. And the live split is 53%
overvalued — the engine mostly finds things to avoid, in a universe that was screened on
momentum.

**2.4 But the engine itself has real, measurable edge. [MEASURED]**
Conviction terciles, 30-day excess vs IWM, clean rows:

| Conviction | n | Excess | t | Win rate |
|---|---|---|---|---|
| High (≥9.5) | 134 | **+3.81%** | +3.82 | 67% |
| Mid | 30 | −3.27% | −1.61 | 43% |
| Low (≤8.5) | 88 | **−6.94%** | −4.91 | 27% |

This is the strongest discriminator in the entire dataset — stronger than stance, stronger
than band. **The analyst works. The funnel feeding it does not.** That is the case for
rebuilding the funnel and keeping the analyst.

---

## 3. THEORETICAL FOUNDATIONS

Four independent literatures converge on the same design principle.

### 3.1 Optimal costly search — Weitzman's Pandora's Box [LIT]
Weitzman (1979, *Econometrica*, "Optimal Search for the Best Alternative") solves exactly
this problem: n boxes, each containing an unknown prize drawn from a known distribution,
each costing c_i to open. Which do you open, in what order, and when do you stop?

The solution — **Pandora's Rule** — assigns each box a *reservation value* ζ_i, the smallest
solution to
```
c_i  =  E[(X_i − ζ_i)⁺]
```
i.e. the value at which you are indifferent between opening the box and stopping. Then:
- **Ordering:** open boxes in decreasing order of ζ_i.
- **Stopping:** stop when the best prize already observed exceeds the ζ of every unopened box.

The rule is greedy, order-non-adaptive, and provably optimal. Each ζ_i depends only on that
box's own distribution and cost — not on any other box.

**The critical property for us:** ζ_i rises with the *dispersion* of X_i, holding the mean
fixed. A box whose prize is 5% ± 1% has a low reservation value; a box whose prize is
5% ± 40% has a high one, because the right tail is what you are paying to discover. **Search
should be directed by uncertainty, not by expected value.**

This is the formal justification for abandoning return-ranked screening.

### 3.2 Model cascades [LIT]
The ML-serving literature (FrugalML, CascadeServe, C3PO, budget-constrained LLM cascades)
establishes the complementary engineering pattern: run a cheap model on everything, escalate
to the expensive model only where the cheap model is *uncertain*. Reported savings of
40–85% of expensive-model cost at near-identical output quality.

The governing insight: most items are "easy" — far from the decision boundary — and a cheap
model handles them correctly. The expensive model earns its cost only on the hard cases.
**Routing is on uncertainty, not on the cheap model's predicted value.** Same conclusion as
Weitzman, arrived at independently.

### 3.3 Where mispricing actually lives [LIT]
Mispricing persists where arbitrage is constrained: high idiosyncratic volatility (the primary
holding cost in arbitrage), illiquidity, high beta, and thin analyst coverage. Where
corrective forces — informed arbitrageurs, media scrutiny, analyst coverage — are active,
mispricing is competed away before you can act on it.

This says the *opposite* of the current screen. Your screen's largest effective input is
analyst revisions, available for 51% of technology names and 1% of financials. You are
concentrating attention on the most-covered, most-arbitraged corner of the market.

**The critical complication.** Diether, Malloy & Scherbina (2002, *Journal of Finance*,
"Differences of Opinion and the Cross Section of Stock Returns") show that high analyst
forecast dispersion predicts **lower** future returns, most strongly in small stocks and
past losers. The mechanism is Miller (1977): when short-sale constraints keep pessimists out
of the market, price reflects the optimists, so disagreement means *over*valuation.

For a long-only book this is decisive. **High uncertainty is where mispricing lives, but its
sign is skewed toward overpriced.** Your live verdict split — 105 overvalued, 60 hold, 34
undervalued — is exactly what this predicts. A design that simply "screens on uncertainty"
will generate mostly shorts you cannot take.

The resolution, developed in §4, is to screen on uncertainty **that the analyst can resolve
asymmetrically** — situations where a defensible floor can be established, not merely where
opinions differ.

### 3.4 Bayesian optimisation and acquisition functions [LIT]
When each evaluation of an objective is expensive, Bayesian optimisation maintains a
probabilistic surrogate over the whole space and selects the next evaluation by maximising an
*acquisition function* — Expected Improvement or Upper Confidence Bound — which explicitly
trades exploitation (evaluate where the surrogate predicts high value) against exploration
(evaluate where the surrogate is uncertain).

This supplies the missing machinery: a *learned* priority function that improves as
evaluations accumulate, rather than a hand-tuned factor composite that never learns.

---

## 4. THE PROPOSED ARCHITECTURE

Six tiers. Each is cheap relative to the next. Each selects on uncertainty-adjusted
opportunity, never on predicted return.

```
T0  Eligibility            ~6,600 → ~3,500     free, deterministic
T1  Valuation prior        ~3,500 → ~3,500     seconds/name, produces (μ, σ)
T2  Priority index         ranks all           free, Weitzman/UCB
T3  Cheap LLM triage       ~4,000/yr           5–10 min/name, cloud
T4  RS2 deep analysis      ~2,750/yr           80 min/name, local
T5  Construction           ~30–50 held         caps, sizing, hysteresis
T6  Outcome grading        every verdict       feeds back into T2
```

### T0 — Eligibility, not judgment [DESIGN]
Purely mechanical: listed and tradable, above a liquidity floor you can actually fill at KIS,
above a market-cap floor, not an ETF or fund, has the *inputs its own valuation model
requires*.

**The design rule that matters:** T0 removes what you cannot act on. It does **not** remove
what looks unattractive. Every quality judgment moves downstream. This is what kills the
current data-quality haircut problem: a bank is not penalised for lacking EBITDA, it is
routed to a model that does not need EBITDA.

### T1 — A valuation prior with an honest uncertainty [DESIGN]
For every survivor, produce a *distribution*, not a score:
```
μ_i = point estimate of mispricing  =  (IV_estimate − price) / price
σ_i = uncertainty on that estimate
```
Two design requirements.

**Model routing by business type.** You have already built this in
`rs2-local/valuation_backbone.py`: P/B-ROE for banks, insurers and mortgage lenders;
justified-P/B with an explicit 7% cost of equity for rate-regulated utilities; reverse-DCF
for asset-light operators; Credit Services and Capital Markets deliberately kept on the DCF
as fee businesses. Port it up into T1 and extend it. A name whose correct model cannot be
run is *excluded with a reason*, not silently haircut.

**σ from ensemble spread, not from a formula.** Run 3–5 cheap valuation methods per name
(reverse-DCF, residual income, peer multiple, asset-based where applicable) and let σ_i be
the dispersion across them. Wide disagreement between methods is the cheapest possible proxy
for "this needs a human-grade look."

### T2 — The priority index [DESIGN] ← the heart of the redesign
Rank every eligible name by an acquisition function approximating the Weitzman reservation
value. A tractable form:

```
Priority_i  =  E[ (Gain_i − ζ)⁺ ]  /  c_i

where  Gain_i  ~  Normal(μ_i , σ_i²)  truncated at the actionable side
       c_i     =  analysis cost (constant ≈ 80 min, or lower for a re-run)
```

In practice this reduces to a UCB-style score with four multiplicative adjustments:

| Term | What it captures | Source in your repo |
|---|---|---|
| **Opportunity** μ_i | prior mispricing magnitude | T1 |
| **Uncertainty** σ_i | how much analysis could change the estimate | T1 ensemble spread |
| **Actionability** | can you buy it, in size, at KIS | tradability + liquidity |
| **Freshness** | information arrived since last look | your 8-K / filing / >8% move triggers, already built |
| **Staleness decay** | verdict age | your 90-day rotation floor |
| **Exploration bonus** | names never analysed | new — prevents the queue collapsing onto known names |

**The long-only correction (§3.3).** Because dispersion skews toward overvaluation, weight
the *downside-protected* side of the distribution: prefer names where a defensible **floor**
exists — asset backing, net cash, contracted revenue, regulated rate base — over names where
the disagreement is purely about the growth tail. Concretely, use the left tail of the T1
ensemble, not the mean: rank on `(P5 of IV estimates − price)/price`, so a name qualifies
only if even the pessimistic model says it is cheap. This turns the Miller/DMS overvaluation
bias from a hazard into a filter.

### T3 — Cheap LLM triage [DESIGN] ← the capacity unlock
A 5–10 minute bounded pass on the top ~4,000 priority names per year: read the latest annual
and quarterly filing summary plus the T1 model outputs, and return only three things — a
coarse IV range, a confidence, and a one-line reason.

**You have already built the infrastructure for this.** The DeepSeek cloud arm
(`rs2-local`, commits Sep 7) already runs depth analysis off-peak, three names concurrently,
bounded by a job time budget, publishing back into the same overlay. It is currently used as
a *backstop serving the same 170-name queue*. Repointing it at a wide, shallow triage tier is
a redeployment of existing capability, not new construction.

The cascade literature's rule applies directly: escalate to T4 when T3's confidence is
**low**, or when T3's estimate is far from T1's prior. Both are signals that 80 minutes will
change the answer. Escalating on T3's *predicted return* would rebuild the same mistake at a
different layer.

### T4 — RS2 deep analysis, largely unchanged [DESIGN]
Keep the engine. It measurably works (§2.4). Two changes.

**Replace the band-direction rule.** The current `price < min(band)` test is structurally
biased against uncertainty (§2.3) and throws away magnitude. Replace with a continuous,
uncertainty-normalised mispricing score:
```
m_i  =  (median_IV − price) / (half-width of the IV band)
```
This is a t-statistic on the mispricing. It is comparable across names of different
uncertainty, it degrades gracefully instead of flipping at a cliff, and it doubles as the
sizing input. A stance threshold on m_i (say m > 1.0 for a long) becomes a *decision*, not a
mechanical consequence of band width.

**Elevate conviction to a first-class output.** It is your best-measured signal
(+3.81% vs −6.94%, t = +3.82 / −4.91). It currently does nothing in portfolio construction.

### T5 — Construction [DESIGN]
- Size on `m_i × conviction_i`, capped (fractional-Kelly, hard ceiling per name).
- Sector cap applied to **weights**, iterated to convergence, not to name counts.
- Position cap, so redistribution cannot create an 8% single-name bet.
- Exit hysteresis on `m_i`, with a hard exit reserved for an explicit thesis break.

### T6 — Outcome grading, and the loop that closes it [DESIGN] ← the real innovation
You already grade verdicts against realised forward returns in
`public/data/rs2_verdict_outcomes.json`: 600 graded verdict-horizons and **6,567 pending**.
Today that feeds prompt conditioning (`outcome_feedback.py`). It should feed **T2**.

Train the priority index to predict **the outcome of analysis**, not the return of the stock.
The label is available: for every name analysed, did the deep analysis discover a materially
actionable mispricing that subsequently paid? Regress that binary or continuous label on the
T1 features (μ, σ, sector, coverage, liquidity, event flags, model-routing class).

This is the Bayesian-optimisation surrogate. It answers the only question the screening layer
should be asking: *given what I can see cheaply, how likely is 80 minutes to be worth it?*

**No published factor model can answer that question for you, because it is specific to your
analyst's competence profile.** Where RS2 has edge is an empirical property of RS2, and you
have 7,167 labelled and pending observations with which to learn it.

---

## 5. CAPACITY ARITHMETIC [MEASURED + DESIGN]

Your measured constraints: 1.3h median per name (1.9h mean), ~11.6 names/day at 21h/day.

| | Current | Proposed |
|---|---|---|
| Deep analyses per year | ~2,750 | ~2,750 (unchanged) |
| Candidate pool feeding them | **170** | **~4,000 triaged from ~3,500 eligible** |
| Effective search breadth | 170 names | ~3,500 names |
| Cheap triage cost | n/a | ~4,000 × 8 min ≈ 533 h, cloud, parallel |

The deep tier's cost does not change. What changes is that it draws from a pool ~20× wider,
selected on where analysis is likely to pay rather than on momentum rank.

Grinold's fundamental law (IR ≈ IC × √breadth) implies that widening genuine breadth from 170
to a few thousand independent decisions is worth substantially more than any refinement of
the ranking function — **provided the added breadth carries real information**, which is the
condition T6 exists to verify.

---

## 6. MIGRATION FROM ZERO

Build in this order. Each stage is independently verifiable and does not require the next.

| Phase | Build | Verifiable by |
|---|---|---|
| 1 | **T6 first.** Grade the 6,567 pending horizons. Establish the analyst's true edge profile by sector, size, coverage, band width, conviction. | You learn where RS2 is actually good before designing around it |
| 2 | **T0 + T1.** Eligibility and the routed valuation prior with ensemble σ. No selection logic yet. | Coverage: what fraction of 6,600 gets a valid (μ, σ), by sector |
| 3 | **T2 v0.** Hand-specified priority index using the left-tail rule. Run it *in parallel* with the existing screen; do not switch. | Overlap analysis: how different is the queue? |
| 4 | **T3.** Repoint the DeepSeek cloud arm at wide triage. | Does T3 confidence predict T4 conviction? |
| 5 | **T4 rule change.** Continuous `m_i`, conviction elevated. | Re-grade history under the new rule |
| 6 | **T2 v1.** Replace the hand-specified index with one trained on T6 labels. | Out-of-sample lift over v0 |
| 7 | **T5.** Sizing, caps, hysteresis. | Turnover and concentration |

**Phase 1 is not optional and should not be skipped for speed.** Everything downstream is an
attempt to route work to where your analyst has edge. You do not currently know where that
is. You have the data to find out and it is sitting unused.

---

## 7. WHAT THIS DESIGN DELIBERATELY DOES NOT DO

- **It does not predict returns anywhere before T4.** T0–T3 predict *where analysis pays*.
- **It does not use a factor composite for selection.** Factors may still inform σ (a name in
  a well-understood, heavily-covered corner has a tighter prior) but they do not rank candidates.
- **It does not apply one valuation template to all businesses.** Model routing is a T1
  primitive, not a patch.
- **It does not treat missing data as a quality signal.** Absent-by-convention routes to a
  different model; absent-by-failure excludes with a stated reason.
- **It does not assume the analyst is right.** T6 measures it continuously and reweights T2.

---

## 8. RISKS AND OPEN QUESTIONS

1. **[UNKNOWN] Does RS2's edge survive outside the current universe?** Its measured
   +3.81% high-conviction excess was earned on momentum-screened, well-covered names. Its
   accuracy on thinly-covered small caps is untested and could be worse — LLM valuation
   quality plausibly depends on filing quality and available research.
2. **[UNKNOWN] Can T1 produce an honest σ?** Ensemble spread across valuation methods is a
   proxy, not a posterior. If all methods share an input error, σ is understated.
3. **[LIT, adverse] The dispersion anomaly cuts against you.** Screening on uncertainty in a
   long-only book fights Miller/DMS. The left-tail rule in T2 is the proposed mitigation and
   it is untested.
4. **[UNKNOWN] Is 8-minute triage enough to be informative?** If T3 confidence does not
   correlate with T4 conviction, the cascade collapses and you are back to random sampling.
   This is the single cheapest experiment to run and Phase 4 exists to run it.
5. **[MEASURED, adverse] Both live books are currently losing.** Quant −6.00% since June,
   RS2 AI −3.19% since August. A redesign is being proposed on a system with no demonstrated
   profitability, so the null hypothesis that none of this generates alpha remains live.
6. **[UNKNOWN] Liquidity at KIS.** Widening to 3,500 names admits illiquid names an overseas
   retail account may not fill. T0's liquidity floor must be calibrated to real fills, not
   to reported volume.

---

## 9. THE ONE-PARAGRAPH VERSION

Stop ranking stocks by predicted return and calling the top decile "research now." Instead,
compute for every eligible stock a cheap valuation *distribution* using a model appropriate
to its business type, and spend your 80-minute analyses where that distribution is widest on
the side you can act on — because that is where analysis changes the answer, which is
Weitzman's reservation-value rule, the model-cascade routing rule, and the limits-to-arbitrage
literature all saying the same thing. Insert a cheap LLM triage tier between the prior and the
deep analysis, using infrastructure you have already built for a different purpose. Replace
the band-crossing verdict with a continuous, uncertainty-normalised mispricing score so the
engine can express conviction about uncertain names instead of being structurally silenced by
them. And close the loop: you have 7,167 graded and pending verdict outcomes with which to
learn where your analyst actually has edge, which is the only question the screening layer
should ever be asking.

---

## 10. SOURCES

**Optimal costly search**
- Weitzman, M. (1979). "Optimal Search for the Best Alternative." *Econometrica* 47(3). https://scholar.harvard.edu/files/weitzman/files/optimalsearchbestalternative.pdf
- Beyhaghi & Cai (2023). "Recent Developments in Pandora's Box Problem: Variants and Applications." *SIGecom Exchanges* 21(1). https://www.sigecom.org/exchanges/volume_21/1/BEYHAGHI.pdf
- "Weitzman's Rule for Pandora's Box with Correlations." https://arxiv.org/pdf/2301.13534
- "Contextual Pandora's Box." https://ojs.aaai.org/index.php/AAAI/article/view/28969/29842

**Model cascades / budget-constrained inference**
- Chen, Zaharia & Zou. "FrugalML: How to Use ML Prediction APIs More Accurately and Cheaply." https://arxiv.org/pdf/2006.07512
- "Efficient Contextual LLM Cascades through Budget-Constrained Policy Learning." https://arxiv.org/pdf/2404.13082
- "CascadeServe: Unlocking Model Cascades for Inference Serving." https://arxiv.org/pdf/2406.14424
- "Learning to Cascade: Confidence Calibration for Improving the Accuracy and Computational Cost of Cascade Inference Systems." https://arxiv.org/pdf/2104.09286

**Mispricing, disagreement and limits to arbitrage**
- Diether, Malloy & Scherbina (2002). "Differences of Opinion and the Cross Section of Stock Returns." *Journal of Finance* 57(5). https://diether.org/papers/dms.pdf
- Birru. "Disentangling Anomalies: Risk versus Mispricing." https://haslam.utk.edu/wp-content/uploads/2022/09/Disentangling-Anomalies-Rick-versus-Mispricing_Birru.pdf
- "Does uncertainty affect the limits of arbitrage? Evidence from the U.S. stock markets." https://www.sciencedirect.com/science/article/abs/pii/S1062940824001463
- "What Drives the Dispersion Anomaly?" https://www.ivey.uwo.ca/media/3785983/what-drives-the-dispersion-anomaly.pdf

**Sequential experimental design**
- "Exploring Bayesian Optimization." *Distill*. https://distill.pub/2020/bayesian-optimization/
- "Active Learning and Bayesian Optimization: a Unified Perspective to Learn with a Goal." https://arxiv.org/html/2303.01560

**LLMs in equity research**
- "Large Language Models in equity markets: applications, techniques, and insights." *Frontiers in AI*. https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2025.1608365/full
- "Large Language Model Agents for Investment Management: Foundations, Benchmarks, and Research Frontiers." *ACM ICAIF '25*. https://dl.acm.org/doi/full/10.1145/3768292.3770387
- "Can large language models autonomously generate unique and profound insights in fundamental analysis?" https://www.sciencedirect.com/science/article/pii/S2667305325000924
- "The New Quant: A Survey of Large Language Models in Financial Prediction and Trading." https://arxiv.org/html/2510.05533v1

**Access caveat.** Egress to several publishers was blocked during this research
(scholar.harvard.edu, arxiv.org PDFs, sigecom.org, link.springer.com). Weitzman's reservation-
value formulation and Pandora's Rule were reconstructed from multiple independent secondary
summaries that agreed; the exact equation `c_i = E[(X_i − ζ_i)⁺]` and the ordering/stopping
rules should be verified against the primary source before implementation. The
Diether-Malloy-Scherbina result and the cascade findings likewise rest on abstracts and
summaries rather than full texts.

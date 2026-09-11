# Correcting the RS2 Diagnosis
Literature review + code audit. Companion to the RS2 Sector Concentration Audit.
Compiled 2026-09-10. SUPERSEDES Defect 3 in that brief.

## 00. SUMMARY — four changes to the picture

1. DEFECT 3 IS RETRACTED AS STATED. Sector-neutral z-scoring is mainstream best
   practice; the literature supports it for both low volatility and value. I was wrong
   to call it an inverted signal.
2. WHAT REPLACES IT IS BETTER GROUNDED. The repo does HALF of sector neutralisation:
   it neutralises inputs, then pools everything into a global ranking, which does not
   produce a neutral portfolio. The literature's version constrains the OUTPUT.
3. DEFECT 1 IS CONFIRMED by outside practice, and has a standard remedy the repo is
   not using.
4. NEW UNRELATED BUG: the reverse-DCF discounts a LEVERED cash flow at WACC. It makes
   every stock look cheaper than it is, and is mirrored in the frontend workbench.

## 01. RETRACTION — Defect 3 as stated

I argued that z-scoring volatility within sector converts an absolute quantity into a
relative one and destroys the signal. THE MEASUREMENT STANDS. THE INTERPRETATION DOES NOT.

ON LOW VOLATILITY: the anomaly persists when sector neutrality is strictly enforced —
it is not a sector effect. It is found in cyclical as well as defensive sectors. More
pointedly, sector-neutral low-risk construction appears to BEAT the unconstrained
version (one study reports ~14% higher information ratio), because low-risk alpha in
one sector is weakly correlated with low-risk alpha in another, and neutralising
harvests that diversification.

ON THE GENERAL PRINCIPLE: Asness, Porter & Stevens established that firm
characteristics are reliably priced WITHIN industry, that within-industry measurement
produces MORE PRECISE estimates, and that value strategies are far more effective at
selecting within industries than allocating across them. Their conclusion: higher
risk-adjusted returns come from NEUTRALISING industry bets.

So the module docstring's rationale ("universe-wide percentiles let sector beta
masquerade as signal") is not a rationalisation — it is the mainstream position, and
it answers open question Q2 in the affirmative for value as well.

WHAT THIS MEANS FOR THE COUNTERFACTUAL: my market-wide low-vol counterfactual produced
46.5% financials. I already flagged that as unacceptable. The literature explains WHY
rather than merely that it is uncomfortable: it is a sector bet dressed as a factor,
and it is the configuration the research says underperforms.

## 02. REFRAMED — Defect 3' — the pipeline throws its neutrality away

Sector neutrality in the literature is a property of the PORTFOLIO: rank within each
sector, then hold sectors at benchmark weight. Neutral inputs are the first half of
the method; a constrained output is the second half.

The repo does the first half only. score_factors.py z-scores within sector, then pools
every name into ONE universe-wide percentile (line 417), re-ranks on the
haircut-adjusted score, and cuts a global top decile. Nothing preserves sector
proportionality through that step, and it does not survive (MEASURED):

| Sector             | Universe | Selected | Selected, no haircuts |
|--------------------|----------|----------|-----------------------|
| Healthcare         |   11.2%  |  31.4%   |        24.3%          |
| Technology         |   16.8%  |  30.2%   |        34.3%          |
| Financial Services |   22.9%  |   1.8%   |         3.6%          |
| Energy             |    3.8%  |   0.0%   |         1.2%          |

The third column matters: even with EVERY haircut removed, selection is nowhere near
proportional. Neutral z-scores do not imply a neutral portfolio, because composite
means differ by sector once selection into the scored set is uneven.

THIS REVERSES THE PRIORITY ORDER IN THE ORIGINAL BRIEF. The sector cap is not a
defensive afterthought bounding damage from the other defects. It is the missing second
half of a method the repo has already committed to, and the literature says that second
half is where the risk-adjusted return improvement comes from.

## 03. CONFIRMED — Defect 1 — financials need a separate methodology

Outside practice is unambiguous: for banks, insurance and REITs a FULLY SEPARATE
methodology applies, because metrics like FCF margin and debt/EBITDA are structurally
misleading. EBITDA is meaningless where interest is a core component of both revenue
and expense; working capital and free cash flow stop being applicable concepts.

Two accepted responses — the repo uses NEITHER:
- EXPLICIT EXCLUSION. Drop financials from an EBITDA/FCF-based model and say so.
  Clean, honest, costs you a fifth of the market.
- SECTOR-SPECIFIC METRICS. Score banks on NIM, ROTCE, ROA, efficiency ratio, z-scored
  against SECTOR PEERS. This is the shape of quality-factor construction, where scores
  are normalised against sector benchmarks rather than a universal template.

What the repo does instead: admit financials to the universe, run them through a
template that cannot describe them, then penalise them for the resulting blanks via
rev_data_quality. They occupy universe slots and can never be selected. This is the
WORST of the three options because it is INVISIBLE — no exclusion notice, no
sector-specific path, just a quiet multiplicative haircut.

## 04. POSSIBLY WORSE THAN STATED — Defect 2 — coverage lift may be anti-predictive

I described the analyst-coverage lift as an undeclared bonus factor. The neglected-firm
literature suggests worse: firms followed by FEWER analysts tend to earn HIGHER average
returns, attributed to mispricing in under-followed names; low analyst coverage is one
of the two standard screens for identifying them.

If that holds in this universe, the composite gives its largest structural lift to
exactly the names the effect says to underweight. Technology, at 51% coverage against
1% for financials, receives most of it.

DO NOT OVER-READ THIS: the neglected-firm effect is contested and a good part of it may
be size and liquidity rather than coverage as such. I am NOT claiming the revisions
factor is inverted. I am claiming the SIGN of the coverage bias is an open empirical
question and the repo assumes it is harmless without testing. The measured fact is
unchanged: dropping revisions halves technology's selected share.

## 05. NEW FINDING — Defect 4 — reverse-DCF discounts equity cash flow at WACC

Unrelated to the sector question. Found while auditing the valuation engine for the
class of error CLAUDE.md documents. It IS that class, one step removed from the one
already fixed.

THE MISMATCH (build_valuation_models.py):
  base_cf = net income + D&A - capex   -> LEVERED (net income is after interest)
  target  = market capitalisation      -> EQUITY value      CORRECTLY PAIRED
  rate    = sector WACC                -> FIRM-level rate   MISMATCHED

The flow and target agree — both equity-level — so the earlier enterprise-value bug IS
genuinely fixed. The discount rate did not follow. A levered flow discounted to equity
value requires the COST OF EQUITY. WACC is the rate for an UNLEVERED flow discounted to
ENTERPRISE VALUE.

Fallbacks inherit the problem: filing FCF = OCF - capex, and under US GAAP interest
paid sits in OPERATING activities, so it is levered too. The ocf-da proxy likewise.

DIRECTION AND SIZE: WACC < cost of equity for any firm carrying debt, so the model
discounts too gently and the growth needed to justify a price comes out TOO LOW. Every
valuation reads CHEAPER than it is.

I re-solved all 167 modelled names — first reproducing shipped output EXACTLY (max abs
error 5e-05), then substituting a cost of equity derived from each name's own leverage:
  Ke = ( WACC - Kd*(1-t)*D/V ) / (E/V),  with Kd = 5.5%, t = 21%

MEASURED, 85 names with leverage data:
| Statistic                                  | Value    |
|--------------------------------------------|----------|
| Median debt / (debt + market cap)          |   4.4%   |
| Median cost-of-equity gap over WACC        |  0.30 pts|
| Median implied-growth UNDERSTATEMENT       |  0.81 pts|
| Mean understatement                        |  1.02 pts|
| 90th percentile                            |  2.20 pts|
| Worst case (BMY)                           |  4.12 pts|
| Names biased in the BULLISH direction      | 83 of 85 |

BMY is the clearest case: shipped model says the price implies 2.4% growth, comfortably
below demonstrated history, which reads as CHEAP. Corrected, the price implies 6.6%.
The expectations gap moves >4 points and the verdict line changes character.

The same math is mirrored in lib/dcf.ts with the same variable name and pairing, so the
interactive workbench shows the identical bias. No divergence between them — good
hygiene, bad news: the error is consistent everywhere.

THE SEQUENCING CONSEQUENCE (most important part):
This error scales with LEVERAGE, and the current book's median debt ratio is only 4.4%,
so today the damage is modest. That low ratio is A CONSEQUENCE OF DEFECT 1 — the
screener excludes exactly the levered sectors. Fix sector coverage first and you admit
banks, REITs and utilities at debt ratios several times higher, where the WACC-vs-Ke gap
runs to two or three points on a SMALLER base rate.
=> FIX THE DISCOUNT RATE BEFORE FIXING THE SECTOR COVERAGE, or the sector fix will
   import a much larger valuation error than it removes.

VERIFIED AGAINST AN ALTERNATIVE EXPLANATION:
The obvious objection is that sector_wacc might hold COST-OF-EQUITY values under a
misleading name, making this a documentation issue with no numerical consequence.
Utilities at 7% and real estate at 8% are more typical of Ke than WACC, so the objection
is reasonable. IT IS REFUTED by how the same table is used elsewhere: score_reverse.py
lines 489, 655 and 754 use it as the hurdle in ROIC-SPREAD scoring, as (roic - wacc).
ROIC is an UNLEVERED firm-level return, so that comparison requires a genuine WACC and is
textbook-correct. The table is what it says it is — so its use as an equity discount rate
is a real mismatch.

TWO INTERNALLY CONSISTENT REPAIRS:
- Keep the levered flow, change the rate: ADD a sector cost-of-equity table, or derive Ke
  per name from its own leverage. DO NOT repurpose or overwrite sector_wacc — three
  ROIC-spread call sites in score_reverse.py depend on it being a true WACC, and changing
  it in place would silently corrupt archetype routing and quality scoring. Smallest diff;
  the assumptions block already records everything needed.
- Keep the rate, change flow and target: add back after-tax interest to reach an
  unlevered flow and solve against ENTERPRISE VALUE. More faithful to the docstring,
  more moving parts, and it reintroduces the EV bridge that caused the original bug.
The first is safer. Note also: the DOCUMENTATION describes a firm-level DCF while the
CODE implements an equity-level one.

## 06. RECOMMENDATIONS — in dependency order

1. FIX THE DISCOUNT RATE. Contained, measurable, prerequisite for anything widening
   sector coverage. Validate by reproducing current output first, then diffing.
2. ADD THE SECTOR CAP to depth_targets(). This is the missing second half of sector
   neutralisation, not a safety net. Decide the overflow rule explicitly: cash or
   redistribution. For a 35-name book a 25% cap is 8-9 names — still concentrated.
3. DECIDE FINANCIALS DELIBERATELY. Either exclude with a stated reason, or build the
   sector-specific metric path. Both beat the silent penalty. Until then, note the
   universe count overstates real coverage by ~a fifth.
4. SEPARATE absent-by-convention from absent-by-failure in calculate_data_quality, and
   revisit the stage-1 hard reject at score_reverse.py:284 at the same time — both read
   the same score.
5. TEST THE REVISIONS FACTOR rather than assuming it. No point-in-time history, cannot
   be IC-validated by the existing harness, coverage bias of unknown sign. Weakest-
   evidenced input in the composite.
6. EXTEND THE BACKTEST to score low volatility BOTH ways and report separate ICs. The
   harness measures only the market-wide variant while production runs the
   sector-neutral one. Close that gap regardless of which wins.

## 07. STILL OPEN

- WHETHER ANY OF THIS IMPROVES RETURNS. Unchanged. Every finding is about CONSTRUCTION.
  Price cache absent, market-data egress blocked; nothing validated against realised
  performance.
- The survivorship direction argument. Still inference; needs a delisted-inclusive
  universe the repo does not have.
- The SIGN of the coverage bias in this universe. Literature suggests one direction,
  the repo assumes another, neither tested here.
- How much of the financials exclusion happens at the stage-1 hard reject. Unmeasured,
  directly measurable, worth doing.
- Whether a 25% cap is right for 35 names. Inherited from an audit of a different
  construction method.

EPISTEMIC CAVEAT ON THE LITERATURE: egress to several publishers was blocked, so for
most sources I worked from search-result summaries and abstracts, not full texts. The
Springer literature review could not be fetched. Findings are consistent across multiple
independent summaries, but a reviewer with journal access should verify the specific 14%
information-ratio figure and the sector-neutral comparison it comes from before anyone
acts on that number.

## SOURCES
- Asness, Porter & Stevens, "Predicting Stock Returns Using Industry-Relative Firm
  Characteristics" — https://papers.ssrn.com/sol3/papers.cfm?abstract_id=213872
- Blitz, van Vliet & Baltussen, "The Volatility Effect Revisited" —
  https://doi.org/10.2139/ssrn.3442749
- "What we know about the low-risk anomaly: a literature review" —
  https://link.springer.com/article/10.1007/s11408-023-00427-0
- "Deconstructing the Low-Vol Anomaly" — https://arxiv.org/html/1510.01679
- Quantpedia, "Low Volatility Factor Effect in Stocks" —
  https://quantpedia.com/strategies/low-volatility-factor-effect-in-stocks
- Alpha Architect, "Improving Low Volatility Strategies" —
  https://alphaarchitect.com/low-volatility-strategies/
- BNP Paribas AM, "Low risk equity strategies without interest rate sensitivity" —
  https://viewpoint.bnpparibas-am.com/low-risk-equity-strategies-without-interest-rate-sensitivity/
- Asness, Frazzini & Pedersen, "Quality Minus Junk" —
  https://images.aqr.com/-/media/AQR/Documents/Insights/Working-Papers/Quality-Minus-Junk.pdf
- "Bank & Insurance Financial Modeling 101" —
  https://mergersandinquisitions.com/bank-insurance-modeling-101/
- "A dynamic analysis of the neglected firm effect" —
  https://www.sciencedirect.com/science/article/abs/pii/S1057521922003799

Code audit performed read-only against origin/main as of 2026-09-09. No files modified.
The reverse-DCF reimplementation reproduced all 167 shipped values to within 5e-05
before any counterfactual was run.

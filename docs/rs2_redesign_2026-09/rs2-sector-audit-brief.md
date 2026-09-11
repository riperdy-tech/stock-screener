# RS2 Sector Concentration Audit

Compiled 2026-09-10. Repos: stock-screener, rs2-local. Data as of 2026-09-08 post-close.
Read-only audit; no code modified. Line refs are to origin/main as of 2026-09-09.

!!! CORRECTION ISSUED 2026-09-10 — READ BEFORE USING THIS BRIEF !!!
Subsequent literature review RETRACTED DEFECT 3 AS STATED IN SECTION 06. Sector-neutral
z-scoring is mainstream best practice and is supported for both low volatility and value
(Asness/Porter/Stevens; Blitz/van Vliet). The MEASUREMENTS in section 06 stand; the
INTERPRETATION does not. The correct reading is that the pipeline neutralises its INPUTS
and then discards that neutrality by pooling into a global ranking — so the missing
sector cap (section 07) is the PRIMARY fix, not a safety net.
A separate valuation bug was also found: the reverse-DCF discounts a LEVERED cash flow
at WACC, understating required growth on 83 of 85 names (median 0.81 pts, max 4.12).
Both are covered in the companion document "Correcting the RS2 Diagnosis", which
supersedes section 06 and answers open questions Q1 and Q2 below.

## 00. How to use this

Claims are tagged by epistemic status:
- MEASURED — computed from repository files, reproducible from section 10.
- COUNTERFACTUAL — ranking re-run with one input changed, result observed.
- INFERRED — reasoning not verified with data in hand.
- UNKNOWN — exactly that.

I want the three defects attacked on methodology, and the open questions in section 9
answered. I am least confident about Defect 3, which is a judgment call about factor
construction rather than a bug in the ordinary sense.

## 01. System context — how a stock reaches the portfolio

1. Universe: ~6,900 listed names carrying a reverse-engine record.
2. Reverse engine: staged eliminator producing survivability, data-quality, quality
   scores. Rejects become a hard veto downstream. Removes 59–88% of each sector.
3. Factor screener (scripts/score_factors.py): builds five SECTOR-NEUTRAL factor
   z-scores, averages the available ones, converts to a universe-wide percentile,
   multiplies by three haircuts, re-ranks, assigns bands. Top 3% = research_now,
   next 7% = watchlist.
4. Depth analysis: ONLY names banded research_now or watchlist are queued for the LLM
   depth run (rs2-local/depth_membership.py:31). Returns a frozen verdict of
   undervalued / hold / overvalued.
5. Portfolio: depth_targets() at track_paper_portfolios.py:165 equal-weights every
   non-vetoed name whose verdict reads undervalued. This is the rn_depth ledger,
   labelled "RS2 AI" in the UI at lib/desk/nav.ts:36.

KEY STRUCTURAL POINT: the LLM never sees a name the factor screener did not band.
Any sector bias in stage 3 becomes a hard ceiling on stages 4 and 5.

## 02. Triggering observation — 2.0% single-day loss on 2026-09-08

RS2 AI book fell 2.015% in one session; worst day since its 2026-08-25 restart
(prior worst 0.63%). Sibling quant book fell 0.914% the same day.

Attribution (MEASURED):
| Component                  | Weight | Contribution |
|----------------------------|--------|--------------|
| Healthcare                 | 40.0%  | -88 bps      |
| Consumer Cyclical          | 17.1%  | -55 bps      |
| Technology                 | 17.1%  | -49 bps      |
| Industrials                | 17.1%  |   0 bps      |
| Total mark-to-market       | 100%   | -200 bps     |
| Trading and costs residual |        | -1.4 bps     |

27 of 35 names fell, so nothing hinges on one position. The market was flat while
semis/memory rallied: measured at midday vs prior close, SOXX +2.58%, DRAM +3.41%,
SPY -0.32%. The book holds ZERO semiconductors and ZERO computer hardware across its
24 industries, so it took the entire downside of a rotation and none of the upside.

The loss is not the problem. The problem is a 35-name equal-weighted book with 40%
single-sector exposure and no mechanism anywhere to prevent it.

## 03. Where the concentration originates (MEASURED)

Sector share at each stage. n: universe 1693 scored, band 170, verdict 33, book 35.

| Sector             | Universe | Screener band | Depth verdict | In book |
|--------------------|----------|---------------|---------------|---------|
| Healthcare         |   11.2%  |     31.2%     |     33.3%     |  40.0%  |
| Technology         |   16.8%  |     30.0%     |     27.3%     |  17.1%  |
| Industrials        |   15.5%  |     12.9%     |     12.1%     |  17.1%  |
| Consumer Cyclical  |   10.5%  |     12.4%     |     18.2%     |  17.1%  |
| Financial Services |   22.9%  |      1.8%     |      0.0%     |   0.0%  |
| Real Estate        |    5.1%  |      0.6%     |      0.0%     |   0.0%  |
| Basic Materials    |    4.8%  |      0.6%     |      0.0%     |   0.0%  |
| Energy             |    3.8%  |      0.0%     |      0.0%     |   0.0%  |
| Utilities          |    0.4%  |      0.0%     |      0.0%     |   0.0%  |

Universe-to-band is where the distortion happens. Healthcare gains 2.78x, technology
1.79x. Financials collapse to 0.08x; energy and utilities to zero. The depth verdict
adds only a mild further tilt; the portfolio stage a little more.

THE AI IS PICKING SENSIBLY FROM A MENU ALREADY NARROWED TO HEALTHCARE AND SOFTWARE.

## 04. DEFECT 1 — data-quality haircut punishes accounting convention
Status: COUNTERFACTUAL VERIFIED. Fully explains 2 sector exclusions.

MECHANISM
The screener computes factor z-scores WITHIN SECTOR, explicitly so sector beta cannot
masquerade as signal. It then converts to a universe-wide percentile and multiplies by
three haircuts at score_factors.py:418:

    final = pct * survivability * data_quality * forensic

data_quality multiplier = min(1.0, 0.8 + 0.04 * dq), where dq is a 0-5 integer from
calculate_data_quality() at score_reverse.py:179. That function starts at 5 and deducts
one point each for:
  - missing financial detail
  - missing Total_Debt or Total_Cash
  - a missing or non-positive EBITDA/EBIT denominator   <-- structural for financials
  - missing Free_Cash_Flow_TTM                          <-- structural for financials
  - unknown sector or industry

Banks, insurers and REITs do not report EBITDA or free cash flow. Those fields are
absent BY ACCOUNTING CONVENTION. The function scores that identically to a negligent
filer with broken data.

MEASURED — raw dq and resulting multiplier, scored names:
| Sector             | dq raw (of 5) | Multiplier |
|--------------------|---------------|------------|
| Financial Services |      1.6      |   0.863    |
| Basic Materials    |      2.0      |   0.878    |
| Energy             |      2.0      |   0.879    |
| Utilities          |      2.0      |   0.880    |
| Real Estate        |      2.2      |   0.889    |
| Technology         |      4.0      |   0.959    |
| Healthcare         |      4.5      |   0.978    |
| Industrials        |      4.7      |   0.989    |
| Consumer Defensive |      4.8      |   0.994    |

Because the haircut multiplies a percentile, it caps the reachable ceiling: a financial
can never score above ~86 on a 0-100 scale regardless of merit.

COUNTERFACTUAL — remove only the dq haircut, re-rank, take top decile:
| Sector             | As shipped | No dq haircut | Universe |
|--------------------|------------|---------------|----------|
| Basic Materials    |    0.0%    |     4.7%      |   4.8%   |
| Energy             |    0.0%    |     2.4%      |   3.8%   |
| Financial Services |    1.8%    |     3.6%      |  22.9%   |
| Real Estate        |    0.6%    |     1.8%      |   5.1%   |
| Healthcare         |   31.4%    |    24.3%      |  11.2%   |

This haircut fully accounts for the total exclusion of basic materials and energy, and
roughly doubles financials and real estate. It does NOT explain financials' overall
absence — that is Defect 3.

CORROBORATING DETAIL
The code already contains a carve-out: the EBITDA deduction is skipped for archetypes
G and H, and survivability_leverage_score substitutes an Altman Z proxy for them. So
the authors recognised that some businesses structurally lack EBITDA. The carve-out is
keyed on ARCHETYPE not SECTOR, and does not extend to the free-cash-flow deduction.

A second, harsher channel: score_reverse.py:284 HARD-REJECTS any name with
data_quality < 2 at stage 1. Financials average 1.6.
STATUS: I did NOT isolate how many financials die at this gate vs later. See Q3.

## 05. DEFECT 2 — analyst coverage acts as an undeclared bonus factor
Status: COUNTERFACTUAL VERIFIED. Halves the technology overweight.

MECHANISM
The composite is mean_of_available across five factor z-scores
(score_factors.py:334-343). A name missing a factor is scored on the REMAINDER rather
than penalised. The revisions factor requires analyst estimate history, and its
coverage is wildly uneven. Where present, its z-score is strongly positive, because
coverage correlates with size and institutional following.

Result: BEING COVERED BY ANALYSTS IS ITSELF A LIFT, independent of what the
revisions actually say.

MEASURED — revisions availability, scored names:
Technology 51% | Utilities 17% | Industrials 15% | Comm Services 12% | Healthcare 11%
Energy 6% | Consumer Cyclical 4% | Financial Services 1% | Real Estate 0% |
Consumer Defensive 0%

COUNTERFACTUAL — drop revisions from the composite entirely:
  Technology top-decile share: 20.4% -> 9.9%
  Healthcare:                  21.6% -> 28.4%  (RISES — revisions is NOT what
                                                elevates healthcare)
  Financial Services:           1.6% ->  2.3%

COMPOUNDING ISSUE
factor_weights.json is equal-weight by design, citing DeMiguel-Garlappi-Uppal (2009)
on 1/N. But mean_of_available means the EFFECTIVE weight of every present factor rises
when another is absent: a name with four factors gives each 25%; five gives each 20%.
The equal-weight claim holds per name, not across names.

## 06. DEFECT 3 — low volatility is sector-neutralised, which inverts the signal
Status: INTERPRETATION RETRACTED 2026-09-10. MEASUREMENTS STAND.

>>> SUPERSEDED. The framing in this section is WRONG and is retained only so the
>>> reasoning can be audited. The low-volatility anomaly persists WITHIN sectors, is not
>>> a sector effect, and sector-neutral construction may OUTPERFORM the unconstrained
>>> version. Asness/Porter/Stevens found the same for value. The numbers below are
>>> reproducible and the 40-point sector swing is real, but the correct reading is that
>>> the pipeline neutralises its INPUTS and then discards that neutrality by pooling
>>> into a global ranking. See the companion document for the reframing.

MECHANISM
All five factors are z-scored within sector by the same code path. For value, quality
and momentum that is defensible and is what the module docstring argues for. For low
volatility it destroys the quantity being measured.

Volatility is an ABSOLUTE property. Sector-neutralising it stops asking "is this a calm
stock" and starts asking "is this stock calm FOR ITS SECTOR". The composite then ranks
those relative answers ACROSS sectors as if they were the same number.

MEASURED — the inversion (scored names):
| Sector             | Median vol | Low-vol z | Sector median vol |
|--------------------|------------|-----------|-------------------|
| Healthcare         |   0.386    |   +0.56   |       0.724       |
| Technology         |   0.478    |   +0.39   |       0.623       |
| Industrials        |   0.330    |   +0.42   |       0.488       |
| Consumer Defensive |   0.280    |   +0.38   |       0.440       |
| Real Estate        |   0.201    |   +0.28   |       0.242       |
| Financial Services |   0.228    |   +0.08   |       0.204       |

Scored financials are the second-calmest group in the market at 0.228 annualised,
roughly HALF the volatility of the healthcare names and less than half the technology
names. They are awarded almost nothing for it. A large-cap pharma at 0.386 sits far
below its sector median of 0.724 (that sector is full of speculative biotech) and is
credited as a strong low-volatility name despite being objectively TWICE as volatile
as the bank.

The screener intends to harvest the low-volatility premium. What it actually rewards is
being unusually calm relative to a noisy peer group.

MEASURED — magnitude. Composite-z gap, healthcare vs financials (total 0.178):
| Factor          | Healthcare | Financials |  Gap  |
|-----------------|------------|------------|-------|
| Low volatility  |   +0.56    |   +0.08    |  0.48 |
| Value           |   +0.34    |   +0.21    |  0.13 |
| Momentum        |   +0.40    |   +0.31    |  0.09 |
| Quality         |   +0.39    |   +0.42    | -0.03 |
Low volatility is ~70% of the gap.

COUNTERFACTUAL — change ONLY this factor to a market-wide z (Defects 1 and 2 untouched):
| Sector             | As shipped | Market-wide | Universe |
|--------------------|------------|-------------|----------|
| Financial Services |    3.5%    |    46.5%    |  22.9%   |
| Technology         |   34.1%    |     7.1%    |  16.8%   |
| Healthcare         |   24.1%    |    11.8%    |  11.2%   |
| Real Estate        |    2.4%    |     9.4%    |   5.1%   |

Healthcare lands on 11.8% vs a natural weight of 11.2%. This ONE choice was producing
essentially ALL of the healthcare overweight as well as the financials blackout.

IMPORTANT QUALIFICATION
Flipping the switch is NOT the recommendation. 46.5% financials is simply the opposite
concentration and is itself a sector bet. Neither pure treatment is defensible. The
honest reading: low volatility does not belong in the same neutralisation scheme as
value, quality and momentum, and the code applies one blanket rule to all five without
recording that decision anywhere.

## 07. GAP — the RS2 AI book has no diversification constraint of any kind
Status: CONFIRMED BY CODE READ.

build_portfolio_plan.py:60-61 caps any sector at 25% and any theme at 30%.
build_momo_plan.py caps sectors at 30%. NEITHER the `equal` sleeve NOR `rn_depth`
applies either.

depth_targets() is a pure equal weight over every undervalued verdict, with a single
concentration floor of 8 names (MIN_EQUAL_NAMES) that leaves a cash residual when the
panel is small. No sector logic, no theme logic, no correlation logic.

This matters INDEPENDENTLY of the three defects. Even a perfectly unbiased screener
will produce clustered output some of the time, and nothing here would stop it
reaching the money.

## 08. Evidence status — what is measured, what has never been tested

The repo has a point-in-time backtest at scripts/backtest_lite.py: 37 quarterly
formations, 2017-03 to 2026-03, ~2,600 names per formation. Two structural facts:

FIRST: its composite is value/quality/momentum ONLY (backtest_lite.py:59). Low
volatility is computed but feeds only the IC diagnostic, never the portfolio.

SECOND: it computes low volatility MARKET-WIDE, with no sector-neutral variant anywhere
in the file. So the backtest has only ever measured the treatment production DISCARDS,
and has never measured the treatment production USES.

MEASURED — Spearman rank-IC vs forward 3m return, 37 quarters. Statistics recomputed
from the stored series, not the shipped summary:
| Factor         | Mean IC | Std dev | t-stat | 95% interval      | Pos. qtrs |
|----------------|---------|---------|--------|-------------------|-----------|
| Low volatility | +0.0454 |  0.192  |  1.44  | -0.016 to +0.107  |   59.5%   |
| Value          | +0.0434 |  0.104  |  2.54  | +0.010 to +0.077  |   56.8%   |
| Quality        | +0.0340 |  0.095  |  2.18  | +0.004 to +0.064  |   62.2%   |
| Momentum       | +0.0346 |  0.126  |  1.67  | -0.006 to +0.075  |   70.3%   |

Low volatility has the HIGHEST mean and the WEAKEST support: dispersion nearly double
value's, interval spans zero, lowest t-stat in the set. The shipped drift report
presents it as the strongest factor by mean IC — true and misleading, because it never
shows dispersion.

MEASURED — split-half stability:
| Factor         | First half | Second half |
|----------------|------------|-------------|
| Low volatility |  -0.0026   |   +0.0909   |
| Momentum       |  -0.0037   |   +0.0709   |
| Value          |  +0.0120   |   +0.0732   |
| Quality        |  +0.0409   |   +0.0274   |

The entire low-volatility effect sits in the back half. Quality is the only stable
factor. ON THE REPO'S OWN NUMBERS, MARKET-WIDE LOW VOLATILITY CANNOT BE DISTINGUISHED
FROM ZERO OVER NINE YEARS.

SURVIVORSHIP — status: INFERRED, NOT MEASURED
The harness warns results are an upper bound: universe is today's listings, delisted
losers absent from every formation date. For THIS SPECIFIC FACTOR the bias plausibly
runs the OTHER way — the missing delisted names are disproportionately high-volatility,
and their collapse would have STRENGTHENED the low-volatility signal. I could not
verify this. last_listed in scripts/tradability.py only covers names still present in
the current file, so the truly delisted are unrecoverable from this data.
This is a genuine confound on the question being asked, because survivorship bias is
itself correlated with volatility.

## 09. Candidate solutions

FOR DEFECT 1 (data-quality haircut)
- Separate "absent by convention" from "absent by failure": maintain an explicit
  per-sector or per-archetype schema of expected fields; score dq against expected
  fields only. Highest fidelity, most work, needs a maintained mapping.
- Sector-relative dq: convert dq to a within-sector percentile before applying it.
  Cheap, consistent with the existing sector-neutral philosophy, but hides genuinely
  poor filing in a poorly-filing sector.
- Extend the G/H carve-out to the FCF deduction and map financials/REITs/utilities into
  an exempt class. Smallest diff; leaves the architectural weakness intact.
- Remove the haircut from banding, keep as a display flag. Most aggressive; would need
  the stage-1 dq<2 rejection revisited at the same time.

FOR DEFECT 2 (coverage bonus)
- Require a minimum factor count before a name can be banded.
- Impute revisions to sector-neutral zero when absent rather than dropping it from the
  average. Makes the equal-weight claim true across names and removes the coverage lift.
- Move revisions out of the composite into a context tag, as theme already is. The
  docstring already concedes it has no point-in-time history and cannot be IC-validated.

FOR DEFECT 3 (low-volatility treatment)
- Blend: weighted mix of within-sector and market-wide z, with the mix an explicit
  documented parameter rather than an implicit consequence of shared code.
- Two separate factors: treat relative calm and absolute calm as distinct inputs and let
  IC measurement decide their weights.
- Neutralise then re-express: keep sector-neutral z for selection but apply an
  absolute-volatility constraint at the PORTFOLIO stage instead of the scoring stage.
- Leave it and constrain downstream: if the sector-neutral choice is deliberate,
  document it and rely on a sector cap to contain the consequence.

FOR THE MISSING GUARDRAIL
- Apply the existing 25% sector / 30% theme caps from portfolio_config.json to
  depth_targets(). This is the one change clearly correct REGARDLESS of how the three
  defects resolve, since it bounds damage from any residual bias.
- Decide the overflow rule deliberately: hold cash, or redistribute to uncapped names.
  Materially different risk profiles.

## 10. Open questions — what I want challenged or researched

Q1. IS SECTOR-NEUTRALISING LOW VOLATILITY ACTUALLY WRONG?
    ANSWERED 2026-09-10: NO. The anomaly persists WITHIN sectors and sector-neutral
    construction may OUTPERFORM. Defect 3's framing is retracted. The live question that
    replaces it: why do neutral INPUTS still yield a non-proportional SELECTION? The
    companion document attributes it to pooling into a global ranking.
Q2. Does the same argument apply to the other four factors?
    ANSWERED 2026-09-10: YES, AND IT FAVOURS THE REPO. Asness/Porter/Stevens found value
    strategies work far better WITHIN industries than across, and that neutralising
    industry bets RAISES risk-adjusted returns. The repo's choice is correct for value.
Q3. How much of the financials exclusion happens at the reverse-engine stage-1 dq<2 hard
    reject? I identified the gate but did not measure its sector-specific kill rate
    separately from the later haircut. Directly measurable; I did not do it.
Q4. Is mean_of_available across a VARIABLE factor count statistically sound at all?
    Averaging different numbers of correlated z-scores produces composites with
    different variances, which then get ranked against each other. I have not modelled
    the size of this effect.
Q5. Does the survivorship bias direction argument hold? I claim it UNDERSTATES low
    volatility's IC rather than overstating it. This is inference. It could be settled
    with a delisted-inclusive universe, which this repo does not have.
Q6. Is a 25% sector cap right for a 35-name equal-weighted book? That is 8-9 names in
    one sector. The number was inherited from a June 2026 audit of a DIFFERENT
    construction method and may not transfer.
Q7. Should the depth queue be sector-stratified independently of the screener? An
    alternative to fixing the screener is to reserve depth-analysis slots per sector,
    guaranteeing the LLM sees a diversified candidate set regardless of upstream bias.
    This changes what the panel MEANS and may be worse.
Q8. Does correcting these biases actually improve RETURNS, or merely diversify? Unknown
    and untested. The two are not the same, and the screener's job is the former.

## 11. Reproduction

All measurements read only these files, at the origin/main commit for 2026-09-08
post-close:
  public/data/factor_scores.json  — fct_z, fct_contributions, fct_haircuts,
                                    fct_composite, fct_percentile, fct_band, fct_vol
  public/data/stocks.json         — sector and industry
  public/data/depth_overlay.json  — depth verdict direction per ticker
  public/data/paper_ledgers.json  — ledger NAV series, holdings, marks
  public/data/reverse_scores.json — rev_survivability, rev_data_quality
  public/data/factor_ic.json      — per-formation IC series

Counterfactuals recover the pre-haircut percentile as
  fct_composite / (survivability * data_quality * forensic)
substitute the changed input, re-rank, and take the top decile as the band proxy
(research_now + watchlist = top 10%). Day attribution reconstructs NAV as sum(shares *
marks), which reproduces the stored value exactly across three independent snapshots.

ENVIRONMENT LIMITS ON THIS AUDIT
I could not run the backtest. The ten-year monthly price cache backtest_prices.json is
gitignored and absent, and all market-data egress was refused by the network policy:
two Yahoo hosts, Stooq, Alpha Vantage and Financial Modeling Prep all failed at the
proxy. The longest offline series is 24 monthly closes, which after a 12-month momentum
lookback leaves about three usable formation dates.
NO FORWARD-LOOKING CLAIM IN THIS BRIEF HAS BEEN VALIDATED AGAINST RETURNS. Everything
here is a claim about CONSTRUCTION, not about PERFORMANCE.

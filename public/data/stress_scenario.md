# Stress Scenario — AI-capex bust + higher-for-longer

_Generated 2026-06-14 · severity: severe · **illustrative model, not a forecast or advice**_

## Scenario
Inflation higher-for-longer (multiple/duration compression) + datacenter build delays & OpenAI debt & AI under-earning its capital (AI-infra derate) + VC/private-credit defaults like Blue Owl (credit + liquidity stress) + momentum reversal.

## Modeled 12-month total return

| Portfolio | Modeled return |
|---|---|
| **plan** (your sized book, 50% invested) | **-10.1%** |
| **equal** (research_now, full) | **-38.6%** |
| QQQ proxy (Nasdaq-100) | -63.6% |
| SPY proxy (S&P 500) | -43.6% |

**Strategy (equal) vs QQQ: +24.9% relative.**

## Why (attribution, equal book)
| Shock | Strategy pts | QQQ pts |
|---|---|---|
| systematic | -16.8 | -16.8 |
| duration(value) | +2.8 | -10.1 |
| ai_capex | -9.6 | -23.1 |
| momentum_reversal | -6.4 | -7.7 |
| quality_cushion | +4.6 | +3.9 |
| lowvol_cushion | +3.5 | -2.1 |
| credit_survivability | -14.9 | -3.5 |
| financials | -0.3 | +0.0 |
| smallcap_liquidity | -1.5 | +0.0 |
| gpr | +0.0 | -4.2 |

## Honest tension
- **Factor tilt favors the strategy**: cheap (value), profitable (quality), calm (low-vol), low-AI-capex names derate far less than QQQ's expensive, high-momentum, AI-heavy mega-caps. The strategy's vetoes already exclude the cash-burning AI-narrative names that blow up here.
- **Size tilt favors QQQ**: the strategy holds small/mid-caps, which gap down on liquidity in a credit crunch (the `smallcap_liquidity` line). QQQ is large-cap and liquid. This partially offsets the factor advantage.
- Net: under these assumptions the strategy draws down **less** than QQQ, because the AI-capex + duration + momentum-reversal hits to QQQ outweigh the strategy's small-cap liquidity penalty. Flip the coefficients (milder AI shock, harsher liquidity) and the gap narrows or reverses — which is exactly the point of making them explicit.

## Coefficients used (edit in scripts/stress_scenario.py)
- systematic derate -0.12, duration×value 0.06, AI-capex -0.3, momentum-reversal -0.05, quality 0.04, lowvol 0.05, credit×(1-surv) -0.25, financials -0.1, smallcap-liquidity -0.08, gpr -0.03; severity ×1.4.
- QQQ proxy assumes value_z=-1.2, momentum_z=1.1, AI-capex weight 0.55, survivability 90, large-cap.

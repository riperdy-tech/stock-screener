# Stress Scenario — AI-capex bust + higher-for-longer

_Generated 2026-06-14 · severity: base · **illustrative model, not a forecast or advice**_

## Scenario
Inflation higher-for-longer (multiple/duration compression) + datacenter build delays & OpenAI debt & AI under-earning its capital (AI-infra derate) + VC/private-credit defaults like Blue Owl (credit + liquidity stress) + momentum reversal.

## Modeled 12-month total return

| Portfolio | Modeled return |
|---|---|
| **plan** (value core, 50% invested) | **-7.2%** |
| **plan2** (hybrid, 78% invested) | **-17.0%** |
| **equal** (research_now, full) | **-27.6%** |
| QQQ proxy (Nasdaq-100) | -45.4% |
| SPY proxy (S&P 500) | -31.1% |

**plan2 (hybrid) vs QQQ: +28.4% relative.** Quality sleeve cost vs value core this scenario: -9.8%.

## Why (attribution, equal book)
| Shock | Strategy pts | QQQ pts |
|---|---|---|
| systematic | -12.0 | -12.0 |
| duration(value) | +2.0 | -7.2 |
| ai_capex | -6.8 | -16.5 |
| momentum_reversal | -4.6 | -5.5 |
| quality_cushion | +3.3 | +2.8 |
| lowvol_cushion | +2.5 | -1.5 |
| credit_survivability | -10.7 | -2.5 |
| financials | -0.2 | +0.0 |
| smallcap_liquidity | -1.1 | +0.0 |
| gpr | +0.0 | -3.0 |

## Honest tension
- **Factor tilt favors the strategy**: cheap (value), profitable (quality), calm (low-vol), low-AI-capex names derate far less than QQQ's expensive, high-momentum, AI-heavy mega-caps. The strategy's vetoes already exclude the cash-burning AI-narrative names that blow up here.
- **Size tilt favors QQQ**: the strategy holds small/mid-caps, which gap down on liquidity in a credit crunch (the `smallcap_liquidity` line). QQQ is large-cap and liquid. This partially offsets the factor advantage.
- Net: under these assumptions the strategy draws down **less** than QQQ, because the AI-capex + duration + momentum-reversal hits to QQQ outweigh the strategy's small-cap liquidity penalty. Flip the coefficients (milder AI shock, harsher liquidity) and the gap narrows or reverses — which is exactly the point of making them explicit.

## Coefficients used (edit in scripts/stress_scenario.py)
- systematic derate -0.12, duration×value 0.06, AI-capex -0.3, momentum-reversal -0.05, quality 0.04, lowvol 0.05, credit×(1-surv) -0.25, financials -0.1, smallcap-liquidity -0.08, gpr -0.03; severity ×1.0.
- QQQ proxy assumes value_z=-1.2, momentum_z=1.1, AI-capex weight 0.55, survivability 90, large-cap.

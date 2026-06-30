# Portfolio Plan (v1 — decision support)

Generated: 2026-06-30T04:39:42Z
Macro flags: none
Invested: **44.25%**  |  Cash: **55.75%**  |  Positions: 17

| # | Sym | Wt% | Arch | Comp | Surv | FctRank | FctBand | Theme | PdmBand | F | M | Flags |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 | **AGX** | 2.46 | B | 76.3 | 80 | 2 | research_now | - | no_data | 6 | -4.032 | - |
| 3 | **INCY** | 4.0 | B | 87.52 | 80 | 3 | research_now | - | no_data | 6 | - | - |
| 5 | **EXEL** | 4.79 | B | 85.69 | 80 | 5 | research_now | - | no_data | 6 | -2.593 | - |
| 6 | **CPRX** | 3.2 | B | 55.66 | 80 | 6 | research_now | - | no_data | 5 | - | - |
| 11 | **KRYS** | 2.0 | B | 46.49 | 75 | 11 | research_now | - | no_data | 6 | - | - |
| 13 | **NBIX** | 3.96 | A | 49.64 | 75 | 13 | research_now | glp1_metabolic | mid | 5 | - | - |
| 15 | **VIK** | 1.88 | B | 63.38 | 75 | 15 | research_now | - | no_data | 6 | - | - |
| 18 | **MCRI** | 3.0 | A | 66.99 | 80 | 18 | research_now | - | no_data | 8 | -2.953 | - |
| 20 | **AZN** | 1.0 | B | 67.54 | 75 | 20 | research_now | glp1_metabolic | mid | 7 | -2.513 | - |
| 24 | **NVS** | 1.88 | B | 75.5 | 75 | 24 | research_now | glp1_metabolic | mid | 6 | - | - |
| 31 | **WILC** | 2.5 | A | 68.51 | 80 | 31 | research_now | - | no_data | 7 | -2.102 | - |
| 35 | **KNSA** | 4.0 | A | 44.55 | 75 | 35 | research_now | - | no_data | 6 | -3.129 | - |
| 38 | **ABNB** | 2.0 | B | 81.26 | 80 | 38 | research_now | - | no_data | 5 | - | - |
| 42 | **EXPE** | 2.8 | B | 74.76 | 80 | 42 | research_now | - | no_data | 6 | -2.758 | - |
| 43 | **BLBD** | 1.78 | B | 84.34 | 75 | 43 | research_now | - | no_data | 8 | -3.432 | - |
| 48 | **SAP** | 2.01 | A | 63.91 | 70 | 48 | research_now | cloud_software | watch | - | - | - |
| 50 | **GSAT** | 0.99 | A | 43.28 | 70 | 50 | research_now | - | no_data | 4 | -3.946 | - |

## Sector allocation
- Healthcare: 24.83%
- Consumer Cyclical: 9.68%
- Industrials: 4.24%
- Consumer Defensive: 2.5%
- Technology: 2.01%
- Communication Services: 0.99%

## Theme allocation
- glp1_metabolic: 6.84%
- cloud_software: 2.01%

## Skipped (caps/sizing)
- ADSK: no Kelly edge (expectations gap +8pts >= 0: price already assumes more growth than demonstrated)
- RMBS: no Kelly edge (expectations gap +9pts >= 0: price already assumes more growth than demonstrated)
- NHC: no Kelly edge (expectations gap +5pts >= 0: price already assumes more growth than demonstrated)
- BMRN: no Kelly edge (expectations gap +8pts >= 0: price already assumes more growth than demonstrated)
- MRK: no Kelly edge (expectations gap +5pts >= 0: price already assumes more growth than demonstrated)
- MEDP: sector cap Healthcare (25.0%)
- VRTX: no Kelly edge (expectations gap +5pts >= 0: price already assumes more growth than demonstrated)
- INVA: sector cap Healthcare (25.0%)
- GMED: sector cap Healthcare (25.0%)
- AVGO: no Kelly edge (expectations gap +14pts >= 0: price already assumes more growth than demonstrated)
- UTHR: sector cap Healthcare (25.0%)
- GD: no Kelly edge (expectations gap +3pts >= 0: price already assumes more growth than demonstrated)
- META: no Kelly edge (expectations gap +32pts >= 0: price already assumes more growth than demonstrated)
- RMD: sector cap Healthcare (25.0%)
- MNST: no Kelly edge (expectations gap +8pts >= 0: price already assumes more growth than demonstrated)

## Sizing method
- Quarter-Kelly: 1 positions — f = 0.25 x mu/sigma^2, mu = expectations-gap recovery over 3y (cap 15%), sigma floor 15%, position cap 5.0%.
- Heuristic fallback: 16 positions (no expectations model): base x survivability scaling.
- Overlay multipliers: GPR level 2 -> x0.75, level 3 -> x0.5 + requires negative gap; informed-demand -1 -> x0.75.

## Standing exit/review triggers (all positions)
- Economics gate falls to 0 or reverse band drops to Reject -> re-underwrite within a week
- A forensic flag newly fires (M/F/accruals/issuance) -> re-underwrite
- Scores older than 90 days -> position is unreviewed, treat as expired (engine rule 15)

_Decision support only. Not investment advice, not an order list. Every position requires human review of the con line and flags._

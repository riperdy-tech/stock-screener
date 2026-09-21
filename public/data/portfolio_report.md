# Portfolio Plan (v1 — decision support)

Generated: 2026-09-21T17:41:45Z
Macro flags: none
Invested: **47.88%**  |  Cash: **52.12%**  |  Positions: 12

| # | Sym | Wt% | Arch | Comp | Surv | FctRank | FctBand | Theme | PdmBand | F | M | Flags |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 4 | **INCY** | 5.0 | B | 87.56 | 80 | 4 | research_now | - | no_data | 6 | - | - |
| 5 | **EXEL** | 5.0 | B | 85.75 | 80 | 5 | research_now | - | no_data | 6 | -2.593 | - |
| 6 | **KNSA** | 5.0 | A | 44.1 | 80 | 6 | research_now | - | no_data | 6 | -3.129 | - |
| 7 | **GRDN** | 2.4 | B | 76.34 | 80 | 7 | research_now | - | no_data | 7 | -2.947 | - |
| 8 | **ABNB** | 1.8 | B | 80.45 | 80 | 8 | research_now | - | no_data | 5 | - | - |
| 11 | **CART** | 5.0 | B | 76.2 | 80 | 11 | research_now | cloud_software | watch | 5 | -3.032 | - |
| 12 | **NBIX** | 4.59 | B | 69.79 | 75 | 12 | research_now | glp1_metabolic | mid | 5 | -2.484 | - |
| 17 | **KRYS** | 2.25 | B | 47.01 | 75 | 17 | research_now | - | no_data | 6 | - | - |
| 30 | **SAP** | 2.1 | B | 73.77 | 70 | 30 | research_now | cloud_software | mid | - | - | - |
| 35 | **PCTY** | 4.74 | B | 70.82 | 70 | 35 | research_now | cloud_software | watch | 7 | -2.57 | - |
| 46 | **VIK** | 5.0 | B | 77.77 | 75 | 46 | research_now | - | no_data | 6 | - | - |
| 47 | **MCRI** | 5.0 | A | 67.59 | 80 | 47 | research_now | - | no_data | 8 | -2.953 | - |

## Sector allocation
- Healthcare: 24.24%
- Consumer Cyclical: 16.8%
- Technology: 6.84%

## Theme allocation
- cloud_software: 11.84%
- glp1_metabolic: 4.59%

## Skipped (caps/sizing)
- TSM: no Kelly edge (expectations gap +21pts >= 0: price already assumes more growth than demonstrated)
- STX: no Kelly edge (expectations gap +34pts >= 0: price already assumes more growth than demonstrated)
- BMRN: no Kelly edge (expectations gap +10pts >= 0: price already assumes more growth than demonstrated)
- LITE: no Kelly edge (expectations gap +56pts >= 0: price already assumes more growth than demonstrated)
- AMD: no Kelly edge (expectations gap +26pts >= 0: price already assumes more growth than demonstrated)
- EMBJ: no Kelly edge (expectations gap +0pts >= 0: price already assumes more growth than demonstrated)
- MU: no Kelly edge (expectations gap +92pts >= 0: price already assumes more growth than demonstrated)
- AAPL: no Kelly edge (expectations gap +19pts >= 0: price already assumes more growth than demonstrated)
- GOOGL: no Kelly edge (expectations gap +16pts >= 0: price already assumes more growth than demonstrated)
- LLY: no Kelly edge (expectations gap +12pts >= 0: price already assumes more growth than demonstrated)
- MPWR: no Kelly edge (expectations gap +22pts >= 0: price already assumes more growth than demonstrated)
- ANET: no Kelly edge (expectations gap +7pts >= 0: price already assumes more growth than demonstrated)
- GOOG: no Kelly edge (expectations gap +16pts >= 0: price already assumes more growth than demonstrated)
- MEDP: sized below minimum (0.22% < 0.75%)
- NHC: no Kelly edge (expectations gap +7pts >= 0: price already assumes more growth than demonstrated)
- RMD: sector cap Healthcare (25.0%)
- ADSK: no Kelly edge (expectations gap +10pts >= 0: price already assumes more growth than demonstrated)
- GEV: no Kelly edge (expectations gap +17pts >= 0: price already assumes more growth than demonstrated)
- VRTX: no Kelly edge (expectations gap +6pts >= 0: price already assumes more growth than demonstrated)
- NVS: sector cap Healthcare (25.0%)
- AZN: sector cap Healthcare (25.0%)
- AMZN: no Kelly edge (expectations gap +47pts >= 0: price already assumes more growth than demonstrated)
- GILD: no Kelly edge (expectations gap +3pts >= 0: price already assumes more growth than demonstrated)
- DELL: no Kelly edge (expectations gap +27pts >= 0: price already assumes more growth than demonstrated)
- SIMO: no Kelly edge (expectations gap +33pts >= 0: price already assumes more growth than demonstrated)
- AVGO: no Kelly edge (expectations gap +10pts >= 0: price already assumes more growth than demonstrated)
- LQDT: no Kelly edge (expectations gap +6pts >= 0: price already assumes more growth than demonstrated)
- MCO: no Kelly edge (expectations gap +10pts >= 0: price already assumes more growth than demonstrated)
- META: no Kelly edge (expectations gap +37pts >= 0: price already assumes more growth than demonstrated)
- HRMY: sector cap Healthcare (25.0%)
- ISRG: no Kelly edge (expectations gap +8pts >= 0: price already assumes more growth than demonstrated)
- ATI: no Kelly edge (expectations gap +26pts >= 0: price already assumes more growth than demonstrated)
- CLS: no Kelly edge (expectations gap +15pts >= 0: price already assumes more growth than demonstrated)
- DT: no Kelly edge (expectations gap +22pts >= 0: price already assumes more growth than demonstrated)
- KRT: no Kelly edge (expectations gap +4pts >= 0: price already assumes more growth than demonstrated)
- SENEB: no Kelly edge (expectations gap +5pts >= 0: price already assumes more growth than demonstrated)
- MNST: no Kelly edge (expectations gap +6pts >= 0: price already assumes more growth than demonstrated)
- TYL: no Kelly edge (expectations gap +4pts >= 0: price already assumes more growth than demonstrated)
- MANH: no Kelly edge (expectations gap +20pts >= 0: price already assumes more growth than demonstrated)

## Sizing method
- Quarter-Kelly: 8 positions — f = 0.25 x mu/sigma^2, mu = expectations-gap recovery over 3y (cap 15%), sigma floor 15%, position cap 5.0%.
- Heuristic fallback: 4 positions (no expectations model): base x survivability scaling.
- Overlay multipliers: GPR level 2 -> x0.75, level 3 -> x0.5 + requires negative gap; informed-demand -1 -> x0.75.

## Standing exit/review triggers (all positions)
- Economics gate falls to 0 or reverse band drops to Reject -> re-underwrite within a week
- A forensic flag newly fires (M/F/accruals/issuance) -> re-underwrite
- Scores older than 90 days -> position is unreviewed, treat as expired (engine rule 15)

_Decision support only. Not investment advice, not an order list. Every position requires human review of the con line and flags._

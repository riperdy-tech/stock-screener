# Portfolio Plan (v1 — decision support)

Generated: 2026-09-18T16:29:13Z
Macro flags: ['macro_yield_warning']
Invested: **47.44%**  |  Cash: **52.56%**  |  Positions: 12

| # | Sym | Wt% | Arch | Comp | Surv | FctRank | FctBand | Theme | PdmBand | F | M | Flags |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 4 | **INCY** | 5.0 | B | 87.47 | 80 | 4 | research_now | - | no_data | 6 | - | - |
| 5 | **EXEL** | 5.0 | B | 85.69 | 80 | 5 | research_now | - | no_data | 6 | -2.593 | - |
| 6 | **KNSA** | 5.0 | A | 44.1 | 80 | 6 | research_now | - | no_data | 6 | -3.129 | - |
| 7 | **GRDN** | 2.4 | B | 76.28 | 80 | 7 | research_now | - | no_data | 7 | -2.947 | - |
| 10 | **NBIX** | 4.2 | B | 69.67 | 75 | 10 | research_now | glp1_metabolic | mid | 5 | -2.484 | - |
| 11 | **CART** | 5.0 | B | 76.33 | 80 | 11 | research_now | cloud_software | watch | 5 | -3.032 | - |
| 14 | **ABNB** | 1.8 | B | 80.47 | 80 | 14 | research_now | - | no_data | 5 | - | - |
| 15 | **KRYS** | 2.25 | B | 47.0 | 75 | 15 | research_now | - | no_data | 6 | - | - |
| 29 | **VIK** | 5.0 | B | 77.88 | 75 | 29 | research_now | - | no_data | 6 | - | - |
| 30 | **SAP** | 2.1 | B | 73.76 | 70 | 30 | research_now | cloud_software | mid | - | - | - |
| 35 | **PCTY** | 4.69 | B | 70.8 | 70 | 35 | research_now | cloud_software | watch | 7 | -2.57 | - |
| 49 | **MCRI** | 5.0 | A | 67.58 | 80 | 49 | research_now | - | no_data | 8 | -2.953 | - |

## Sector allocation
- Healthcare: 23.85%
- Consumer Cyclical: 16.8%
- Technology: 6.79%

## Theme allocation
- cloud_software: 11.79%
- glp1_metabolic: 4.2%

## Skipped (caps/sizing)
- TSM: no Kelly edge (expectations gap +21pts >= 0: price already assumes more growth than demonstrated)
- STX: no Kelly edge (expectations gap +33pts >= 0: price already assumes more growth than demonstrated)
- BMRN: no Kelly edge (expectations gap +10pts >= 0: price already assumes more growth than demonstrated)
- LITE: no Kelly edge (expectations gap +55pts >= 0: price already assumes more growth than demonstrated)
- AMD: no Kelly edge (expectations gap +23pts >= 0: price already assumes more growth than demonstrated)
- EMBJ: sized below minimum (0.38% < 0.75%)
- MU: no Kelly edge (expectations gap +91pts >= 0: price already assumes more growth than demonstrated)
- AAPL: no Kelly edge (expectations gap +19pts >= 0: price already assumes more growth than demonstrated)
- GOOGL: no Kelly edge (expectations gap +16pts >= 0: price already assumes more growth than demonstrated)
- LLY: no Kelly edge (expectations gap +12pts >= 0: price already assumes more growth than demonstrated)
- GOOG: no Kelly edge (expectations gap +16pts >= 0: price already assumes more growth than demonstrated)
- ANET: no Kelly edge (expectations gap +6pts >= 0: price already assumes more growth than demonstrated)
- MPWR: no Kelly edge (expectations gap +21pts >= 0: price already assumes more growth than demonstrated)
- MEDP: sized below minimum (0.39% < 0.75%)
- VRTX: no Kelly edge (expectations gap +6pts >= 0: price already assumes more growth than demonstrated)
- NHC: no Kelly edge (expectations gap +7pts >= 0: price already assumes more growth than demonstrated)
- RMD: sector cap Healthcare (25.0%)
- ADSK: no Kelly edge (expectations gap +9pts >= 0: price already assumes more growth than demonstrated)
- NVS: sector cap Healthcare (25.0%)
- AZN: sector cap Healthcare (25.0%)
- GILD: no Kelly edge (expectations gap +3pts >= 0: price already assumes more growth than demonstrated)
- AMZN: no Kelly edge (expectations gap +46pts >= 0: price already assumes more growth than demonstrated)
- DELL: no Kelly edge (expectations gap +27pts >= 0: price already assumes more growth than demonstrated)
- GEV: no Kelly edge (expectations gap +17pts >= 0: price already assumes more growth than demonstrated)
- MCO: no Kelly edge (expectations gap +10pts >= 0: price already assumes more growth than demonstrated)
- SIMO: no Kelly edge (expectations gap +32pts >= 0: price already assumes more growth than demonstrated)
- AVGO: no Kelly edge (expectations gap +10pts >= 0: price already assumes more growth than demonstrated)
- HRMY: sector cap Healthcare (25.0%)
- ISRG: no Kelly edge (expectations gap +8pts >= 0: price already assumes more growth than demonstrated)
- LQDT: no Kelly edge (expectations gap +6pts >= 0: price already assumes more growth than demonstrated)
- META: no Kelly edge (expectations gap +35pts >= 0: price already assumes more growth than demonstrated)
- KRT: no Kelly edge (expectations gap +3pts >= 0: price already assumes more growth than demonstrated)
- DT: no Kelly edge (expectations gap +22pts >= 0: price already assumes more growth than demonstrated)
- ROST: no Kelly edge (expectations gap +10pts >= 0: price already assumes more growth than demonstrated)
- SENEB: no Kelly edge (expectations gap +5pts >= 0: price already assumes more growth than demonstrated)
- MOV: no Kelly edge (expectations gap +6pts >= 0: price already assumes more growth than demonstrated)
- TYL: no Kelly edge (expectations gap +5pts >= 0: price already assumes more growth than demonstrated)
- CLS: no Kelly edge (expectations gap +14pts >= 0: price already assumes more growth than demonstrated)
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

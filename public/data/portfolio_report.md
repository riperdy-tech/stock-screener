# Portfolio Plan (v1 — decision support)

Generated: 2026-09-17T19:26:07Z
Macro flags: ['macro_yield_warning']
Invested: **42.3%**  |  Cash: **57.7%**  |  Positions: 11

| # | Sym | Wt% | Arch | Comp | Surv | FctRank | FctBand | Theme | PdmBand | F | M | Flags |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 4 | **INCY** | 5.0 | B | 87.52 | 80 | 4 | research_now | - | no_data | 6 | - | - |
| 5 | **EXEL** | 5.0 | B | 85.69 | 80 | 5 | research_now | - | no_data | 6 | -2.593 | - |
| 6 | **KNSA** | 5.0 | A | 44.11 | 80 | 6 | research_now | - | no_data | 6 | -3.129 | - |
| 7 | **GRDN** | 2.4 | B | 76.25 | 80 | 7 | research_now | - | no_data | 7 | -2.947 | - |
| 11 | **NBIX** | 3.75 | B | 69.58 | 75 | 11 | research_now | glp1_metabolic | mid | 5 | -2.484 | - |
| 14 | **CART** | 5.0 | B | 76.3 | 80 | 14 | research_now | cloud_software | watch | 5 | -3.032 | - |
| 15 | **KRYS** | 2.25 | B | 47.0 | 75 | 15 | research_now | - | no_data | 6 | - | - |
| 22 | **ABNB** | 1.8 | B | 80.48 | 80 | 22 | research_now | - | no_data | 5 | - | - |
| 29 | **SAP** | 2.1 | B | 73.68 | 70 | 29 | research_now | cloud_software | mid | - | - | - |
| 31 | **VIK** | 5.0 | B | 77.85 | 75 | 31 | research_now | - | no_data | 6 | - | - |
| 35 | **PCTY** | 5.0 | B | 71.0 | 70 | 35 | research_now | cloud_software | watch | 7 | -2.57 | - |

## Sector allocation
- Healthcare: 23.4%
- Consumer Cyclical: 11.8%
- Technology: 7.1%

## Theme allocation
- cloud_software: 12.1%
- glp1_metabolic: 3.75%

## Skipped (caps/sizing)
- TSM: no Kelly edge (expectations gap +21pts >= 0: price already assumes more growth than demonstrated)
- STX: no Kelly edge (expectations gap +32pts >= 0: price already assumes more growth than demonstrated)
- BMRN: no Kelly edge (expectations gap +10pts >= 0: price already assumes more growth than demonstrated)
- LITE: no Kelly edge (expectations gap +55pts >= 0: price already assumes more growth than demonstrated)
- EMBJ: sized below minimum (0.38% < 0.75%)
- AMD: no Kelly edge (expectations gap +23pts >= 0: price already assumes more growth than demonstrated)
- AAPL: no Kelly edge (expectations gap +19pts >= 0: price already assumes more growth than demonstrated)
- MU: no Kelly edge (expectations gap +90pts >= 0: price already assumes more growth than demonstrated)
- GOOGL: no Kelly edge (expectations gap +16pts >= 0: price already assumes more growth than demonstrated)
- ANET: no Kelly edge (expectations gap +6pts >= 0: price already assumes more growth than demonstrated)
- LLY: no Kelly edge (expectations gap +12pts >= 0: price already assumes more growth than demonstrated)
- GOOG: no Kelly edge (expectations gap +16pts >= 0: price already assumes more growth than demonstrated)
- MPWR: no Kelly edge (expectations gap +20pts >= 0: price already assumes more growth than demonstrated)
- MEDP: sized below minimum (0.28% < 0.75%)
- NHC: no Kelly edge (expectations gap +7pts >= 0: price already assumes more growth than demonstrated)
- ADSK: no Kelly edge (expectations gap +10pts >= 0: price already assumes more growth than demonstrated)
- RMD: sector cap Healthcare (25.0%)
- VRTX: no Kelly edge (expectations gap +6pts >= 0: price already assumes more growth than demonstrated)
- NVS: sector cap Healthcare (25.0%)
- AZN: sector cap Healthcare (25.0%)
- GEV: no Kelly edge (expectations gap +17pts >= 0: price already assumes more growth than demonstrated)
- DELL: no Kelly edge (expectations gap +28pts >= 0: price already assumes more growth than demonstrated)
- GILD: no Kelly edge (expectations gap +3pts >= 0: price already assumes more growth than demonstrated)
- ATI: no Kelly edge (expectations gap +25pts >= 0: price already assumes more growth than demonstrated)
- SIMO: no Kelly edge (expectations gap +31pts >= 0: price already assumes more growth than demonstrated)
- MCO: no Kelly edge (expectations gap +10pts >= 0: price already assumes more growth than demonstrated)
- AMZN: no Kelly edge (expectations gap +46pts >= 0: price already assumes more growth than demonstrated)
- AVGO: no Kelly edge (expectations gap +9pts >= 0: price already assumes more growth than demonstrated)
- HRMY: sector cap Healthcare (25.0%)
- META: no Kelly edge (expectations gap +36pts >= 0: price already assumes more growth than demonstrated)
- SENEB: no Kelly edge (expectations gap +5pts >= 0: price already assumes more growth than demonstrated)
- DT: no Kelly edge (expectations gap +22pts >= 0: price already assumes more growth than demonstrated)
- TYL: no Kelly edge (expectations gap +5pts >= 0: price already assumes more growth than demonstrated)
- ISRG: no Kelly edge (expectations gap +7pts >= 0: price already assumes more growth than demonstrated)
- LQDT: no Kelly edge (expectations gap +6pts >= 0: price already assumes more growth than demonstrated)
- MNST: no Kelly edge (expectations gap +6pts >= 0: price already assumes more growth than demonstrated)
- JKHY: no Kelly edge (expectations gap +1pts >= 0: price already assumes more growth than demonstrated)
- MANH: no Kelly edge (expectations gap +20pts >= 0: price already assumes more growth than demonstrated)
- MOV: no Kelly edge (expectations gap +7pts >= 0: price already assumes more growth than demonstrated)
- CLS: no Kelly edge (expectations gap +14pts >= 0: price already assumes more growth than demonstrated)

## Sizing method
- Quarter-Kelly: 7 positions — f = 0.25 x mu/sigma^2, mu = expectations-gap recovery over 3y (cap 15%), sigma floor 15%, position cap 5.0%.
- Heuristic fallback: 4 positions (no expectations model): base x survivability scaling.
- Overlay multipliers: GPR level 2 -> x0.75, level 3 -> x0.5 + requires negative gap; informed-demand -1 -> x0.75.

## Standing exit/review triggers (all positions)
- Economics gate falls to 0 or reverse band drops to Reject -> re-underwrite within a week
- A forensic flag newly fires (M/F/accruals/issuance) -> re-underwrite
- Scores older than 90 days -> position is unreviewed, treat as expired (engine rule 15)

_Decision support only. Not investment advice, not an order list. Every position requires human review of the con line and flags._

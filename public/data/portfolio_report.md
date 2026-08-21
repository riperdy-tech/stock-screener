# Portfolio Plan (v1 — decision support)

Generated: 2026-08-21T22:02:00Z
Macro flags: none
Invested: **51.12%**  |  Cash: **48.88%**  |  Positions: 13

| # | Sym | Wt% | Arch | Comp | Surv | FctRank | FctBand | Theme | PdmBand | F | M | Flags |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 4 | **INCY** | 5.0 | B | 87.16 | 80 | 4 | research_now | - | no_data | 6 | - | - |
| 5 | **EXEL** | 5.0 | B | 86.33 | 80 | 5 | research_now | - | no_data | 6 | -2.593 | - |
| 8 | **KNSA** | 5.0 | A | 43.84 | 80 | 8 | research_now | - | no_data | 6 | -3.129 | - |
| 11 | **NBIX** | 3.62 | B | 69.6 | 75 | 11 | research_now | - | no_data | 5 | -2.484 | - |
| 12 | **KRYS** | 2.25 | B | 46.99 | 75 | 12 | research_now | - | no_data | 6 | - | - |
| 22 | **GRDN** | 2.4 | B | 77.78 | 80 | 22 | research_now | - | no_data | 7 | -2.947 | - |
| 23 | **VIK** | 5.0 | B | 64.54 | 75 | 23 | research_now | - | no_data | 6 | - | - |
| 25 | **CART** | 4.3 | B | 75.39 | 80 | 25 | research_now | cloud_software | mid | 5 | -3.032 | - |
| 27 | **SAP** | 2.1 | B | 73.18 | 70 | 27 | research_now | - | no_data | - | - | - |
| 31 | **ABNB** | 1.8 | B | 79.54 | 80 | 31 | research_now | - | no_data | 5 | - | - |
| 43 | **PCTY** | 4.65 | B | 70.38 | 70 | 43 | research_now | cloud_software | watch | 7 | -2.57 | - |
| 46 | **MCRI** | 5.0 | A | 66.82 | 80 | 46 | research_now | - | no_data | 8 | -2.953 | - |
| 48 | **KFY** | 5.0 | A | 69.65 | 80 | 48 | research_now | - | no_data | 8 | -2.619 | - |

## Sector allocation
- Healthcare: 23.27%
- Consumer Cyclical: 16.1%
- Technology: 6.75%
- Industrials: 5.0%

## Theme allocation
- cloud_software: 8.95%

## Skipped (caps/sizing)
- TSM: no Kelly edge (expectations gap +20pts >= 0: price already assumes more growth than demonstrated)
- STX: no Kelly edge (expectations gap +33pts >= 0: price already assumes more growth than demonstrated)
- BMRN: no Kelly edge (expectations gap +11pts >= 0: price already assumes more growth than demonstrated)
- GOOGL: no Kelly edge (expectations gap +16pts >= 0: price already assumes more growth than demonstrated)
- GOOG: no Kelly edge (expectations gap +16pts >= 0: price already assumes more growth than demonstrated)
- LITE: no Kelly edge (expectations gap +54pts >= 0: price already assumes more growth than demonstrated)
- EMBJ: sized below minimum (0.13% < 0.75%)
- MPWR: no Kelly edge (expectations gap +23pts >= 0: price already assumes more growth than demonstrated)
- MU: no Kelly edge (expectations gap +90pts >= 0: price already assumes more growth than demonstrated)
- GEV: no Kelly edge (expectations gap +17pts >= 0: price already assumes more growth than demonstrated)
- LLY: no Kelly edge (expectations gap +15pts >= 0: price already assumes more growth than demonstrated)
- AAPL: no Kelly edge (expectations gap +17pts >= 0: price already assumes more growth than demonstrated)
- ANET: no Kelly edge (expectations gap +5pts >= 0: price already assumes more growth than demonstrated)
- MNST: no Kelly edge (expectations gap +7pts >= 0: price already assumes more growth than demonstrated)
- ADSK: no Kelly edge (expectations gap +13pts >= 0: price already assumes more growth than demonstrated)
- NHC: no Kelly edge (expectations gap +8pts >= 0: price already assumes more growth than demonstrated)
- NVS: sector cap Healthcare (25.0%)
- MEDP: sized below minimum (0.27% < 0.75%)
- JKHY: no Kelly edge (expectations gap +4pts >= 0: price already assumes more growth than demonstrated)
- FIX: no Kelly edge (expectations gap +2pts >= 0: price already assumes more growth than demonstrated)
- RMD: sector cap Healthcare (25.0%)
- CIEN: no Kelly edge (expectations gap +76pts >= 0: price already assumes more growth than demonstrated)
- AMZN: no Kelly edge (expectations gap +47pts >= 0: price already assumes more growth than demonstrated)
- SIMO: no Kelly edge (expectations gap +31pts >= 0: price already assumes more growth than demonstrated)
- GD: no Kelly edge (expectations gap +5pts >= 0: price already assumes more growth than demonstrated)
- AMD: no Kelly edge (expectations gap +20pts >= 0: price already assumes more growth than demonstrated)
- AZN: sector cap Healthcare (25.0%)
- DELL: no Kelly edge (expectations gap +22pts >= 0: price already assumes more growth than demonstrated)
- UTHR: sector cap Healthcare (25.0%)
- AVGO: no Kelly edge (expectations gap +10pts >= 0: price already assumes more growth than demonstrated)
- MCO: no Kelly edge (expectations gap +12pts >= 0: price already assumes more growth than demonstrated)
- ATI: no Kelly edge (expectations gap +28pts >= 0: price already assumes more growth than demonstrated)
- VRTX: no Kelly edge (expectations gap +7pts >= 0: price already assumes more growth than demonstrated)
- MAMA: sized below minimum (0.72% < 0.75%)
- CLS: no Kelly edge (expectations gap +10pts >= 0: price already assumes more growth than demonstrated)
- AGX: no Kelly edge (expectations gap +5pts >= 0: price already assumes more growth than demonstrated)
- GMED: sector cap Healthcare (25.0%)
- CMI: no Kelly edge (expectations gap +2pts >= 0: price already assumes more growth than demonstrated)

## Sizing method
- Quarter-Kelly: 9 positions — f = 0.25 x mu/sigma^2, mu = expectations-gap recovery over 3y (cap 15%), sigma floor 15%, position cap 5.0%.
- Heuristic fallback: 4 positions (no expectations model): base x survivability scaling.
- Overlay multipliers: GPR level 2 -> x0.75, level 3 -> x0.5 + requires negative gap; informed-demand -1 -> x0.75.

## Standing exit/review triggers (all positions)
- Economics gate falls to 0 or reverse band drops to Reject -> re-underwrite within a week
- A forensic flag newly fires (M/F/accruals/issuance) -> re-underwrite
- Scores older than 90 days -> position is unreviewed, treat as expired (engine rule 15)

_Decision support only. Not investment advice, not an order list. Every position requires human review of the con line and flags._

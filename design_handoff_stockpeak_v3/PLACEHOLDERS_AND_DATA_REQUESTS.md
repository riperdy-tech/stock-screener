# Placeholders in the prototype (do NOT treat as data) and data requests

## A. Real values (taken from `reference_brief_v2/fixtures/`, as of 2026-10-04/05)
Funnel 6,972 / 3,047 / 3,925 vetoed / 161 / 2,886 / 60 research now / 101 watchlist; DDI overlay row (price
13.31, IV 37.55, one run, MoS +182 %, quarter, blocked reasons, crux −65.8 % vs −0.6 %, street 5.11–43.64,
bear 24.28 / bull 55.50, rules, evidence stamps, instability 15.75 → 37.55); MRI regime, probabilities,
explanation, warnings, ERP 4.03 %, CoE 9.27 %; paper books `rn_depth` and `equal` summaries; ledger trades
2026-09-24; alerts; scoreboard 329 graded / 2,426 pending / 327 at 30 d / caveats. These are **examples**:
in code, read them from files at render time. Never hard-code them.

## B. Illustrative only — invented for layout
- Tickers `AAA`, `BBB`, `CCC`, `DDD`, `EEE`, `FFF`, `GGG`, `HHH`, `TICK`, and every `Company · Industry`.
- Every `n` and `top n %` (door counts, veto-reason counts, exchange counts, percentiles).
- All of 8b (Phase C): 158 verdicts, 9 pass, 5 held, 4 waiting, 118 watchlist, 27 blocked, 3 awaiting, all
  row prices / bands / MoS / sizes / z-scores, "Since yesterday" events, stamps dated 11-13/11-14.
- AAA in 7a and 8b (price $42.10, band $52–58, +31 %, crux 4 % vs 11 %, mcap $4.2B, z-scores).
- AMD's queue position, door and z-scores; queue order in 8a.
- DDI screener-side values: `Door 2 · Value gap`, `research now #14`, its z-scores, the "Came in through the value
  door" sentence, sector "Communication services", mcap $0.7B, verdict-history date `2026-09-xx`. The fixture
  has no `factor_scores` row for DDI; read the real one.
- Expectations panel `n %/yr` values; key financials `—`.
- Portfolio holdings AAA–DDD, weights, the "Technology is 40 %" warning.
- 24 old-analyst verdicts (real count today, but read it live).
- Macro strength-label wording thresholds (proposal).
- Bar widths in the step-2 / step-3 detail panels (proportions are drawn, not computed).

## C. Data requests (need pipeline work; build the fallback now)
| Wanted | Used in | Fallback until it exists |
| --- | --- | --- |
| `changes.json` (daily diff of book / verdicts / ledger) | Desk "Since yesterday" | `fs.band_transitions` counts only, or hide the block |
| Per-ticker verdict history (from `depth_ledger.jsonl`) | Stock page verdict history; legacy rows there | newest verdict + `instability.prior_iv` |
| `depth_progress.json` (baseline n of N, queue) | Funnel step 4, health drawer | rebuilt verdicts ÷ list size; queue = `fct_rank` order |
| Exchange of listing per ticker | Funnel step 1 detail | omit the three exchange boxes; show total only |
| Explicit universe count in `fs` header | Funnel step 1 | count of `fs.tickers` |
| `record_epoch` on `rn_depth` | Track record reset marker / archive switch | go-live date from `lib/changelog.ts` |
| Regime history | Macro (not designed yet) | current read only |

# KIS Portfolio Sync

Mirrors the site's `equal` paper-trading ledger (Track Record tab) into a real
KIS (한국투자증권) brokerage account via the KIS Open API — 모의투자 first, real
account after validation. Runs on GitHub Actions weekdays at 14:40 UTC.

## How it works

```
paper_ledgers.json (Supabase)          KIS Open API
        │                                   │
        ▼                                   ▼
  target weights  ──►  reconcile  ◄──  holdings + USD cash
  (equal ledger)          │
                          ▼
              sells first → wait for fills → buys
              (limit orders, whole shares, US session only)
```

- **Reconciliation, not trade-replay.** Every run compares target weights
  against actual holdings and orders the delta. Missed runs, partial fills,
  rejected orders all self-heal on the next run.
- **In/outs mirrored exactly:** a name dropped from the ledger is fully sold and
  a new name is bought at its weight, both regardless of the churn threshold.
  The threshold only governs rebalance deltas on names already held.
- **Whole shares** — the KIS API has no fractional orders. Sizing uses
  largest-remainder apportionment, not `floor()`: floor every position, then
  spend the remaining budget on the largest fractional remainders (a name
  wanting 1.97 shares gets 2). Plain flooring stranded ~8% of NAV in cash,
  concentrated in high-priced names. A final top-up pass deploys the last of the
  cash into whichever name overshoots its target slot least, capped at +25% of
  that slot. Ledger cash weight is preserved, never deployed.
- Rebalance deltas below `max($50, 25 bps of NAV)` are skipped to kill churn.
- Marketable limit orders: buy at last +0.3%, sell at last −0.3%.

Code: [`scripts/sync_kis_portfolio.py`](../scripts/sync_kis_portfolio.py) (CLI),
[`scripts/kis/client.py`](../scripts/kis/client.py) (API),
[`scripts/kis/reconcile.py`](../scripts/kis/reconcile.py) (pure logic, tested by
`scripts/test_kis_reconcile.py`).

## Setup (one-time)

### 1. GitHub secrets (repo → Settings → Secrets and variables → Actions)

| Secret | Value |
|---|---|
| `KIS_APP_KEY_PAPER` / `KIS_APP_SECRET_PAPER` | 모의투자 app key/secret |
| `KIS_CANO_PAPER` | 모의투자 account number (first 8 digits) |
| `KIS_ACNT_PRDT_CD_PAPER` | account product code (last 2 digits, usually `01`) |
| `KIS_APP_KEY_REAL` / `KIS_APP_SECRET_REAL` / `KIS_CANO_REAL` / `KIS_ACNT_PRDT_CD_REAL` | real account — add only at cutover |

`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are already set (used by
the data-fetch workflow); the sync reads the freshest ledger from Supabase.

### 2. GitHub repo **variables** (safety switches)

| Variable | Values | Meaning |
|---|---|---|
| `KIS_ENV` | unset/`paper` (default), `real` | which account the workflow targets |
| `KIS_AUTO_EXECUTE` | unset (default = dry run), `true` | scheduled runs actually place orders |
| `KIS_CONFIRM_REAL` | unset (default), `true` | required on top of everything for real trading |
| `KIS_LEDGER` | unset (= `equal`), `equal_llm`, … | ledger to mirror |

Defaults are maximally safe: fresh clone + secrets = scheduled dry runs against
모의투자, nothing traded anywhere.

### 3. First buy-in

The default turnover cap (40% NAV/day) blocks a from-scratch buy-in. Fund the
account (USD), then run manually once:

Actions → **KIS Portfolio Sync** → Run workflow → `execute: true`,
`max_turnover: 100`.

Do this during US market hours (the script refuses to trade outside
09:30–16:00 ET; `--ignore-market-hours` exists for local testing only).

## Rollout plan

1. **Now — paper dry runs.** Add paper secrets, leave variables unset. Watch
   the job summary table (Actions → run → Summary) for a few days.
2. **Paper trading.** Set `KIS_AUTO_EXECUTE=true`, do the first buy-in
   manually (above). Let it run 2–4 weeks; compare account NAV vs the `equal`
   ledger NAV. Expect small drag: paper assumes 10 bps/side, real KIS overseas
   commission is ~25 bps + FX spread.
3. **Real cutover.** Add `*_REAL` secrets, set `KIS_ENV=real` +
   `KIS_CONFIRM_REAL=true`. Consider leaving `KIS_AUTO_EXECUTE` unset at first
   so real runs stay manual-trigger.
4. **Switch to LLM ledger** (if it keeps outperforming): set
   `KIS_LEDGER=equal_llm`. The reconciler treats it as a normal rebalance.

## Drawdown governor (live 2026-07-21)

Every run enforces the max-drawdown budget on the mirrored book (engine:
`scripts/kis/dd_engine.py`, wiring: `scripts/kis/dd_gate.py`; tiers −8% → half
gross, −11% → quarter, −13% → liquidate + sticky HALT; ~2pt recovery
hysteresis). State (peak NAV per unit, unit count, gross, halted — per env)
persists in Supabase `paper_ledgers` row id=2; pre-unitization rows migrate on
read with the drawdown reading unchanged. Tier changes, halts, and declared
flows alert via Telegram.

- **Reduced tier:** targets are scaled down (sells/trims proceed), fresh buys
  are suppressed until the drawdown recovers past the hysteresis line.
- **HALT:** targets cleared → full liquidation, no buys, sticky across runs.
  After review, resume via workflow input `dd_resume=true` — this KEEPS the
  peak (the ladder governs re-entry). `dd_rebase=true` restarts the budget
  from current NAV — deliberate only, never routine.
- **Fail-open:** if the state store is unreachable the run trades ungated and
  alerts loudly; `KIS_HALT` remains the manual backstop. Emergency bypass:
  repo variable `KIS_DD_DISABLE=true`.
- **Moving money in or out — nothing to do; it is detected automatically.**
  Drawdown is measured on NAV **per unit**, fund-style, so a cash flow buys or
  sells units at the pre-flow price and cannot register as performance. Without
  this a deposit lifts NAV past the high-water mark and *forgives an open
  drawdown*, restoring full gross — and a withdrawal manufactures one (a 13%
  withdrawal alone would liquidate and HALT).

  Each run reconciles the previous run's book against today's prices:

  ```
  expected = cash_prev + SUM(shares_prev x price_now)
  flow     = nav_now - expected
  ```

  Trades in between are sleeve-internal and cancel (a buy converts cash into
  shares at market); market moves land in `expected` because the OLD share
  counts are revalued at today's prices. Whatever remains is money that entered
  or left. **Pure KRW movement yields exactly 0.0** — it never touches USD NAV
  on either side — which is also why no 환전 endpoint is required: an exchange
  raises USD NAV with no position or trade explaining it, so it falls out of the
  residual on its own.

  Residuals below `max($200, 0.5% of NAV)` are treated as performance —
  dividends, fees, and the timing noise of valuing an exited position at today's
  close rather than the fill. Real transfers are orders of magnitude larger, so
  the bands do not overlap. Detection is skipped (never guessed) on the first
  run, or when a previously-held name has no current price.

  Every detected flow alerts via Telegram. `flow_usd` is an **override** for the
  rare misread — set a number to force it, or `0` to suppress one. It is a
  dispatch input, never a repo variable: a variable left set would re-apply the
  same flow every run.

  `dd_rebase` is now rarely the right tool for new capital — it discards an open
  drawdown, whereas this keeps the budget honest. Reach for rebase on a genuine
  regime change only. Locked by the flow and detection tests in
  `scripts/test_dd_engine.py`.
- Validation: `docs/superpowers/audit/tools/dd_replay.py` (stress + Monte
  Carlo). Hard ≤15% cannot be guaranteed against single-day gaps at full
  gross (~1% of simulated years reach ≈−16 to −20%); p99 ≈ −15%.

## Operational notes

- **Unfilled orders abort the run** (prevents double-ordering). They usually
  mean a limit didn't fill; cancel in the KIS app or let them expire, next
  run reconciles.
- **Rejected tickers** (KIS may not carry some small caps — GRDN/JLHL/WILC
  class names) are logged and skipped; the run continues. Persistent rejects
  show up in every summary — decide per-name whether to live without it.
- **Stale ledger guard:** if the ledger's `current_date` is >5 days old the
  script refuses to trade.
- **Two independent caps limit buys — don't confuse them.**
  1. **Turnover** (`max_turnover_pct`, default 40% of NAV) bounds trading
     *activity*, i.e. cost. It counts sells **and** buys against one allowance,
     so **selling consumes the cap rather than replenishing it**. Exits are
     exempt from being dropped (they must happen) but still eat the allowance —
     on 2026-08-03 six exits used $6,057 of an $11,887 cap and $5,409 of buys
     were dropped as a result.
  2. **Cash** bounds *affordability*: `(orderable + expected sell proceeds) ×
     (1 − cost_buffer)`. This is the "sell first, then spend the proceeds"
     rule, and it applies after the turnover cap.

  A run can be blocked by (1) while (2) still has slack, which looks like
  "why isn't my cash being used?". A wholesale ledger rotation is the extreme
  case: on 2026-08-11 exits alone were $23,094 against a $16,205 cap, leaving
  zero room, and all 13 entries were dropped — the book sold 57% of NAV and
  redeployed none of it until the next run.
- **Idle-cash allowance.** Cash held *above the ledger's target weight* is
  exempt from the turnover cap. Deploying new capital is a one-off, not churn,
  so a deposit no longer queues behind unrelated rotation. The allowance is
  self-limiting: it exists only while underinvested, vanishes at target, ignores
  the current run's own sale proceeds (rotation stays fully capped), and
  disappears under a reduced DD tier, where the governor wants the cash held.
  **Consequence:** on a deployment day total turnover can exceed the nominal
  cap — 57% vs a 40% setting in the 08-03 replay. That is intended; the buys
  happen either way, so deferring them costs cash drag without saving
  commission. Trims never draw on the allowance.
- **Suppressed orders are reported, not just logged.** Anything the plan wanted
  and never sent — turnover cap, cash shortfall, DD-governor suppression, a buy
  cut down to what cash allowed — is recorded in `plan.dropped`, written to
  `logs/kis_sync.jsonl` under the `plan` event, and surfaced in the Telegram
  digest as a `⚠ N NOT placed` line (largest three itemized, rest counted).
  Independently, a run that placed only sells and left ≥20% of NAV in cash gets
  a `⚠ SELLS ONLY` line — a backstop that fires even if a future suppression
  path forgets to record itself. Before this, dropped orders reached only the
  Actions job summary: the 08-11 rotation above notified as a clean
  "Placed 14/14".
- **Cash source.** The script prefers the plain USD deposit from
  `inquire-present-balance`. A KRW-seeded account under 통합증거금 reports a
  **zero** USD deposit while still being able to order US stock (this is what
  모의투자 does: ₩10M seed, $0 deposit, $100k 매수가능금액), so it falls back to
  `inquire-psamount`. The levered `frcr_ord_psbl_amt1` field is deliberately
  ignored. On a **real** account the fallback aborts the run unless
  `KIS_ALLOW_MARGIN=1` — fund USD instead of trading on collateral.
  Run `--probe` (workflow input `probe`) any time to dump all of this read-only.
- **KRW is out of scope for NAV (policy, owner-stated 2026-08-01).** Any KRW
  left in the account is a parked reserve: it is never invested in Korean
  equities and must not enter any NAV, drawdown, or position-sizing equation.
  The code holds this on all three sides — NAV counts USD only, `orderable` is
  capped at USD funds so 통합증거금 collateral is never spent, and the NAV
  cross-check nets the KRW leg (`tot_dncl_amt`) out of KIS's `tot_asst_amt` so a
  reserve cannot read as a NAV error. The reserve is printed on every run purely
  so it stays visible. Locked by
  `test_krw_reserve_of_any_size_never_moves_nav_or_budget`.
  Corollary: if KRW ever *is* deployed into Korean stock it lands in holdings,
  which USD NAV cannot see, and the run aborts — correctly, since the book could
  no longer be valued. Don't widen the tolerance to silence that; sell back to
  KRW cash or exchange to USD.
- **모의투자 quirks:** paper supports overseas orders (VTTT/VTTS TR IDs) but
  fills can differ from reality; treat paper results as plumbing validation,
  not performance validation.
- Every run appends to `logs/kis_sync.jsonl` (uploaded as an artifact,
  90-day retention) and writes a markdown summary to the Actions run page.
- `scripts/kis/exchange_map.json` caches ticker→exchange (NAS/NYS/AMS)
  lookups. It does not exist yet: the first run builds it by probing the
  quote API (up to 3 calls per unknown ticker). Actions runners are
  ephemeral, so unless you commit the file after a local run, every run
  re-probes — ~1–2 min of extra quote calls on paper's 2 req/s limit.
  Harmless; commit it if you want faster runs.

## Local dry run

```bash
export KIS_APP_KEY=... KIS_APP_SECRET=... KIS_CANO=... KIS_ACNT_PRDT_CD=01
python scripts/sync_kis_portfolio.py            # paper, dry run
python scripts/test_kis_reconcile.py            # unit tests, no network
```

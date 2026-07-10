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
- **In/outs mirrored exactly:** a name dropped from the ledger is fully sold
  (even below the churn threshold); a new name is bought at its weight.
- **Whole shares** (`floor(weight × NAV / price)`); the KIS API has no
  fractional orders. With NAV ≥ $65k, rounding drift is small.
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

## Operational notes

- **Unfilled orders abort the run** (prevents double-ordering). They usually
  mean a limit didn't fill; cancel in the KIS app or let them expire, next
  run reconciles.
- **Rejected tickers** (KIS may not carry some small caps — GRDN/JLHL/WILC
  class names) are logged and skipped; the run continues. Persistent rejects
  show up in every summary — decide per-name whether to live without it.
- **Stale ledger guard:** if the ledger's `current_date` is >5 days old the
  script refuses to trade.
- **Cash field check:** first dry run prints the raw USD cash row from
  `inquire-present-balance` — eyeball that the parsed amount matches reality
  before enabling execution (KIS field naming varies by account type).
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

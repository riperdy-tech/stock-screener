"""sync_kis_portfolio.py — mirror a paper-trading ledger into a KIS account.

Reads target weights from the site's ledger book (default: the `equal`
ledger), compares them with actual KIS holdings, and reconciles with limit
orders through the KIS Open API. Reconciliation, not trade-replay: missed
runs, partial fills and rejects self-heal on the next run.

DRY-RUN BY DEFAULT. Nothing is sent without --execute.
Real accounts additionally require --confirm-real.

Usage:
    python scripts/sync_kis_portfolio.py                      # dry run, paper
    python scripts/sync_kis_portfolio.py --execute            # trade, paper
    python scripts/sync_kis_portfolio.py --env real --execute --confirm-real

Env: KIS_APP_KEY, KIS_APP_SECRET, KIS_CANO, KIS_ACNT_PRDT_CD (see docs/KIS_SYNC.md)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kis.client import EXCD_TO_ORDER, KISClient  # noqa: E402
from kis.reconcile import compute_plan  # noqa: E402
from kis.targets import ledger_weights, load_ledger_book  # noqa: E402

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[1]
EXCHANGE_MAP = ROOT / "scripts" / "kis" / "exchange_map.json"
LOG_PATH = ROOT / "logs" / "kis_sync.jsonl"

BUY_LIMIT_BUFFER = 1.003   # limit = last * buffer (marketable limit)
SELL_LIMIT_BUFFER = 0.997
FILL_WAIT_ROUNDS = 6       # x 30s = up to 3 min waiting for sell fills
FILL_WAIT_SECONDS = 30


def us_market_open(now=None) -> bool:
    ny = (now or datetime.now(timezone.utc)).astimezone(ZoneInfo("America/New_York"))
    if ny.weekday() >= 5:
        return False
    minutes = ny.hour * 60 + ny.minute
    return 9 * 60 + 30 <= minutes < 16 * 60  # 09:30–16:00 ET (holidays -> orders just reject)


def load_exchange_map() -> dict:
    try:
        return json.loads(EXCHANGE_MAP.read_text())
    except Exception:
        return {}


def resolve_prices(client: KISClient, tickers: set[str], held_exch: dict) -> tuple[dict, dict]:
    """Return ({ticker: last_price}, {ticker: order_exchange_cd}).
    Exchange codes come from (1) the balance response for held names,
    (2) the cached map, (3) probing the quote API. Cache updated on disk."""
    exch_map = load_exchange_map()
    reverse = {v: k for k, v in EXCD_TO_ORDER.items()}  # NASD -> NAS etc.
    prices, order_cd, dirty = {}, {}, False
    for t in sorted(tickers):
        excd = None
        if t in held_exch and held_exch[t] in reverse:
            excd = reverse[held_exch[t]]
        elif t in exch_map:
            excd = exch_map[t]
        if excd:
            last = client.quote(excd, t)
            if last:
                prices[t], order_cd[t] = last, EXCD_TO_ORDER[excd]
                if exch_map.get(t) != excd:
                    exch_map[t], dirty = excd, True
                continue
        hit = client.resolve_exchange(t)
        if hit:
            excd, last = hit
            prices[t], order_cd[t] = last, EXCD_TO_ORDER[excd]
            exch_map[t], dirty = excd, True
    if dirty:
        try:
            EXCHANGE_MAP.write_text(json.dumps(exch_map, indent=1, sort_keys=True))
        except Exception:
            pass
    return prices, order_cd


def log_event(event: dict):
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    event["ts"] = datetime.now(timezone.utc).isoformat()
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")


def gh_summary(lines: list[str]):
    p = os.environ.get("GITHUB_STEP_SUMMARY")
    if p:
        with open(p, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")


def plan_table(plan, order_cd) -> list[str]:
    lines = ["| side | ticker | exch | qty | ref px | est value | reason |",
             "|------|--------|------|-----|--------|-----------|--------|"]
    for o in plan.orders:
        lines.append(f"| {o.side} | {o.ticker} | {order_cd.get(o.ticker, '?')} | {o.qty} "
                     f"| {o.price:,.2f} | ${o.est_value:,.2f} | {o.reason} |")
    return lines


def run_probe(client):
    """Read-only diagnostics. Answers: is the account KRW-seeded, does it have
    USD, and does KIS think we can actually buy anything?"""
    out = ["## KIS account probe", ""]

    def emit(line=""):
        print(line)
        out.append(line)

    emit(f"env: {client.env}")

    body = client.present_balance_raw()
    rows = body.get("output2") or []
    emit(f"\ncurrency rows in inquire-present-balance: {len(rows)}")
    for row in rows:
        emit(f"  {json.dumps(row, ensure_ascii=False)}")
    if not rows:
        emit("  (none — account holds no foreign currency at all)")
    totals = body.get("output3")
    if totals:
        emit(f"  totals (output3): {json.dumps(totals, ensure_ascii=False)}")

    try:
        krw = client.krw_balance()
        keys = ("dnca_tot_amt", "prvs_rcdl_excc_amt", "tot_evlu_amt", "nxdy_excc_amt")
        shown = {k: krw.get(k) for k in keys if k in krw}
        emit(f"\nKRW (domestic) balance: "
             f"{json.dumps(shown, ensure_ascii=False) if shown else '(empty)'}")
    except Exception as e:
        emit(f"\nKRW balance query failed: {e}")

    try:
        bp = client.buying_power("AAPL", "NASD", 200.0)
        emit(f"\nbuying power (매수가능금액, AAPL @ $200): "
             f"{json.dumps(bp, ensure_ascii=False) if bp else '(empty)'}")
    except Exception as e:
        emit(f"\nbuying power query failed: {e}")

    emit("\nRead: zero USD deposit + KRW seed + nonzero 매수가능금액 => 통합증거금 "
         "account; usd_cash() falls back to 매수가능금액 automatically.")
    emit("      Everything zero => account genuinely unfunded.")
    gh_summary(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--env", default=os.environ.get("KIS_ENV", "paper"),
                    choices=["paper", "real"])
    ap.add_argument("--ledger", default=os.environ.get("KIS_LEDGER", "equal"),
                    help="ledger key in the book (equal, equal_llm, plan, ...)")
    ap.add_argument("--execute", action="store_true", help="actually place orders")
    ap.add_argument("--confirm-real", action="store_true",
                    help="required (with --execute) to trade the real account")
    ap.add_argument("--min-order-usd", type=float,
                    default=float(os.environ.get("KIS_MIN_ORDER_USD", 50)))
    ap.add_argument("--min-order-bps", type=float,
                    default=float(os.environ.get("KIS_MIN_ORDER_BPS", 25)))
    ap.add_argument("--max-order-usd", type=float,
                    default=float(os.environ.get("KIS_MAX_ORDER_USD", 15000)))
    ap.add_argument("--max-turnover", type=float,
                    default=float(os.environ.get("KIS_MAX_TURNOVER_PCT", 40)),
                    help="max total order value as %% of NAV (use 100 for first buy-in)")
    ap.add_argument("--probe", action="store_true",
                    help="read-only account diagnostics (cash rows, KRW seed, "
                         "buying power); places no orders and exits")
    ap.add_argument("--ignore-market-hours", action="store_true")
    ap.add_argument("--no-wait", action="store_true",
                    help="don't wait for sell fills before buying")
    args = ap.parse_args()

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    print(f"KIS sync [{run_id}] env={args.env} ledger={args.ledger} "
          f"execute={args.execute}")

    # ---- targets ----
    book, src = load_ledger_book()
    tgt = ledger_weights(book, args.ledger)
    print(f"targets: {len(tgt['weights'])} names from {args.ledger!r} "
          f"(source={src}, as_of={tgt['as_of']}, cash_w={tgt['cash_weight']:.2%})")

    # ---- account ----
    missing = [k for k in ("KIS_APP_KEY", "KIS_APP_SECRET", "KIS_CANO", "KIS_ACNT_PRDT_CD")
               if not os.environ.get(k)]
    if missing:
        sys.exit(f"missing env: {', '.join(missing)}")
    client = KISClient(args.env, os.environ["KIS_APP_KEY"], os.environ["KIS_APP_SECRET"],
                       os.environ["KIS_CANO"], os.environ["KIS_ACNT_PRDT_CD"])

    if args.probe:
        run_probe(client)
        return

    positions = client.balance()
    held = {p["ticker"]: p["shares"] for p in positions}
    sellable = {p["ticker"]: p["sellable"] for p in positions}
    held_exch = {p["ticker"]: p["exch_order_cd"] for p in positions}
    cash, cash_src, cash_row = client.usd_cash()
    print(f"account: {len(held)} positions, USD cash {cash:,.2f} (source: {cash_src})")
    if cash_row:
        print(f"  cash row: "
              f"{json.dumps({k: v for k, v in cash_row.items() if 'amt' in k}, ensure_ascii=False)}")
    if cash_src == "buying_power":
        # KRW-seeded account under 통합증거금: the USD deposit reads zero but US
        # orders still clear. Fine for 모의투자; on a real account this can draw
        # on collateral (margin), which this strategy never intends to use.
        print("  NOTE: USD deposit is zero; using 매수가능금액 (통합증거금 account)")
        if args.env == "real" and not os.environ.get("KIS_ALLOW_MARGIN"):
            sys.exit("refusing: real account has no USD deposit and would trade on "
                     "collateral-backed buying power. Fund USD, or set "
                     "KIS_ALLOW_MARGIN=1 if that is genuinely intended.")

    open_orders = client.unfilled()
    if open_orders:
        print(f"WARNING: {len(open_orders)} unfilled orders already open — "
              f"aborting to avoid double-ordering: {open_orders}")
        log_event({"run_id": run_id, "event": "abort_unfilled", "orders": open_orders})
        sys.exit(2)

    # ---- prices ----
    tickers = set(tgt["weights"]) | set(held)
    prices, order_cd = resolve_prices(client, tickers, held_exch)
    unpriced = tickers - set(prices)
    if unpriced:
        print(f"WARNING: no KIS quote for {sorted(unpriced)}")

    # ---- plan ----
    plan = compute_plan(tgt["weights"], held, sellable, prices, cash,
                        min_order_usd=args.min_order_usd,
                        min_order_bps=args.min_order_bps,
                        max_order_usd=args.max_order_usd,
                        max_turnover_pct=args.max_turnover)
    print(f"\nNAV ${plan.nav:,.2f} | {len(plan.sells)} sells, {len(plan.buys)} buys, "
          f"turnover {plan.turnover_pct}%")
    for w in plan.warnings:
        print(f"  ! {w}")
    for line in plan_table(plan, order_cd):
        print(line)

    summary = [f"## KIS sync {run_id} — {args.env}/{args.ledger}",
               f"NAV ${plan.nav:,.2f} · cash ${cash:,.2f} · turnover {plan.turnover_pct}% · "
               f"{'EXECUTE' if args.execute else 'DRY RUN'}",
               ""] + plan_table(plan, order_cd)
    if plan.warnings:
        summary += ["", "**Warnings**"] + [f"- {w}" for w in plan.warnings]

    log_event({"run_id": run_id, "event": "plan", "env": args.env, "ledger": args.ledger,
               "execute": args.execute, "nav": plan.nav, "cash": cash,
               "turnover_pct": plan.turnover_pct, "warnings": plan.warnings,
               "orders": [vars(o) for o in plan.orders]})

    if not args.execute:
        print("\ndry run — no orders sent (use --execute)")
        gh_summary(summary)
        return
    if args.env == "real" and not args.confirm_real:
        gh_summary(summary + ["", "REFUSED: real env without --confirm-real"])
        sys.exit("refusing: --env real --execute requires --confirm-real")
    if not plan.orders:
        print("nothing to do")
        gh_summary(summary)
        return
    if not us_market_open() and not args.ignore_market_hours:
        gh_summary(summary + ["", "SKIPPED: US market closed"])
        sys.exit("US market closed (use --ignore-market-hours to override)")

    # ---- execute: sells first ----
    results = []
    for o in plan.sells:
        limit = o.price * SELL_LIMIT_BUFFER
        res = client.place_order("sell", order_cd[o.ticker], o.ticker, o.qty, limit)
        results.append({**vars(o), **res, "limit": round(limit, 4)})
        print(f"  sell {o.ticker} x{o.qty} @ {limit:.2f} -> "
              f"{'OK ' + str(res['order_no']) if res['ok'] else 'REJECT: ' + res['msg']}")

    if plan.sells and plan.buys and not args.no_wait:
        for i in range(FILL_WAIT_ROUNDS):
            time.sleep(FILL_WAIT_SECONDS)
            remaining = [u for u in client.unfilled() if u["side"] == "sell"]
            print(f"  fill wait {i + 1}/{FILL_WAIT_ROUNDS}: {len(remaining)} sells unfilled")
            if not remaining:
                break

    # ---- buys, capped by actual cash ----
    budget = client.usd_cash()[0] if plan.sells else cash
    budget *= 0.995  # fee/slippage headroom
    for o in plan.buys:
        limit = o.price * BUY_LIMIT_BUFFER
        qty = min(o.qty, int(budget // limit))
        if qty < 1:
            results.append({**vars(o), "ok": False, "order_no": None,
                            "msg": "skipped: insufficient settled cash"})
            print(f"  buy {o.ticker} skipped (insufficient cash)")
            continue
        res = client.place_order("buy", order_cd[o.ticker], o.ticker, qty, limit)
        if res["ok"]:
            budget -= qty * limit
        results.append({**vars(o), "qty": qty, **res, "limit": round(limit, 4)})
        print(f"  buy {o.ticker} x{qty} @ {limit:.2f} -> "
              f"{'OK ' + str(res['order_no']) if res['ok'] else 'REJECT: ' + res['msg']}")

    ok = sum(1 for r in results if r.get("ok"))
    rejects = [r for r in results if not r.get("ok")]
    print(f"\nplaced {ok}/{len(results)} orders; {len(rejects)} rejected/skipped")
    log_event({"run_id": run_id, "event": "execute", "results": results})
    summary += ["", f"**Placed {ok}/{len(results)}** orders"]
    if rejects:
        summary += ["", "**Rejected/skipped**"] + \
                   [f"- {r['side']} {r['ticker']}: {r['msg']}" for r in rejects]
    gh_summary(summary)


if __name__ == "__main__":
    main()

"""kis_smoke_trade.py — one-share buy/sell round trip to prove order permission.

Places a single marketable-limit BUY, waits for the fill, then SELLS the same
quantity back. Its only purpose is to answer "can this account actually trade?"
after the 모의투자 account refused every order. Nothing here reads the ledger.

REAL MONEY when --env real. Guards, all of which must pass:
  * --execute            nothing is sent without it
  * --confirm-real       required when --env real
  * --max-notional       hard cap on qty x price (default $500)
  * US regular session   unless --ignore-market-hours
  * KIS_ALLOW_MARGIN     required if the real account has no USD deposit
                         and would otherwise trade on 통합증거금 collateral

A resting (unfilled) buy is cancelled rather than left on the book. If the buy
fills but the sell fails, the position is reported loudly — you own the shares.

Usage:
    python scripts/kis_smoke_trade.py --env real --ticker F --execute --confirm-real
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kis.client import EXCD_TO_ORDER, KISClient  # noqa: E402
from sync_kis_portfolio import gh_summary, log_event, us_market_open  # noqa: E402

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BUY_LIMIT_BUFFER = 1.003
SELL_LIMIT_BUFFER = 0.997
POLL_SECONDS = 10
POLL_ROUNDS = 12          # 2 minutes


def wait_for_fill(client, ticker, order_no, rounds=POLL_ROUNDS) -> bool:
    """True once the order is no longer resting. Polls inquire-nccs."""
    for i in range(rounds):
        time.sleep(POLL_SECONDS)
        resting = [u for u in client.unfilled()
                   if str(u.get("order_no")) == str(order_no)]
        if not resting:
            print(f"  filled after ~{(i + 1) * POLL_SECONDS}s")
            return True
        print(f"  poll {i + 1}/{rounds}: still resting "
              f"({resting[0]['qty_remaining']:.0f} unfilled)")
    return False


def shares_held(client, ticker) -> float:
    for p in client.balance():
        if p["ticker"] == ticker:
            return p["shares"]
    return 0.0


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--env", default=os.environ.get("KIS_ENV", "paper"),
                    choices=["paper", "real"])
    ap.add_argument("--ticker", default="F")
    ap.add_argument("--qty", type=int, default=1)
    ap.add_argument("--max-notional", type=float, default=500.0)
    ap.add_argument("--execute", action="store_true")
    ap.add_argument("--confirm-real", action="store_true")
    ap.add_argument("--no-sell", action="store_true",
                    help="buy only; leave the position open")
    ap.add_argument("--ignore-market-hours", action="store_true")
    args = ap.parse_args()

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    tkr = args.ticker.upper()
    print(f"KIS smoke trade [{run_id}] env={args.env} ticker={tkr} qty={args.qty} "
          f"execute={args.execute}")

    missing = [k for k in ("KIS_APP_KEY", "KIS_APP_SECRET", "KIS_CANO", "KIS_ACNT_PRDT_CD")
               if not os.environ.get(k)]
    if missing:
        sys.exit(f"missing env: {', '.join(missing)}")
    client = KISClient(args.env, os.environ["KIS_APP_KEY"], os.environ["KIS_APP_SECRET"],
                       os.environ["KIS_CANO"], os.environ["KIS_ACNT_PRDT_CD"])

    hit = client.resolve_exchange(tkr)
    if not hit:
        sys.exit(f"no KIS quote for {tkr} on NAS/NYS/AMS")
    excd, last = hit
    exch = EXCD_TO_ORDER[excd]
    notional = args.qty * last
    print(f"{tkr} @ {last:,.2f} on {exch} — notional ${notional:,.2f}")

    cash, cash_src, _ = client.usd_cash()
    print(f"USD cash {cash:,.2f} (source: {cash_src})")

    summary = [f"## KIS smoke trade {run_id}",
               f"`{args.env}` · {tkr} x{args.qty} @ ~${last:,.2f} "
               f"(${notional:,.2f}) · {'EXECUTE' if args.execute else 'DRY RUN'}", ""]

    # ---- guards ----
    if notional > args.max_notional:
        sys.exit(f"refusing: notional ${notional:,.2f} exceeds "
                 f"--max-notional ${args.max_notional:,.2f}")
    if cash_src == "buying_power" and args.env == "real" and not os.environ.get("KIS_ALLOW_MARGIN"):
        sys.exit("refusing: real account has no USD deposit; this would trade on "
                 "collateral-backed buying power. Fund USD or set KIS_ALLOW_MARGIN=1.")
    if cash < notional * 1.01:
        sys.exit(f"refusing: cash ${cash:,.2f} below notional ${notional:,.2f} (+1% headroom)")

    if not args.execute:
        print("\ndry run — no orders sent (use --execute)")
        gh_summary(summary + ["Dry run: guards passed, no orders sent."])
        return
    if args.env == "real" and not args.confirm_real:
        sys.exit("refusing: --env real --execute requires --confirm-real")
    if not us_market_open() and not args.ignore_market_hours:
        sys.exit("US market closed")

    # ---- buy ----
    buy_limit = last * BUY_LIMIT_BUFFER
    print(f"\nBUY {tkr} x{args.qty} limit {buy_limit:.2f}")
    buy = client.place_order("buy", exch, tkr, args.qty, buy_limit)
    print(f"  -> {'OK ' + str(buy['order_no']) if buy['ok'] else 'REJECT: ' + buy['msg']}")
    log_event({"run_id": run_id, "event": "smoke_buy", "env": args.env,
               "ticker": tkr, "qty": args.qty, "limit": buy_limit, **buy})
    if not buy["ok"]:
        gh_summary(summary + [f"**BUY REJECTED:** `{buy['msg']}`"])
        sys.exit(f"buy rejected: {buy['msg']}")

    if not wait_for_fill(client, tkr, buy["order_no"]):
        print("  buy did not fill; cancelling")
        c = client.cancel_order(exch, tkr, buy["order_no"], args.qty)
        print(f"  cancel -> {'OK' if c['ok'] else 'FAILED: ' + c['msg']}")
        gh_summary(summary + ["**BUY placed but did not fill** — cancelled. "
                              "Ordering is permitted; the limit was simply not hit."])
        sys.exit("buy unfilled (cancelled)")

    held = shares_held(client, tkr)
    print(f"  position after buy: {held:g} shares")
    summary += [f"**BUY filled** — {tkr} x{args.qty} @ limit {buy_limit:.2f}, "
                f"position now {held:g} shares"]

    if args.no_sell:
        gh_summary(summary + ["", "`--no-sell`: position left open."])
        print("\n--no-sell: leaving the position open")
        return

    # ---- sell back ----
    px = client.quote(excd, tkr) or last
    sell_limit = px * SELL_LIMIT_BUFFER
    qty = int(min(args.qty, held))
    print(f"\nSELL {tkr} x{qty} limit {sell_limit:.2f}")
    sell = client.place_order("sell", exch, tkr, qty, sell_limit)
    print(f"  -> {'OK ' + str(sell['order_no']) if sell['ok'] else 'REJECT: ' + sell['msg']}")
    log_event({"run_id": run_id, "event": "smoke_sell", "env": args.env,
               "ticker": tkr, "qty": qty, "limit": sell_limit, **sell})
    if not sell["ok"]:
        gh_summary(summary + [f"", f"**SELL REJECTED:** `{sell['msg']}` — "
                              f"YOU STILL HOLD {held:g} SHARES OF {tkr}."])
        sys.exit(f"sell rejected: {sell['msg']} — position still open!")

    filled = wait_for_fill(client, tkr, sell["order_no"])
    remaining = shares_held(client, tkr)
    if not filled:
        c = client.cancel_order(exch, tkr, sell["order_no"], qty)
        gh_summary(summary + ["", f"**SELL did not fill** — cancel "
                              f"{'OK' if c['ok'] else 'FAILED'}. "
                              f"You hold {remaining:g} shares of {tkr}."])
        sys.exit(f"sell unfilled; still holding {remaining:g} shares")

    cash_after, _, _ = client.usd_cash()
    print(f"\nround trip complete. position {remaining:g} shares, "
          f"USD {cash:,.2f} -> {cash_after:,.2f} (delta {cash_after - cash:+,.2f})")
    summary += ["", f"**SELL filled** — round trip complete.",
                f"Position: {remaining:g} shares · "
                f"USD {cash:,.2f} → {cash_after:,.2f} "
                f"(**{cash_after - cash:+,.2f}** = spread + commission)"]
    gh_summary(summary)
    log_event({"run_id": run_id, "event": "smoke_done", "cash_before": cash,
               "cash_after": cash_after, "remaining": remaining})


if __name__ == "__main__":
    main()

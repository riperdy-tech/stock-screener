"""kis_liquidate_except.py — one-shot manual exit of every KIS US position
except an explicit keep-list.

This is NOT the ledger sync. It reads nothing from Supabase, computes no target
weights, and applies neither the drawdown gate nor the turnover cap. It looks at
what the account actually holds and sells everything that is not on --keep. Use
it when the ledger is stale or paused and the book has to be reduced by hand.

DRY-RUN BY DEFAULT. Nothing is sent without --execute.
Real accounts additionally require --confirm-real.

    python scripts/kis_liquidate_except.py --env real --keep CART,EXPE,BMRN
    python scripts/kis_liquidate_except.py --env real --keep CART,EXPE --execute --confirm-real

Env: KIS_APP_KEY, KIS_APP_SECRET, KIS_CANO, KIS_ACNT_PRDT_CD (see docs/KIS_SYNC.md)

After a manual exit the scheduled sync will re-buy the book on its next run — it
reconciles to the ledger and has no memory of this script. Set the repo variable
KIS_HALT=true before running unless that re-buy is what you want.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kis.client import KISClient  # noqa: E402
from sync_kis_portfolio import (  # noqa: E402
    SELL_LIMIT_BUFFER, gh_summary, log_event, resolve_prices, us_market_open,
)

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def parse_keep(raw: str) -> set[str]:
    return {t.strip().upper() for t in raw.replace(" ", ",").split(",") if t.strip()}


def plan_sells(positions, keep, prices, order_cd, max_order_usd):
    """([order, ...], [skipped, ...]) — one order row per KIS order to send.

    Sells min(shares, sellable): a name with shares locked behind an unfilled
    order or an unsettled buy cannot be fully sold today, and asking for more
    than sellable gets the whole order rejected rather than partially filled.
    A position worth more than max_order_usd is split across several orders.
    """
    orders, skipped = [], []
    for p in sorted(positions, key=lambda x: x["ticker"]):
        t = p["ticker"]
        if t in keep:
            continue
        px = prices.get(t)
        exch = order_cd.get(t) or p.get("exch_order_cd")
        if not px or not exch:
            skipped.append({"ticker": t, "shares": p["shares"],
                            "why": "no price/exchange resolved — sell by hand in the KIS app"})
            continue
        qty = int(min(p["shares"], p["sellable"]))
        if qty <= 0:
            skipped.append({"ticker": t, "shares": p["shares"],
                            "why": "sellable=0 (locked: unfilled order or unsettled buy)"})
            continue
        note = ""
        if qty < int(p["shares"]):
            note = f"PARTIAL: holds {int(p['shares'])}, only {qty} sellable"
        limit = round(px * SELL_LIMIT_BUFFER, 4 if px < 1 else 2)
        per_chunk = max(1, int(max_order_usd // max(limit, 0.0001)))
        left, split = qty, qty > per_chunk
        while left > 0:
            n = min(left, per_chunk)
            orders.append({"ticker": t, "exch": exch, "qty": n, "price": limit,
                           "ref": px, "est_value": n * limit,
                           "note": (note + " (split)").strip() if split else note})
            left -= n
    return orders, skipped


def table(orders) -> list[str]:
    lines = ["| ticker | exch | qty | last | limit (-0.3%) | est proceeds | note |",
             "|--------|------|-----|------|---------------|--------------|------|"]
    for o in orders:
        lines.append(f"| {o['ticker']} | {o['exch']} | {o['qty']} | {o['ref']:,.2f} "
                     f"| {o['price']:,.2f} | ${o['est_value']:,.2f} | {o['note']} |")
    return lines


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--env", default=os.environ.get("KIS_ENV", "paper"),
                    choices=["paper", "real"])
    ap.add_argument("--keep", default="",
                    help="comma-separated tickers to KEEP; everything else is sold")
    ap.add_argument("--keep-none", action="store_true",
                    help="required to liquidate the entire account (empty --keep)")
    ap.add_argument("--execute", action="store_true", help="actually place orders")
    ap.add_argument("--confirm-real", action="store_true",
                    help="required (with --execute) to trade the real account")
    ap.add_argument("--max-order-usd", type=float,
                    default=float(os.environ.get("KIS_MAX_ORDER_USD", 15000)),
                    help="split any position larger than this across several orders")
    ap.add_argument("--ignore-market-hours", action="store_true",
                    help="local testing only; KIS rejects US orders outside the session")
    args = ap.parse_args()

    keep = parse_keep(args.keep)
    if not keep and not args.keep_none:
        sys.exit("empty --keep would liquidate the ENTIRE account. If that is the "
                 "intent, pass --keep-none explicitly.")

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    print(f"KIS liquidate-except [{run_id}] env={args.env} execute={args.execute}")
    print(f"keep ({len(keep)}): {', '.join(sorted(keep)) or '(none — full liquidation)'}")
    halt = os.environ.get("KIS_HALT", "").strip().lower() in ("1", "true", "yes")
    halt_note = ("set — the scheduled sync is stopped" if halt else
                 "NOT set — the next scheduled sync will re-buy toward the ledger")
    print(f"KIS_HALT={halt_note}")

    missing = [k for k in ("KIS_APP_KEY", "KIS_APP_SECRET", "KIS_CANO", "KIS_ACNT_PRDT_CD")
               if not os.environ.get(k)]
    if missing:
        sys.exit(f"missing env: {', '.join(missing)}")
    client = KISClient(args.env, os.environ["KIS_APP_KEY"], os.environ["KIS_APP_SECRET"],
                       os.environ["KIS_CANO"], os.environ["KIS_ACNT_PRDT_CD"])

    positions = client.balance()
    if not positions:
        print("account holds no US positions — nothing to do.")
        return
    print(f"held: {len(positions)} US names")

    # An order still working would be double-counted by a fresh sell.
    open_orders = client.unfilled()
    if open_orders:
        print(f"\n{len(open_orders)} UNFILLED order(s) already working:")
        for o in open_orders:
            print(f"  {o}")
        if args.execute:
            sys.exit("refusing to execute on top of working orders — cancel them in "
                     "the KIS app (or let them expire), then re-run.")

    held_exch = {p["ticker"]: p["exch_order_cd"] for p in positions}
    sell_names = {p["ticker"] for p in positions} - keep
    prices, order_cd = resolve_prices(client, sell_names, held_exch)

    orders, skipped = plan_sells(positions, keep, prices, order_cd, args.max_order_usd)

    held_now = {p["ticker"] for p in positions}
    not_held = sorted(keep - held_now)
    if not_held:
        print(f"\nWARNING — on the keep-list but NOT held: {', '.join(not_held)}. "
              f"This script never buys; check the ticker spelling.")

    kept = sorted(keep & held_now)
    print(f"\nkeeping {len(kept)} held name(s): {', '.join(kept) or '(none)'}")
    print(f"selling {len({o['ticker'] for o in orders})} name(s) in {len(orders)} order(s)\n")
    lines = table(orders)
    print("\n".join(lines))
    total = sum(o["est_value"] for o in orders)
    print(f"\nestimated gross proceeds: ${total:,.2f}")

    if skipped:
        print("\nCANNOT SELL (handle by hand):")
        for s in skipped:
            print(f"  {s['ticker']}: {int(s['shares'])} sh — {s['why']}")

    summary = [f"## KIS liquidate-except {run_id}",
               f"env `{args.env}` · execute `{args.execute}` · "
               f"keep `{', '.join(sorted(keep)) or 'NONE'}`", ""] + lines + \
              ["", f"estimated gross proceeds: **${total:,.2f}**"]
    gh_summary(summary)
    log_event({"run_id": run_id, "event": "liquidate_except_plan", "env": args.env,
               "keep": sorted(keep), "orders": orders, "skipped": skipped,
               "est_proceeds": total, "execute": args.execute})

    if not orders:
        print("\nnothing to sell.")
        return

    if not args.execute:
        flags = " --execute" + (" --confirm-real" if args.env == "real" else "")
        print(f"\nDRY RUN — no orders sent. Re-run with{flags} to place them.")
        return

    if args.env == "real" and not args.confirm_real:
        sys.exit("real account requires --confirm-real alongside --execute.")
    if not us_market_open() and not args.ignore_market_hours:
        sys.exit("US market is closed (09:30–16:00 ET, weekdays) — KIS would reject "
                 "these orders. Re-run during the session.")

    results, rejects = [], []
    for o in orders:
        r = client.place_order("sell", o["exch"], o["ticker"], o["qty"], o["price"])
        status = "ok" if r["ok"] else "REJECTED"
        print(f"  sell {o['ticker']} x{o['qty']} @ {o['price']:,.2f} -> {status} "
              f"{r.get('order_no') or ''} {r['msg']}")
        results.append({**o, **r})
        if not r["ok"]:
            rejects.append({"ticker": o["ticker"], "msg": r["msg"]})

    ok = sum(1 for r in results if r["ok"])
    print(f"\nplaced {ok}/{len(results)} order(s)")
    log_event({"run_id": run_id, "event": "liquidate_except_executed",
               "env": args.env, "placed": ok, "results": results})
    gh_summary([f"placed **{ok}/{len(results)}** sell orders"] +
               [f"- {r['ticker']}: {r['msg']}" for r in rejects])

    if rejects:
        print("rejected:")
        for r in rejects:
            print(f"  {r['ticker']}: {r['msg']}")
    if ok == 0:
        sys.exit(f"every order was rejected; first reason: {rejects[0]['msg']!r}")
    print("\nLimit orders may not fill immediately. Check the KIS app; unfilled "
          "orders expire at the close.")
    if not halt:
        print("REMINDER: KIS_HALT is not set — the next scheduled sync will "
              "reconcile back toward the ledger and re-buy what you just sold.")


if __name__ == "__main__":
    main()

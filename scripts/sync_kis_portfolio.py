"""sync_kis_portfolio.py — mirror a paper-trading ledger into a KIS account.

Reads target weights from the site's ledger book (which ledger is REQUIRED —
--ledger or KIS_LEDGER, no default), compares them with actual KIS holdings,
and reconciles with limit orders through the KIS Open API. Reconciliation, not
trade-replay: missed runs, partial fills and rejects self-heal on the next run.

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
from kis.dd_engine import decide, initial_state, rebase, resume  # noqa: E402
from kis.dd_gate import (  # noqa: E402
    apply_gate, dd_alert_text, dd_log_line, load_dd_states, save_dd_states,
)
from kis.notify import (  # noqa: E402
    format_telegram, pnl_suffix, sb_upsert, send_telegram, trades_rows,
)
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

    try:
        f = client.usd_funds()
        emit(f"\nfunds split (what the sync actually uses):"
             f"\n  settled            {f['settled']:>12,.2f}"
             f"\n  + sells in transit {f['sell_in_transit']:>12,.2f}"
             f"\n  - buys in transit  {f['buy_in_transit']:>12,.2f}"
             f"\n  = NAV cash         {f['nav_cash']:>12,.2f}   (counted toward NAV / drawdown)"
             f"\n  orderable          {f['orderable']:>12,.2f}   (spendable on buys today)")
    except Exception as e:
        emit(f"\nfunds split failed: {e}")

    emit("\nRead: zero USD deposit + KRW seed + nonzero 매수가능금액 => 통합증거금 "
         "account; usd_funds() falls back to 매수가능금액 automatically.")
    emit("      Everything zero => account genuinely unfunded.")
    emit("      NAV cash >> settled => sale proceeds in transit; that gap used to "
         "vanish from NAV and manufacture a phantom drawdown.")

    if os.environ.get("KIS_PROBE_DOMESTIC_ORDER"):
        # Places a ₩1,000 limit on 005930 — three orders of magnitude below
        # market, so it cannot fill. Purely to see which error comes back.
        emit("\ndomestic order probe (unfillable ₩1,000 limit on 005930):")
        try:
            res = client.domestic_buy_probe()
            emit(f"  rt_cd={res['rt_cd']} ok={res['ok']} msg={res['msg']!r} "
                 f"order_no={res['order_no']}")
            if res["ok"]:
                emit("  => account CAN place mock orders. Overseas rejection is a "
                     "해외주식 provisioning problem, not credentials.")
            elif "모의투자 주문이 불가" in res["msg"]:
                emit("  => account cannot place ANY mock order. The credentials or "
                     "account are not a working 모의투자 pair.")
            else:
                emit("  => refused for a different reason (market hours?), which still "
                     "means ordering is permitted on this account.")
        except Exception as e:
            emit(f"  probe failed: {e}")

    gh_summary(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--env", default=os.environ.get("KIS_ENV", "paper"),
                    choices=["paper", "real"])
    # No default ledger on purpose: silently mirroring the wrong book is the
    # worst failure this script has. Pass --ledger or set KIS_LEDGER.
    ap.add_argument("--ledger", default=os.environ.get("KIS_LEDGER", ""),
                    help="ledger key in the book (equal, equal_llm, plan, ...); "
                         "required — no default")
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
    ap.add_argument("--dd-resume", action="store_true",
                    help="clear a drawdown HALT after human review (peak kept; "
                         "the tier ladder governs re-entry)")
    ap.add_argument("--dd-rebase", action="store_true",
                    help="DELIBERATE: restart the drawdown budget from current NAV "
                         "(accepts a fresh 15%% below here); never routine")
    args = ap.parse_args()
    if not args.ledger.strip():
        sys.exit("no ledger: pass --ledger or set KIS_LEDGER (e.g. equal_llm). "
                 "There is deliberately no default — mirroring the wrong book is worse "
                 "than not trading.")

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    print(f"KIS sync [{run_id}] env={args.env} ledger={args.ledger} "
          f"execute={args.execute}")

    # Kill switch: repo variable KIS_HALT (any of 1/true/yes) stops the run
    # before targets, prices, or any order. Flip it from the GitHub mobile app
    # (repo Settings -> Secrets and variables -> Variables). Halts paper and
    # real alike; clear the variable to resume.
    if os.environ.get("KIS_HALT", "").strip().lower() in ("1", "true", "yes"):
        log_event({"run_id": run_id, "event": "halted", "reason": "KIS_HALT set"})
        gh_summary([f"## KIS sync {run_id}",
                    "**HALTED** — repo variable KIS_HALT is set; no orders."])
        print("HALTED: KIS_HALT is set — exiting before any planning/orders.")
        return

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
    avg_cost = {p["ticker"]: p.get("avg_cost", 0) for p in positions}
    funds = client.usd_funds()
    # NAV counts money in transit (sold shares already left the balance); the buy
    # budget only counts what KIS will let us spend today. See usd_funds().
    cash, orderable = funds["nav_cash"], funds["orderable"]
    cash_src, cash_row = funds["source"], funds["row"]
    print(f"account: {len(held)} positions, USD cash {cash:,.2f} (source: {cash_src})")
    print(f"  cash: settled {funds['settled']:,.2f} + sells in transit "
          f"{funds['sell_in_transit']:,.2f} - buys in transit "
          f"{funds['buy_in_transit']:,.2f} = {cash:,.2f} | orderable {orderable:,.2f}")
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
    if tickers and not prices:
        # Never plan from a total absence of prices — that is an outage, not a
        # portfolio of delisted names.
        sys.exit(f"refusing: no price for any of {len(tickers)} tickers")

    # ---- drawdown governor (LIVE per user 2026-07-21; tiers -8/-11/-13, hyst 2) ----
    # Enforces the max-DD<=15% budget on whatever ledger is mirrored. Fail-open:
    # a state-store outage trades ungated with a loud alert (KIS_HALT stays the
    # manual backstop). KIS_DD_DISABLE=true is the emergency bypass.
    nav_now = cash + sum(sh * prices[t] for t, sh in held.items() if t in prices)

    # ---- NAV sanity: cross-check against KIS's own total-assets figure -------
    # Our NAV drives BOTH the drawdown verdict and every position size, so a
    # wrong NAV is not a small error — on 2026-07-30 a settled-cash-only NAV read
    # -46% on an account at its high-water mark and would have liquidated the
    # book. tot_asst_amt is computed by KIS independently of our arithmetic, so a
    # material divergence means we cannot trust our own number. Fail CLOSED: no
    # orders at all, rather than de-risking (or sizing) off a figure we doubt.
    # KIS_HALT remains the manual backstop; KIS_NAV_TOL_ABORT tunes the trip.
    kis_total = funds.get("kis_total_usd") or 0.0
    if kis_total > 0:
        div = abs(nav_now - kis_total) / kis_total
        warn_at = float(os.environ.get("KIS_NAV_TOL_WARN", "3")) / 100
        abort_at = float(os.environ.get("KIS_NAV_TOL_ABORT", "10")) / 100
        print(f"  NAV check: ours ${nav_now:,.2f} vs KIS total ${kis_total:,.2f} "
              f"({div:.2%} divergence)")
        if div >= abort_at:
            msg = (f"[KIS·risk] {args.env}: ABORT — computed NAV ${nav_now:,.2f} diverges "
                   f"{div:.1%} from KIS total assets ${kis_total:,.2f} "
                   f"(limit {abort_at:.0%}). NO orders placed; drawdown state untouched.")
            print(f"  {msg}")
            log_event({"run_id": run_id, "event": "nav_mismatch_abort", "env": args.env,
                       "nav": nav_now, "kis_total": kis_total, "divergence": round(div, 4)})
            send_telegram(msg)
            gh_summary([f"## KIS sync {run_id} — {args.env}/{args.ledger}", "", msg])
            sys.exit("refusing: NAV disagrees with KIS total assets")
        if div >= warn_at:
            send_telegram(f"[KIS·risk] {args.env}: NAV divergence {div:.1%} "
                          f"(ours ${nav_now:,.2f} vs KIS ${kis_total:,.2f}) — proceeding, "
                          f"but check for unpriced holdings or FX drift.")
    else:
        print("  NAV check: skipped (KIS total assets unavailable)")

    dd_gross, dd_halted = 1.0, False
    if os.environ.get("KIS_DD_DISABLE", "").strip().lower() in ("1", "true", "yes"):
        print("  DD governor DISABLED via KIS_DD_DISABLE — trading ungated")
    else:
        dd_envs, dd_src = load_dd_states()
        if dd_src == "error":
            msg = ("[KIS·risk] DD state store unreachable — trading UNGATED this run "
                   "(fail-open); KIS_HALT remains the manual backstop")
            print(f"  WARNING: {msg}")
            send_telegram(msg)
        else:
            st = (dd_envs or {}).get(args.env)
            if args.dd_rebase:
                st = rebase(nav_now)
                print(f"  DD: REBASE — new budget base at NAV ${nav_now:,.2f}")
            elif st and args.dd_resume:
                st = resume(st)
                print("  DD: RESUME — halt cleared, peak kept; ladder governs re-entry")
            if st is None:
                st = initial_state(nav_now)
                print(f"  DD: initialized (peak = NAV ${nav_now:,.2f})")
            st, dd = decide(st, nav_now)
            dd_envs = {**(dd_envs or {}), args.env: st}
            if not save_dd_states(dd_envs):
                print("  ! DD state save failed (non-fatal; retried next run)", file=sys.stderr)
            print(f"  {dd_log_line(args.env, dd, st)}")
            log_event({"run_id": run_id, "event": "dd_decision", "env": args.env,
                       "nav": nav_now, "dd": round(dd["dd"], 4), "gross": dd["gross"],
                       "action": dd["action"], "halted": st["halted"]})
            if dd["action"] in ("derisk", "rerisk", "halt"):
                send_telegram(dd_alert_text(args.env, dd, args.execute))
            dd_gross, dd_halted = dd["gross"], st["halted"]
            gated, gate_note = apply_gate(tgt["weights"], dd_gross, dd_halted)
            if gate_note:
                print(f"  DD gate: {gate_note}")
            tgt["weights"] = gated

    # ---- plan ----
    plan = compute_plan(tgt["weights"], held, sellable, prices, cash,
                        buy_budget=orderable,
                        min_order_usd=args.min_order_usd,
                        min_order_bps=args.min_order_bps,
                        max_order_usd=args.max_order_usd,
                        max_turnover_pct=args.max_turnover)
    # Reduced DD tier: sells proceed (trims to the scaled weights), fresh buys wait
    # until the drawdown recovers past the hysteresis line.
    if 0 < dd_gross < 1.0 and plan.buys:
        for o in plan.buys:
            plan.warnings.append(
                f"{o.ticker}: buy suppressed (DD governor gross {dd_gross:.0%})")
        plan.orders = [o for o in plan.orders if o.side == "sell"]
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
        print(f"  sell {o.ticker} x{o.qty} @ {limit:.2f}"
              f"{pnl_suffix(avg_cost.get(o.ticker, 0), limit, o.qty)} -> "
              f"{'OK ' + str(res['order_no']) if res['ok'] else 'REJECT: ' + res['msg']}")

    if plan.sells and plan.buys and not args.no_wait:
        for i in range(FILL_WAIT_ROUNDS):
            time.sleep(FILL_WAIT_SECONDS)
            remaining = [u for u in client.unfilled() if u["side"] == "sell"]
            print(f"  fill wait {i + 1}/{FILL_WAIT_ROUNDS}: {len(remaining)} sells unfilled")
            if not remaining:
                break

    # ---- buys, capped by what KIS will actually let us spend ----
    # Re-read after the sells: filled proceeds show up as 매도대금 재사용 and lift
    # the orderable amount, so this is no longer starved by T+2 settlement.
    budget = client.usd_funds()["orderable"] if plan.sells else orderable
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

    # ---- surface the run (best-effort; must never break the trade path) ----
    # Only after a real execute that placed/attempted orders. Both sinks are
    # non-fatal by contract; failures here are logged, never raised.
    if results:
        try:
            # nav_cash only — no need for 매수가능금액 on a post-run snapshot.
            cash_after = client.usd_funds(with_orderable=False)["nav_cash"]
        except Exception:
            cash_after = budget  # fall back to our internal estimate
        try:
            if sb_upsert("kis_trades",
                         trades_rows(run_id, args.env, results, plan.nav, cash_after),
                         "run_id,ticker,side"):
                print("  kis_trades: persisted to Supabase")
        except Exception as e:
            print(f"  kis_trades upsert failed (non-fatal): {e}", file=sys.stderr)
        try:
            prefix = os.environ.get("KIS_MSG_PREFIX", "[KIS·trades]")
            msg = format_telegram(prefix, run_id, args.env, args.ledger,
                                  results, plan.nav, cash_after, avg_cost)
            if send_telegram(msg):
                print("  telegram: digest sent")
        except Exception as e:
            print(f"  telegram notify failed (non-fatal): {e}", file=sys.stderr)
    summary += ["", f"**Placed {ok}/{len(results)}** orders"]
    if rejects:
        summary += ["", "**Rejected/skipped**"] + \
                   [f"- {r['side']} {r['ticker']}: {r['msg']}" for r in rejects]
    gh_summary(summary)

    # A run that intended to trade and placed nothing is a failure, not a no-op.
    # Silence here would let a misprovisioned account look healthy for weeks.
    if results and ok == 0:
        sys.exit(f"every order was rejected ({len(rejects)}/{len(results)}); "
                 f"first reason: {rejects[0]['msg']!r}")


if __name__ == "__main__":
    main()

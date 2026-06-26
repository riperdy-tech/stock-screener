"""track_paper_portfolios.py — live paper-trading ledgers (Track Record tab).

The honest, forward meter the ecosystem review (§H) prescribes: from
inception onward, simulate ACTUALLY FOLLOWING the system day by day and
record what happens. Three ledgers:

  plan  — follows portfolio_plan.json exactly (quarter-Kelly weights, cash).
          "Did following the system work?"
  equal — equal-weight basket of every research_now name (factor_scores).
          Pure selection test, no sizing effects.
  mine  — the user's actual holdings (public/data/my_portfolio.json, written
          by the My Portfolio UI). Unitized like a fund: edits are treated
          as deposits/withdrawals that buy/sell units, so adding money never
          fakes performance. "Did I beat my own system?"

Mechanics: trade-on-change only (buy on entry to the target set, sell on
exit; held positions drift). 10 bps transaction cost per side. Marks come
from stocks.json prices (fresh from the daily fetch); missing marks carry
the last price and are flagged stale. Benchmark IWM via one yfinance call.

Idempotent per date: re-running the same day rewinds to the day's opening
state and replays it, so CI re-runs can't double-trade.

Usage:
    python scripts/track_paper_portfolios.py                 # as of today
    python scripts/track_paper_portfolios.py --as-of 2026-06-15   # testing
State: public/data/paper_ledgers.json (append-only history inside).
"""

import argparse
import copy
import json
import math
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"
STOCKS_JSON = DATA / "stocks.json"
FACTOR_SCORES_JSON = DATA / "factor_scores.json"
PORTFOLIO_PLAN_JSON = DATA / "portfolio_plan.json"
MY_PORTFOLIO_JSON = DATA / "my_portfolio.json"
LEDGERS_JSON = DATA / "paper_ledgers.json"
DIVIDENDS_JSON = DATA / "dividends.json"

# Ex-dividend calendar for the run, {ticker: [[ex_date, per_share_amount], ...]}.
# Stashed module-side so the credit step can reach it without threading the arg
# through run_target_ledger / run_mine_ledger.
dividends_holder = {}

COST_BPS = 10
BENCHMARKS = ["IWM", "SPY", "QQQ", "SOXX", "DRAM"]  # small-cap, S&P500, Nasdaq-100, semis, memory
PRIMARY_BENCHMARK = "IWM"
START_NAV = 100.0
POST_EXIT_DAYS = 30


def load_json(path, default=None):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def supabase_env():
    return os.environ.get("NEXT_PUBLIC_SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")


def sb_get(path):
    """GET PostgREST rows (service key). Returns parsed list or None."""
    url, key = supabase_env()
    if not (url and key):
        return None
    try:
        import requests
        r = requests.get(f"{url}/rest/v1/{path}",
                         headers={"apikey": key, "Authorization": f"Bearer {key}"}, timeout=30)
        if r.status_code == 200:
            return r.json()
        print(f"  supabase GET {path} -> {r.status_code}: {r.text[:200]}", file=sys.stderr)
    except Exception as e:
        print(f"  supabase GET {path} failed: {e}", file=sys.stderr)
    return None


def sb_upsert(table, row, on_conflict):
    """Upsert one row via PostgREST (service key, merge-duplicates). Returns bool."""
    url, key = supabase_env()
    if not (url and key):
        return False
    try:
        import requests
        r = requests.post(f"{url}/rest/v1/{table}?on_conflict={on_conflict}",
                          headers={"apikey": key, "Authorization": f"Bearer {key}",
                                   "Content-Type": "application/json",
                                   "Prefer": "resolution=merge-duplicates,return=minimal"},
                          data=json.dumps(row), timeout=30)
        if r.status_code in (200, 201, 204):
            return True
        print(f"  supabase upsert {table} -> {r.status_code}: {r.text[:200]}", file=sys.stderr)
    except Exception as e:
        print(f"  supabase upsert {table} failed: {e}", file=sys.stderr)
    return False


def save_ledgers_to_supabase(book):
    """Mirror the GLOBAL ledger book (plan/plan2/equal) to Supabase (paper_ledgers
    row id=1). The site reads it at runtime via /api/paper-ledgers — no commit /
    redeploy. No-op without Supabase env (dev); the committed JSON stays a backup.
    Per-user `mine` ledgers live in user_mine_ledgers, not here.
    """
    if sb_upsert("paper_ledgers",
                 {"id": 1, "data": book, "updated_at": datetime.now(timezone.utc).isoformat()},
                 "id"):
        print("  global ledgers mirrored to Supabase.")


def num(v):
    return v if isinstance(v, (int, float)) and math.isfinite(v) and v > 0 else None


def empty_ledger():
    return {
        "current_date": None,
        "state": {"holdings": {}, "cash": START_NAV, "units": None},
        "prev_day_state": None,
        "last_marks": {},
        "nav_series": [],
        "trades": [],
        "closed": [],
    }


def cost_factor():
    return 1.0 - COST_BPS / 10000.0


def mark_price(ticker, prices, ledger):
    """Today's price; falls back to last known mark (flagged stale by caller)."""
    p = num(prices.get(ticker))
    if p is not None:
        ledger["last_marks"][ticker] = p
        return p, False
    last = num(ledger["last_marks"].get(ticker))
    return last, True


def portfolio_value(ledger, prices):
    total = ledger["state"]["cash"]
    stale = []
    for t, h in ledger["state"]["holdings"].items():
        p, is_stale = mark_price(t, prices, ledger)
        if p is None:
            continue  # never had a price (shouldn't happen post-buy)
        total += h["shares"] * p
        if is_stale:
            stale.append(t)
    return total, stale


def buy(ledger, ticker, price, spend, as_of, reason):
    spend = min(spend, ledger["state"]["cash"])
    if spend <= 0 or price is None:
        return
    shares = spend * cost_factor() / price
    ledger["state"]["cash"] -= spend
    ledger["state"]["holdings"][ticker] = {
        "entry_date": as_of, "entry_price": round(price, 4), "shares": shares,
    }
    ledger["trades"].append({"date": as_of, "side": "buy", "ticker": ticker,
                             "price": round(price, 4), "value": round(spend, 4), "reason": reason})


def sell(ledger, ticker, price, as_of, reason):
    h = ledger["state"]["holdings"].pop(ticker, None)
    if h is None:
        return
    if price is None:
        price = h["entry_price"]  # worst case: flat exit at entry (flagged via stale)
    proceeds = h["shares"] * price * cost_factor()
    ledger["state"]["cash"] += proceeds
    ret = (price * cost_factor()) / h["entry_price"] - 1 if h["entry_price"] else None
    hold_days = (date.fromisoformat(as_of) - date.fromisoformat(h["entry_date"])).days
    ledger["trades"].append({"date": as_of, "side": "sell", "ticker": ticker,
                             "price": round(price, 4), "value": round(proceeds, 4), "reason": reason})
    ledger["closed"].append({
        "ticker": ticker, "entry_date": h["entry_date"], "exit_date": as_of,
        "entry_price": h["entry_price"], "exit_price": round(price, 4),
        "return_pct": round(ret * 100, 2) if ret is not None else None,
        "hold_days": hold_days, "post_exit_return_pct": None, "post_exit_days": None,
    })


def credit_dividends(ledger, as_of):
    """Cash-credit current holders for ex-dates in (last_nav_date, as_of].

    Approach-B total return: only positions held on the ex-date receive the
    dividend, so a churning ledger captures exactly the dividends it earned. Runs
    after rewind_or_advance on the carried-over (pre-rebalance) holdings, so a
    same-date replay re-credits cleanly against the restored opening state.
    """
    divs = dividends_holder.get("divs") or {}
    if not divs:
        return
    series = ledger.get("nav_series") or []
    last_date = series[-1]["date"] if series else None
    if last_date is None:
        return  # fresh ledger: nothing was held before today
    total = 0.0
    for t, h in ledger["state"]["holdings"].items():
        for ex_date, amt in divs.get(t, ()):  # [[ex_date, per_share_amount], ...]
            if last_date < ex_date <= as_of:
                total += h["shares"] * amt
    if total:
        ledger["state"]["cash"] += total
        ledger.setdefault("dividends", []).append({"date": as_of, "amount": round(total, 4)})


def rewind_or_advance(ledger, as_of):
    """Idempotency: same-date rerun rewinds to the day's opening state."""
    if ledger["current_date"] == as_of and ledger["prev_day_state"] is not None:
        ledger["state"] = copy.deepcopy(ledger["prev_day_state"])
        ledger["nav_series"] = [r for r in ledger["nav_series"] if r["date"] != as_of]
        ledger["trades"] = [t for t in ledger["trades"] if t["date"] != as_of]
        ledger["closed"] = [c for c in ledger["closed"] if c["exit_date"] != as_of]
        ledger["dividends"] = [d for d in ledger.get("dividends", []) if d["date"] != as_of]
    else:
        ledger["prev_day_state"] = copy.deepcopy(ledger["state"])
        ledger["current_date"] = as_of


def run_target_ledger(ledger, targets, prices, as_of, reason_prefix):
    """plan/equal ledgers: trade-on-change toward a {ticker: weight_pct} target set."""
    rewind_or_advance(ledger, as_of)
    credit_dividends(ledger, as_of)  # pay holders before today's rebalance
    held = set(ledger["state"]["holdings"])
    target_set = set(targets)

    for t in sorted(held - target_set):
        p, _ = mark_price(t, prices, ledger)
        sell(ledger, t, p, as_of, f"left_{reason_prefix}")

    nav, _ = portfolio_value(ledger, prices)
    for t in sorted(target_set - held):
        p, stale = mark_price(t, prices, ledger)
        if p is None or stale:
            continue  # never open a position on a stale/absent mark
        spend = targets[t] / 100.0 * nav
        buy(ledger, t, p, spend, as_of, f"entered_{reason_prefix}")

    nav, stale = portfolio_value(ledger, prices)
    return nav, stale


def run_mine_ledger(ledger, snapshot, prices, as_of):
    """Unitized ledger of the user's actual holdings."""
    rewind_or_advance(ledger, as_of)
    credit_dividends(ledger, as_of)  # pay holders before applying today's snapshot
    state = ledger["state"]

    # Mark existing book first (pre-flow value)
    pre_value = state["cash"]
    for t, h in state["holdings"].items():
        p, _ = mark_price(t, prices, ledger)
        pre_value += h["shares"] * (p if p is not None else h["entry_price"])

    if state["units"] is None:
        # Inception of the mine ledger: requires a snapshot
        if not snapshot:
            return None, []
        state["cash"] = float(snapshot.get("cash") or 0)
        state["holdings"] = {}
        for h in snapshot.get("holdings", []):
            t = (h.get("ticker") or "").upper()
            v = num(h.get("value"))
            p, stale = mark_price(t, prices, ledger)
            if not t or v is None:
                continue
            if p is None:
                state["cash"] += v  # can't price it: hold as cash, honest
                continue
            state["holdings"][t] = {"entry_date": as_of, "entry_price": round(p, 4),
                                    "shares": v / p}
        total = state["cash"] + sum(
            h["shares"] * ledger["last_marks"].get(t, h["entry_price"])
            for t, h in state["holdings"].items())
        state["units"] = total / START_NAV if total > 0 else None
        if state["units"] is None:
            return None, []
        nav_pu = START_NAV
    else:
        nav_pu = pre_value / state["units"] if state["units"] else None
        if snapshot and snapshot.get("saved_at_date") == as_of:
            # User updated holdings today: diff = trades; value delta = flow (units move)
            new_holdings = {}
            new_cash = float(snapshot.get("cash") or 0)
            new_value = new_cash
            for h in snapshot.get("holdings", []):
                t = (h.get("ticker") or "").upper()
                v = num(h.get("value"))
                p, _ = mark_price(t, prices, ledger)
                if not t or v is None:
                    continue
                if p is None:
                    new_cash += v
                    new_value += v
                    continue
                prev = state["holdings"].get(t)
                new_holdings[t] = {
                    "entry_date": prev["entry_date"] if prev else as_of,
                    "entry_price": prev["entry_price"] if prev else round(p, 4),
                    "shares": v / p,
                }
                new_value += v
                if prev is None:
                    ledger["trades"].append({"date": as_of, "side": "buy", "ticker": t,
                                             "price": round(p, 4), "value": round(v, 4),
                                             "reason": "user_edit"})
            for t in set(state["holdings"]) - set(new_holdings):
                p, _ = mark_price(t, prices, ledger)
                ledger["trades"].append({"date": as_of, "side": "sell", "ticker": t,
                                         "price": round(p, 4) if p else None, "value": None,
                                         "reason": "user_edit"})
            flow = new_value - pre_value
            if nav_pu and abs(flow) > 1e-9:
                state["units"] += flow / nav_pu  # deposits/withdrawals move units, not NAV
            state["holdings"] = new_holdings
            state["cash"] = new_cash

    value = state["cash"]
    stale = []
    for t, h in state["holdings"].items():
        p, is_stale = mark_price(t, prices, ledger)
        value += h["shares"] * (p if p is not None else h["entry_price"])
        if is_stale:
            stale.append(t)
    nav_pu = value / state["units"] if state["units"] else None
    return nav_pu, stale


def fetch_benchmarks():
    """Latest close for each benchmark ETF -> {sym: price|None}."""
    out = {b: None for b in BENCHMARKS}
    try:
        import yfinance as yf
        for b in BENCHMARKS:
            try:
                hist = yf.Ticker(b).history(period="5d", interval="1d")
                if hist is not None and not hist.empty:
                    out[b] = round(float(hist["Close"].dropna().iloc[-1]), 4)
            except Exception as e:
                print(f"  {b} fetch failed: {e}", file=sys.stderr)
    except Exception as e:
        print(f"  benchmark fetch failed: {e}", file=sys.stderr)
    return out


def compute_summary(nav_series, trades, closed, inception):
    rows = [r for r in nav_series if r.get("nav") is not None]
    if len(rows) < 1:
        return {"observations": 0}
    navs = [r["nav"] for r in rows]
    n = len(navs)
    days = max(1, (date.fromisoformat(rows[-1]["date"]) - date.fromisoformat(inception)).days)
    cum = navs[-1] / START_NAV - 1
    cagr = (navs[-1] / START_NAV) ** (365.0 / days) - 1 if days >= 30 else None
    peak, maxdd = navs[0], 0.0
    for v in navs:
        peak = max(peak, v)
        maxdd = min(maxdd, v / peak - 1)
    sharpe = None
    if n >= 21:
        rets = [navs[i] / navs[i - 1] - 1 for i in range(1, n)]
        mean = sum(rets) / len(rets)
        var = sum((x - mean) ** 2 for x in rets) / (len(rets) - 1)
        if var > 0:
            sharpe = round(mean / math.sqrt(var) * math.sqrt(252), 2)
    # Excess return vs each benchmark over the same window
    excess_vs = {}
    for b in BENCHMARKS:
        b_rows = [r for r in rows if (r.get("benches") or {}).get(b) is not None]
        if b_rows:
            b0, b1 = b_rows[0]["benches"][b], b_rows[-1]["benches"][b]
            if b0:
                excess_vs[b] = round((cum - (b1 / b0 - 1)) * 100, 2)
    excess = excess_vs.get(PRIMARY_BENCHMARK)
    wins = [c for c in closed if c.get("return_pct") is not None]
    traded = sum(t.get("value") or 0 for t in trades)
    return {
        "observations": n,
        "inception": inception,
        "cumulative_return_pct": round(cum * 100, 2),
        "cagr_pct": round(cagr * 100, 2) if cagr is not None else None,
        "max_drawdown_pct": round(maxdd * 100, 2),
        "sharpe": sharpe,
        "excess_vs_bench_pct": excess,
        "excess_vs": excess_vs,
        "closed_trades": len(wins),
        "win_rate_pct": round(100 * sum(1 for c in wins if c["return_pct"] > 0) / len(wins), 1) if wins else None,
        "avg_hold_days": round(sum(c["hold_days"] for c in closed) / len(closed), 1) if closed else None,
        "total_traded_value": round(traded, 2),
        "open_positions": None,  # filled by caller
    }


def backfill_post_exit(ledger, prices, as_of):
    for c in ledger["closed"]:
        if c["post_exit_return_pct"] is not None or c.get("exit_price") in (None, 0):
            continue
        elapsed = (date.fromisoformat(as_of) - date.fromisoformat(c["exit_date"])).days
        if elapsed >= POST_EXIT_DAYS:
            p = num(prices.get(c["ticker"]))
            if p is not None:
                c["post_exit_return_pct"] = round((p / c["exit_price"] - 1) * 100, 2)
                c["post_exit_days"] = elapsed


def finalize_ledger(led, nav, stale, benches, as_of, inception):
    """Append today's NAV point, backfill post-exit marks, recompute summary."""
    led["nav_series"].append({"date": as_of, "nav": round(nav, 4) if nav is not None else None,
                              "bench": benches.get(PRIMARY_BENCHMARK),  # back-compat (IWM)
                              "benches": benches, "stale_marks": stale})
    backfill_post_exit(led, prices_holder.get("prices", {}), as_of)
    led["summary"] = compute_summary(led["nav_series"], led["trades"], led["closed"], inception)
    led["summary"]["open_positions"] = len(led["state"]["holdings"])


# prices are passed explicitly everywhere except backfill inside finalize_ledger;
# stash them so finalize_ledger can reach the current run's marks without threading
# the arg through every caller.
prices_holder = {}


def process_user_mine_ledgers(prices, benches, as_of):
    """Per-user `mine` ledgers (multi-user). Reads every saved snapshot from
    my_portfolio (service key), advances each user's mine ledger held in
    user_mine_ledgers, and writes it back. Each user's ledger inceptions on the
    first run that sees their snapshot. Returns a count for logging.
    """
    rows = sb_get("my_portfolio?select=user_id,holdings,cash,saved_at")
    if not rows:
        return 0
    done = 0
    for snap in rows:
        uid = snap.get("user_id")
        if not uid:
            continue
        if snap.get("saved_at"):
            snap["saved_at_date"] = snap["saved_at"][:10]
        existing = sb_get(f"user_mine_ledgers?user_id=eq.{uid}&select=data") or []
        stored = existing[0]["data"] if existing else None
        led = stored["ledger"] if stored and "ledger" in stored else empty_ledger()
        inception = (stored or {}).get("inception") or as_of
        nav, stale = run_mine_ledger(led, snap, prices, as_of)
        finalize_ledger(led, nav, stale, benches, as_of, inception)
        sb_upsert("user_mine_ledgers",
                  {"user_id": uid, "data": {"ledger": led, "inception": inception},
                   "updated_at": datetime.now(timezone.utc).isoformat()},
                  "user_id")
        done += 1
    return done


def main():
    parser = argparse.ArgumentParser(description="Update live paper-trading ledgers.")
    parser.add_argument("--as-of", type=str, default=None, help="Override date (YYYY-MM-DD, testing)")
    parser.add_argument("--stocks-json", type=str, default=None, help="Override stocks.json path (testing)")
    parser.add_argument("--skip-benchmark", action="store_true", help="No yfinance call (testing)")
    args = parser.parse_args()
    as_of = args.as_of or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    stocks_path = Path(args.stocks_json) if args.stocks_json else STOCKS_JSON
    stocks = load_json(stocks_path, [])
    prices = {s["symbol"]: s.get("price") for s in stocks if s.get("symbol")}
    prices_holder["prices"] = prices
    dividends_holder["divs"] = (load_json(DIVIDENDS_JSON, {}) or {}).get("tickers", {})
    factor = (load_json(FACTOR_SCORES_JSON, {}) or {}).get("tickers", {})
    plan = load_json(PORTFOLIO_PLAN_JSON, {}) or {}

    book = load_json(LEDGERS_JSON, None) or {
        "inception": as_of,
        "config": {"cost_bps": COST_BPS, "benchmarks": BENCHMARKS,
                   "primary_benchmark": PRIMARY_BENCHMARK, "start_nav": START_NAV},
        "ledgers": {"plan": empty_ledger(), "plan2": empty_ledger(), "equal": empty_ledger()},
    }
    book["ledgers"].setdefault("plan2", empty_ledger())  # add to pre-existing books
    book["ledgers"].pop("mine", None)  # mine is per-user now (user_mine_ledgers)
    book.setdefault("config", {})["benchmarks"] = BENCHMARKS
    book["config"]["primary_benchmark"] = PRIMARY_BENCHMARK
    ledgers = book["ledgers"]

    benches = {b: None for b in BENCHMARKS} if args.skip_benchmark else fetch_benchmarks()

    # ── global ledgers: plan / plan2 / equal (identical for every user) ──
    plan_targets = {p["symbol"]: p["weight_pct"] for p in (plan.get("positions") or [])}
    nav_plan, stale_plan = run_target_ledger(ledgers["plan"], plan_targets, prices, as_of, "plan")
    plan2_targets = {p["symbol"]: p["weight_pct"] for p in ((plan.get("plan2") or {}).get("positions") or [])}
    nav_plan2, stale_plan2 = run_target_ledger(ledgers["plan2"], plan2_targets, prices, as_of, "plan2")
    research = sorted(t for t, e in factor.items() if e.get("fct_band") == "research_now")
    eq_weight = 100.0 / len(research) if research else 0
    nav_eq, stale_eq = run_target_ledger(ledgers["equal"], {t: eq_weight for t in research},
                                         prices, as_of, "rank")
    for name, nav, stale in (("plan", nav_plan, stale_plan), ("plan2", nav_plan2, stale_plan2),
                             ("equal", nav_eq, stale_eq)):
        finalize_ledger(ledgers[name], nav, stale, benches, as_of, book["inception"])

    book["last_updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    LEDGERS_JSON.write_text(json.dumps(book, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    save_ledgers_to_supabase(book)  # runtime source for /api/paper-ledgers (no redeploy)

    # ── mine ledgers (per-user in Supabase; single local user in dev) ────
    if all(supabase_env()):
        n_users = process_user_mine_ledgers(prices, benches, as_of)
        mine_note = f"{n_users} user mine-ledger(s) -> Supabase"
    else:
        my_snapshot = load_json(MY_PORTFOLIO_JSON, None)
        if my_snapshot and my_snapshot.get("saved_at"):
            my_snapshot["saved_at_date"] = my_snapshot["saved_at"][:10]
        mine = book["ledgers"].setdefault("mine", empty_ledger())
        nav_mine, stale_mine = run_mine_ledger(mine, my_snapshot, prices, as_of)
        finalize_ledger(mine, nav_mine, stale_mine, benches, as_of, book["inception"])
        LEDGERS_JSON.write_text(json.dumps(book, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        mine_note = "local mine ledger (dev, no Supabase env)"

    print(f"Paper ledgers @ {as_of}:")
    for name in ("plan", "plan2", "equal"):
        s = ledgers[name]["summary"]
        nav_now = ledgers[name]["nav_series"][-1]["nav"]
        print(f"  {name:5s} nav={nav_now} open={s.get('open_positions')} "
              f"cum={s.get('cumulative_return_pct')}% trades={len(ledgers[name]['trades'])}")
    print(f"  mine: {mine_note}")
    print(f"Written: {LEDGERS_JSON.name}")


if __name__ == "__main__":
    main()

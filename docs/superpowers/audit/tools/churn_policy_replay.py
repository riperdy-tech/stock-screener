"""Churn policy replay (F-06 test): replay the ACTUAL daily signal history
(out/replay_panel.json — as-of git snapshots, no look-ahead) under alternative
membership policies, at multiple real-cost scenarios. Same signals, same
prices, different trading discipline; only the policy varies.

Policies:
  A_current   enter immediately; exit after 2 consecutive evaluated misses
              (replicates the live tracker's behavior)
  B_confirm2  enter after 2 consecutive days in-set; exit after 2 out
  C_slow      enter after 3; exit after 5 (slow-exit asymmetry)
  D_weekly    act only every 5th evaluated day (weekly rebalance)
  E_hyst      enter on research_now; exit only when demoted BELOW the
              watchlist zone (llm percentile <90 / quant band out of RN+WL)
              for 2 consecutive days
  F_buyhold   enter on first appearance; never exit (upper bound)

Mechanics mirror the tracker: equal weight = NAV/max(N,8), trade-on-change
(no incumbent rebalancing), sell leavers then fund entrants while cash lasts,
carry last mark when a price is missing. Costs charged per side on traded
value. Read-only; outputs out/churn_replay_results.json."""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent / "out"
panel = json.loads((OUT / "replay_panel.json").read_text(encoding="utf-8"))
DATES = panel["dates"]
DAYS = panel["days"]
BENCH = panel["bench"]

COST_SIDES_BPS = (10, 25, 40, 55)
MIN_NAMES = 8


def in_set(day, book, t):
    s = day["signals"].get(t)
    if not s:
        return False
    if book == "llm":
        return s.get("l") == "research_now" and s.get("lv") != "llm_reject"
    return s.get("q") == "research_now"


def hyst_hold_ok(day, book, t):
    """E_hyst: still 'good enough to hold'?"""
    s = day["signals"].get(t)
    if not s:
        return False
    if book == "llm":
        lp = s.get("lp")
        return (s.get("l") == "research_now") or (lp is not None and lp >= 90)
    return s.get("q") in ("research_now", "watchlist")


def evaluated(day, book):
    return day["overlay_on"] if book == "llm" else True


def replay(book, policy, cost_bps):
    cost = cost_bps / 10000.0
    cash, shares, marks = 100.0, {}, {}
    in_streak, out_streak, hold_ok_out = {}, {}, {}
    traded = paid = 0.0
    n_trades = 0
    nav_series = []
    eval_idx = -1
    started = False
    for d in DATES:
        day = DAYS[d]
        px = day["px"]
        for t, p in px.items():
            marks[t] = p
        ev = evaluated(day, book)
        cur = {t for t in day["signals"] if in_set(day, book, t)} if ev else set()
        if not started and cur:
            started = True
        if started and ev:
            eval_idx += 1
            for t in set(list(in_streak) + list(cur)):
                in_streak[t] = in_streak.get(t, 0) + 1 if t in cur else 0
            for t in list(shares):
                out_streak[t] = 0 if t in cur else out_streak.get(t, 0) + 1
                hold_ok_out[t] = 0 if hyst_hold_ok(day, book, t) \
                    else hold_ok_out.get(t, 0) + 1

            weekly_offset = int(policy[-1]) if policy.startswith("D_weekly") and policy[-1].isdigit() else 0
            act = not policy.startswith("D_weekly") or (eval_idx % 5 == weekly_offset)
            if act:
                # exits
                for t in list(shares):
                    os_, ho = out_streak.get(t, 0), hold_ok_out.get(t, 0)
                    sell_now = (
                        policy in ("A_current", "B_confirm2") and os_ >= 2
                        or policy.startswith("D_weekly") and os_ >= 1
                        or policy == "C_slow" and os_ >= 5
                        or policy == "E_hyst" and ho >= 2
                    )
                    if sell_now and marks.get(t):
                        v = shares.pop(t) * marks[t]
                        cash += v * (1 - cost)
                        traded += v
                        paid += v * cost
                        n_trades += 1
                # entries
                need_in = {"A_current": 1, "B_confirm2": 2, "C_slow": 3,
                           "E_hyst": 1, "F_buyhold": 1}.get(policy, 1)
                entrants = [t for t in sorted(cur)
                            if t not in shares and in_streak.get(t, 0) >= need_in
                            and marks.get(t)]
                nav = cash + sum(sh * marks[t] for t, sh in shares.items() if marks.get(t))
                w = nav / max(len(cur) if cur else len(shares), MIN_NAMES)
                for t in entrants:
                    spend = min(w, cash)
                    if spend < w * 0.9:      # full-fund-or-defer, like the tracker
                        continue
                    shares[t] = spend * (1 - cost) / marks[t]
                    cash -= spend
                    traded += spend
                    paid += spend * cost
                    n_trades += 1
        nav = cash + sum(sh * marks[t] for t, sh in shares.items() if marks.get(t))
        nav_series.append((d, round(nav, 4)))
    navs = [n for _, n in nav_series]
    peak, maxdd = navs[0], 0.0
    for n in navs:
        peak = max(peak, n)
        maxdd = min(maxdd, n / peak - 1)
    start_d = next((d for d, _ in nav_series if DAYS[d]["signals"]), DATES[0])
    iwm0 = iwm1 = None
    for d, _ in nav_series:
        b = BENCH.get(d)
        if b and b.get("IWM"):
            if iwm0 is None:
                iwm0 = b["IWM"]
            iwm1 = b["IWM"]
    return {
        "final_nav": round(navs[-1], 2),
        "ret_pct": round(navs[-1] / navs[0] * 100 - 100, 2),
        "iwm_pct": round(iwm1 / iwm0 * 100 - 100, 2) if iwm0 else None,
        "max_dd_pct": round(maxdd * 100, 2),
        "turnover_x": round(traded / 100.0, 2),
        "cost_paid_navpts": round(paid, 2),
        "trades": n_trades,
        "open_at_end": len(shares),
    }


results = {}
for book in ("llm", "quant"):
    results[book] = {}
    for policy in ("A_current", "B_confirm2", "C_slow", "D_weekly0", "D_weekly1",
                   "D_weekly2", "D_weekly3", "D_weekly4", "E_hyst", "F_buyhold"):
        results[book][policy] = {f"{c}bps": replay(book, policy, c)
                                 for c in COST_SIDES_BPS}
(OUT / "churn_replay_results.json").write_text(json.dumps(results, indent=1),
                                               encoding="utf-8")
for book in results:
    print(f"\n=== {book.upper()} book ===")
    print(f"{'policy':<11} {'ret@10':>7} {'ret@25':>7} {'ret@40':>7} {'ret@55':>7} "
          f"{'DD@25':>7} {'turn':>6} {'trades':>6}")
    for p, sc in results[book].items():
        r = sc["25bps"]
        print(f"{p:<11} {sc['10bps']['ret_pct']:>7} {r['ret_pct']:>7} "
              f"{sc['40bps']['ret_pct']:>7} {sc['55bps']['ret_pct']:>7} "
              f"{r['max_dd_pct']:>7} {r['turnover_x']:>6} {r['trades']:>6}")
    print(f"IWM over same window: {results[book]['A_current']['25bps']['iwm_pct']}%")

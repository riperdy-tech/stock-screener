"""backtest_momo.py — sanity backtest of the plan3 momentum rules.

Walk-forward over stocks.json metrics.monthlyCloses (24 monthly bars): form the
momentum book at each month-end with ONLY data available then, hold one month,
repeat. Mirrors build_momo_plan.py's signal blend, knife guard, selection and
weighting; risk rules run at monthly granularity (the live tracker runs them
daily, which is strictly tighter).

HONEST LIMITS — this is a sanity gate, not proof:
  * survivorship bias: the universe is TODAY's stocks.json; names that delisted
    during the window are invisible (flatters returns);
  * ~11 tradable months only (13 bars of formation + 11 of walk-forward);
  * monthly stops understate both drawdown and stop-out costs vs daily;
  * mcap/veto filters use today's values (no historical snapshots exist);
  * regime throttle uses QQQ monthly closes via yfinance (skipped offline).

Run: python scripts/backtest_momo.py [--skip-regime]
"""

import argparse
import importlib.util
import json
import math
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("momo", str(HERE / "build_momo_plan.py"))
momo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(momo)

DATA = HERE.parent / "public" / "data"
COST = 0.001            # 10 bps per side
STOP = 0.15             # trailing stop off the high-water mark (monthly marks)
FORM_BARS = 13          # bars needed to form signals


def load_universe():
    stocks = json.loads((DATA / "stocks.json").read_text(encoding="utf-8"))
    out = {}
    for s in stocks:
        sym = s.get("symbol")
        closes = (s.get("metrics") or {}).get("monthlyCloses") or []
        c = [v for v in closes if isinstance(v, (int, float)) and v > 0]
        if not sym or len(c) < 24:
            continue
        if (s.get("marketCap") or 0) < momo.CONFIG["min_mcap"]:
            continue
        if (s.get("price") or 0) < momo.CONFIG["min_price"]:
            continue
        out[sym] = {"closes": c, "sector": s.get("sector") or "Unknown"}
    return out


def hist_vol(closes):
    """Annualized vol from trailing monthly returns (fct_vol has no history)."""
    rets = [closes[i] / closes[i - 1] - 1 for i in range(1, len(closes))]
    tail = rets[-12:]
    if len(tail) < 6:
        return None
    mean = sum(tail) / len(tail)
    var = sum((x - mean) ** 2 for x in tail) / (len(tail) - 1)
    return math.sqrt(var) * math.sqrt(12)


def form_book(universe, m):
    """Top-N book at month index m using bars [0..m] only. Returns {sym: weight}."""
    cands = []
    for sym, u in universe.items():
        window = u["closes"][: m + 1]
        sig = momo.momentum_signals(window)
        if sig is None or momo.knife(window):
            continue
        vol = hist_vol(window)
        cands.append({"symbol": sym, "sector": u["sector"],
                      "m121": sig[0], "m6": sig[1], "px": sig[2], "vol": vol})
    if not cands:
        return {}
    r121 = momo.pct_rank([c["m121"] for c in cands])
    r6 = momo.pct_rank([c["m6"] for c in cands])
    rpx = momo.pct_rank([c["px"] for c in cands])
    for c in cands:
        c["score"] = (momo.CONFIG["w_mom_12_1"] * r121[c["m121"]]
                      + momo.CONFIG["w_mom_6"] * r6[c["m6"]]
                      + momo.CONFIG["w_prox_52w"] * rpx[c["px"]])
    cands.sort(key=lambda c: (-c["score"], c["symbol"]))
    picked, per_sector = [], {}
    for c in cands:
        if len(picked) >= momo.CONFIG["n_positions"]:
            break
        if per_sector.get(c["sector"], 0) >= momo.CONFIG["max_per_sector"]:
            continue
        per_sector[c["sector"]] = per_sector.get(c["sector"], 0) + 1
        picked.append(c)
    n = len(picked)
    for i, c in enumerate(picked):
        tilt = 1.0 + momo.CONFIG["rank_tilt"] * (0.5 - (i / (n - 1) if n > 1 else 0.0))
        c["raw"] = tilt / max(c["vol"] or momo.CONFIG["vol_floor"], momo.CONFIG["vol_floor"])
    tot = sum(c["raw"] for c in picked)
    w = {c["symbol"]: c["raw"] / tot for c in picked}
    cap = momo.CONFIG["position_cap_pct"] / 100.0
    for _ in range(6):
        over = sum(max(0.0, x - cap) for x in w.values())
        if over < 1e-9:
            break
        under = {k for k, x in w.items() if x < cap}
        us = sum(w[k] for k in under)
        w = {k: min(x, cap) for k, x in w.items()}
        if not under or us <= 0:
            break
        for k in under:
            w[k] += over * w[k] / us
    return w


def fetch_qqq_monthly(skip):
    if skip:
        return None
    try:
        import yfinance as yf
        hist = yf.Ticker("QQQ").history(period="3y", interval="1mo")
        closes = [float(x) for x in hist["Close"].dropna().tolist()]
        return closes if len(closes) >= 24 else None
    except Exception as e:
        print(f"  ! QQQ fetch failed ({e}) — running without regime throttle/benchmark",
              file=sys.stderr)
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-regime", action="store_true", help="no yfinance (offline)")
    args = ap.parse_args()

    universe = load_universe()
    print(f"universe: {len(universe)} names with 24 clean monthly bars "
          f"(mcap >= ${momo.CONFIG['min_mcap']/1e9:.0f}B, price >= ${momo.CONFIG['min_price']:.0f})")

    qqq = fetch_qqq_monthly(args.skip_regime)
    qqq24 = qqq[-24:] if qqq else None

    nav, navs = 1.0, [1.0]
    qnav, qnavs = 1.0, [1.0]
    held = {}          # sym -> weight at entry of the month
    hwm = {}           # sym -> high-water on monthly closes
    cooldown = set()   # stopped last month, banned this month
    turnover = 0.0
    stop_hits = 0
    rows = []

    for m in range(FORM_BARS - 1, 23):      # form at bar m (>=12), hold m -> m+1
        book = form_book(universe, m)
        book = {s: w for s, w in book.items() if s not in cooldown}
        if book:
            scale = 1.0 / sum(book.values())
            book = {s: w * scale for s, w in book.items()}

        # regime throttle: QQQ vs its 10-month average (the monthly stand-in for 200d)
        gross = 1.0
        if qqq24 and m >= 10:
            ma10 = sum(qqq24[m - 9: m + 1]) / 10.0
            gross = 1.0 if qqq24[m] > ma10 else 0.5

        # one-way turnover at the rebalance
        change = sum(abs(book.get(s, 0.0) * gross - held.get(s, 0.0))
                     for s in set(book) | set(held))
        turnover += change
        nav *= (1.0 - change * COST)

        # hold month m -> m+1, monthly trailing stop against the high-water mark
        new_cd = set()
        port_ret = 0.0
        for s, w in book.items():
            c0, c1 = universe[s]["closes"][m], universe[s]["closes"][m + 1]
            hw = max(hwm.get(s, c0), c0, c1)
            r = c1 / c0 - 1.0
            if c1 < hw * (1 - STOP):
                new_cd.add(s)
                stop_hits += 1
            port_ret += w * gross * r
            hwm[s] = hw
        for s in list(hwm):
            if s not in book:
                hwm.pop(s)

        nav *= (1.0 + port_ret)
        navs.append(nav)
        held = {s: w * gross for s, w in book.items()}
        cooldown = new_cd
        qr = (qqq24[m + 1] / qqq24[m] - 1.0) if qqq24 else 0.0
        qnav *= (1.0 + qr)
        qnavs.append(qnav)
        rows.append((m, len(book), gross, port_ret * 100, qr * 100))

    months = len(navs) - 1
    cagr = nav ** (12.0 / months) - 1
    peak, maxdd = navs[0], 0.0
    for v in navs:
        peak = max(peak, v)
        maxdd = min(maxdd, v / peak - 1)
    qcagr = (qnav ** (12.0 / months) - 1) if qqq24 else None
    qpeak, qmaxdd = qnavs[0], 0.0
    for v in qnavs:
        qpeak = max(qpeak, v)
        qmaxdd = min(qmaxdd, v / qpeak - 1)

    print(f"\nwalk-forward: {months} months, {stop_hits} monthly stop-outs, "
          f"one-way turnover {turnover:.1f}x total (~{turnover / months * 12:.1f}x/yr)")
    print(f"{'bar':>4} {'names':>5} {'gross':>5} {'strat%':>8} {'QQQ%':>8}")
    for m, n, g, r, q in rows:
        print(f"{m:>4} {n:>5} {g:>5.2f} {r:>+8.2f} {q:>+8.2f}")
    print(f"\nplan3 rules : total {(nav - 1) * 100:+.1f}%  CAGR {cagr * 100:+.1f}%  "
          f"MaxDD {maxdd * 100:.1f}%  Calmar {cagr / abs(maxdd) if maxdd else float('inf'):.1f}")
    if qqq24:
        print(f"QQQ         : total {(qnav - 1) * 100:+.1f}%  CAGR {qcagr * 100:+.1f}%  "
              f"MaxDD {qmaxdd * 100:.1f}%")
    print("\nCAVEATS: survivorship-biased universe (today's members only), monthly "
          "granularity (understates DD + stop costs), 11-month window, no veto layer. "
          "A pass here earns a PAPER ledger, nothing more.")


if __name__ == "__main__":
    main()

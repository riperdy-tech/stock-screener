"""Decompose each ledger's live-to-date return vs IWM into: day-1 selection
(buy&hold the inception-day basket, equal-weight, marked at current prices),
subsequent-trading delta (actual minus counterfactual), and modeled cost drag.
Marks: ledger last_marks first, stocks.json price fallback. Dividends and
the cash residual are excluded from the counterfactual (stated approximation).
Honest caveat: ~5 weeks of data supports mechanical decomposition, not
statistical claims about signal quality. Read-only."""
import json
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent / "out"
book = json.loads((ROOT / "public/data/paper_ledgers.json").read_text(encoding="utf-8"))
stocks_raw = json.loads((ROOT / "public/data/stocks.json").read_text(encoding="utf-8"))
stocks_list = stocks_raw if isinstance(stocks_raw, list) else stocks_raw.get("stocks", [])
px_stocks = {}
for s in stocks_list:
    t = s.get("symbol") or s.get("ticker")
    p = s.get("price")
    if t and isinstance(p, (int, float)) and p > 0:
        px_stocks[t] = float(p)
churn = json.loads((Path(__file__).parent / "out/churn_summary.json").read_text(encoding="utf-8"))

res = {}
for name in ("equal", "equal_llm", "plan", "plan_llm", "plan2", "plan2_llm"):
    led = book["ledgers"].get(name)
    if not led:
        continue
    ns = led.get("nav_series", [])
    if len(ns) < 2:
        continue
    nav0, nav1 = ns[0], ns[-1]
    actual = nav1["nav"] / nav0["nav"] - 1
    b0, b1 = nav0.get("benches") or {}, nav1.get("benches") or {}
    iwm = (b1["IWM"] / b0["IWM"] - 1) if b0.get("IWM") and b1.get("IWM") else None

    trades = led.get("trades", [])
    day0 = min((t["date"] for t in trades if t.get("date")), default=None)
    day1_buys = [t for t in trades
                 if t["date"] == day0 and str(t.get("side", "")).lower() == "buy"]
    marks = led.get("last_marks") or {}
    rets, unpriced = [], []
    for t in day1_buys:
        tick, px_in = t["ticker"], float(t.get("price") or 0)
        px_now = marks.get(tick) or px_stocks.get(tick)
        if px_now and px_in > 0:
            rets.append(px_now / px_in - 1)
        else:
            unpriced.append(tick)
    hold_ret = statistics.fmean(rets) if rets else None
    cs = churn.get(name) or {}
    res[name] = {
        "window": f"{nav0['date']} -> {nav1['date']}",
        "actual_ret_pct": round(actual * 100, 2),
        "iwm_ret_pct": round(iwm * 100, 2) if iwm is not None else None,
        "excess_vs_iwm_pct": round((actual - iwm) * 100, 2) if iwm is not None else None,
        "day1_basket": f"{len(rets)}/{len(day1_buys)} priced"
                       + (f" (unpriced: {unpriced})" if unpriced else ""),
        "day1_buyhold_ret_pct": round(hold_ret * 100, 2) if hold_ret is not None else None,
        "trading_delta_pct": (round((actual - hold_ret) * 100, 2)
                              if hold_ret is not None else None),
        "modeled_cost_drag_nav_bps": cs.get("modeled_cost_drag_nav_bps"),
        "mean_closed_return_pct": cs.get("mean_closed_return_pct"),
        "win_rate": cs.get("win_rate"),
    }
OUT.mkdir(exist_ok=True)
(OUT / "attribution.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
print(json.dumps(res, indent=1))

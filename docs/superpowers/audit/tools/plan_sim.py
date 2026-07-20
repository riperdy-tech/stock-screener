"""Feed compute_plan the CURRENT live equal_llm targets at synthetic NAVs
(20k/50k/200k) using the ledger's own marks as prices. Answers: whole-share
granularity, cash drag, unaffordable names, order counts, spread cost at each
scale. Imports the live pure function read-only; no network, no writes."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent / "out"
sys.path.insert(0, str(ROOT / "scripts"))
from kis.reconcile import compute_plan          # noqa: E402
from kis.targets import ledger_weights          # noqa: E402

book = json.loads((ROOT / "public/data/paper_ledgers.json").read_text(encoding="utf-8"))
tgt = ledger_weights(book, "equal_llm", max_stale_days=3650)   # bypass staleness for sim
weights, marks = tgt["weights"], tgt["source_marks"]
LIMIT_BUFFER_RT = 0.006          # 0.3% buy + 0.3% sell buffers, round trip

res = {"targets": len(weights), "cash_weight_pct": round(tgt["cash_weight"] * 100, 2),
       "price_range": [round(min(marks.values()), 2), round(max(marks.values()), 2)]}
for nav in (20_000, 50_000, 200_000):
    plan = compute_plan(weights, held={}, sellable={}, prices=marks, cash=float(nav),
                        max_turnover_pct=100.0)   # buy-in mode; isolates whole-share effects
    invested = sum(o.est_value for o in plan.orders if o.side == "buy")
    single_share = [o.ticker for o in plan.orders if o.side == "buy" and o.qty == 1]
    res[str(nav)] = {
        "orders": len(plan.orders),
        "unaffordable": [w.split(":")[0] for w in plan.warnings if "can't afford" in w],
        "single_share_positions": len(single_share),
        "invested_usd": round(invested, 2),
        "cash_drag_pct_vs_target": round(
            100 * (1 - invested / (nav * (1 - tgt["cash_weight"]))), 2),
        "est_spread_cost_usd_round_trip": round(invested * LIMIT_BUFFER_RT, 2),
        "warnings_other": [w for w in plan.warnings if "can't afford" not in w],
    }
OUT.mkdir(exist_ok=True)
(OUT / "plan_sim.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
print(json.dumps(res, indent=1))

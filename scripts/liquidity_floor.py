"""liquidity_floor.py — what a dollar-volume floor would do to the list (WO_SF6 part 3).

A measurement, not a switch: ADV_ENFORCE stays as it is. Given the published scores and each
name's 20-day dollar volume, list the names on the list (research_now + watchlist) that would
fail a floor, and the names that would take their places.

Replacements are taken in the published rank order (fct_rank) from the scored names that are
not on the list, skipping names that fail the floor themselves, second share classes and
operator exclusions. A name with no figure is neither a pass nor a failure: on the list it is
reported as unmeasured, and as a replacement it is listed with measured=False. This is an
approximation: a real veto would re-run the scorer, so percentiles and sector quotas would
shift too.

Usage:  python scripts/liquidity_floor.py [--data-dir public/data] [--floors 300000 1000000 3000000]
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hygiene_thresholds import resolve_adv_usd

LIST_BANDS = ("research_now", "watchlist")
NOT_REPLACEMENTS = ("secondary_share_class", "operator_excluded")


def _num(v) -> Optional[float]:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and v == v else None


def resolve_list_adv(stocks: Dict[str, Any], momentum: Dict[str, Any]) -> Dict[str, Optional[float]]:
    """{ticker: dollar volume} by the scorer's own order (stocks.json figure, then the momentum
    file's); None where neither has one. No volume x price branch: the figure or nothing."""
    out = {}
    for t, r in stocks.items():
        a, _ = resolve_adv_usd(_num(((r or {}).get("metrics") or {}).get("adv_20d_usd")),
                               _num((momentum.get(t) or {}).get("adv_20d_usd")), None, None)
        out[t] = a
    return out


def floor_report(factor_tickers: Dict[str, Dict[str, Any]], adv: Dict[str, Optional[float]],
                 floors: Iterable[float] = (300_000.0, 1_000_000.0, 3_000_000.0)) -> Dict[str, Any]:
    scored = {t: d for t, d in factor_tickers.items() if d.get("fct_veto") is None}
    on_list = {t: d for t, d in scored.items() if d.get("fct_band") in LIST_BANDS}
    candidates = sorted((t for t, d in scored.items()
                         if t not in on_list and d.get("fct_rank") is not None
                         and not any(f in (d.get("fct_flags") or []) for f in NOT_REPLACEMENTS)),
                        key=lambda t: (scored[t]["fct_rank"], t))
    result = []
    for floor in floors:
        fail = sorted((t for t in on_list if adv.get(t) is not None and adv[t] < floor),
                      key=lambda t: (on_list[t].get("fct_rank") or 1e9, t))
        take = []
        for t in candidates:
            if len(take) >= len(fail):
                break
            if adv.get(t) is not None and adv[t] < floor:
                continue
            take.append({"ticker": t, "rank": scored[t]["fct_rank"], "adv": adv.get(t),
                         "measured": adv.get(t) is not None})
        result.append({
            "floor": floor,
            "fail": [{"ticker": t, "band": on_list[t]["fct_band"], "rank": on_list[t].get("fct_rank"),
                      "adv": adv[t]} for t in fail],
            "unmeasured_on_list": sorted(t for t in on_list if adv.get(t) is None),
            "replacements": take,
        })
    return {
        "floors": result,
        "coverage": {"list": len(on_list), "list_measured": sum(adv.get(t) is not None for t in on_list),
                     "scored": len(scored), "scored_measured": sum(adv.get(t) is not None for t in scored)},
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--data-dir", default=str(Path(__file__).resolve().parents[1] / "public" / "data"))
    ap.add_argument("--floors", type=float, nargs="+", default=[300_000.0, 1_000_000.0, 3_000_000.0])
    args = ap.parse_args()
    d = Path(args.data_dir)
    load = lambda n: json.loads((d / n).read_text(encoding="utf-8"))
    stocks = {r["symbol"]: r for r in load("stocks.json") if r.get("symbol")}
    momentum = load("momentum_state.json").get("tickers") or {}
    rep = floor_report(load("factor_scores.json")["tickers"], resolve_list_adv(stocks, momentum), args.floors)
    c = rep["coverage"]
    print(f"coverage: {c['list_measured']}/{c['list']} list names and {c['scored_measured']}/{c['scored']} "
          f"scored names have a dollar-volume figure")
    for f in rep["floors"]:
        print(f"\nfloor ${f['floor']:,.0f}: {len(f['fail'])} list names fail, "
              f"{len(f['unmeasured_on_list'])} unmeasured")
        for x in f["fail"]:
            print(f"  FAIL {x['ticker']:8s} {x['band']:12s} rank {x['rank']}  adv ${x['adv']:,.0f}")
        for x in f["replacements"]:
            figure = f"adv ${x['adv']:,.0f}" if x["measured"] else "unmeasured"
            print(f"  IN   {x['ticker']:8s} rank {x['rank']}  {figure}")


if __name__ == "__main__":
    main()

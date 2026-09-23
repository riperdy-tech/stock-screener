"""build_momo_plan.py — plan3 · bold: momentum sleeve plan builder.

P3.11: diagnostic-only — not a run_chain.py step; its regime throttle is an input to Phase 5.

Objective (user spec 2026-07-13): maximize profit inside a 15% drawdown budget
(20% hard kill), benchmark QQQ. Offense and defense are SEPARATE layers:

  Offense — cross-sectional momentum, NO valuation gate. RS2/quant act only as
            a red-flag veto (forensic, survivability, hard AVOID/SELL); they
            cannot demote a name for being "overvalued".
  Defense — regime throttle written into the plan (QQQ vs its 200-day average
            + macro de-risk flags -> gross exposure 100/50/25%). Trailing
            stops and the portfolio kill switch live in the tracker, which
            marks daily; this builder only decides WHAT to hold and HOW MUCH
            gross to run.

Signals come from stocks.json metrics.monthlyCloses (24 monthly closes,
oldest -> newest, last = latest price): the academic 12-1 momentum, 6-month
momentum, and proximity to the 52-week high. Monthly data is the standard
formation frequency for these signals; daily risk management is the tracker's
job, not this file's.

Cadence: the momentum RANKING is refreshed weekly (RERANK_DAYS) — churning a
momentum book daily just burns spread. The REGIME block is refreshed on every
run (daily) so de-risking is never a week late. Idempotent: same-day reruns
reuse the stored ranking unless --force-rerank.

Usage:
    python scripts/build_momo_plan.py                 # normal daily run
    python scripts/build_momo_plan.py --force-rerank  # rebuild ranking now
    python scripts/build_momo_plan.py --skip-regime   # offline/testing: no yfinance

Output: public/data/portfolio_plan_momo.json (consumed by track_paper_portfolios
as the `plan3` ledger's target set). Paper only — never wired to KIS.
"""

import argparse
import json
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
REVERSE_SCORES_JSON = DATA / "reverse_scores.json"
LLM_OVERLAY_JSON = DATA / "llm_overlay.json"
MACRO_STATE_JSON = DATA / "macro_state.json"
OUT_JSON = DATA / "portfolio_plan_momo.json"

CONFIG = {
    # universe
    "min_mcap": 2e9,            # bold, not microcap lottery tickets (JLHL lesson)
    "min_price": 5.0,
    "min_closes": 13,           # 12-1 momentum needs 13 monthly closes
    # signal blend (cross-sectional percentile ranks)
    "w_mom_12_1": 0.5,
    "w_mom_6": 0.3,
    "w_prox_52w": 0.2,
    # falling-knife guards (blocked from ENTRY; exits are the tracker's stops)
    "knife_1m_pct": -25.0,      # last monthly bar dropped more than this
    "knife_2m_pct": -35.0,      # or the last two bars combined
    # book construction
    "n_positions": 13,
    "max_per_sector": 4,        # ~30% sector cap on a 13-name book
    "position_cap_pct": 12.0,
    "sector_cap_pct": 30.0,
    "vol_floor": 0.15,          # inverse-vol floor so a sleepy name can't take 3x weight
    "rank_tilt": 0.5,           # top rank gets (1 + tilt/2)x, bottom (1 - tilt/2)x
    # veto layer (red flags only — NEVER valuation)
    "min_survivability": 40,
    # regime throttle
    "ma_days": 200,
    "macro_derisk_flag_count": 2,
    "gross_full": 100.0,
    "gross_below_ma": 50.0,
    "gross_risk_off": 25.0,
    # cadence
    "rerank_days": 7,
}

FORENSIC_FLAGS = ("M_SCORE_ELEVATED", "F_SCORE_WEAK", "ACCRUALS_HIGH", "HEAVY_ISSUANCE")
RS2_HARD_SELL = ("AVOID", "SELL", "SHORT")


def load_json(path, default=None):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def pct_rank(values):
    """value -> percentile rank in [0, 1] (average of below + half of equal)."""
    s = sorted(values)
    n = len(s)
    if n == 0:
        return {}
    out = {}
    import bisect
    for v in values:
        lo = bisect.bisect_left(s, v)
        hi = bisect.bisect_right(s, v)
        out[v] = (lo + (hi - lo) / 2.0) / n
    return out


def momentum_signals(closes):
    """(mom_12_1, mom_6, prox_52w) from oldest->newest monthly closes, or None."""
    c = [v for v in closes if isinstance(v, (int, float)) and v > 0]
    if len(c) < CONFIG["min_closes"]:
        return None
    mom_12_1 = c[-2] / c[-13] - 1.0     # skip the most recent month (reversal)
    mom_6 = c[-1] / c[-7] - 1.0
    prox = c[-1] / max(c[-12:])
    return mom_12_1, mom_6, prox


def knife(closes):
    """True if the name just fell off a cliff — momentum entry into a crash is
    how JLHL happened; a crashed name must re-earn its rank over months."""
    c = [v for v in closes if isinstance(v, (int, float)) and v > 0]
    if len(c) < 3:
        return True
    r1 = (c[-1] / c[-2] - 1.0) * 100
    r2 = (c[-1] / c[-3] - 1.0) * 100
    return r1 <= CONFIG["knife_1m_pct"] or r2 <= CONFIG["knife_2m_pct"]


def veto_reason(sym, factor, reverse, overlay):
    """Red-flag veto ONLY (quant guardrail + RS2 hard sell). No valuation gates:
    'overvalued' is not a veto in this sleeve — that is the whole point of it."""
    f = factor.get(sym) or {}
    if f.get("fct_veto") is not None:
        return f"quant veto: {f['fct_veto']}"
    rv = reverse.get(sym) or {}
    flags = rv.get("rev_flags") or ""
    fired = [x for x in FORENSIC_FLAGS if x in flags]
    if fired:
        return f"forensic: {','.join(fired)}"
    surv = rv.get("rev_survivability")
    if isinstance(surv, (int, float)) and surv < CONFIG["min_survivability"]:
        return f"survivability {surv} < {CONFIG['min_survivability']}"
    v = (overlay.get(sym) or {})
    act = (v.get("action") or "").upper()
    if any(w in act for w in RS2_HARD_SELL):
        return f"RS2 hard sell: {v.get('action')}"
    return None


def fetch_regime(skip=False, prev=None):
    """QQQ vs its 200-day average + macro flags -> gross exposure %. Refreshed
    daily. On fetch failure the PREVIOUS regime is carried (a stale throttle is
    better than snapping to full gross on a network error)."""
    macro = load_json(MACRO_STATE_JSON, {}) or {}
    flags = macro.get("triggered_flags") or []
    regime = {
        "qqq_close": None, "qqq_ma200": None, "above_ma": None,
        "macro_flags": flags, "source": "live",
        "gross_exposure_pct": CONFIG["gross_full"],
    }
    if skip:
        if prev:
            out = dict(prev)
            out["source"] = "carried (--skip-regime)"
            out["macro_flags"] = flags
            return out
        regime["source"] = "default (--skip-regime, no previous plan)"
        return regime
    try:
        import yfinance as yf
        hist = yf.Ticker("QQQ").history(period="1y", interval="1d")
        closes = [float(x) for x in hist["Close"].dropna().tolist()]
        if len(closes) < 60:
            raise RuntimeError(f"only {len(closes)} QQQ closes")
        ma = sum(closes[-CONFIG["ma_days"]:]) / min(len(closes), CONFIG["ma_days"])
        regime["qqq_close"] = round(closes[-1], 4)
        regime["qqq_ma200"] = round(ma, 4)
        regime["above_ma"] = closes[-1] > ma
    except Exception as e:
        print(f"  ! QQQ regime fetch failed: {e}", file=sys.stderr)
        if prev:
            out = dict(prev)
            out["source"] = f"carried (fetch failed: {e})"
            out["macro_flags"] = flags
            return out
        regime["source"] = f"default (fetch failed: {e})"
        return regime

    risk_off = len(flags) >= CONFIG["macro_derisk_flag_count"]
    if regime["above_ma"]:
        regime["gross_exposure_pct"] = CONFIG["gross_full"]
    elif risk_off:
        regime["gross_exposure_pct"] = CONFIG["gross_risk_off"]
    else:
        regime["gross_exposure_pct"] = CONFIG["gross_below_ma"]
    return regime


def build_ranking(stocks, factor, reverse, overlay):
    """Momentum ranking -> (positions, skipped). Weights sum to 100 (the gross
    throttle is applied by the tracker, not baked into the weights)."""
    candidates = []
    skipped = []
    for s in stocks:
        sym = s.get("symbol")
        if not sym:
            continue
        price = s.get("price")
        mcap = s.get("marketCap") or 0
        if not isinstance(price, (int, float)) or price < CONFIG["min_price"]:
            continue
        if mcap < CONFIG["min_mcap"]:
            continue
        closes = (s.get("metrics") or {}).get("monthlyCloses") or []
        sig = momentum_signals(closes)
        if sig is None:
            continue
        why = veto_reason(sym, factor, reverse, overlay)
        if why:
            skipped.append({"symbol": sym, "reason": why})
            continue
        if knife(closes):
            skipped.append({"symbol": sym, "reason": "falling knife (crash guard)"})
            continue
        vol = (factor.get(sym) or {}).get("fct_vol")
        candidates.append({
            "symbol": sym, "sector": s.get("sector") or "Unknown",
            "mom_12_1": sig[0], "mom_6": sig[1], "prox_52w": sig[2],
            "vol": vol if isinstance(vol, (int, float)) and vol > 0 else None,
        })

    if not candidates:
        return [], skipped

    # cross-sectional percentile blend
    r121 = pct_rank([c["mom_12_1"] for c in candidates])
    r6 = pct_rank([c["mom_6"] for c in candidates])
    rpx = pct_rank([c["prox_52w"] for c in candidates])
    for c in candidates:
        c["mom_score"] = round(
            CONFIG["w_mom_12_1"] * r121[c["mom_12_1"]]
            + CONFIG["w_mom_6"] * r6[c["mom_6"]]
            + CONFIG["w_prox_52w"] * rpx[c["prox_52w"]], 4)
    candidates.sort(key=lambda c: (-c["mom_score"], c["symbol"]))

    # greedy select with a per-sector count limit
    picked, per_sector = [], {}
    for c in candidates:
        if len(picked) >= CONFIG["n_positions"]:
            break
        if per_sector.get(c["sector"], 0) >= CONFIG["max_per_sector"]:
            skipped.append({"symbol": c["symbol"],
                            "reason": f"sector limit {c['sector']} ({CONFIG['max_per_sector']} names)"})
            continue
        per_sector[c["sector"]] = per_sector.get(c["sector"], 0) + 1
        picked.append(c)

    # weights: rank tilt x inverse vol, normalized to 100, then position cap
    n = len(picked)
    for i, c in enumerate(picked):
        tilt = 1.0 + CONFIG["rank_tilt"] * (0.5 - (i / (n - 1) if n > 1 else 0.0))
        c["_raw"] = tilt / max(c["vol"] or CONFIG["vol_floor"], CONFIG["vol_floor"])
    total = sum(c["_raw"] for c in picked)
    for c in picked:
        c["weight_pct"] = 100.0 * c["_raw"] / total

    # position cap: clamp and redistribute the excess to uncapped names
    cap = CONFIG["position_cap_pct"]
    for _ in range(6):
        over = sum(max(0.0, c["weight_pct"] - cap) for c in picked)
        if over < 1e-9:
            break
        under = [c for c in picked if c["weight_pct"] < cap]
        under_sum = sum(c["weight_pct"] for c in under)
        for c in picked:
            c["weight_pct"] = min(c["weight_pct"], cap)
        if not under or under_sum <= 0:
            break
        for c in under:
            c["weight_pct"] += over * c["weight_pct"] / under_sum

    # sector cap on WEIGHT (the count limit above is only a coarse pre-filter)
    for _ in range(4):
        sec_w = {}
        for c in picked:
            sec_w[c["sector"]] = sec_w.get(c["sector"], 0.0) + c["weight_pct"]
        worst = max(sec_w.items(), key=lambda kv: kv[1])
        if worst[1] <= CONFIG["sector_cap_pct"] + 1e-6:
            break
        scale = CONFIG["sector_cap_pct"] / worst[1]
        freed = 0.0
        for c in picked:
            if c["sector"] == worst[0]:
                freed += c["weight_pct"] * (1 - scale)
                c["weight_pct"] *= scale
        others = [c for c in picked
                  if c["sector"] != worst[0] and c["weight_pct"] < cap]
        osum = sum(c["weight_pct"] for c in others)
        if osum > 0:
            for c in others:
                c["weight_pct"] = min(cap, c["weight_pct"] + freed * c["weight_pct"] / osum)

    positions = []
    for c in picked:
        positions.append({
            "symbol": c["symbol"],
            "weight_pct": round(c["weight_pct"], 2),
            "sector": c["sector"],
            "mom_score": c["mom_score"],
            "mom_12_1_pct": round(c["mom_12_1"] * 100, 1),
            "mom_6_pct": round(c["mom_6"] * 100, 1),
            "prox_52w": round(c["prox_52w"], 3),
            "fct_vol": c["vol"],
        })
    return positions, skipped


def main():
    parser = argparse.ArgumentParser(description="Build the plan3 momentum plan.")
    parser.add_argument("--force-rerank", action="store_true",
                        help="Rebuild the momentum ranking even if it is fresh.")
    parser.add_argument("--skip-regime", action="store_true",
                        help="No yfinance call (offline/testing); carries the previous regime.")
    parser.add_argument("--as-of", type=str, default=None,
                        help="Override date (YYYY-MM-DD, testing).")
    args = parser.parse_args()
    as_of = args.as_of or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    prev = load_json(OUT_JSON, None) or {}
    stocks = load_json(STOCKS_JSON, [])
    factor = (load_json(FACTOR_SCORES_JSON, {}) or {}).get("tickers", {})
    reverse = load_json(REVERSE_SCORES_JSON, {}) or {}
    overlay = (load_json(LLM_OVERLAY_JSON, {}) or {}).get("tickers", {})

    if not stocks:
        print("FATAL: stocks.json missing/empty.")
        sys.exit(1)

    # weekly rerank; daily runs only refresh the regime throttle
    reranked_at = prev.get("reranked_at")
    fresh = False
    if reranked_at and prev.get("positions") and not args.force_rerank:
        try:
            fresh = (date.fromisoformat(as_of) - date.fromisoformat(reranked_at)).days \
                < CONFIG["rerank_days"]
        except ValueError:
            fresh = False

    if fresh:
        positions, skipped = prev["positions"], prev.get("skipped", [])
        print(f"ranking carried (reranked {reranked_at}, < {CONFIG['rerank_days']}d old)")
    else:
        positions, skipped = build_ranking(stocks, factor, reverse, overlay)
        reranked_at = as_of
        print(f"reranked: {len(positions)} positions, {len(skipped)} skipped")

    regime = fetch_regime(skip=args.skip_regime, prev=prev.get("regime"))

    out = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "as_of_date": as_of,
        "reranked_at": reranked_at,
        "engine": "momo_v1",
        "objective": "max profit, 15% DD budget (20% kill), benchmark QQQ",
        "regime": regime,
        "positions": positions,
        "skipped": skipped[:50],
        "config": CONFIG,
    }
    OUT_JSON.write_text(json.dumps(out, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    total_w = round(sum(p["weight_pct"] for p in positions), 1)
    print(f"plan3 plan written: {len(positions)} names, weights sum {total_w}%, "
          f"gross throttle {regime['gross_exposure_pct']}% ({regime['source']})")
    for p in positions:
        print(f"  {p['symbol']:<6} w={p['weight_pct']:5.2f}%  score={p['mom_score']:.3f}  "
              f"12-1={p['mom_12_1_pct']:+7.1f}%  6m={p['mom_6_pct']:+7.1f}%  "
              f"52wH={p['prox_52w']:.2f}  {p['sector']}")


if __name__ == "__main__":
    main()

"""Verdict-stabilizer replay (task #19): rebuild the live book's daily
membership from RAW RS2 verdicts under alternative opinion-change rules, then
run identical portfolio mechanics over each membership stream. Isolates the
value of cleaning the signal, holding everything else fixed.

Variants:
  V0_asis     reimplementation of the current rule (validation baseline)
  V1_confirm  an opinion FAMILY change (bull/hold/bear) only takes effect if
              the engine's own fair value moved >=5%, OR the next analysis
              repeats the new opinion (two-in-a-row rule)
  V3_sticky   easier to stay than to enter: enter at MoS>=15 & conviction>=9.5
              (or deep value MoS>=30); stay until MoS<10 or conviction<8.5
              (deep value stays until MoS<25); bearish always exits
  V4_both     V1 verdict cleaning + V3 sticky thresholds

Portfolio mechanics identical for all variants (tracker-faithful: equal weight
over max(N,8), enter immediately, exit after 2 consecutive days out, 2-run
grace, full-fund-or-defer). Costs charged per side. Read-only."""
import json
import subprocess
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent / "out"
panel = json.loads((OUT / "replay_panel.json").read_text(encoding="utf-8"))
DATES = panel["dates"]
DAYS = panel["days"]

# ---- extract dated raw-verdict snapshots from llm_overlay.json history ----
PATH = "public/data/llm_overlay.json"
log = subprocess.run(["git", "-C", str(ROOT), "log", "--format=%H %cI", "--", PATH],
                     capture_output=True, text=True, check=True).stdout.split()
ov_commits = list(zip(log[0::2], log[1::2]))[::-1]
overlay_by_date = {}
for sha, iso in ov_commits:
    try:
        blob = subprocess.run(["git", "-C", str(ROOT), "show", f"{sha}:{PATH}"],
                              capture_output=True, text=True, check=True).stdout
        overlay_by_date[iso[:10]] = (json.loads(blob) or {}).get("tickers", {})
    except Exception:
        continue
OV_DATES = sorted(overlay_by_date)


def overlay_for(d):
    """Latest overlay snapshot at-or-before panel date d."""
    best = None
    for od in OV_DATES:
        if od <= d:
            best = od
        else:
            break
    return overlay_by_date.get(best, {}) if best else {}


BEARS = ("AVOID", "SELL", "REDUCE", "TRIM", "EXIT", "SHORT")
HARD = ("AVOID", "SELL", "SHORT")
BULLS = ("BUY", "ACCUMULAT", "INITIAT", "SCALE", "ADD", "OVERWEIGHT")


def family(v):
    a = str(v.get("action") or "").upper()
    if any(w in a for w in BEARS) or (v.get("stance") or "").lower() == "overvalued":
        return "BEAR"
    if any(w in a for w in BULLS) or (v.get("stance") or "").lower() == "undervalued":
        return "BULL"
    return "HOLD"


def mos_live(v, px):
    fv = v.get("fair_value")
    if isinstance(fv, (int, float)) and px:
        return (fv / px - 1) * 100
    m = v.get("realistic_mos_pct")
    return m if m is not None else v.get("mos_pct")


def conv_of(v, d):
    c = v.get("conviction")
    c = c if isinstance(c, (int, float)) else 9.0
    try:
        if (date.fromisoformat(d) - date.fromisoformat(v["analyzed_date"])).days > 14:
            c = 9.0 + (c - 9.0) * 0.5
    except Exception:
        pass
    return c


def rn_enter(v, fam, mos, conv):
    if fam == "BEAR":
        return False
    et = (v.get("entry_timing") or "").lower()
    deep = mos is not None and mos >= 30
    return deep or (conv >= 9.5 and ((mos is not None and mos >= 15) or et == "buy"))


STATS = {}


def build_membership(variant):
    """{date: set(tickers)} under the variant's rules."""
    fv_thr = 0.03 if variant.endswith("fv3") else 0.08 if variant.endswith("fv8") else 0.05
    st = STATS.setdefault(variant, {"parked": 0, "confirmed": 0, "reverted": 0,
                                    "big_move_adopt": 0})
    eff = {}          # V1: ticker -> effective verdict dict
    pending = {}      # V1: ticker -> family awaiting confirmation
    member = set()    # V3/V4 sticky state
    out = {}
    for d in DATES:
        ov = overlay_for(d)
        px_day = DAYS[d]["px"]
        sig = DAYS[d]["signals"]
        today = set()
        for t, v in ov.items():
            s = sig.get(t)
            if s and s.get("qv") is not None:
                continue                      # quant hard-veto guardrail
            if variant.startswith("V5"):
                # ROOT-CAUSE variant: decision from deterministic fields ONLY —
                # no sampled action text, no sampled conviction. Live MoS from
                # the deterministic fair value; entry_timing is the brake's
                # (price-data-driven) tier, frozen at analysis.
                mos = mos_live(v, px_day.get(t))
                et = (v.get("entry_timing") or "").lower()
                if variant == "V5_mos":
                    ok = mos is not None and mos >= 15
                else:  # V5_mos_entry
                    ok = mos is not None and mos >= 15 and et in ("buy", "stage")
                if ok:
                    today.add(t)
                continue
            if variant.startswith("V1") or variant == "V4_both":
                prev = eff.get(t)
                if prev is None or prev.get("analyzed_date") == v.get("analyzed_date"):
                    use = v if prev is None else prev
                    if prev is None:
                        eff[t] = v
                else:                          # a NEW analysis arrived
                    fam_new, fam_old = family(v), family(prev)
                    fv_new, fv_old = v.get("fair_value"), prev.get("fair_value")
                    big_move = (isinstance(fv_new, (int, float)) and
                                isinstance(fv_old, (int, float)) and fv_old and
                                abs(fv_new / fv_old - 1) >= fv_thr)
                    if fam_new == fam_old:
                        if pending.pop(t, None) is not None:
                            st["reverted"] += 1   # parked flip never confirmed
                        eff[t] = v
                    elif big_move or pending.get(t) == fam_new:
                        if pending.pop(t, None) == fam_new:
                            st["confirmed"] += 1
                        else:
                            st["big_move_adopt"] += 1
                        eff[t] = v
                    else:
                        st["parked"] += 1
                        pending[t] = fam_new   # park it; keep acting on prev verdict
                        eff[t] = {**prev, "analyzed_date": v.get("analyzed_date")}
                use = eff[t]
            else:
                use = v
            fam = family(use)
            if any(w in str(use.get("action") or "").upper() for w in HARD):
                member.discard(t)
                continue
            mos = mos_live(use, px_day.get(t))
            conv = conv_of(use, d)
            if variant in ("V3_sticky", "V4_both"):
                if t in member:
                    deep_stay = mos is not None and mos >= 25
                    stay = fam != "BEAR" and (deep_stay or
                           ((mos is None or mos >= 10) and conv >= 8.5))
                    if stay:
                        today.add(t)
                    else:
                        member.discard(t)
                elif rn_enter(use, fam, mos, conv):
                    today.add(t)
                    member.add(t)
            else:
                if rn_enter(use, fam, mos, conv):
                    today.add(t)
        out[d] = today
    return out


def replay(membership, cost_bps):
    cost = cost_bps / 10000.0
    cash, shares, marks = 100.0, {}, {}
    out_streak = {}
    traded = paid = 0.0
    n_trades = 0
    navs = []
    started = False
    for d in DATES:
        for t, p in DAYS[d]["px"].items():
            marks[t] = p
        cur = membership[d]
        if not started and cur:
            started = True
        if started:
            for t in list(shares):
                out_streak[t] = 0 if t in cur else out_streak.get(t, 0) + 1
                if out_streak[t] >= 2 and marks.get(t):
                    v = shares.pop(t) * marks[t]
                    cash += v * (1 - cost)
                    traded += v
                    paid += v * cost
                    n_trades += 1
            nav = cash + sum(sh * marks[t] for t, sh in shares.items() if marks.get(t))
            w = nav / max(len(cur) if cur else len(shares), 8)
            for t in sorted(cur - set(shares)):
                if not marks.get(t):
                    continue
                spend = min(w, cash)
                if spend < w * 0.9:
                    continue
                shares[t] = spend * (1 - cost) / marks[t]
                cash -= spend
                traded += spend
                paid += spend * cost
                n_trades += 1
        navs.append(cash + sum(sh * marks[t] for t, sh in shares.items() if marks.get(t)))
    peak, maxdd = navs[0], 0.0
    for n in navs:
        peak = max(peak, n)
        maxdd = min(maxdd, n / peak - 1)
    return {"ret_pct": round(navs[-1] / navs[0] * 100 - 100, 2),
            "max_dd_pct": round(maxdd * 100, 2),
            "turnover_x": round(traded / 100.0, 2),
            "cost_paid": round(paid, 2), "trades": n_trades}


# validation: V0 membership vs the actual recorded LLM sets
actual = {d: {t for t, s in DAYS[d]["signals"].items()
              if s.get("l") == "research_now" and s.get("lv") != "llm_reject"}
          for d in DATES}
v0 = build_membership("V0_asis")
overlaps = []
for d in DATES:
    a, b = actual[d], v0[d]
    if a or b:
        overlaps.append(len(a & b) / len(a | b))
print(f"V0 validation: mean Jaccard overlap with actual LLM sets = "
      f"{round(100 * sum(overlaps) / len(overlaps), 1)}% over {len(overlaps)} days")

results = {}
for variant in ("V0_asis", "V1_fv3", "V1_confirm", "V1_fv8", "V3_sticky", "V4_both",
                "V5_mos", "V5_mos_entry"):
    m = build_membership(variant)
    results[variant] = {f"{c}bps": replay(m, c) for c in (10, 25, 40)}
    avg_n = round(sum(len(m[d]) for d in DATES) / len(DATES), 1)
    results[variant]["avg_set_size"] = avg_n
(OUT / "stabilizer_results.json").write_text(json.dumps(results, indent=1),
                                             encoding="utf-8")
print(f"\n{'variant':<12} {'ret@10':>7} {'ret@25':>7} {'ret@40':>7} "
      f"{'DD@25':>7} {'trades':>7} {'turn':>6} {'avgN':>5}")
for v, sc in results.items():
    r = sc["25bps"]
    print(f"{v:<12} {sc['10bps']['ret_pct']:>7} {r['ret_pct']:>7} "
          f"{sc['40bps']['ret_pct']:>7} {r['max_dd_pct']:>7} {r['trades']:>7} "
          f"{r['turnover_x']:>6} {sc['avg_set_size']:>5}")
print("\nV1 mechanism stats (parked flips and their fate):")
for v, s in STATS.items():
    if v.startswith("V1"):
        print(f"  {v}: parked={s['parked']} reverted={s['reverted']} "
              f"confirmed={s['confirmed']} adopted-on-real-move={s['big_move_adopt']}")

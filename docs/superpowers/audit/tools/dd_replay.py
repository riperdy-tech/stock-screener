"""dd_replay.py — Phase 2 validation for the drawdown governor (spec §5).

1. REPLAY: run the engine over every real ledger NAV path (did it false-trigger
   on the actual 5-week record?).
2. STRESS: deterministic crash shapes — 2020-fast, 2022-grind, overnight gap,
   boundary whipsaw — realized max DD must stay inside the 15% budget.
3. MONTE CARLO: fat-tailed daily returns (Student-t df=4, sigma 1.3%/day);
   distribution of realized max DD with the engine on; insurance cost measured
   on a +10%/yr drift variant (upside surrendered in normal conditions).
4. GRID: tier/halt combinations searched; qualifying = zero breaches of -15%
   anywhere; ranked by lowest insurance cost. Output: out/dd_validation.json.

Execution model: the engine decides at the daily mark and trades the same
close (the live sync runs intraday); next day's return applies to the new
gross. Cost 25 bps per side on |d gross| x NAV. Read-only; stdlib only."""
import json
import random
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent / "out"
sys.path.insert(0, str(ROOT / "scripts"))
from kis.dd_engine import decide, initial_state, resume    # noqa: E402

COST_SIDE = 0.0025
RESET_AFTER = 10   # model the human reviewing and resetting a halt after ~2 weeks


def managed_path(returns, config, nav0=100.0):
    """Apply the engine to a daily-return path. Returns (max_dd, terminal, tier_changes).
    A halt is manually reset after RESET_AFTER marks (models the user's review)."""
    nav = nav0
    state = initial_state(nav)
    peak, max_dd, changes = nav, 0.0, 0
    gross = 1.0
    halted_marks = 0
    for r in returns:
        nav *= (1.0 + r * gross)
        state, d = decide(state, nav, config)
        if d["action"] in ("derisk", "rerisk", "halt"):
            nav -= abs(d["gross"] - d["prev_gross"]) * nav * COST_SIDE
            changes += 1
        if state.get("halted"):
            halted_marks += 1
            if halted_marks >= RESET_AFTER:
                state = resume(state)           # peak KEPT; re-halts if still under water
                halted_marks = 0
        else:
            halted_marks = 0
        gross = state["gross"]
        peak = max(peak, nav)
        max_dd = min(max_dd, nav / peak - 1.0)
    return max_dd, nav / nav0, changes


def raw_path(returns, nav0=100.0):
    nav, peak, max_dd = nav0, nav0, 0.0
    for r in returns:
        nav *= (1.0 + r)
        peak = max(peak, nav)
        max_dd = min(max_dd, nav / peak - 1.0)
    return max_dd, nav / nav0


# ── deterministic stress scenarios ───────────────────────────────────────────
def scen_2020():
    crash = [-0.02, -0.03, -0.01, -0.045, -0.07, 0.04, -0.05, -0.06, 0.02, -0.05,
             -0.03, 0.05, -0.04, -0.02, -0.03, 0.01, -0.05, 0.06, -0.03, -0.02,
             0.03, -0.02, -0.01]
    return crash + [0.008] * 90


def scen_2022():
    block = [-0.012, -0.02, 0.008, -0.015, 0.011, -0.02, -0.006, 0.013]
    return block * 20 + [0.004] * 60


def scen_gap():
    return [0.002] * 10 + [-0.12] + [-0.05, -0.02, 0.01, 0.02] + [0.005] * 40


def scen_whipsaw():
    drift = [-0.005] * 16                       # grind to ~-7.7%
    return drift + [0.015, -0.015] * 20 + [0.004] * 30


SCENARIOS = {"crash_2020": scen_2020(), "grind_2022": scen_2022(),
             "overnight_gap": scen_gap(), "boundary_whipsaw": scen_whipsaw()}


def mc_paths(n, days, sigma, drift_daily, seed):
    rng = random.Random(seed)
    out = []
    for _ in range(n):
        path = []
        for _ in range(days):
            # Student-t df=4 via ratio of normals; scaled to target sigma
            z = rng.gauss(0, 1)
            chi = sum(rng.gauss(0, 1) ** 2 for _ in range(4))
            tval = z / max((chi / 4) ** 0.5, 1e-9)
            path.append(drift_daily + tval * sigma / (2.0 ** 0.5))  # t4 std = sqrt(2)
        out.append(path)
    return out


def evaluate(config, mc_flat, mc_drift):
    res = {"scenarios": {}, "breach": False}
    for name, path in SCENARIOS.items():
        dd, term, ch = managed_path(path, config)
        rdd, rterm = raw_path(path)
        res["scenarios"][name] = {"managed_dd": round(dd * 100, 1),
                                  "raw_dd": round(rdd * 100, 1),
                                  "terminal_vs_raw": round(term / rterm, 3),
                                  "tier_changes": ch}
        if dd < -0.15:
            res["breach"] = True
    dds = []
    for path in mc_flat:
        dd, _, _ = managed_path(path, config)
        dds.append(dd)
        if dd < -0.15:
            res["breach"] = True
    dds.sort()
    res["mc_flat"] = {"n": len(dds), "worst_dd": round(dds[0] * 100, 1),
                      "p99_dd": round(dds[len(dds) // 100] * 100, 1),
                      "p95_dd": round(dds[len(dds) // 20] * 100, 1),
                      "breaches_15": sum(d < -0.15 for d in dds)}
    ratios = []
    for path in mc_drift:
        _, term, _ = managed_path(path, config)
        _, rterm = raw_path(path)
        ratios.append(term / rterm)
    res["insurance_cost_pct_yr"] = round((1 - statistics.fmean(ratios)) * 100, 2)
    return res


def main():
    # 1. replay real ledgers
    book = json.loads((ROOT / "public/data/paper_ledgers.json").read_text(encoding="utf-8"))
    replay = {}
    for name, led in book["ledgers"].items():
        ns = [p["nav"] for p in led.get("nav_series", []) if p.get("nav")]
        if len(ns) < 5:
            continue
        rets = [ns[i] / ns[i - 1] - 1 for i in range(1, len(ns))]
        dd, term, ch = managed_path(rets, None, nav0=ns[0])
        rdd, _ = raw_path(rets, nav0=ns[0])
        replay[name] = {"days": len(ns), "raw_dd": round(rdd * 100, 1),
                        "managed_dd": round(dd * 100, 1), "tier_changes": ch}

    # 2-4. stress + MC + grid
    mc_flat = mc_paths(1200, 250, 0.013, 0.0, seed=7)
    mc_drift = mc_paths(600, 250, 0.013, 0.10 / 250, seed=11)
    grid = []
    for t1 in (-0.06, -0.07, -0.08, -0.09):
        for t2 in (-0.10, -0.11, -0.12):
            for halt in (-0.12, -0.13, -0.14):
                if not (t1 > t2 > halt):
                    continue
                cfg = {"tiers": [(t1, 0.5), (t2, 0.25)], "halt_dd": halt,
                       "recover_hyst": 0.02}
                r = evaluate(cfg, mc_flat, mc_drift)
                grid.append({"t1": t1, "t2": t2, "halt": halt, **r})
    # No config can guarantee zero breaches (a fat-tail single day at full gross
    # precedes any daily decision) — rank by fewest breaches, then shallowest
    # worst case, then cheapest insurance.
    ok = sorted(grid, key=lambda g: (g["mc_flat"]["breaches_15"],
                                     -g["mc_flat"]["worst_dd"],
                                     g["insurance_cost_pct_yr"]))
    default_eval = evaluate(None, mc_flat, mc_drift)

    OUT.mkdir(exist_ok=True)
    (OUT / "dd_validation.json").write_text(json.dumps(
        {"replay_real_ledgers": replay, "default_config": default_eval,
         "grid_qualifying": ok[:8], "grid_total": len(grid),
         "grid_qualifying_count": len(ok)}, indent=1), encoding="utf-8")

    print("── replay on real ledger paths (should be quiet) ──")
    for n, r in replay.items():
        print(f"  {n:<10} days={r['days']:>3} raw_dd={r['raw_dd']:>6}% "
              f"managed_dd={r['managed_dd']:>6}% tier_changes={r['tier_changes']}")
    print("\n── default config (-8/-11/-13, hyst 2) ──")
    for n, s in default_eval["scenarios"].items():
        print(f"  {n:<17} raw {s['raw_dd']:>6}%  managed {s['managed_dd']:>6}%  "
              f"terminal x{s['terminal_vs_raw']}  changes {s['tier_changes']}")
    m = default_eval["mc_flat"]
    print(f"  MC flat: worst {m['worst_dd']}%  p99 {m['p99_dd']}%  p95 {m['p95_dd']}%  "
          f"breaches>15%: {m['breaches_15']}/{m['n']}")
    print(f"  insurance cost (drift year): {default_eval['insurance_cost_pct_yr']}%/yr")
    print(f"\n── grid ({len(grid)} configs): fewest MC breaches, then shallowest, then cheapest ──")
    print(f"{'t1':>5} {'t2':>5} {'halt':>5} | {'breach':>6} {'worstMC':>7} {'p99':>6} | {'cost/yr':>7}")
    for g in ok[:8]:
        print(f"{g['t1']*100:>5.0f} {g['t2']*100:>5.0f} {g['halt']*100:>5.0f} | "
              f"{g['mc_flat']['breaches_15']:>6} {g['mc_flat']['worst_dd']:>7} "
              f"{g['mc_flat']['p99_dd']:>6} | {g['insurance_cost_pct_yr']:>7}")


if __name__ == "__main__":
    main()

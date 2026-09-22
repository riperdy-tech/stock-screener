"""run_benchmark.py — Tier 3 Comparative Calibration Harness.

Runs Candidate A (Static), Candidate B (LLM), and Candidate C (Hybrid)
across the 50-stock frozen benchmark and outputs a quantitative comparison matrix.
"""

import json
import os
import sys
import time
from pathlib import Path
from typing import Dict, Any, List

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DATA = ROOT / "public" / "data"

sys.path.insert(0, str(HERE))
from candidate_a_static import evaluate_static
from candidate_b_llm import evaluate_llm
from candidate_c_hybrid import evaluate_hybrid


def main():
    print("=" * 70)
    print("TIER 3 SMART PRE-FILTER BENCHMARK HARNESS (50-STOCK FROZEN SET)")
    print("=" * 70)
    
    bench_file = HERE / "benchmark_cohorts.json"
    bench = json.loads(bench_file.read_text(encoding="utf-8"))
    cohorts = bench["cohorts"]
    
    stocks_list = json.loads((DATA / "stocks.json").read_text(encoding="utf-8"))
    stocks = {s["symbol"]: s for s in stocks_list if s.get("symbol")}
    fundamentals = json.loads((DATA / "fundamentals_history.json").read_text(encoding="utf-8")).get("tickers", {})
    
    all_tickers = []
    ticker_to_cohort = {}
    for c_name, c_data in cohorts.items():
        for item in c_data["tickers"]:
            t = item["ticker"]
            all_tickers.append(t)
            ticker_to_cohort[t] = c_name
            
    print(f"Loaded {len(all_tickers)} benchmark tickers across 4 cohorts:")
    for c_name, c_data in cohorts.items():
        print(f"  - {c_name}: {len(c_data['tickers'])} tickers (Target: {c_data['target_behavior']})")
        
    results = {
        "candidate_a_static": {"cases": {}, "total_time_s": 0.0},
        "candidate_b_llm": {"cases": {}, "total_time_s": 0.0},
        "candidate_c_hybrid": {"cases": {}, "total_time_s": 0.0}
    }
    
    # ── 1. Run Candidate A (Static) ──────────────────────────────────────────
    print("\n[1/3] Running Candidate A: Pure Static Structural Heuristics...")
    t0 = time.time()
    for t in all_tickers:
        sm = stocks.get(t, {})
        fh = fundamentals.get(t, {})
        res = evaluate_static(t, sm, fh)
        results["candidate_a_static"]["cases"][t] = res
    results["candidate_a_static"]["total_time_s"] = round(time.time() - t0, 3)
    print(f"Candidate A finished in {results['candidate_a_static']['total_time_s']}s")
    
    # ── 2. Run Candidate B (LLM) ─────────────────────────────────────────────
    print("\n[2/3] Running Candidate B: Bounded Qwen 3.8 27B Qualitative...")
    t0 = time.time()
    for idx, t in enumerate(all_tickers, 1):
        sm = stocks.get(t, {})
        fh = fundamentals.get(t, {})
        res = evaluate_llm(t, sm, fh)
        results["candidate_b_llm"]["cases"][t] = res
        print(f"  [{idx:02d}/{len(all_tickers)}] {t:5s} -> {res['decision']:4s} ({res.get('elapsed_s', 0)}s) | {res.get('moat_rating')} | {res.get('rationale')[:60]}...")
    results["candidate_b_llm"]["total_time_s"] = round(time.time() - t0, 3)
    print(f"Candidate B finished in {results['candidate_b_llm']['total_time_s']}s")
    
    # ── 3. Run Candidate C (Hybrid) ──────────────────────────────────────────
    print("\n[3/3] Running Candidate C: Hybrid Staged Gate...")
    t0 = time.time()
    hybrid_time = 0.0
    for idx, t in enumerate(all_tickers, 1):
        res_static = results["candidate_a_static"]["cases"][t]
        res_llm = results["candidate_b_llm"]["cases"][t]
        
        if res_static["decision"] == "VETO":
            res_c = {
                "ticker": t,
                "decision": "VETO",
                "stage_vetoed": "STAGE_1_STATIC",
                "moat_rating": "NONE_OR_TRAP",
                "cliff_risk": True,
                "cyclical_peak": False,
                "static_flags": res_static["flags"],
                "rationale": f"Static structural failure: {'; '.join(res_static['reasons'])}",
                "elapsed_s": 0.001,
                "llm_called": False
            }
            hybrid_time += 0.001
        else:
            final_decision = "VETO" if res_llm.get("decision") == "VETO" else "PASS"
            llm_time = res_llm.get("elapsed_s", 0.0)
            hybrid_time += llm_time
            res_c = {
                "ticker": t,
                "decision": final_decision,
                "stage_vetoed": "STAGE_2_LLM" if final_decision == "VETO" else "NONE",
                "moat_rating": res_llm.get("moat_rating", "MODERATE"),
                "cliff_risk": res_llm.get("cliff_risk", False),
                "cyclical_peak": res_llm.get("cyclical_peak", False),
                "static_flags": res_static["flags"],
                "rationale": res_llm.get("rationale", "Passed hybrid screening."),
                "elapsed_s": llm_time,
                "llm_called": True,
                "error": res_llm.get("error")
            }
        results["candidate_c_hybrid"]["cases"][t] = res_c
        print(f"  [{idx:02d}/{len(all_tickers)}] {t:5s} -> {res_c['decision']:4s} (by {res_c['stage_vetoed']:14s}, {res_c['elapsed_s']}s)")
    results["candidate_c_hybrid"]["total_time_s"] = round(hybrid_time, 3)
    print(f"Candidate C finished (effective time: {results['candidate_c_hybrid']['total_time_s']}s)")
    
    # ── 4. Score Matrix Computation ─────────────────────────────────────────
    def compute_metrics(arm_name: str) -> Dict[str, Any]:
        cases = results[arm_name]["cases"]
        traps = [cases[item["ticker"]] for item in cohorts["traps"]["tickers"]]
        compounders = [cases[item["ticker"]] for item in cohorts["compounders"]["tickers"]]
        cyclicals = [cases[item["ticker"]] for item in cohorts["cyclicals"]["tickers"]]
        biotechs = [cases[item["ticker"]] for item in cohorts["high_risk_biotech_tech"]["tickers"]]
        
        traps_vetoed = sum(1 for c in traps if c["decision"] == "VETO")
        compounders_passed = sum(1 for c in compounders if c["decision"] == "PASS")
        compounders_vetoed = sum(1 for c in compounders if c["decision"] == "VETO")
        cyclicals_passed = sum(1 for c in cyclicals if c["decision"] == "PASS")
        biotechs_passed = sum(1 for c in biotechs if c["decision"] == "PASS")
        
        trap_catch_rate = (traps_vetoed / len(traps)) * 100.0
        comp_preservation_rate = (compounders_passed / len(compounders)) * 100.0
        false_reject_rate = (compounders_vetoed / len(compounders)) * 100.0
        
        total_time = results[arm_name]["total_time_s"]
        avg_time = round(total_time / len(all_tickers), 3)
        
        return {
            "arm": arm_name,
            "traps_vetoed": f"{traps_vetoed}/{len(traps)}",
            "trap_catch_rate_pct": round(trap_catch_rate, 1),
            "compounders_passed": f"{compounders_passed}/{len(compounders)}",
            "comp_preservation_pct": round(comp_preservation_rate, 1),
            "false_rejection_pct": round(false_reject_rate, 1),
            "cyclicals_passed": f"{cyclicals_passed}/{len(cyclicals)}",
            "biotechs_passed": f"{biotechs_passed}/{len(biotechs)}",
            "total_time_s": total_time,
            "avg_time_per_ticker_s": avg_time
        }
        
    metrics_a = compute_metrics("candidate_a_static")
    metrics_b = compute_metrics("candidate_b_llm")
    metrics_c = compute_metrics("candidate_c_hybrid")
    
    summary = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "benchmark_tickers_count": len(all_tickers),
        "score_matrix": [metrics_a, metrics_b, metrics_c],
        "detailed_results": results
    }
    
    out_file = HERE / "tier3_benchmark_results.json"
    out_file.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"\nSaved complete benchmark results to: {out_file}")
    
    # Print formatted comparison table
    print("\n" + "=" * 85)
    print("TIER 3 BENCHMARK COMPARISON MATRIX")
    print("=" * 85)
    header = f"{'Arm':<22} | {'Trap Catch':<12} | {'False Rejects':<14} | {'Comp Preserv':<14} | {'Avg Latency':<12}"
    print(header)
    print("-" * 85)
    for m in [metrics_a, metrics_b, metrics_c]:
        line = f"{m['arm']:<22} | {m['trap_catch_rate_pct']:>5.1f}% ({m['traps_vetoed']:<4}) | {m['false_rejection_pct']:>5.1f}% ({m['comp_preservation_pct']:<4}%) | {m['comp_preservation_pct']:>5.1f}% ({m['compounders_passed']:<4}) | {m['avg_time_per_ticker_s']:>6.3f}s"
        print(line)
    print("=" * 85)


if __name__ == "__main__":
    main()

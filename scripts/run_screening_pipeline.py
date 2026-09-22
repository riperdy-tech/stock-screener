"""run_screening_pipeline.py — Master End-to-End Screener Pipeline (Tiers 1, 2, and 3).

Executes the unified forward funnel:
  1. Tier 1: Retail Hygiene & SEC Statutory Filing Compliance (6,900+ -> ~3,460)
  2. Tier 2: Dual-Door Quantitative Sifter with 145 Canonical Industries & Dynamic Door Allocation (~3,460 -> ~135)
  3. Tier 3: Candidate C Hybrid Smart Pre-Filter Gate (Vetoes Value Traps via Fast Static + Bounded LLM Reasoning)

Usage:
  python scripts/run_screening_pipeline.py
  python scripts/run_screening_pipeline.py --tier3-llm-sample 10  # test with 10 LLM evaluations
  python scripts/run_screening_pipeline.py --skip-tier3-llm      # run static checks only
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT / "scripts"
DATA_DIR = ROOT / "public" / "data"

sys.path.append(str(SCRIPTS_DIR))
sys.path.append(str(SCRIPTS_DIR / "tier3_calibration"))

from filter_tier1_hygiene import evaluate_tier1
import score_factors_dual_door
from candidate_c_hybrid import evaluate_hybrid


def load_json(p: Path, default=None):
    if not p.exists():
        return default
    with p.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_json(p: Path, data: Any):
    with p.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def main():
    parser = argparse.ArgumentParser(description="Run End-to-End Tiers 1-3 Screening Pipeline")
    parser.add_argument("--tier3-llm-sample", type=int, default=15,
                        help="Number of nominees to evaluate through Tier 3 LLM (default: 15 for fast benchmarking, 0 for all)")
    parser.add_argument("--skip-tier3-llm", action="store_true",
                        help="Skip LLM qualitative gate and only run Tier 3 Stage 1 static checks")
    args = parser.parse_args()

    print("=" * 80)
    print("STARTING END-TO-END SCREENING PIPELINE (TIERS 1 -> 2 -> 3)")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 80)
    
    t_start = time.time()

    # ---------------------------------------------------------
    # STEP 1: TIER 1 RETAIL HYGIENE & SEC STATUTORY REPORTING
    # ---------------------------------------------------------
    print("\n>>> STEP 1: EXECUTING TIER 1 RETAIL HYGIENE & SEC COMPLIANCE...")
    t1_t0 = time.time()
    t1_survivors = evaluate_tier1()
    t1_duration = round(time.time() - t1_t0, 2)
    print(f"✅ Tier 1 Complete in {t1_duration}s. Survivors: {len(t1_survivors)} clean equities.")

    # ---------------------------------------------------------
    # STEP 2: TIER 2 DUAL-DOOR QUANTITATIVE SIFTER
    # ---------------------------------------------------------
    print("\n>>> STEP 2: EXECUTING TIER 2 DUAL-DOOR QUANTITATIVE SIFTER...")
    t2_t0 = time.time()
    score_factors_dual_door.main()
    t2_duration = round(time.time() - t2_t0, 2)
    
    dual_door_path = DATA_DIR / "factor_scores_dual_door.json"
    dual_door_data = load_json(dual_door_path, {})
    nominated_tickers = dual_door_data.get("nominated_tickers", [])
    profiles = dual_door_data.get("profiles", {})
    nominees = [profiles[t] for t in nominated_tickers if t in profiles]
    print(f"✅ Tier 2 Complete in {t2_duration}s. Nominated Pool: {len(nominees)} candidates.")

    # ---------------------------------------------------------
    # STEP 3: TIER 3 CANDIDATE C HYBRID PRE-FILTER GATE
    # ---------------------------------------------------------
    print("\n>>> STEP 3: EXECUTING TIER 3 HYBRID SMART PRE-FILTER GATE (CANDIDATE C)...")
    t3_t0 = time.time()

    stocks_data = load_json(DATA_DIR / "stocks.json", [])
    stocks_meta = {s["symbol"]: s for s in stocks_data if s.get("symbol")}
    fundamentals = (load_json(DATA_DIR / "fundamentals_history.json", {}) or {}).get("tickers", {})

    tier3_results = []
    passed_survivors = []
    vetoed_traps = []

    # Decide how many nominees to run through LLM
    eval_pool = nominees
    llm_budget = args.tier3_llm_sample if args.tier3_llm_sample > 0 else len(nominees)
    if args.skip_tier3_llm:
        llm_budget = 0

    print(f"Evaluating {len(eval_pool)} Tier 2 nominees through Tier 3 Candidate C...")
    print(f"LLM Reasoning Budget: {'Disabled (Static only)' if llm_budget == 0 else f'First {llm_budget} candidates'}")

    llm_calls_made = 0
    for idx, cand in enumerate(eval_pool):
        ticker = cand["ticker"]
        stock_meta = stocks_meta.get(ticker, {})
        fh = fundamentals.get(ticker, {})

        if llm_calls_made >= llm_budget:
            # Fall back to fast static check only once LLM sample budget is reached
            from candidate_a_static import evaluate_static
            res_static = evaluate_static(ticker, stock_meta, fh)
            res = {
                "ticker": ticker,
                "decision": res_static["decision"],
                "stage_vetoed": "STAGE_1_STATIC" if res_static["decision"] == "VETO" else "NONE",
                "moat_rating": "STATIC_PASS",
                "cliff_risk": False,
                "cyclical_peak": False,
                "static_flags": res_static["flags"],
                "rationale": "; ".join(res_static["reasons"]) if res_static["reasons"] else "Passed static balance sheet filter.",
                "elapsed_s": 0.001,
                "llm_called": False
            }
        else:
            res = evaluate_hybrid(ticker, stock_meta, fh)
            if res.get("llm_called"):
                llm_calls_made += 1

        cand_result = {
            **cand,
            "tier3_decision": res["decision"],
            "tier3_stage": res.get("stage_vetoed"),
            "moat_rating": res.get("moat_rating"),
            "cliff_risk": res.get("cliff_risk"),
            "cyclical_peak": res.get("cyclical_peak"),
            "tier3_rationale": res.get("rationale"),
            "static_flags": res.get("static_flags", []),
            "eval_time_s": res.get("elapsed_s", 0.0)
        }
        tier3_results.append(cand_result)

        doors_str = "/".join(cand.get("nominated_doors", []))
        if res["decision"] == "VETO":
            vetoed_traps.append(cand_result)
            print(f"  ❌ [{idx+1}/{len(eval_pool)}] VETO: {ticker:<5} ({doors_str}) -> {res.get('stage_vetoed')}: {res.get('rationale', '')[:80]}")
        else:
            passed_survivors.append(cand_result)
            print(f"  ✅ [{idx+1}/{len(eval_pool)}] PASS: {ticker:<5} ({doors_str}) [{res.get('moat_rating')}] -> {res.get('rationale', '')[:70]}")

    t3_duration = round(time.time() - t3_t0, 2)
    
    # Save outputs
    tier3_out_path = DATA_DIR / "tier3_survivors.json"
    tier3_audit_path = DATA_DIR / "tier3_audit.json"
    
    save_json(tier3_out_path, {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_evaluated": len(tier3_results),
        "passed_count": len(passed_survivors),
        "vetoed_count": len(vetoed_traps),
        "survivors": passed_survivors
    })
    
    save_json(tier3_audit_path, {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_evaluated": len(tier3_results),
        "passed": [s["ticker"] for s in passed_survivors],
        "vetoed": [v["ticker"] for v in vetoed_traps],
        "full_results": tier3_results
    })

    # ---------------------------------------------------------
    # FINAL FUNNEL SUMMARY
    # ---------------------------------------------------------
    total_time = round(time.time() - t_start, 2)
    t3_eval_count = len(tier3_results)
    veto_pct = (len(vetoed_traps) / t3_eval_count * 100.0) if t3_eval_count > 0 else 0.0
    pass_pct = (len(passed_survivors) / t3_eval_count * 100.0) if t3_eval_count > 0 else 0.0
    
    print("\n" + "=" * 80)
    print("SCREENING PIPELINE FUNNEL SUMMARY (TIERS 1 -> 2 -> 3)")
    print("=" * 80)
    print(f"  • Universal Equity Database:      6,926 equities")
    print(f"  • Tier 1 Hygiene Survivors:       {len(t1_survivors)} clean equities ({len(t1_survivors)/6926*100:.1f}%)")
    print(f"  • Tier 2 Nominated Candidates:    {len(nominees)} candidates")
    print(f"      - Door 1 (Compounders):       {dual_door_data.get('door1_compounders_count', 0)}")
    print(f"      - Door 2 (Deep Value Gap):    {dual_door_data.get('door2_value_gaps_count', 0)}")
    print(f"      - Dual-Door Overlap:          {dual_door_data.get('overlap_both_doors_count', 0)}")
    print(f"  • Tier 3 Pre-Filter Evaluated:    {t3_eval_count} candidates")
    print(f"      - Traps Vetoed:               {len(vetoed_traps)} ({veto_pct:.1f}%)")
    print(f"      - Pristine Survivors for RS2: {len(passed_survivors)} ({pass_pct:.1f}%)")
    print(f"  • Total Pipeline Execution Time:  {total_time}s (Tier 1: {t1_duration}s | Tier 2: {t2_duration}s | Tier 3: {t3_duration}s)")
    print(f"  • Output Manifest Written to:     {tier3_out_path}")
    print("=" * 80)
    print("\nNext step: Tier 3 survivors are now ready to feed directly into the RS2 Local underwriting benchmark!")



if __name__ == "__main__":
    main()

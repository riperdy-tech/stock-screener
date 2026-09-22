"""candidate_c_hybrid.py — Hybrid Staged Filter for Tier 3.

Combines fast static structural vetoes with bounded Qwen 27B qualitative reasoning.
- Stage 1: Static structural heuristics filter out obvious balance sheet / debt disasters (instant).
- Stage 2: Bounded LLM evaluates surviving candidates for qualitative moat decay, cliff risk, and trap dynamics.
"""

import sys
from pathlib import Path
from typing import Dict, Any

CALIB_DIR = Path(__file__).resolve().parent
if str(CALIB_DIR) not in sys.path:
    sys.path.append(str(CALIB_DIR))

from candidate_a_static import evaluate_static
from candidate_b_llm import evaluate_llm


def evaluate_hybrid(ticker: str, stock_meta: Dict[str, Any], fundamentals_history: Dict[str, Any]) -> Dict[str, Any]:
    # Stage 1: Fast Static Filter
    res_static = evaluate_static(ticker, stock_meta, fundamentals_history)
    
    # If static filter firmly vetoes (2+ hard flags), reject immediately (saves GPU time)
    if res_static["decision"] == "VETO":
        return {
            "ticker": ticker,
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
        
    # Stage 2: Bounded LLM Qualitative Filter for surviving candidates
    res_llm = evaluate_llm(ticker, stock_meta, fundamentals_history)
    
    final_decision = "VETO" if res_llm.get("decision") == "VETO" else "PASS"
    
    return {
        "ticker": ticker,
        "decision": final_decision,
        "stage_vetoed": "STAGE_2_LLM" if final_decision == "VETO" else "NONE",
        "moat_rating": res_llm.get("moat_rating", "MODERATE"),
        "cliff_risk": res_llm.get("cliff_risk", False),
        "cyclical_peak": res_llm.get("cyclical_peak", False),
        "static_flags": res_static["flags"],
        "rationale": res_llm.get("rationale", "Passed hybrid screening."),
        "elapsed_s": res_llm.get("elapsed_s", 0.0),
        "llm_called": True,
        "error": res_llm.get("error")
    }

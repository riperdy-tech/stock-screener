"""candidate_a_static.py — Pure Static Structural Heuristic Filter for Tier 3.

Evaluates deterministic accounting and structural business deterioration signals
without calling any LLM.
"""

from typing import Dict, Any, Tuple, List


def evaluate_static(ticker: str, stock_meta: Dict[str, Any], fundamentals_history: Dict[str, Any]) -> Dict[str, Any]:
    flags: List[str] = []
    reasons: List[str] = []
    
    if not fundamentals_history:
        return {
            "ticker": ticker,
            "decision": "PASS",
            "flags": ["NO_FUNDAMENTAL_HISTORY"],
            "score": 50,
            "reasons": ["Insufficient historical data for static veto; passes to next gate."]
        }
        
    years = sorted([int(y) for y in fundamentals_history.keys()])
    if len(years) < 2:
        return {
            "ticker": ticker,
            "decision": "PASS",
            "flags": ["SHORT_HISTORY"],
            "score": 50,
            "reasons": ["History under 2 years; passes to next gate."]
        }
        
    latest_y = str(years[-1])
    prev_y = str(years[-2])
    oldest_y = str(years[0])
    
    latest = fundamentals_history.get(latest_y, {})
    prev = fundamentals_history.get(prev_y, {})
    oldest = fundamentals_history.get(oldest_y, {})
    
    # 1. Gross Margin Decay (> 300 bps compression over multi-year span)
    rev_lat, gp_lat = latest.get("revenue"), latest.get("gross_profit")
    rev_old, gp_old = oldest.get("revenue"), oldest.get("gross_profit")
    if rev_lat and gp_lat and rev_old and gp_old and rev_lat > 0 and rev_old > 0:
        gm_lat = gp_lat / rev_lat
        gm_old = gp_old / rev_old
        if (gm_lat - gm_old) < -0.03:
            flags.append("GROSS_MARGIN_DECAY")
            reasons.append(f"Gross margin collapsed {(gm_lat - gm_old)*100:.1f}pts from {gm_old*100:.1f}% to {gm_lat*100:.1f}%")

    # 2. Severe Debt Burden (Operating Income < 0 with massive debt OR Debt/EBITDA > 5x)
    op_inc = latest.get("operating_income") or 0.0
    lt_debt = latest.get("lt_debt") or 0.0
    cash = latest.get("cash") or 0.0
    net_debt = lt_debt - cash
    da = latest.get("da") or 0.0
    ebitda = op_inc + da
    
    if op_inc < 0 and lt_debt > 1e9:
        flags.append("NEGATIVE_OPINC_HIGH_DEBT")
        reasons.append(f"Operating income is negative (${op_inc/1e9:.2f}B) against ${lt_debt/1e9:.2f}B of long-term debt")
    elif ebitda > 0 and net_debt > 0 and (net_debt / ebitda) > 5.0:
        flags.append("EXCESSIVE_LEVERAGE")
        reasons.append(f"Net Debt to EBITDA is dangerously high at {(net_debt/ebitda):.1f}x")

    # 3. Persistent FCF Cash Drain (Negative FCF in both latest and prior year with net debt)
    fcf_lat = latest.get("fcf")
    fcf_prev = prev.get("fcf")
    if fcf_lat is not None and fcf_prev is not None:
        if fcf_lat < 0 and fcf_prev < 0 and net_debt > 0:
            flags.append("PERSISTENT_FCF_BURN")
            reasons.append(f"Consecutive negative FCF (${fcf_lat/1e9:.2f}B latest, ${fcf_prev/1e9:.2f}B prior) while holding net debt")

    # 4. Dilution Bleed (Shares growing > 5% CAGR without revenue growth, excluding splits)
    sh_lat = latest.get("shares_diluted") or latest.get("shares_basic")
    sh_old = oldest.get("shares_diluted") or oldest.get("shares_basic")
    num_years = max(1, years[-1] - years[0])
    if sh_lat and sh_old and sh_old > 0 and num_years >= 2:
        # Check if single-year step of >80% happened (stock split signature)
        has_split = False
        for i in range(len(years) - 1):
            s_cur = fundamentals_history[str(years[i+1])].get("shares_diluted") or fundamentals_history[str(years[i+1])].get("shares_basic")
            s_prev = fundamentals_history[str(years[i])].get("shares_diluted") or fundamentals_history[str(years[i])].get("shares_basic")
            if s_cur and s_prev and s_prev > 0 and (s_cur / s_prev) >= 1.75:
                has_split = True
                break
        if not has_split:
            sh_cagr = (sh_lat / sh_old) ** (1.0 / num_years) - 1.0
            rev_cagr = (rev_lat / rev_old) ** (1.0 / num_years) - 1.0 if rev_lat and rev_old and rev_old > 0 and rev_lat > 0 else 0.0
            if sh_cagr > 0.05 and sh_cagr > rev_cagr:
                flags.append("SHARE_DILUTION_BLEED")
                reasons.append(f"Share count compounded at {sh_cagr*100:.1f}%/yr while revenue compounded at {rev_cagr*100:.1f}%/yr")

    # 5. Top-Line Structural Contraction (Revenue CAGR < -3%/yr over 3+ years)
    if num_years >= 3 and rev_lat and rev_old and rev_old > 0 and rev_lat > 0:
        rev_cagr = (rev_lat / rev_old) ** (1.0 / num_years) - 1.0
        if rev_cagr < -0.03:
            flags.append("TOPLINE_STRUCTURAL_CONTRACTION")
            reasons.append(f"Revenue contracting at {rev_cagr*100:.1f}% CAGR over {num_years} years")

    # VETO Decision: 2 or more major structural failure flags
    decision = "VETO" if len(flags) >= 2 else "PASS"
    score = max(0, 100 - len(flags) * 35)

    return {
        "ticker": ticker,
        "decision": decision,
        "flags": flags,
        "score": score,
        "reasons": reasons if reasons else ["No severe structural red flags detected."]
    }

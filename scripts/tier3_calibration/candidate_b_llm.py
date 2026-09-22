"""candidate_b_llm.py — Bounded Qwen 3.8 27B Qualitative Evaluation Filter for Tier 3.

Calls local Ollama with a compact prompt and low token budget to judge
economic moat, binary cliff risks, and secular terminal decline traps.
"""

import json
import time
import urllib.request
from typing import Dict, Any, List


MODEL = "rs2-analyst-deep-mtp5"
OLLAMA_ENDPOINT = "http://127.0.0.1:11434/api/chat"


def format_summary_context(ticker: str, stock_meta: Dict[str, Any], fundamentals_history: Dict[str, Any]) -> str:
    sector = stock_meta.get("sector") or "Unknown"
    industry = stock_meta.get("industry") or "Unknown"
    mcap = stock_meta.get("marketCap")
    mcap_str = f"${mcap/1e9:.2f}B" if mcap else "Unknown"
    
    lines = [
        f"Ticker: {ticker} | Sector: {sector} | Industry: {industry} | Market Cap: {mcap_str}",
        "Recent Financial Trend (Fiscal Years):"
    ]
    
    years = sorted([int(y) for y in fundamentals_history.keys()])[-4:]
    for y in years:
        row = fundamentals_history[str(y)]
        rev = row.get("revenue")
        op = row.get("operating_income")
        fcf = row.get("fcf")
        lt_debt = row.get("lt_debt")
        gp = row.get("gross_profit")
        
        rev_s = f"${rev/1e9:.2f}B" if rev else "N/A"
        gm_s = f"{(gp/rev)*100:.1f}%" if gp and rev and rev > 0 else "N/A"
        op_s = f"${op/1e9:.2f}B" if op else "N/A"
        fcf_s = f"${fcf/1e9:.2f}B" if fcf else "N/A"
        debt_s = f"${lt_debt/1e9:.2f}B" if lt_debt else "N/A"
        lines.append(f"  FY{y}: Revenue {rev_s} | GrossMargin {gm_s} | OpIncome {op_s} | FCF {fcf_s} | Debt {debt_s}")
        
    return "\n".join(lines)


SYSTEM_PROMPT = """You are a senior hedge fund credit and equity risk analyst acting as a Tier 3 investment gatekeeper.
Your job is to screen out VALUE TRAPS, SECULAR DECLINERS, DEBT DISTRESS, and TERMINAL CLIFFS before deep valuation.

You must respond ONLY with a single valid JSON object matching this exact schema:
{
  "moat_rating": "DURABLE" | "MODERATE" | "NONE_OR_TRAP",
  "cliff_risk": true | false,
  "cyclical_peak": true | false,
  "decision": "PASS" | "VETO",
  "rationale": "<1-2 sentences explaining why this business is investable or a trap>"
}

Rules:
1. If the company is facing structural secular decline (e.g. legacy wireline, dying retail, structural share loss to competitors) or unsustainable debt distress, decision MUST be VETO.
2. If the company is a high-quality compounder or solid business with a durable moat, decision MUST be PASS.
3. If it is a normal cyclical company with a healthy balance sheet, decision is PASS (with cyclical_peak noted if applicable).
4. Output JSON ONLY. No markdown, no preface, no trailing text.
"""


def evaluate_llm(ticker: str, stock_meta: Dict[str, Any], fundamentals_history: Dict[str, Any], timeout: int = 60) -> Dict[str, Any]:
    context = format_summary_context(ticker, stock_meta, fundamentals_history)
    prompt = f"Evaluate this company for Tier 3 investability:\n\n{context}\n\nReturn JSON:"
    
    payload = {
        "model": MODEL,
        "stream": False,
        "think": "low",  # fast reasoning effort to keep latency low (<30s)
        "format": "json",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        "options": {
            "num_ctx": 4096,
            "num_predict": 1024,
            "temperature": 0.1
        }
    }
    
    t0 = time.time()
    try:
        req = urllib.request.Request(
            OLLAMA_ENDPOINT,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            elapsed = round(time.time() - t0, 2)
            content = data.get("message", {}).get("content", "").strip()
            
            # Robust JSON extraction
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            content = content.strip()
            
            # Find outermost JSON object
            s_idx = content.find("{")
            e_idx = content.rfind("}")
            if s_idx != -1 and e_idx != -1:
                content = content[s_idx:e_idx+1]
                
            parsed = json.loads(content)
            parsed["ticker"] = ticker
            parsed["elapsed_s"] = elapsed
            parsed["error"] = None
            return parsed
            
    except Exception as exc:
        elapsed = round(time.time() - t0, 2)
        return {
            "ticker": ticker,
            "moat_rating": "UNKNOWN",
            "cliff_risk": False,
            "cyclical_peak": False,
            "decision": "PASS",  # Fail-open with warning
            "rationale": f"LLM evaluation failed or timed out: {str(exc)}",
            "elapsed_s": elapsed,
            "error": str(exc)
        }

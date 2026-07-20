"""Cross the current overlay against current factor scores: for every RS2
ticker, what did the guardrail decide. Anomaly rules (P0 candidates):
  A) a name carries an LLM band while quant fct_veto is set (veto bypass);
  B) a hard-sell action sits inside the LLM research_now set.
Unscorable-but-unvetoed names keeping a verdict is BY DESIGN (red-flag
filter, not coverage filter — score_factors.py:199-204). Read-only."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent / "out"
ov = json.loads((ROOT / "public/data/llm_overlay.json").read_text(encoding="utf-8")).get("tickers", {})
fs_doc = json.loads((ROOT / "public/data/factor_scores.json").read_text(encoding="utf-8"))
fs = fs_doc.get("tickers", {})
HARD_SELL = ("AVOID", "SELL", "SHORT")

trace, anomalies, stats = {}, [], {
    "overlay_generated_at": None, "factor_generated_at": fs_doc.get("generated_at"),
    "rs2_tickers": len(ov), "not_in_factor_scores": 0, "blocked_by_quant_veto": 0,
    "llm_rn": 0, "llm_watchlist": 0, "llm_demoted": 0, "llm_reject": 0,
    "exit_reviews_active": 0, "stale_verdicts_gt14d": 0,
}
from datetime import date
for t, v in ov.items():
    e = fs.get(t)
    if not e:
        stats["not_in_factor_scores"] += 1
        continue
    row = {
        "rs2_action": v.get("action"), "conviction": v.get("conviction"),
        "analyzed_date": v.get("analyzed_date"), "exit_review": v.get("exit_review"),
        "quant_band": e.get("fct_band"), "quant_veto": e.get("fct_veto"),
        "llm_band": e.get("fct_band_llm"), "llm_flag": e.get("fct_llm"),
        "llm_veto": e.get("fct_llm_veto"), "quant_pctl": e.get("fct_percentile"),
    }
    trace[t] = row
    act = str(v.get("action") or "").upper()
    try:
        if (date.today() - date.fromisoformat(v["analyzed_date"])).days > 14:
            stats["stale_verdicts_gt14d"] += 1
    except Exception:
        pass
    if v.get("exit_review"):
        stats["exit_reviews_active"] += 1
    if row["quant_veto"] is not None:
        stats["blocked_by_quant_veto"] += 1
        if row["llm_band"] is not None:
            anomalies.append(f"{t}: VETO BYPASS — llm_band={row['llm_band']} with quant_veto={row['quant_veto']}")
    if row["llm_band"] == "research_now":
        stats["llm_rn"] += 1
        if any(w in act for w in HARD_SELL):
            anomalies.append(f"{t}: HARD-SELL action inside LLM research_now set: {v.get('action')!r}")
    elif row["llm_band"] == "watchlist":
        stats["llm_watchlist"] += 1
    if row["llm_flag"] == "demoted":
        stats["llm_demoted"] += 1
    if row["llm_veto"] == "llm_reject":
        stats["llm_reject"] += 1

OUT.mkdir(exist_ok=True)
(OUT / "overlay_trace.json").write_text(json.dumps(
    {"stats": stats, "anomalies": anomalies, "trace": trace}, indent=1), encoding="utf-8")
print(json.dumps(stats, indent=1))
print("ANOMALIES:", anomalies or "NONE")

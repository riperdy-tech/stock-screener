"""Dump the actual schema of paper_ledgers.json so later forensic scripts
parse real field names, not guessed ones. Read-only."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]   # repo root (tools -> audit -> superpowers -> docs -> root)
OUT = Path(__file__).resolve().parent / "out"
book = json.loads((ROOT / "public/data/paper_ledgers.json").read_text(encoding="utf-8"))

def shape(x, depth=0):
    if depth > 3:
        return "..."
    if isinstance(x, dict):
        return {k: shape(v, depth + 1) for k, v in list(x.items())[:8]}
    if isinstance(x, list):
        return [shape(x[0], depth + 1), f"...{len(x)} items"] if x else []
    return type(x).__name__

schema = {name: shape(led) for name, led in book["ledgers"].items()}
OUT.mkdir(exist_ok=True)
(OUT / "ledger_schema.json").write_text(json.dumps(schema, indent=1), encoding="utf-8")

sample = {}
for name in ("equal", "equal_llm"):
    led = book["ledgers"][name]
    sample[name] = {
        "closed_first3": led.get("closed", [])[:3],
        "trades_first3": led.get("trades", [])[:3],
        "holdings_first3": dict(list((led.get("state") or {}).get("holdings", {}).items())[:3]),
    }
(OUT / "trades_sample.json").write_text(json.dumps(sample, indent=1, default=str), encoding="utf-8")
print("ledgers:", list(book["ledgers"]))
print("wrote out/ledger_schema.json, out/trades_sample.json")

"""rn_gemini: the interim Gemini paper book (operator decision 2026-10-13).

Pins two things:
  * its targets come from the Gemini overlay through the same gate as rn_depth;
  * the KIS target loader refuses to mirror it, so it can never reach a real account.

No network, no files. Run: python scripts/test_rn_gemini_ledger.py
"""

import importlib.util
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("tp", str(HERE / "track_paper_portfolios.py"))
tp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tp)
sys.path.insert(0, str(HERE))
from kis import targets as kt  # noqa: E402


def fct(rank=1, veto=None):
    return {"fct_rank": rank, "fct_band": "watchlist", "fct_veto": veto, "fct_llm_veto": None}


def gem(direction):
    return {"direction": direction, "run_source": "gemini_interim", "not_for_real_money": True}


def test_gemini_targets_use_the_rn_depth_gate():
    f = {"A": fct(1), "B": fct(2), "C": fct(3, veto="x"), "D": fct(4)}
    g = {"A": gem("undervalued"), "B": gem("hold"), "C": gem("undervalued"), "D": gem("overvalued")}
    w = tp.depth_targets(f, g)
    assert set(w) == {"A"}, w                       # hold/overvalued out; a vetoed name out even if undervalued


def test_the_kis_loader_refuses_the_gemini_ledger():
    book = {"ledgers": {"rn_gemini": {"current_date": date.today().isoformat(),
                                      "state": {"cash": 100.0, "holdings": {}}, "last_marks": {}}}}
    try:
        kt.ledger_weights(book, "rn_gemini")
    except ValueError as e:
        assert "paper-only" in str(e)
    else:
        raise AssertionError("ledger_weights mirrored rn_gemini")


def test_the_kis_loader_still_serves_rn_depth():
    book = {"ledgers": {"rn_depth": {"current_date": date.today().isoformat(),
                                     "state": {"cash": 100.0, "holdings": {}}, "last_marks": {}}}}
    out = kt.ledger_weights(book, "rn_depth")
    assert out["weights"] == {}


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print("ok", name)

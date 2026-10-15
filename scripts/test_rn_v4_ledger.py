"""rn_v4: engine v2.1's paper book, EXPERIMENTAL and unpromoted (operator decision 2026-10-15; rs2 SPEC_rebuild AK.82, AK.84).

Pins three things:
  * its targets come from v4_paper_overlay.json through the same gate as rn_depth, so only rows the producer marked paper-actionable are held;
  * the KIS target loader refuses to mirror it, so it can never reach a real account;
  * rn_depth is still served (the separation is by ledger, never by changing rn_depth).

No network, no files. Run: python scripts/test_rn_v4_ledger.py
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


def v4(direction, actionable):
    return {"direction": direction, "actionable": actionable, "paper_only": True, "label": "experimental_unpromoted"}


def test_v4_targets_hold_only_paper_actionable_undervalued_names():
    f = {"A": fct(1), "B": fct(2), "C": fct(3), "D": fct(4, veto="x"), "E": fct(5)}
    g = {"A": v4("undervalued", True), "B": v4("undervalued", False), "C": v4("hold", True), "D": v4("undervalued", True),
         "E": v4("overvalued", True)}
    assert set(tp.depth_targets(f, g)) == {"A"}            # not paper-actionable, hold/overvalued and vetoed names are all out


def test_the_v4_overlay_path_is_its_own_file():
    assert tp.V4_PAPER_OVERLAY_JSON.name == "v4_paper_overlay.json"
    assert tp.V4_PAPER_OVERLAY_JSON != tp.DEPTH_OVERLAY_JSON


def test_the_kis_loader_refuses_the_v4_ledger():
    assert "rn_v4" in kt.PAPER_ONLY_LEDGERS
    book = {"ledgers": {"rn_v4": {"current_date": date.today().isoformat(), "state": {"cash": 100.0, "holdings": {}}, "last_marks": {}}}}
    try:
        kt.ledger_weights(book, "rn_v4")
    except ValueError as e:
        assert "paper-only" in str(e)
    else:
        raise AssertionError("ledger_weights mirrored rn_v4")


def test_the_kis_loader_still_serves_rn_depth():
    book = {"ledgers": {"rn_depth": {"current_date": date.today().isoformat(), "state": {"cash": 100.0, "holdings": {}}, "last_marks": {}}}}
    assert kt.ledger_weights(book, "rn_depth")["weights"] == {}


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print("ok", name)

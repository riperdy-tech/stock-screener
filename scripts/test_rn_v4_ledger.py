"""rn_v4 / rn_v4_low / rn_v4_abs: engine v2.1's paper books, EXPERIMENTAL and unpromoted (rs2 SPEC_rebuild AK.82, AK.84, AK.91).

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


def v4(pct, actionable=True, rule_b=False, direction="hold"):
    return {"direction": direction, "actionable": actionable, "rank_pct": pct, "rule_b_pick": rule_b, "paper_only": True}


def test_the_top_sleeve_enters_at_the_top_decile_and_keeps_a_held_name_down_to_085():
    f = {t: fct(i) for i, t in enumerate("ABCDEF", 1)} | {"V": fct(9, veto="x")}
    g = {"A": v4(0.95), "B": v4(0.87), "C": v4(0.87), "D": v4(0.80), "E": v4(0.99, actionable=False), "F": v4(0.92), "V": v4(0.99)}
    assert set(tp.v4_sleeve_targets(f, g, "top")) == {"A", "F"}                       # new entries: >= 0.90 only; not-actionable and vetoed out
    assert set(tp.v4_sleeve_targets(f, g, "top", held={"B", "D"})) == {"A", "F", "B"}  # B held and >= 0.85 stays; D below 0.85 leaves


def test_the_bottom_sleeve_mirrors_the_top_with_its_own_buffer():
    f = {t: fct(i) for i, t in enumerate("ABC", 1)}
    g = {"A": v4(0.05), "B": v4(0.13), "C": v4(0.20)}
    assert set(tp.v4_sleeve_targets(f, g, "bottom")) == {"A"}
    assert set(tp.v4_sleeve_targets(f, g, "bottom", held={"B", "C"})) == {"A", "B"}


def test_the_audit_ledger_follows_the_original_rule_only():
    f = {t: fct(i) for i, t in enumerate("ABC", 1)}
    g = {"A": v4(0.5, rule_b=True, direction="undervalued"), "B": v4(0.99), "C": v4(0.2, actionable=False, rule_b=False, direction="undervalued")}
    assert set(tp.v4_rule_b_targets(f, g)) == {"A"}


def test_the_v4_overlay_path_is_its_own_file():
    assert tp.V4_PAPER_OVERLAY_JSON.name == "v4_paper_overlay.json"
    assert tp.V4_PAPER_OVERLAY_JSON != tp.DEPTH_OVERLAY_JSON


def test_the_kis_loader_refuses_every_v4_ledger():
    for name in ("rn_v4", "rn_v4_low", "rn_v4_abs"):
        assert name in kt.PAPER_ONLY_LEDGERS
        book = {"ledgers": {name: {"current_date": date.today().isoformat(), "state": {"cash": 100.0, "holdings": {}}, "last_marks": {}}}}
        try:
            kt.ledger_weights(book, name)
        except ValueError as e:
            assert "paper-only" in str(e)
        else:
            raise AssertionError(f"ledger_weights mirrored {name}")


def test_the_kis_loader_still_serves_rn_depth():
    book = {"ledgers": {"rn_depth": {"current_date": date.today().isoformat(), "state": {"cash": 100.0, "holdings": {}}, "last_marks": {}}}}
    assert kt.ledger_weights(book, "rn_depth")["weights"] == {}


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print("ok", name)

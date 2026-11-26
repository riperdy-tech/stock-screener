"""ai_book: the AI analyst's own paper book (operator 2026-11-27).

Pins:
  * its targets are every stock the filings read (gemini_c_overlay.json) ran on and gives BUY, equally weighted, with no
    screener gate: a stock that is not in factor_scores counts as one that is; WATCH, AVOID, NO_CALL and a read that did not
    run are not bought;
  * it holds, never liquidates, when the file is missing or empty; a held name the file no longer lists is carried;
  * a name that stops being BUY is sold after the usual two-run exit grace;
  * code_book and qwen_book are no longer advanced or seeded; a book that already holds them keeps their history untouched.

main() runs over tmp files only (made-up tickers); no network. Run: python -m pytest scripts/test_ai_book_ledger.py -q
"""

import copy
import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("tp", str(HERE / "track_paper_portfolios.py"))
tp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tp)

NAMES = ("TESTA", "TESTB", "TESTC", "TESTD", "TESTE")
ON_LIST = ("TESTA", "TESTB", "TESTC", "TESTD")            # TESTE is read on request: priced, but not in factor_scores


def read(**verdicts):
    rows = {"TESTA": "BUY", "TESTB": "WATCH", "TESTC": "NO_CALL", "TESTD": "AVOID", "TESTE": "BUY"}
    rows.update(verdicts)
    return {"tickers": {t: {"verdict": v, "analysis": "complete"} for t, v in rows.items() if v is not None}}


def test_targets_are_the_buy_names_with_no_screener_gate():
    w = tp.ai_book_targets(read())
    assert set(w) == {"TESTA", "TESTE"} and w["TESTA"] == 100.0 / tp.MIN_EQUAL_NAMES
    r = read()
    r["tickers"]["TESTA"]["analysis"] = "not run"            # a verdict left by a read that did not run is not followed
    assert set(tp.ai_book_targets(r)) == {"TESTE"}
    assert tp.ai_book_targets({}) == {} and tp.ai_book_targets(None) == {} and tp.ai_book_targets({"tickers": {}}) == {}


def _run(tmp_path, monkeypatch, session, overlay, seed=None):
    d = tmp_path / "data"
    d.mkdir(parents=True, exist_ok=True)
    sp = d / "stocks.json"
    sp.write_text(json.dumps([{"symbol": t, "price": 10.0, "Last_Updated": f"{session} 18:00"} for t in NAMES]), encoding="utf-8")
    factor = {"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "scored_count": len(ON_LIST),
              "tickers": {t: {"fct_rank": i + 1, "fct_band": "research_now", "fct_veto": None, "fct_llm_veto": None} for i, t in enumerate(ON_LIST)}}
    (d / "factor_scores.json").write_text(json.dumps(factor), encoding="utf-8")
    monkeypatch.setattr(tp, "FACTOR_SCORES_JSON", d / "factor_scores.json")
    for name in ("DEPTH_OVERLAY_JSON", "GEMINI_OVERLAY_JSON", "OPUS_OVERLAY_JSON", "V4_PAPER_OVERLAY_JSON", "DIVIDENDS_JSON", "MY_PORTFOLIO_JSON", "RISK_STATE_JSON"):
        monkeypatch.setattr(tp, name, d / f"absent_{name}.json")
    op = d / "gemini_c_overlay.json"
    if overlay is None:
        op.unlink(missing_ok=True)
    else:
        op.write_text(json.dumps(overlay), encoding="utf-8")
    monkeypatch.setattr(tp, "GEMINI_C_OVERLAY_JSON", op)
    lp = d / "paper_ledgers.json"
    if seed is not None and not lp.exists():
        lp.write_text(json.dumps(seed), encoding="utf-8")
    monkeypatch.setattr(tp, "LEDGERS_JSON", lp)
    for k in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_KEY"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setattr(sys, "argv", ["track_paper_portfolios.py", "--stocks-json", str(sp), "--as-of", session, "--skip-benchmark"])
    tp.main()
    return json.loads(lp.read_text(encoding="utf-8"))


def _ai(book):
    return book["ledgers"]["ai_book"]


def test_main_buys_the_buy_names_also_one_not_on_the_screener_list(tmp_path, monkeypatch):
    book = _run(tmp_path, monkeypatch, "2026-11-27", read())
    assert set(_ai(book)["state"]["holdings"]) == {"TESTA", "TESTE"}
    assert [r["date"] for r in _ai(book)["nav_series"]] == ["2026-11-27"]


def test_main_holds_when_the_file_is_missing_or_empty_and_carries_a_name_the_file_dropped(tmp_path, monkeypatch):
    book = _run(tmp_path, monkeypatch, "2026-11-27", read())
    held = copy.deepcopy(_ai(book)["state"]["holdings"])
    for session, overlay in (("2026-11-30", None), ("2026-12-01", {"tickers": {}})):
        book = _run(tmp_path, monkeypatch, session, overlay)
        assert _ai(book)["state"]["holdings"] == held, session
        assert any(a.get("scope") == "ai_book" and a.get("kind") == "held" for a in book["alerts"] if a["date"] == session), session
    for session in ("2026-12-02", "2026-12-03", "2026-12-04"):
        book = _run(tmp_path, monkeypatch, session, read(TESTE=None))             # the file no longer lists TESTE: no verdict is not a verdict
    assert set(_ai(book)["state"]["holdings"]) == {"TESTA", "TESTE"}


def test_a_name_that_stops_being_buy_leaves_after_the_exit_grace_and_a_new_buy_enters(tmp_path, monkeypatch):
    _run(tmp_path, monkeypatch, "2026-11-27", read())
    book = _run(tmp_path, monkeypatch, "2026-11-30", read(TESTA="AVOID", TESTB="BUY"))
    assert set(_ai(book)["state"]["holdings"]) == {"TESTA", "TESTB", "TESTE"}      # the entry is at once, the exit waits one more run
    book = _run(tmp_path, monkeypatch, "2026-12-01", read(TESTA="AVOID", TESTB="BUY"))
    assert set(_ai(book)["state"]["holdings"]) == {"TESTB", "TESTE"}


def test_the_monthly_books_are_no_longer_seeded_or_advanced(tmp_path, monkeypatch):
    fresh = _run(tmp_path / "a", monkeypatch, "2026-11-27", read())
    assert "code_book" not in fresh["ledgers"] and "qwen_book" not in fresh["ledgers"] and not hasattr(tp, "M3O_BOOKS_JSON")
    old = copy.deepcopy(fresh)
    frozen = {"nav_series": [{"date": "2026-11-24", "nav": 101.0}], "state": {"holdings": {"TESTD": {"shares": 1.0}}}, "trades": []}
    old["ledgers"]["code_book"], old["ledgers"]["qwen_book"] = copy.deepcopy(frozen), copy.deepcopy(frozen)
    book = _run(tmp_path / "b", monkeypatch, "2026-11-30", read(), seed=old)
    assert book["ledgers"]["code_book"] == frozen and book["ledgers"]["qwen_book"] == frozen       # history kept, untouched
    assert _ai(book)["nav_series"][-1]["date"] == "2026-11-30"

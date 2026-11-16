"""rn_opus: the Opus valuation run's paper book (SPEC opus_v1, point 5).

Pins:
  * its targets come from the Opus overlay through the same gate as rn_depth and rn_gemini: only
    `direction == "undervalued"` (verdict BUY) is bought; WATCH, AVOID and NO_CALL are not;
  * it holds, never liquidates, when opus_overlay.json is missing or empty;
  * a second run of the same session writes nothing new;
  * the other books are identical with and without the Opus file.

The overlay is scripts/fixtures/opus_overlay_sample.json (made-up tickers). main() runs over tmp files only;
no network. Run: python -m pytest scripts/test_rn_opus_ledger.py -q
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

FIXTURE = HERE / "fixtures" / "opus_overlay_sample.json"
NAMES = ("TESTA", "TESTB", "TESTC", "TESTD")


def overlay():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def fct(rank, veto=None):
    return {"fct_rank": rank, "fct_band": "watchlist", "fct_veto": veto, "fct_llm_veto": None}


def test_the_fixture_is_the_site_contract():
    o = overlay()
    assert o["scheme"] == "opus_v1" and o["not_for_real_money"] is True
    assert {t: r["verdict"] for t, r in o["tickers"].items()} == {
        "TESTA": "BUY", "TESTB": "WATCH", "TESTC": "NO_CALL", "TESTD": "AVOID"}
    for r in o["tickers"].values():
        assert r["direction"] == {"BUY": "undervalued", "WATCH": "hold", "AVOID": "overvalued", "NO_CALL": None}[r["verdict"]]


def test_opus_targets_are_the_buy_names_through_the_rn_depth_gate():
    f = {t: fct(i + 1) for i, t in enumerate(NAMES)}
    w = tp.depth_targets(f, overlay()["tickers"])
    assert set(w) == {"TESTA"}, w                     # WATCH (hold), AVOID, NO_CALL (direction null) are not bought
    assert w["TESTA"] == 100.0 / tp.MIN_EQUAL_NAMES   # the same equal weighting as rn_gemini
    f["TESTA"] = fct(1, veto="x")
    assert tp.depth_targets(f, overlay()["tickers"]) == {}   # a vetoed BUY is out, as for every overlay book


# ── main() over tmp files ──────────────────────────────────────────────────────────────────────────

def _run(tmp_path, monkeypatch, session, opus):
    """One real tp.main() for `session`. `opus` is the overlay dict to write, or None for no file."""
    d = tmp_path / "data"
    d.mkdir(parents=True, exist_ok=True)
    stocks = [{"symbol": t, "price": 10.0, "Last_Updated": f"{session} 18:00"} for t in NAMES]
    sp = d / "stocks.json"
    sp.write_text(json.dumps(stocks), encoding="utf-8")
    factor = {"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "scored_count": len(NAMES),
              "tickers": {t: dict(fct(i + 1), fct_band="research_now") for i, t in enumerate(NAMES)}}
    (d / "factor_scores.json").write_text(json.dumps(factor), encoding="utf-8")
    monkeypatch.setattr(tp, "FACTOR_SCORES_JSON", d / "factor_scores.json")
    for name in ("DEPTH_OVERLAY_JSON", "GEMINI_OVERLAY_JSON", "M3O_BOOKS_JSON", "V4_PAPER_OVERLAY_JSON",
                 "DIVIDENDS_JSON", "MY_PORTFOLIO_JSON", "RISK_STATE_JSON"):
        monkeypatch.setattr(tp, name, d / f"absent_{name}.json")
    op = d / "opus_overlay.json"
    if opus is None:
        op.unlink(missing_ok=True)
    else:
        op.write_text(json.dumps(opus), encoding="utf-8")
    monkeypatch.setattr(tp, "OPUS_OVERLAY_JSON", op)
    monkeypatch.setattr(tp, "LEDGERS_JSON", d / "paper_ledgers.json")
    for k in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_KEY"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setattr(sys, "argv", ["track_paper_portfolios.py", "--stocks-json", str(sp),
                                      "--as-of", session, "--skip-benchmark"])
    tp.main()
    return json.loads((d / "paper_ledgers.json").read_text(encoding="utf-8"))


def _opus(book):
    return book["ledgers"]["rn_opus"]


def test_main_buys_only_the_buy_name(tmp_path, monkeypatch):
    book = _run(tmp_path, monkeypatch, "2026-11-10", overlay())
    assert set(_opus(book)["state"]["holdings"]) == {"TESTA"}
    assert [r["date"] for r in _opus(book)["nav_series"]] == ["2026-11-10"]


def test_main_holds_when_the_file_is_missing_or_empty(tmp_path, monkeypatch):
    book = _run(tmp_path, monkeypatch, "2026-11-10", overlay())
    held = copy.deepcopy(_opus(book)["state"]["holdings"])
    n_trades = len(_opus(book)["trades"])
    for session, opus in (("2026-11-11", None), ("2026-11-12", {"tickers": {}}), ("2026-11-13", {})):
        book = _run(tmp_path, monkeypatch, session, opus)
        assert _opus(book)["state"]["holdings"] == held, session
        assert len(_opus(book)["trades"]) == n_trades, session
        assert any(a.get("scope") == "rn_opus" and a.get("kind") == "held"
                   and "opus_overlay.json missing or empty" in a.get("detail", "")
                   for a in book["alerts"] if a["date"] == session), session
    assert [r["date"] for r in _opus(book)["nav_series"]][-1] == "2026-11-13"


def test_a_second_run_of_the_same_session_writes_nothing_new(tmp_path, monkeypatch):
    first = _run(tmp_path, monkeypatch, "2026-11-10", overlay())
    again = _run(tmp_path, monkeypatch, "2026-11-10", overlay())
    assert _opus(again) == _opus(first)


def test_the_other_books_are_identical_with_and_without_the_opus_file(tmp_path, monkeypatch):
    a = _run(tmp_path / "a", monkeypatch, "2026-11-10", None)
    b = _run(tmp_path / "b", monkeypatch, "2026-11-10", overlay())
    assert set(a["ledgers"]) == set(b["ledgers"])
    for name in a["ledgers"]:
        if name not in ("rn_opus", "rn_opus_watch"):
            assert a["ledgers"][name] == b["ledgers"][name], name
    assert _opus(a)["state"]["holdings"] == {} and _opus(b)["state"]["holdings"] != {}


# ── rn_opus_watch: the WATCH names of the same file (operator 2026-11-16) ─────────────────────────────

def test_the_watch_book_holds_only_the_watch_name_and_the_buy_book_is_unchanged(tmp_path, monkeypatch):
    book = _run(tmp_path, monkeypatch, "2026-11-10", overlay())
    assert set(book["ledgers"]["rn_opus_watch"]["state"]["holdings"]) == {"TESTB"}
    assert set(_opus(book)["state"]["holdings"]) == {"TESTA"}


def test_the_watch_book_holds_when_the_file_is_missing(tmp_path, monkeypatch):
    book = _run(tmp_path, monkeypatch, "2026-11-10", overlay())
    held = copy.deepcopy(book["ledgers"]["rn_opus_watch"]["state"]["holdings"])
    book = _run(tmp_path, monkeypatch, "2026-11-11", None)
    assert book["ledgers"]["rn_opus_watch"]["state"]["holdings"] == held

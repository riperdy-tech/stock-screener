"""WO_SF2: prices carry their date (refresh_prices.py), ledger rows are keyed by session
(track_paper_portfolios.py), monthly closes roll at the month turn.

The real functions run; only the yfinance download is stubbed. No network, no real files.
"""

import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import pytest

HERE = Path(__file__).resolve().parent


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, str(HERE / file))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


rf = _load("rf_sf2", "refresh_prices.py")
tp = _load("tp_sf2", "track_paper_portfolios.py")


# ── the stubbed download ─────────────────────────────────────────────────────

class FakeYF:
    """yf.download over {symbol: [(date, close)]}. Honours start (inclusive) and end
    (exclusive); with neither (the old period="5d" call) it serves everything it has."""

    def __init__(self, bars):
        self.bars = bars
        self.calls = []

    def download(self, tickers, start=None, end=None, period=None, **kw):
        self.calls.append({"tickers": tickers, "start": start, "end": end, "period": period})
        cols = {}
        for sym in tickers.split():
            pts = {pd.Timestamp(d): c for d, c in self.bars.get(sym, [])
                   if (start is None or d >= start) and (end is None or d < end)}
            if pts:
                cols[sym] = pd.Series(pts)
        if not cols:
            return pd.DataFrame()
        return pd.concat({"Close": pd.DataFrame(cols)}, axis=1)


def _utc(s):
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


def _rows(n=100, months_end="2026-11", closes=None):
    out = []
    for i in range(n):
        m = {"monthlyCloses": list(closes or [9.0, 9.5, 10.0])}
        if months_end:
            y, mo = int(months_end[:4]), int(months_end[5:])
            idx = [f"{(y * 12 + mo - 1 - k) // 12}-{(y * 12 + mo - 1 - k) % 12 + 1:02d}"
                   for k in range(len(m["monthlyCloses"]) - 1, -1, -1)]
            m["monthlyCloseMonths"] = idx
        out.append({"symbol": f"S{i:03d}", "price": 10.0, "marketCap": 1000, "metrics": m})
    return out


def _run(tmp_path, monkeypatch, rows, bars, now, daily=None):
    path = tmp_path / "stocks.json"
    path.write_text(json.dumps(rows) + "\n", encoding="utf-8")
    if daily is not None:
        (tmp_path / "daily_closes.json").write_text(json.dumps({"tickers": daily}), encoding="utf-8")
    fake = FakeYF(bars)
    monkeypatch.setitem(sys.modules, "yfinance", fake)
    monkeypatch.setattr(rf, "_now", lambda: _utc(now), raising=False)
    monkeypatch.setattr(rf.time, "sleep", lambda s: None)
    monkeypatch.setattr(sys, "argv", ["refresh_prices.py", "--stocks-json", str(path)])
    before = path.read_bytes()
    code = None
    try:
        rf.main()
    except SystemExit as e:
        code = e.code
    return path, before, code, fake


def _bars(rows, on, older=(), session_close=11.0, older_close=10.5, ref_dates=None):
    """Every name has `on`'s bar except the `older` names, whose newest bar is the day before."""
    b = {"IWM": [(d, 280.0) for d in (ref_dates or ["2026-11-09", "2026-11-10"])]}
    prev = {"2026-11-10": "2026-11-09", "2026-11-02": "2026-10-30"}.get(on, "2026-11-06")
    for r in rows:
        s = r["symbol"]
        b[s] = [(prev, older_close)] + ([] if s in older else [(on, session_close)])
    return b


# ── Defect 1: the post-close refresh ─────────────────────────────────────────

def test_a_batch_of_previous_session_bars_is_refused(tmp_path, monkeypatch):
    """11-11 01:36 UTC is 20:36 in New York on 11-10: the session is 11-10. 87 of 100 names
    return the 11-09 bar (the observed failure): nothing is written, exit is non-zero."""
    rows = _rows()
    stale = {r["symbol"] for r in rows[:87]}
    path, before, code, _ = _run(tmp_path, monkeypatch, rows,
                                 _bars(rows, "2026-11-10", older=stale), "2026-11-11T01:36:00")
    assert code not in (None, 0)
    assert path.read_bytes() == before, "a mixed-date batch was written"


def test_a_batch_on_the_right_session_is_written_with_its_stamp(tmp_path, monkeypatch):
    rows = _rows()
    path, _, code, fake = _run(tmp_path, monkeypatch, rows, _bars(rows, "2026-11-10"),
                               "2026-11-11T01:36:00")
    assert code is None
    out = json.loads(path.read_text(encoding="utf-8"))
    assert out[0]["_meta"]["price_asof"] == "2026-11-10"
    assert out[0]["_meta"]["price_asof_names"] == 100
    assert all(r["price"] == 11.0 for r in out)
    assert all(c["period"] is None and c["start"] and c["end"] for c in fake.calls), \
        "the request must carry explicit dates, not period='5d'"


def test_a_straggler_keeps_its_stored_price_and_a_marker(tmp_path, monkeypatch):
    rows = _rows()
    old = {r["symbol"] for r in rows[:5]}
    path, _, code, _ = _run(tmp_path, monkeypatch, rows, _bars(rows, "2026-11-10", older=old),
                            "2026-11-11T01:36:00")
    assert code is None
    out = {r["symbol"]: r for r in json.loads(path.read_text(encoding="utf-8"))}
    for s in old:
        assert out[s]["price"] == 10.0, "a straggler's stored price must not be replaced"
        assert out[s]["price_older_than_asof"] == "2026-11-09"
    fresh = out["S050"]
    assert fresh["price"] == 11.0 and "price_older_than_asof" not in fresh
    assert out["S000"]["_meta"]["price_older_names"] == 5


def test_a_session_still_open_is_not_priced(tmp_path, monkeypatch):
    """16:37 UTC on 11-10 is mid-session in New York: the partial 11-10 bar is not the
    session; the run prices 11-09's close."""
    rows = _rows()
    bars = _bars(rows, "2026-11-10", session_close=99.0, older_close=10.5)
    path, _, code, _ = _run(tmp_path, monkeypatch, rows, bars, "2026-11-10T16:37:00")
    assert code is None
    out = json.loads(path.read_text(encoding="utf-8"))
    assert out[0]["_meta"]["price_asof"] == "2026-11-09"
    assert all(r["price"] == 10.5 for r in out)


# ── Defect 3: the month roll ─────────────────────────────────────────────────

def _month_bars(rows, with_oct=True, oct_close=12.0):
    b = {"IWM": [("2026-10-30", 280.0), ("2026-11-02", 281.0)]}
    for r in rows:
        pts = ([("2026-10-29", 11.0), ("2026-10-30", oct_close)] if with_oct else [])
        b[r["symbol"]] = pts + [("2026-11-02", 13.0)]
    return b


def test_the_first_run_of_a_new_month_appends(tmp_path, monkeypatch):
    rows = _rows(n=10, months_end="2026-10")
    path, _, code, _ = _run(tmp_path, monkeypatch, rows, _month_bars(rows), "2026-11-03T01:30:00")
    assert code is None
    m = json.loads(path.read_text(encoding="utf-8"))[0]["metrics"]
    assert m["monthlyCloses"] == [9.0, 9.5, 12.0, 13.0]
    assert m["monthlyCloseMonths"][-2:] == ["2026-10", "2026-11"]
    assert "monthlyCloseUnconfirmed" not in m


def test_the_month_end_comes_from_the_daily_series_when_there_is_one(tmp_path, monkeypatch):
    rows = _rows(n=10, months_end="2026-10")
    daily = {r["symbol"]: {"2026-10-29": 11.4, "2026-10-30": 11.5, "2026-11-02": 13.0} for r in rows}
    path, _, _, _ = _run(tmp_path, monkeypatch, rows, _month_bars(rows), "2026-11-03T01:30:00", daily)
    m = json.loads(path.read_text(encoding="utf-8"))[0]["metrics"]
    assert m["monthlyCloses"] == [9.0, 9.5, 11.5, 13.0]


def test_a_month_end_that_cannot_be_found_is_marked(tmp_path, monkeypatch):
    rows = _rows(n=10, months_end="2026-10")
    path, _, _, _ = _run(tmp_path, monkeypatch, rows, _month_bars(rows, with_oct=False),
                         "2026-11-03T01:30:00")
    m = json.loads(path.read_text(encoding="utf-8"))[0]["metrics"]
    assert m["monthlyCloses"] == [9.0, 9.5, 10.0, 13.0], "the old tail must stay, not be guessed"
    assert m["monthlyCloseUnconfirmed"] == ["2026-10"]


def test_inside_a_month_the_last_element_is_overwritten(tmp_path, monkeypatch):
    rows = _rows(n=10, months_end="2026-11")
    path, _, _, _ = _run(tmp_path, monkeypatch, rows, _bars(rows, "2026-11-10"), "2026-11-11T01:36:00")
    m = json.loads(path.read_text(encoding="utf-8"))[0]["metrics"]
    assert m["monthlyCloses"] == [9.0, 9.5, 11.0]
    assert m["monthlyCloseMonths"][-1] == "2026-11"


def test_a_series_without_month_stamps_is_overwritten_and_stamped(tmp_path, monkeypatch):
    rows = _rows(n=10, months_end=None)
    path, _, _, _ = _run(tmp_path, monkeypatch, rows, _bars(rows, "2026-11-10"), "2026-11-11T01:36:00")
    m = json.loads(path.read_text(encoding="utf-8"))[0]["metrics"]
    assert m["monthlyCloses"] == [9.0, 9.5, 11.0]
    assert m["monthlyCloseMonths"] == ["2026-09", "2026-10", "2026-11"]


def test_a_rebuilt_detail_carries_the_month_of_each_close(monkeypatch):
    """fetch_data.extract_financial_detail stamps each monthly close with its month."""
    fd = _load("fd_sf2", "fetch_data.py")
    idx = pd.to_datetime(["2026-09-01", "2026-10-01", "2026-11-01"])

    class T:
        info = {}
        income_stmt = quarterly_income_stmt = cash_flow = balance_sheet = calendar = None

        def history(self, period=None, interval=None):
            return pd.DataFrame({"Close": [9.0, float("nan"), 10.0]}, index=idx)

    monkeypatch.setattr(fd, "build_financial_detail",
                        lambda sym, info, i, q, c, b, ne, monthly: {"Monthly_Closes": monthly})
    detail = fd.extract_financial_detail("ZZZ", T())
    assert detail["Monthly_Closes"] == [9.0, 10.0]
    assert detail["Monthly_Close_Months"] == ["2026-09", "2026-11"]


# ── Defect 2: ledger rows keyed by session ───────────────────────────────────

def _stocks(asof="2026-11-10", refreshed="2026-11-11T01:40:00Z", fetched="2026-11-10 18:00", stamp=True):
    rows = [{"symbol": s, "price": 10.0, "Last_Updated": fetched} for s in ("AAA", "BBB")]
    if stamp:
        rows[0]["_meta"] = {"price_asof": asof, "price_refresh_at": refreshed}
    return rows


def _ledger_run(tmp_path, monkeypatch, stocks, iwm):
    """One real tp.main() over tmp files. `iwm` is {date: close} as the benchmark history."""
    d = tmp_path / "data"
    d.mkdir(exist_ok=True)
    sp = d / "stocks.json"
    sp.write_text(json.dumps(stocks), encoding="utf-8")
    for name in ("FACTOR_SCORES_JSON", "DEPTH_OVERLAY_JSON", "GEMINI_OVERLAY_JSON", "M3O_BOOKS_JSON",
                 "V4_PAPER_OVERLAY_JSON", "DIVIDENDS_JSON", "MY_PORTFOLIO_JSON"):
        monkeypatch.setattr(tp, name, d / f"absent_{name}.json")
    monkeypatch.setattr(tp, "LEDGERS_JSON", d / "paper_ledgers.json")
    monkeypatch.setattr(tp, "fetch_benchmark_history",
                        lambda start: {b: dict(iwm) if b == "IWM" else {} for b in tp.BENCHMARKS})
    for k in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_KEY"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setattr(sys, "argv", ["track_paper_portfolios.py", "--stocks-json", str(sp)])
    tp.main()
    led = d / "paper_ledgers.json"
    return json.loads(led.read_text(encoding="utf-8")) if led.exists() else None


def _equal_dates(book):
    return [r["date"] for r in book["ledgers"]["equal"]["nav_series"]]


def test_the_ledger_writes_one_row_per_completed_session(tmp_path, monkeypatch):
    iwm = {"2026-11-10": 280.58, "2026-11-11": 283.09}
    book = _ledger_run(tmp_path, monkeypatch, _stocks(), iwm)
    assert _equal_dates(book) == ["2026-11-10"]
    row = book["ledgers"]["equal"]["nav_series"][0]
    assert row["price_session"] == "2026-11-10"
    assert row["bench"] == 280.58, "the benchmark must be the close of the book's session"
    # the same session again (a later run the same day, or a weekend run): no new row
    book = _ledger_run(tmp_path, monkeypatch, _stocks(), iwm)
    assert _equal_dates(book) == ["2026-11-10"]
    # the next completed session: one new row, keyed by its session date
    book = _ledger_run(tmp_path, monkeypatch,
                       _stocks(asof="2026-11-11", refreshed="2026-11-12T01:40:00Z", fetched="2026-11-11 18:00"), iwm)
    assert _equal_dates(book) == ["2026-11-10", "2026-11-11"]
    assert book["ledgers"]["equal"]["nav_series"][1]["bench"] == 283.09


def test_a_run_on_intraday_prices_writes_no_row(tmp_path, monkeypatch):
    iwm = {"2026-11-10": 280.58}
    first = _ledger_run(tmp_path, monkeypatch, _stocks(), iwm)
    before = (tmp_path / "data" / "paper_ledgers.json").read_bytes()
    # a fetch after the overlay: no stamp left on the file
    _ledger_run(tmp_path, monkeypatch, _stocks(stamp=False, fetched="2026-11-11 13:50"), iwm)
    assert (tmp_path / "data" / "paper_ledgers.json").read_bytes() == before
    # or a stamp that predates rows fetched after it
    _ledger_run(tmp_path, monkeypatch, _stocks(fetched="2026-11-11 13:50"), iwm)
    assert (tmp_path / "data" / "paper_ledgers.json").read_bytes() == before
    assert _equal_dates(first) == ["2026-11-10"]


def test_a_session_without_its_benchmark_close_writes_no_row(tmp_path, monkeypatch):
    book = _ledger_run(tmp_path, monkeypatch, _stocks(), {"2026-11-09": 282.5})
    assert book is None or _equal_dates(book) == []


def test_a_row_written_before_session_keys_is_never_rewritten(tmp_path, monkeypatch):
    iwm = {"2026-11-10": 280.58}
    _ledger_run(tmp_path, monkeypatch, _stocks(), iwm)
    path = tmp_path / "data" / "paper_ledgers.json"
    book = json.loads(path.read_text(encoding="utf-8"))
    for led in book["ledgers"].values():           # make the last row an old, run-date-keyed one
        for r in led["nav_series"]:
            r.pop("price_session", None)
    path.write_text(json.dumps(book), encoding="utf-8")
    again = _ledger_run(tmp_path, monkeypatch, _stocks(), iwm)
    assert _equal_dates(again) == ["2026-11-10"]
    assert "price_session" not in again["ledgers"]["equal"]["nav_series"][0]


def test_a_straggler_price_is_a_stale_mark(tmp_path, monkeypatch):
    monkeypatch.setitem(tp.price_asof_holder, "older", {"AAA"})
    monkeypatch.setitem(tp.price_asof_holder, "snapshot_date", None)
    assert tp.price_is_stale("AAA") and not tp.price_is_stale("BBB")


# ── what the readers of the monthly series get ───────────────────────────────

def test_price_history_carries_the_month_of_the_last_close_and_the_session(tmp_path, monkeypatch):
    bph = _load("bph_sf2", "build_price_history.py")
    rows = _rows(n=2, months_end="2026-11")
    rows[1]["metrics"]["monthlyCloseUnconfirmed"] = ["2026-10"]
    rows[0]["_meta"] = {"price_asof": "2026-11-10"}
    sp = tmp_path / "stocks.json"
    sp.write_text(json.dumps(rows), encoding="utf-8")
    monkeypatch.setattr(bph, "STOCKS_JSON", sp)
    monkeypatch.setattr(bph, "PRICE_HISTORY_JSON", tmp_path / "price_history.json")
    monkeypatch.setattr(bph, "MISSING_TXT", tmp_path / "missing.txt")
    bph.main()
    out = json.loads((tmp_path / "price_history.json").read_text(encoding="utf-8"))
    assert out["price_asof"] == "2026-11-10"
    assert out["prices"]["S000"] == [9.0, 9.5, 10.0]          # the series itself is unchanged
    assert out["last_month"] == {"S000": "2026-11", "S001": "2026-11"}
    assert out["unconfirmed_month_end"] == {"S001": ["2026-10"]}


def test_a_run_with_no_new_session_still_stamps_the_heartbeat(tmp_path, monkeypatch):
    """No row, but book.last_updated moves: the control tower and the takeover route read it."""
    iwm = {"2026-11-10": 280.58}
    _ledger_run(tmp_path, monkeypatch, _stocks(), iwm)
    path = tmp_path / "data" / "paper_ledgers.json"
    book = json.loads(path.read_text(encoding="utf-8"))
    book["last_updated"] = "2000-01-01T00:00:00Z"
    path.write_text(json.dumps(book), encoding="utf-8")
    again = _ledger_run(tmp_path, monkeypatch, _stocks(), iwm)
    assert _equal_dates(again) == ["2026-11-10"]
    assert again["last_updated"] > "2026-01-01"

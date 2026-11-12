"""WO_SF6 part 1: refresh_prices.py writes metrics.adv_20d_usd for the whole universe.

The real functions run; only the yfinance download is stubbed. No network, no real files.
"""

import importlib.util
import json
import statistics
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, str(HERE / file))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


rf = _load("rf_sf6", "refresh_prices.py")
ht = _load("ht_sf6", "hygiene_thresholds.py")

SESSION = "2026-11-10"


def _days(n, last=SESSION):
    """n consecutive weekday dates ending at `last`."""
    out, d = [], datetime.fromisoformat(last)
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d.date().isoformat())
        d -= timedelta(days=1)
    return out[::-1]


class FakeYF:
    """yf.download over {symbol: [(date, close, volume)]}, with Close and Volume frames."""

    def __init__(self, bars):
        self.bars = bars
        self.calls = []

    def download(self, tickers, start=None, end=None, **kw):
        self.calls.append(tickers)
        close, vol = {}, {}
        for sym in tickers.split():
            pts = [(d, c, v) for d, c, v in self.bars.get(sym, [])
                   if (start is None or d >= start) and (end is None or d < end)]
            if pts:
                close[sym] = pd.Series({pd.Timestamp(d): c for d, c, _ in pts})
                vol[sym] = pd.Series({pd.Timestamp(d): v for d, _, v in pts})
        if not close:
            return pd.DataFrame()
        return pd.concat({"Close": pd.DataFrame(close), "Volume": pd.DataFrame(vol)}, axis=1)


def _run(tmp_path, monkeypatch, rows, bars):
    path = tmp_path / "stocks.json"
    path.write_text(json.dumps(rows) + "\n", encoding="utf-8")
    fake = FakeYF(bars)
    monkeypatch.setitem(sys.modules, "yfinance", fake)
    monkeypatch.setattr(rf, "_now", lambda: datetime.fromisoformat("2026-11-11T01:36:00").replace(tzinfo=timezone.utc))
    monkeypatch.setattr(rf.time, "sleep", lambda s: None)
    monkeypatch.setattr(sys, "argv", ["refresh_prices.py", "--stocks-json", str(path)])
    rf.main()
    return json.loads(path.read_text(encoding="utf-8")), fake


def _universe(n_filler=30):
    """Names: FULL (30 sessions), SHORT (8 sessions), ZERO (zero volume throughout),
    HAD (8 sessions but a figure stored before), plus fillers so coverage is met."""
    days = _days(30)
    close = lambda i: 10.0 + i * 0.1
    bars = {"IWM": [(d, 280.0, 1_000_000) for d in days[-6:]]}
    bars["FULL"] = [(d, close(i), 1000 + i * 10) for i, d in enumerate(days)]
    bars["SHORT"] = [(d, 5.0, 2000) for d in days[-8:]]
    bars["ZERO"] = [(d, 7.0, 0) for d in days]
    bars["HAD"] = [(d, 5.0, 2000) for d in days[-8:]]
    rows = [{"symbol": s, "price": 9.0, "marketCap": 1000, "metrics": {}} for s in ("FULL", "SHORT", "ZERO", "HAD")]
    rows[3]["metrics"]["adv_20d_usd"] = 123456.0
    for i in range(n_filler):
        s = f"F{i:02d}"
        bars[s] = [(d, 10.0, 100) for d in days[-12:]]
        rows.append({"symbol": s, "price": 9.0, "marketCap": 1000, "metrics": {}})
    return rows, bars, days


def test_adv_is_the_median_of_close_times_volume_over_the_last_20_sessions(tmp_path, monkeypatch):
    rows, bars, days = _universe()
    out, _ = _run(tmp_path, monkeypatch, rows, bars)
    m = {r["symbol"]: r["metrics"] for r in out}["FULL"]
    last20 = [(10.0 + i * 0.1) * (1000 + i * 10) for i in range(30)][-20:]
    assert m["adv_20d_usd"] == round(statistics.median(last20), 2)
    assert m["adv_20d_sessions"] == 20
    assert m["adv_20d_asof"] == SESSION


def test_fewer_than_10_sessions_has_no_figure_and_a_reason(tmp_path, monkeypatch):
    rows, bars, _ = _universe()
    out, _ = _run(tmp_path, monkeypatch, rows, bars)
    m = {r["symbol"]: r["metrics"] for r in out}["SHORT"]
    assert "adv_20d_usd" not in m
    assert m["adv_20d_reason"] == "fewer_than_10_sessions"
    assert m["adv_20d_sessions"] == 8


def test_a_stored_figure_is_not_replaced_by_an_absence(tmp_path, monkeypatch):
    rows, bars, _ = _universe()
    out, _ = _run(tmp_path, monkeypatch, rows, bars)
    assert {r["symbol"]: r["metrics"] for r in out}["HAD"]["adv_20d_usd"] == 123456.0


def test_zero_volume_is_a_zero_figure_not_an_absence(tmp_path, monkeypatch):
    rows, bars, _ = _universe()
    out, _ = _run(tmp_path, monkeypatch, rows, bars)
    m = {r["symbol"]: r["metrics"] for r in out}["ZERO"]
    assert m["adv_20d_usd"] == 0.0
    assert "adv_20d_reason" not in m


def test_the_scorer_finds_the_new_figure_first_and_zero_stays_a_value():
    # resolve_adv_usd is the scorer's and tier 1's resolver; num() there keeps 0.0.
    assert ht.resolve_adv_usd(5e6, 1e6, 1000.0, 10.0) == (5e6, None)
    assert ht.resolve_adv_usd(0.0, 1e6, 1000.0, 10.0) == (0.0, None)
    assert ht.resolve_adv_usd(None, 1e6, 1000.0, 10.0) == (1e6, None)


def test_volume_rides_the_same_download_no_second_universe_fetch(tmp_path, monkeypatch):
    rows, bars, _ = _universe()
    _, fake = _run(tmp_path, monkeypatch, rows, bars)
    universe_calls = [c for c in fake.calls if c != "IWM"]
    assert len(universe_calls) == 1          # 34 names fit one chunk: one request for them all


def test_a_download_without_volume_still_overlays_prices(tmp_path, monkeypatch):
    """The stub of the other test files has no Volume frame: prices still overlay, no figure."""
    rows, bars, days = _universe()

    class NoVol(FakeYF):
        def download(self, *a, **k):
            df = super().download(*a, **k)
            return df.drop(columns="Volume", level=0) if not df.empty else df

    fake = NoVol(bars)
    path = tmp_path / "stocks.json"
    path.write_text(json.dumps(rows) + "\n", encoding="utf-8")
    monkeypatch.setitem(sys.modules, "yfinance", fake)
    monkeypatch.setattr(rf, "_now", lambda: datetime.fromisoformat("2026-11-11T01:36:00").replace(tzinfo=timezone.utc))
    monkeypatch.setattr(rf.time, "sleep", lambda s: None)
    monkeypatch.setattr(sys, "argv", ["refresh_prices.py", "--stocks-json", str(path)])
    rf.main()
    out = {r["symbol"]: r for r in json.loads(path.read_text(encoding="utf-8"))}
    assert out["FULL"]["price"] != 9.0
    assert "adv_20d_usd" not in out["FULL"]["metrics"]

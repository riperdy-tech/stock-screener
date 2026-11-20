"""Offline tests for build_stock_driver_flags.py (WO_MW1). Synthetic data only; nothing under public/data is read or written."""
import json
import math
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pytest

import build_stock_driver_flags as sf

N = 300
TODAY = date(2026, 11, 20)
BETAS = {"market": 0.4, "rates": -0.02, "oil": 0.05}


def _dates(n=N, last=TODAY):
    return [(last - timedelta(days=n - 1 - i)).isoformat() for i in range(n)]


def _history(seed=1, n=N):
    rng = np.random.default_rng(seed)
    mkt, rate, oil = rng.normal(0, 1, n), rng.normal(0, 5, n), rng.normal(0, 1.5, n)
    mkt[0] = rate[0] = oil[0] = 0.0
    return {"dates": _dates(n),
            "spy_close": list(100 * np.exp(np.cumsum(mkt) / 100)),
            "dgs10": list(4 + np.cumsum(rate) / 100),
            "oil": list(70 * np.exp(np.cumsum(oil) / 100))}


def _stock(history, betas=BETAS, alpha=0.01, noise=0.0, seed=2, skip=()):
    """A close series whose daily relative return is alpha + betas . driver changes (+ noise)."""
    rng = np.random.default_rng(seed)
    ch = sf.driver_changes(history)
    level, closes = 50.0, {}
    for i, d in enumerate(history["dates"]):
        if i > 0:
            rel = alpha + betas["market"] * ch[i][0] + betas["rates"] * ch[i][1] + betas["oil"] * ch[i][2]
            level *= math.exp((rel + ch[i][0] + noise * rng.normal()) / 100)
        if i not in skip:
            closes[d] = [level, 1000.0]
    return closes


def _drivers(**moved):
    """The exposures file's `drivers` block; moved maps driver -> (window, change)."""
    out = {}
    for name in sf.DRIVERS:
        w = {"21": {"change": 0.0, "z": 0.0, "moved": False}, "63": {"change": 0.0, "z": 0.0, "moved": False}}
        for window, change in moved.get(name, []):
            w[window] = {"change": change, "z": 1.5, "moved": True}
        out[name] = {"series": name, "unit": "u", "windows": w}
    return out


def _exposures(history, drivers=None, as_of=TODAY.isoformat(), degraded=False):
    return {"as_of": as_of, "degraded": degraded, "history": history, "drivers": drivers or _drivers()}


def _files(tmp_path, exposures, closes):
    e, c = tmp_path / "driver_exposures.json", tmp_path / "daily_closes.json"
    if exposures is not None:
        e.write_text(json.dumps(exposures), encoding="utf-8")
    if closes is not None:
        c.write_text(json.dumps({"asof": "x", "tickers": closes}), encoding="utf-8")
    return e, c


NOW = datetime(2026, 11, 20, 12, 0, tzinfo=timezone.utc)


def _build(tmp_path, exposures, closes):
    e, c = _files(tmp_path, exposures, closes)
    return sf.build(e, c, today=TODAY, now=NOW)


def test_betas_are_recovered_exactly(tmp_path):
    h = _history()
    out = sf.fit_stock(_stock(h), h["dates"], sf.driver_changes(h))
    for name, b in BETAS.items():
        assert out["exposures"][name]["beta"] == pytest.approx(b, abs=1e-4)
    assert out["r2"] == pytest.approx(1.0, abs=1e-6)
    assert out["n_days"] == sf.FIT_ROWS
    assert out["first_day"] == h["dates"][-sf.FIT_ROWS] and out["last_day"] == h["dates"][-1]


def test_noisy_stock_gets_the_right_t_signs():
    h = _history()
    out = sf.fit_stock(_stock(h, noise=0.3), h["dates"], sf.driver_changes(h))["exposures"]
    assert out["market"]["t"] > 2.5 and out["rates"]["t"] < -2.5 and out["oil"]["t"] > 2.5
    assert out["market"]["beta"] == pytest.approx(0.4, abs=0.1)


def test_a_missing_day_is_a_missing_row_never_filled():
    h = _history()
    out = sf.fit_stock(_stock(h, skip={N - 10, N - 50}), h["dates"], sf.driver_changes(h))
    assert out["n_days"] == sf.FIT_ROWS - 4          # each missing close removes the day and the next day's return
    assert out["exposures"]["market"]["beta"] == pytest.approx(0.4, abs=1e-4)


def test_fewer_than_150_rows_gives_null_exposures_and_a_reason():
    h = _history()
    closes = {d: v for d, v in _stock(h).items() if d >= h["dates"][-120]}
    out = sf.fit_stock(closes, h["dates"], sf.driver_changes(h))
    assert out["exposures"] is None and out["r2"] is None
    assert out["n_days"] == 119 and "fewer than 150" in out["reason"]


def test_a_driver_that_does_not_vary_is_reported_as_collinear():
    h = _history()
    h["oil"] = [70.0] * N
    out = sf.fit_stock(_stock(h, betas={"market": 0.4, "rates": -0.02, "oil": 0.0}), h["dates"], sf.driver_changes(h))
    assert out["exposures"] is None and "collinear" in out["reason"]


def test_non_positive_oil_is_missing():
    h = _history()
    h["oil"][5] = -3.0
    ch = sf.driver_changes(h)
    assert ch[5][2] is None and ch[6][2] is None and ch[7][2] is not None


def _exp(betas_t):
    return {n: {"beta": b, "t": t} for n, (b, t) in betas_t.items()}


def test_a_flag_needs_both_t_and_moved():
    exposures = _exp({"market": (0.4, 5.0), "rates": (-0.09, 3.1), "oil": (0.05, 1.0)})
    drivers = _drivers(rates=[("63", 33.0)], oil=[("21", -15.0)])
    flags = sf.flags_for(exposures, drivers)
    assert [f["driver"] for f in flags] == ["rates"]       # market: |t| high but not moved; oil: moved but |t| low
    assert flags[0]["window"] == 63 and flags[0]["implied"] == pytest.approx(-2.97)
    assert sf.flags_for(exposures, _drivers()) == []
    just_below = _exp({"rates": (-0.09, -2.49)})
    assert sf.flags_for(just_below, _drivers(rates=[("21", 10.0)])) == []
    assert len(sf.flags_for(_exp({"rates": (-0.09, -2.5)}), _drivers(rates=[("21", 10.0)]))) == 1


def test_the_21_session_window_wins_when_both_moved_and_flags_sort_by_implied():
    exposures = _exp({"rates": (-0.09, -4.0), "oil": (0.05, 4.0), "market": (0.1, 4.0)})
    drivers = _drivers(rates=[("21", 10.0), ("63", 40.0)], oil=[("63", -20.0)], market=[("21", -5.0)])
    flags = sf.flags_for(exposures, drivers)
    assert [(f["driver"], f["window"]) for f in flags] == [("oil", 63), ("rates", 21), ("market", 21)]
    assert [abs(f["implied"]) for f in flags] == sorted((abs(f["implied"]) for f in flags), reverse=True)


def test_text_for_each_driver_and_sign():
    t = sf.flag_text("rates", -0.09, -3.1, "63", 33.0, -2.97)
    assert t == ("Sensitive to the 10-year yield: about −0.9 points against the index per 10 basis points (t −3.1). "
                 "The yield rose 33 basis points in 63 sessions: about −3.0 points.")
    assert "The yield fell 20 basis points in 21 sessions: about +1.8 points." in sf.flag_text("rates", -0.09, -3.1, "21", -20.0, 1.8)
    t = sf.flag_text("oil", 0.05, 4.0, "21", -15.0, -0.75)
    assert t.startswith("Sensitive to oil: about +0.5 points against the index per 10% in the oil price (t +4.0).")
    assert "Oil fell 15.0% in 21 sessions" in t
    t = sf.flag_text("market", 0.4, 5.2, "21", -7.7, -3.1)
    assert t.startswith("Falls about 0.4 points more than the index for each 1% the index falls (t +5.2).")
    assert "The index fell 7.7% in 21 sessions: about −3.1 points." in t
    assert sf.flag_text("market", -0.4, -5.2, "63", 4.0, -1.6).startswith("Falls about 0.4 points less than the index")


def test_build_and_file_layout(tmp_path):
    h = _history()
    drivers = _drivers(rates=[("63", 33.0)])
    closes = {"CCC": _stock(h, noise=0.3), "AAA": _stock(h, noise=0.3, seed=5), "BBB": {h["dates"][-1]: [10.0, 1.0]}}
    doc = _build(tmp_path, _exposures(h, drivers), closes)
    assert doc["as_of"] == TODAY.isoformat() and doc["built_at"] == "2026-11-20T12:00:00Z"
    assert doc["evidence"] == sf.EVIDENCE and doc["reasons"] == []
    assert doc["counts"]["fitted"] == 2 and doc["tickers"]["BBB"]["exposures"] is None
    assert doc["counts"]["flagged"] == doc["counts"]["per_driver"]["rates"]
    out = tmp_path / "out" / "stock_driver_flags.json"
    sf.write(doc, out)
    text = out.read_text(encoding="utf-8")
    assert json.loads(text) == json.loads(json.dumps(doc))
    lines = text.splitlines()
    assert [ln.split('"')[1] for ln in lines if ln.startswith('    "')] == ["AAA", "BBB", "CCC"]   # one per line, sorted
    assert "NaN" not in text and "Infinity" not in text


def test_a_nan_is_refused_by_the_writer(tmp_path):
    doc = _build(tmp_path, _exposures(_history()), {})
    doc["counts"]["fitted"] = float("nan")
    with pytest.raises(ValueError):
        sf.write(doc, tmp_path / "x.json")


@pytest.mark.parametrize("exposures, word", [
    (None, "exposures_missing"),
    ("degraded", "exposures_degraded"),
    ("stale", "exposures_stale"),
    ("nohistory", "exposures_no_history"),
])
def test_missing_degraded_or_stale_exposures_give_empty_tickers(tmp_path, exposures, word):
    h = _history()
    doc = {None: None,
           "degraded": _exposures(h, degraded=True),
           "stale": _exposures(h, as_of=(TODAY - timedelta(days=8)).isoformat()),
           "nohistory": {**_exposures(h), "history": None}}[exposures]
    out = _build(tmp_path, doc, {"AAA": _stock(h)})
    assert out["tickers"] == {} and out["reasons"][0].startswith(word)
    assert out["counts"]["fitted"] == 0
    sf.write(out, tmp_path / "o.json")                       # still a valid file
    assert json.loads((tmp_path / "o.json").read_text(encoding="utf-8"))["tickers"] == {}


def test_a_file_seven_days_old_is_still_read(tmp_path):
    h = _history()
    out = _build(tmp_path, _exposures(h, as_of=(TODAY - timedelta(days=7)).isoformat()), {"AAA": _stock(h)})
    assert out["reasons"] == [] and out["counts"]["fitted"] == 1


def test_missing_closes_file_gives_a_reason(tmp_path):
    out = _build(tmp_path, _exposures(_history()), None)
    assert out["tickers"] == {} and out["reasons"][0].startswith("closes_missing")

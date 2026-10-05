"""test_non_common_securities.py — preferreds, notes and units that SEC lists under the common
stock's CIK must not inherit the issuer's market cap, history or SEC metrics.

Covers issuer_securities (the one rule), the Tier 1 hygiene veto, the fundamentals build targets
and the fetch_sec_data CIK -> tickers mapping. Fake data only: no network, no repo data files.
"""
import json
import sys
import zipfile

import pytest

import build_fundamentals_history as bfh
import fetch_sec_data as fsd
import filter_tier1_hygiene as fth
from issuer_securities import common_tickers_by_cik, non_common_securities


def _s(symbol, mcap="missing", **extra):
    row = {"symbol": symbol, **extra}
    if mcap != "missing":
        row["marketCap"] = mcap
    return row


# -- the rule -----------------------------------------------------------------------------------

def test_dual_class_common_stays_common_on_both_classes():
    cik_map = {"GOOG": "0001652044", "GOOGL": "0001652044"}
    stocks = [_s("GOOG", 2e12), _s("GOOGL", 2.1e12)]
    assert common_tickers_by_cik(cik_map, stocks) == {"0001652044": ["GOOG", "GOOGL"]}
    assert non_common_securities(cik_map, stocks) == {}


def test_preferred_sibling_is_non_common_and_names_the_common_tickers():
    cik_map = {"AFG": "0000001", "AFGB": "0000001", "AFGC": "0000001"}
    stocks = [_s("AFGC", 0), _s("AFG", 5e9), _s("AFGB", 0.0)]
    assert common_tickers_by_cik(cik_map, stocks) == {"0000001": ["AFG"]}
    assert non_common_securities(cik_map, stocks) == {
        "AFGB": {"cik": "0000001", "common": ["AFG"]},
        "AFGC": {"cik": "0000001", "common": ["AFG"]},
    }


def test_cik_with_no_vendor_market_cap_anywhere_counts_all_as_common():
    cik_map = {"AAA": "0000002", "AAAP": "0000002"}
    stocks = [_s("AAA", 0), _s("AAAP", None)]
    assert common_tickers_by_cik(cik_map, stocks) == {"0000002": ["AAA", "AAAP"]}
    assert non_common_securities(cik_map, stocks) == {}


def test_ticker_without_a_cik_is_untouched():
    cik_map = {"AFG": "0000001"}
    stocks = [_s("AFG", 5e9), _s("NOCIK", 0), _s("NOCIK2")]
    assert non_common_securities(cik_map, stocks) == {}
    assert common_tickers_by_cik(cik_map, stocks) == {"0000001": ["AFG"]}


@pytest.mark.parametrize("mcap", [0, 0.0, None, "missing", "n/a", True, float("nan"), -5.0])
def test_zero_none_and_missing_market_cap_all_mean_no_vendor_market_cap(mcap):
    cik_map = {"CUB": "0000003", "CUBWU": "0000003"}
    stocks = [_s("CUB", 1e9), _s("CUBWU", mcap)]
    assert non_common_securities(cik_map, stocks) == {"CUBWU": {"cik": "0000003", "common": ["CUB"]}}


def test_cik_map_tickers_outside_the_universe_are_ignored():
    cik_map = {"AFG": "0000001", "GHOST": "0000001"}
    stocks = [_s("AFG", 5e9)]
    assert common_tickers_by_cik(cik_map, stocks) == {"0000001": ["AFG"]}
    assert non_common_securities(cik_map, stocks) == {}


# -- Tier 1 hygiene -----------------------------------------------------------------------------

def _run_hygiene(tmp_path, monkeypatch, stocks, cik_doc, shares):
    for name, fname in (("DATA", ""), ("STOCKS_JSON", "stocks.json"),
                        ("FUNDAMENTALS_JSON", "fundamentals_history.json"),
                        ("FUNDAMENTALS_TTM_JSON", "fundamentals_ttm.json"),
                        ("MOMENTUM_STATE_JSON", "momentum_state.json"),
                        ("CIK_MAP_JSON", "cik_map.json"),
                        ("OUT_SURVIVORS_JSON", "tier1_hygiene_survivors.json"),
                        ("OUT_AUDIT_JSON", "tier1_hygiene_audit.json")):
        monkeypatch.setattr(fth, name, tmp_path / fname if fname else tmp_path)
    monkeypatch.setattr(fth, "BENCHMARK_PRESERVE", [])
    (tmp_path / "stocks.json").write_text(json.dumps(stocks), encoding="utf-8")
    fh = {t: {"2025": {"shares_diluted": n}} for t, n in shares.items()}
    p_ends = {t: {"2025": "2026-06-30"} for t in shares}
    (tmp_path / "fundamentals_history.json").write_text(
        json.dumps({"tickers": fh, "provenance": {"period_end": p_ends}}), encoding="utf-8")
    (tmp_path / "fundamentals_ttm.json").write_text(json.dumps({"tickers": {}}), encoding="utf-8")
    (tmp_path / "momentum_state.json").write_text(json.dumps({"tickers": {}}), encoding="utf-8")
    (tmp_path / "cik_map.json").write_text(json.dumps(cik_doc), encoding="utf-8")
    survivors = fth.evaluate_tier1()
    audit = json.loads((tmp_path / "tier1_hygiene_audit.json").read_text(encoding="utf-8"))
    return survivors, audit


def _row(symbol, mcap, price):
    return {"symbol": symbol, "price": price, "marketCap": mcap, "volume": 1e6,
            "country": "United States", "industry": "Insurance"}


def test_hygiene_vetoes_a_non_common_security_without_deriving_its_market_cap(tmp_path, monkeypatch):
    stocks = [_row("AFG", 5e9, 120.0), _row("AFGB", 0, 22.05), _row("LONE", 0, 50.0)]
    cik_doc = {"fetched_at": "2026-10-05T00:00:00Z",
               "map": {"AFG": "0000001", "AFGB": "0000001", "LONE": "0000009"}}
    # AFGB carries the issuer's 83.5M diluted shares: price x shares = $1.84B would pass $300M.
    shares = {"AFG": 83_500_000.0, "AFGB": 83_500_000.0, "LONE": 10_000_000.0}
    survivors, audit = _run_hygiene(tmp_path, monkeypatch, stocks, cik_doc, shares)

    assert "AFGB" not in survivors
    d = audit["details"]["AFGB"]
    assert d["decision"] == "VETO"
    assert d["primary_reason"] == "NON_COMMON_SECURITY"
    assert d["reasons"][0] == ("NON_COMMON_SECURITY (shares CIK 0000001 with AFG, "
                               "which carry the issuer's market cap)")
    assert d["mcap_derived"] is False
    assert "DATA_FLAG: MCAP_DERIVED" not in d["flags"]
    assert audit["veto_breakdown"]["NON_COMMON_SECURITY"] == 1

    # the common stock and the lone ticker behave as before; C11 still derives for the lone ticker
    assert audit["details"]["AFG"]["decision"] == "PASS"
    assert audit["details"]["AFG"]["mcap_derived"] is False
    assert audit["details"]["LONE"]["decision"] == "PASS"
    assert audit["details"]["LONE"]["mcap_derived"] is True
    assert audit["details"]["LONE"]["marketCap"] == 500_000_000.0


def test_hygiene_non_common_veto_is_listed_before_every_other_reason(tmp_path, monkeypatch):
    stocks = [_row("AFG", 5e9, 120.0), _row("AFGB", 0, 1.5)]       # also below the $3 price floor
    cik_doc = {"map": {"AFG": "0000001", "AFGB": "0000001"}}
    _, audit = _run_hygiene(tmp_path, monkeypatch, stocks, cik_doc, {"AFG": 83_500_000.0})
    d = audit["details"]["AFGB"]
    assert d["primary_reason"] == "NON_COMMON_SECURITY"
    assert d["reasons"][0].startswith("NON_COMMON_SECURITY (")
    assert any(r.startswith("PRICE_BELOW_3") for r in d["reasons"][1:])


def test_hygiene_dual_class_common_pair_is_unaffected(tmp_path, monkeypatch):
    stocks = [_row("GOOG", 2e12, 180.0), _row("GOOGL", 2.1e12, 178.0)]
    cik_doc = {"map": {"GOOG": "0001652044", "GOOGL": "0001652044"}}
    shares = {"GOOG": 1.2e10, "GOOGL": 1.2e10}
    survivors, audit = _run_hygiene(tmp_path, monkeypatch, stocks, cik_doc, shares)
    assert sorted(survivors) == ["GOOG", "GOOGL"]
    assert "NON_COMMON_SECURITY" not in audit["veto_breakdown"]
    assert all(audit["details"][t]["mcap_derived"] is False for t in ("GOOG", "GOOGL"))


# -- fundamentals build targets -----------------------------------------------------------------

def _companyfacts():
    def inst(y, v):
        return {"end": f"{y}-12-31", "val": v, "form": "10-K", "accn": f"acc-{y}", "filed": f"{y + 1}-02-20"}

    def flow(y, v):
        return {"start": f"{y}-01-01", "end": f"{y}-12-31", "val": v, "form": "10-K",
                "accn": f"acc-{y}", "filed": f"{y + 1}-02-20"}

    years = range(2015, 2023)
    return {"facts": {"us-gaap": {
        "Assets": {"units": {"USD": [inst(y, 1_000_000 + y) for y in years]}},
        "Revenues": {"units": {"USD": [flow(y, 500_000 + y) for y in years]}}}, "ifrs-full": {}}}


def test_fundamentals_build_writes_no_rows_for_non_common_securities(tmp_path, monkeypatch):
    stocks = [_s("AFG", 5e9), _s("AFGB", 0), _s("GOOG", 2e12), _s("GOOGL", 2.1e12), _s("NOCIK", 1e9)]
    cik_map = {"AFG": "0000001", "AFGB": "0000001", "GOOG": "0000002", "GOOGL": "0000002"}
    (tmp_path / "stocks.json").write_text(json.dumps(stocks), encoding="utf-8")
    (tmp_path / "cik_map.json").write_text(json.dumps({"fetched_at": "x", "map": cik_map}), encoding="utf-8")
    zpath = tmp_path / "companyfacts.zip"
    with zipfile.ZipFile(zpath, "w") as z:
        for cik in ("0000001", "0000002"):
            z.writestr(f"CIK{cik}.json", json.dumps(_companyfacts()))
    for name in ("DATA", "STOCKS_JSON", "ZIP_PATH", "CIK_MAP_JSON", "HISTORY_JSON",
                 "BATTERY_JSON", "TTM_JSON", "QTR_JSON"):
        monkeypatch.setattr(bfh, name, getattr(bfh, name))          # restored after the test
    monkeypatch.setattr(sys, "argv", ["build_fundamentals_history.py", "--zip", str(zpath),
                                      "--data-dir", str(tmp_path)])
    bfh.main()

    hist = json.loads((tmp_path / "fundamentals_history.json").read_text(encoding="utf-8"))
    assert sorted(hist["tickers"]) == ["AFG", "GOOG", "GOOGL"]
    assert hist["provenance"]["non_common_securities"] == {"AFGB": {"cik": "0000001", "common": ["AFG"]}}
    for fname in ("fundamentals_ttm.json", "fundamentals_quarterly.json", "fundamentals_battery.json"):
        tickers = json.loads((tmp_path / fname).read_text(encoding="utf-8"))["tickers"]
        assert "AFGB" not in tickers


def test_refresh_one_refuses_a_non_common_security(tmp_path, monkeypatch, capsys):
    (tmp_path / "stocks.json").write_text(json.dumps([_s("AFG", 5e9), _s("AFGB", 0)]), encoding="utf-8")
    monkeypatch.setattr(bfh, "STOCKS_JSON", tmp_path / "stocks.json")
    monkeypatch.setattr(bfh, "get_cik_map", lambda: {"AFG": "0000001", "AFGB": "0000001"})
    monkeypatch.setattr(bfh, "fetch_companyfacts_live", lambda cik: pytest.fail("must not fetch"))
    assert bfh.refresh_one("afgb") == 2
    assert "non-common security" in capsys.readouterr().out


# -- fetch_sec_data CIK -> tickers --------------------------------------------------------------

def _fetch_fixture(tmp_path, monkeypatch):
    stocks = [_s("CUB", 1e9), _s("CUBWU", 0), _s("GOOG", 2e12), _s("GOOGL", 2.1e12),
              _s("PMT", 1e9), _s("PMTV", 0), _s("NOCIK", 1e9)]
    cik_map = {"CUB": "0000001", "CUBWU": "0000001", "GOOG": "0000002", "GOOGL": "0000002",
               "PMT": "0000003", "PMTV": "0000003"}
    monkeypatch.chdir(tmp_path)
    with zipfile.ZipFile(tmp_path / "companyfacts.zip", "w") as z:
        for cik in ("0000001", "0000002", "0000003"):
            z.writestr(f"CIK{cik}.json", "{}")
    return stocks, cik_map


def test_sec_metrics_cik_maps_to_all_common_tickers_and_never_a_non_common_one(tmp_path, monkeypatch):
    stocks, cik_map = _fetch_fixture(tmp_path, monkeypatch)
    tickers = [s["symbol"] for s in stocks]
    # the non-common sibling comes last in stocks.json order: it used to win the CIK
    cik_to_tickers = fsd.download_and_extract_facts(cik_map, tickers, common_tickers_by_cik(cik_map, stocks))
    assert cik_to_tickers == {"0000001": ["CUB"], "0000002": ["GOOG", "GOOGL"], "0000003": ["PMT"]}


def test_sec_metrics_main_merges_into_every_common_ticker_and_parses_once_per_cik(tmp_path, monkeypatch):
    stocks, cik_map = _fetch_fixture(tmp_path, monkeypatch)
    full = [{**s, "name": s["symbol"], "description": "", "price": 10.0, "sector": "X", "industry": "Y",
             "score": 0, "status": "ok", "failCodes": [], "metrics": {}} for s in stocks]
    (tmp_path / "public" / "data" / "financials").mkdir(parents=True)
    (tmp_path / "public" / "data" / "stocks.json").write_text(json.dumps(full), encoding="utf-8")
    monkeypatch.setattr(fsd, "get_cik_mapping", lambda: cik_map)
    calls = []

    def fake_parse(ticker, cik, input_dir):
        calls.append(cik)
        return {"ticker": ticker, "EPS_YoY_Growth": 0.5, "Prior_Year_TTM_EPS": 1.0,
                "Revenue_YoY_Growth": 0.1, "Consecutive_YoY_EPS_Growth": 2}

    monkeypatch.setattr(fsd, "parse_facts", fake_parse)
    fsd.main()

    out = {s["symbol"]: s for s in json.loads((tmp_path / "public/data/stocks.json").read_text(encoding="utf-8"))}
    for t in ("CUB", "GOOG", "GOOGL", "PMT"):
        assert out[t]["metrics"]["epsYoyGrowth"] == 0.5
        assert (tmp_path / "public/data/financials" / f"{t}.json").exists()
    for t in ("CUBWU", "PMTV", "NOCIK"):
        assert out[t]["metrics"] == {}
        assert not (tmp_path / "public/data/financials" / f"{t}.json").exists()
    assert sorted(calls) == ["0000001", "0000002", "0000003"]

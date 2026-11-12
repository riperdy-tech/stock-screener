"""WO_SF6 part 3: the operator exclusion key in not_tradable.json, and the liquidity-floor
measurement. Synthetic tickers only (XCLUDE, AAA, AAB, ...)."""

import json

import score_factors_dual_door as sfdd
import tradability
from liquidity_floor import floor_report, resolve_list_adv
from test_sf6_share_class import _row, _run_scorer, _stocks, CIK


# ── the exclusion key ────────────────────────────────────────────────────────

def test_load_config_reads_operator_excluded(tmp_path):
    p = tmp_path / "nt.json"
    p.write_text(json.dumps({
        "tickers": {"CPRX": {"reason": "halt"}},
        "operator_excluded": {"_note": "doc", "xclude": {"reason": "operator", "since": "2026-11-12"}},
    }), encoding="utf-8")
    cfg = tradability.load_config(p)
    assert cfg["operator_excluded"] == {"XCLUDE": {"reason": "operator", "since": "2026-11-12"}}
    assert "XCLUDE" not in cfg["tickers"]              # not a veto: it is not on the untradable list


def test_load_config_without_the_key_has_no_exclusions(tmp_path):
    p = tmp_path / "nt.json"
    p.write_text(json.dumps({"tickers": {}}), encoding="utf-8")
    assert tradability.load_config(p)["operator_excluded"] == {}
    assert tradability.load_config(tmp_path / "missing.json")["operator_excluded"] == {}


def test_the_shipped_file_has_the_documented_empty_key():
    raw = json.loads(tradability.CONFIG_JSON.read_text(encoding="utf-8"))
    assert "operator_excluded" in raw
    assert tradability.load_config()["operator_excluded"] == {}     # the coordinator fills in names


def test_operator_excluded_is_annotated_and_the_other_class_stays_nominable():
    out = sfdd.nomination_exclusions({"AAA": {}, "AAB": {}, "ZZZ": {}}, {"AAA": 9e6, "AAB": 1e6},
                                     {}, CIK, _stocks("AAA", "AAB", "ZZZ"),
                                     operator_excluded={"AAA": {"reason": "op", "since": "2026-11-12"}})
    assert out["AAA"]["flag"] == "operator_excluded"
    assert out["AAA"]["detail"] == {"reason": "op", "since": "2026-11-12"}
    assert "AAB" not in out and "ZZZ" not in out        # AAB is the only class left, so it is kept


def test_the_scorer_keeps_an_excluded_name_scored_but_off_the_list(tmp_path, monkeypatch):
    cfg = {"grace_days": 5, "tickers": {}, "operator_excluded": {"XCLUDE": {"reason": "op", "since": "2026-11-12"}}}
    monkeypatch.setattr(tradability, "load_config", lambda *a, **k: cfg)
    stocks = {"XCLUDE": {**_row(90e6), "symbol": "XCLUDE"}, "OTHER": {**_row(50e6), "symbol": "OTHER"}}
    rows = _run_scorer(tmp_path, monkeypatch, stocks, {})
    assert rows["XCLUDE"]["fct_veto"] is None and rows["XCLUDE"]["fct_band"] == "pass"
    assert "operator_excluded" in rows["XCLUDE"]["fct_flags"]
    assert rows["XCLUDE"]["fct_rank"] is not None
    assert rows["OTHER"]["fct_band"] in ("research_now", "watchlist")


# ── the floor measurement ────────────────────────────────────────────────────

def _tick(band, rank, veto=None, flags=()):
    return {"fct_band": band, "fct_rank": rank, "fct_veto": veto, "fct_flags": list(flags)}


def test_floor_report_lists_failures_and_replacements():
    ft = {
        "L1": _tick("research_now", 1), "L2": _tick("research_now", 2),
        "L3": _tick("watchlist", 3), "L4": _tick("watchlist", 4),
        "P1": _tick("pass", 5), "P2": _tick("pass", 6), "P3": _tick("pass", 7), "P4": _tick("pass", 8),
        "V1": _tick("vetoed", None, veto="X"),
    }
    adv = {"L1": 2e6, "L2": 250e3, "L3": 0.0, "L4": None, "P1": 100e3, "P2": 2e6, "P3": None, "P4": 9e6}
    r = floor_report(ft, adv, floors=(300e3, 1e6, 3e6))
    f300, f1m, f3m = r["floors"]
    assert [x["ticker"] for x in f300["fail"]] == ["L2", "L3"]      # 0.0 is a value: it fails
    assert f300["unmeasured_on_list"] == ["L4"]                      # no figure: neither pass nor fail
    assert [x["ticker"] for x in f300["replacements"]] == ["P2", "P3"]   # P1 fails the floor itself
    assert f300["replacements"][1]["measured"] is False
    assert [x["ticker"] for x in f1m["fail"]] == ["L2", "L3"]
    assert [x["ticker"] for x in f3m["fail"]] == ["L1", "L2", "L3"]
    assert [x["ticker"] for x in f3m["replacements"]] == ["P3", "P4"]     # only two names are left to take three places
    assert r["coverage"] == {"list": 4, "list_measured": 3, "scored": 8, "scored_measured": 6}


def test_replacements_skip_secondary_and_excluded_names():
    ft = {"L1": _tick("research_now", 1), "S1": _tick("pass", 2, flags=["secondary_share_class"]),
          "O1": _tick("pass", 3, flags=["operator_excluded"]), "P1": _tick("pass", 4)}
    r = floor_report(ft, {"L1": 1.0, "S1": 9e9, "O1": 9e9, "P1": 9e9}, floors=(300e3,))
    assert [x["ticker"] for x in r["floors"][0]["replacements"]] == ["P1"]


def test_resolve_list_adv_prefers_the_universe_figure_and_keeps_zero():
    stocks = {"A": {"metrics": {"adv_20d_usd": 0.0}}, "B": {"metrics": {}}, "C": {}}
    mom = {"A": {"adv_20d_usd": 5e6}, "B": {"adv_20d_usd": 7e6}}
    assert resolve_list_adv(stocks, mom) == {"A": 0.0, "B": 7e6, "C": None}

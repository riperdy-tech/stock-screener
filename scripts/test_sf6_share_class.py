"""WO_SF6 part 2: one share class per company before nomination.

The real functions run on synthetic tickers (AAA / AAB share a CIK; ZZZ is alone).
"""

import score_factors_dual_door as sfdd
from issuer_securities import secondary_share_classes

CIK = {"AAA": "1", "AAB": "1", "AAP": "1", "ZZZ": "2", "GOOG": "3", "GOOGL": "3"}


def _stocks(*syms, caps=None):
    caps = caps or {}
    return [{"symbol": s, "marketCap": caps.get(s, 1e9)} for s in syms]


def test_higher_adv_class_is_kept():
    out = secondary_share_classes(CIK, _stocks("AAA", "AAB"), ["AAA", "AAB"],
                                  adv={"AAA": 5e6, "AAB": 1e6}, mcap={"AAA": 1e9, "AAB": 9e9})
    assert out == {"AAB": {"cik": "1", "kept": "AAA", "basis": "adv"}}


def test_a_class_with_no_figure_loses_to_one_with_a_figure_even_with_the_bigger_cap():
    out = secondary_share_classes(CIK, _stocks("AAA", "AAB"), ["AAA", "AAB"],
                                  adv={"AAA": None, "AAB": 10.0}, mcap={"AAA": 9e9, "AAB": 1e9})
    assert out["AAA"]["kept"] == "AAB" and out["AAA"]["basis"] == "adv_missing"


def test_zero_adv_is_a_figure_not_a_missing_one():
    out = secondary_share_classes(CIK, _stocks("AAA", "AAB"), ["AAA", "AAB"],
                                  adv={"AAA": 0.0, "AAB": None}, mcap={"AAA": 1e9, "AAB": 9e9})
    assert out["AAB"]["kept"] == "AAA"


def test_without_any_figure_the_larger_market_cap_is_kept():
    out = secondary_share_classes(CIK, _stocks("AAA", "AAB"), ["AAA", "AAB"],
                                  adv={}, mcap={"AAA": 1e9, "AAB": 2e9})
    assert out == {"AAA": {"cik": "1", "kept": "AAB", "basis": "market_cap"}}


def test_equal_adv_goes_to_cap_then_ticker():
    adv = {"AAA": 1e6, "AAB": 1e6}
    out = secondary_share_classes(CIK, _stocks("AAA", "AAB"), ["AAA", "AAB"], adv=adv,
                                  mcap={"AAA": 1e9, "AAB": 2e9})
    assert list(out) == ["AAA"] and out["AAA"]["basis"] == "market_cap"
    out = secondary_share_classes(CIK, _stocks("AAA", "AAB"), ["AAA", "AAB"], adv=adv,
                                  mcap={"AAA": 1e9, "AAB": 1e9})
    assert list(out) == ["AAB"] and out["AAB"]["basis"] == "ticker"   # AAA sorts first and is kept


def test_three_classes_keep_one():
    out = secondary_share_classes(CIK, _stocks("AAA", "AAB", "AAP"), ["AAA", "AAB", "AAP"],
                                  adv={"AAA": 1.0, "AAB": 3.0, "AAP": 2.0}, mcap={})
    assert set(out) == {"AAA", "AAP"} and {v["kept"] for v in out.values()} == {"AAB"}


def test_only_scored_classes_compete():
    """AAB is the better class but is not scored (vetoed): AAA must not be dropped for it."""
    out = secondary_share_classes(CIK, _stocks("AAA", "AAB"), ["AAA"],
                                  adv={"AAA": 1.0, "AAB": 9e9}, mcap={})
    assert out == {}


def test_a_preferred_is_not_a_second_common_class():
    """AAP has no vendor market cap: it is a non-common security, handled elsewhere."""
    stocks = [{"symbol": "AAA", "marketCap": 1e9}, {"symbol": "AAP", "marketCap": 0}]
    assert secondary_share_classes(CIK, stocks, ["AAA", "AAP"], adv={}, mcap={}) == {}


def test_single_class_and_unmapped_tickers_are_untouched():
    assert secondary_share_classes(CIK, _stocks("ZZZ", "QQQ"), ["ZZZ", "QQQ"], adv={}, mcap={}) == {}


def test_nomination_exclusions_annotate_the_secondary_class():
    profiles = {"AAA": {}, "AAB": {}, "ZZZ": {}}
    out = sfdd.nomination_exclusions(profiles, ticker_adv={"AAA": 5e6, "AAB": 0.0},
                                     ticker_mcap={"AAA": 1e9, "AAB": 1e9}, ticker_to_cik=CIK,
                                     stock_rows=_stocks("AAA", "AAB", "ZZZ"))
    assert set(out) == {"AAB"}
    assert out["AAB"]["flag"] == "secondary_share_class"
    assert out["AAB"]["detail"]["kept"] == "AAA"


def _run_scorer(tmp_path, monkeypatch, stocks, cik_map, extra_files=()):
    import json
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True)
    fundamentals = {"tickers": {t: {"2024": {"revenue": 1000.0, "operating_income": 100.0, "net_income": 80.0}}
                                for t in stocks}}
    (data_dir / "stocks.json").write_text(json.dumps(stocks), encoding="utf-8")
    (data_dir / "fundamentals_history.json").write_text(json.dumps(fundamentals), encoding="utf-8")
    (data_dir / "cik_map.json").write_text(json.dumps({"map": cik_map}), encoding="utf-8")
    for name, payload in extra_files:
        (data_dir / name).write_text(json.dumps(payload), encoding="utf-8")
    out_dual, out_compat = tmp_path / "factor_scores_dual_door.json", tmp_path / "factor_scores.json"
    for attr, fn in (("STOCKS_JSON", "stocks.json"), ("PRICE_HISTORY_JSON", "price_history.json"),
                     ("FUNDAMENTALS_HISTORY_JSON", "fundamentals_history.json"),
                     ("BATTERY_JSON", "fundamentals_battery.json"), ("EPS_TRAJECTORY_JSON", "eps_trajectory.json"),
                     ("TIER1_SURVIVORS_JSON", "tier1_hygiene_survivors.json"),
                     ("MOMENTUM_STATE_JSON", "momentum_state.json")):
        monkeypatch.setattr(sfdd, attr, data_dir / fn)
    monkeypatch.setattr(sfdd, "DATA", data_dir)
    monkeypatch.setattr(sfdd, "OUT_JSON", out_dual)
    monkeypatch.setattr(sfdd, "FACTOR_SCORES_COMPAT_JSON", out_compat)
    monkeypatch.setattr(sfdd, "sync_mri_snapshot", lambda: None)
    sfdd.main()
    return json.loads(out_compat.read_text(encoding="utf-8"))["tickers"]


def _row(adv, cap=5e9):
    return {"symbol": "X", "sector": "Technology", "industry": "Software-Application",
            "marketCap": cap, "price": 50.0, "metrics": {"adv_20d_usd": adv}}


def test_the_scorer_nominates_one_class_and_annotates_the_other(tmp_path, monkeypatch):
    # both classes are above the $300k floor (it is enforced since 2026-11-13), so the class rule is what is tested
    stocks = {"AAA": {**_row(1e6), "symbol": "AAA"}, "AAB": {**_row(50e6), "symbol": "AAB"}}
    rows = _run_scorer(tmp_path, monkeypatch, stocks, {"AAA": "1", "AAB": "1"})
    assert rows["AAB"]["fct_band"] in ("research_now", "watchlist")
    assert rows["AAA"]["fct_band"] == "pass" and rows["AAA"]["fct_veto"] is None
    assert "secondary_share_class" in rows["AAA"]["fct_flags"]
    assert rows["AAA"]["fct_flag_detail"]["secondary_share_class"]["kept"] == "AAB"
    assert rows["AAA"]["fct_rank"] is not None          # still scored and ranked
    assert "secondary_share_class" not in rows["AAB"]["fct_flags"]

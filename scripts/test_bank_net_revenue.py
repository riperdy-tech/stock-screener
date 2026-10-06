"""Bank net revenue in build_fundamentals_history (2026-10-06): a bank P&L filer's revenue is
InterestIncomeExpenseNet (NII) + NoninterestIncome, in the annual history, the TTM and the quarterly
snapshot, and a listed revenue tag is refused for it. Synthetic companyfacts only; no network, no repo files.

What is pinned:
  * bank_net_revenue_filer: both components with the SAME annual period end, else not a filer;
  * annual history: the sum comes from the CHOSEN accession; the series value stands in when that accession
    lacks the component for the period (and only on the row's own period); a clean power-of-1000 accession
    value is refused; a listed tag is refused for a filer in EVERY year (no mixing) and kept for any other
    filer; a year missing one component is null; a row that only existed through the refused listed revenue
    and has no total_assets is dropped;
  * the components never vote: every other cell, the chosen accession's overrides and the period ends are
    identical with and without them;
  * TTM: the two components over the SAME windows, else absent, never a listed tag;
  * quarterly: the two components per quarter, never a listed tag; none in common -> the snapshot is None;
  * provenance: state "n" (bank_net_revenue), tag "InterestIncomeExpenseNet+NoninterestIncome", encoded and
    merged by --refresh-one's path.
"""

import copy
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "bfh", str(Path(__file__).resolve().parent / "build_fundamentals_history.py"))
bfh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bfh)

NII, NONII = "InterestIncomeExpenseNet", "NoninterestIncome"
YEARS = range(2015, 2023)


def _i(y, val, accn=None, filed=None):
    return {"end": f"{y}-12-31", "val": val, "form": "10-K",
            "accn": accn or f"acc-{y}", "filed": filed or f"{y + 1}-02-20"}


def _d(y, val, accn=None, filed=None, start=None, end=None):
    return {"start": start or f"{y}-01-01", "end": end or f"{y}-12-31", "val": val, "form": "10-K",
            "accn": accn or f"acc-{y}", "filed": filed or f"{y + 1}-02-20"}


def _inst(vals):
    return {"units": {"USD": [_i(y, v) for y, v in sorted(vals.items())]}}


def _flow(vals):
    return {"units": {"USD": [_d(y, v) for y, v in sorted(vals.items())]}}


def _doc(us):
    return {"facts": {"us-gaap": us, "ifrs-full": {}}}


def _us(nii_years=YEARS, nonii_years=YEARS, listed=True, assets_years=YEARS):
    us = {"Assets": _inst({y: 9_000_000 + y for y in assets_years})}
    if listed:
        us["RevenueFromContractWithCustomerExcludingAssessedTax"] = _flow({y: 10_000 + y for y in YEARS})
    if nii_years:
        us[NII] = _flow({y: 100_000 + 1_000 * (y - 2015) for y in nii_years})
    if nonii_years:
        us[NONII] = _flow({y: 40_000 + 100 * (y - 2015) for y in nonii_years})
    return us


def _out(us, ticker="BANK"):
    out = bfh.build_ticker_outputs(_doc(us), ticker)
    assert out is not None
    return out


def _col(out, field="revenue"):
    return {int(y): row[field] for y, row in out["history"].items()}


def _net(y):
    return (100_000 + 1_000 * (y - 2015)) + (40_000 + 100 * (y - 2015))


# -- the helper -------------------------------------------------------------------------------

def test_filer_needs_both_components_with_the_same_annual_period_end():
    assert bfh.bank_net_revenue_filer(_us()) is True
    assert bfh.bank_net_revenue_filer(_us(nonii_years=())) is False
    assert bfh.bank_net_revenue_filer(_us(nii_years=())) is False
    # NII only in even years, NoninterestIncome only in odd years: no common period end
    assert bfh.bank_net_revenue_filer(_us(nii_years=(2016, 2018), nonii_years=(2017, 2019))) is False
    one_common = _us(nii_years=(2016, 2018), nonii_years=(2017, 2018))
    assert bfh.bank_net_revenue_filer(one_common) is True


def test_filer_ignores_non_annual_facts():
    us = _us(nonii_years=())
    us[NONII] = {"units": {"USD": [
        {"start": "2020-01-01", "end": "2020-03-31", "val": 5, "form": "10-Q", "accn": "q", "filed": "2020-05-01"},
        {"start": "2020-01-01", "end": "2020-12-31", "val": 5, "form": "8-K", "accn": "k", "filed": "2021-02-01"},
        {"start": "2020-07-01", "end": "2020-12-31", "val": 5, "form": "10-K", "accn": "h", "filed": "2021-02-01"}]}}
    assert bfh.bank_net_revenue_filer(us) is False


# -- annual history -----------------------------------------------------------------------------

def test_filer_revenue_is_the_net_sum_and_the_listed_tag_is_refused_in_every_year():
    out = _out(_us())
    assert _col(out) == {y: _net(y) for y in YEARS}
    assert all(v != 10_000 + y for y, v in _col(out).items())


def test_non_filer_keeps_the_listed_tag():
    out = _out(_us(nii_years=(), nonii_years=()))
    assert _col(out) == {y: 10_000 + y for y in YEARS}
    out = _out(_us(nonii_years=()))                      # NII alone is not a bank P&L filer
    assert _col(out) == {y: 10_000 + y for y in YEARS}


def test_no_mixing_listed_years_before_the_components_are_null():
    out = _out(_us(nii_years=range(2018, 2023), nonii_years=range(2018, 2023)))
    col = _col(out)
    assert [col[y] for y in (2015, 2016, 2017)] == [None, None, None]
    assert {y: col[y] for y in range(2018, 2023)} == {y: _net(y) for y in range(2018, 2023)}


def test_year_missing_one_component_is_null():
    out = _out(_us(nonii_years=[y for y in YEARS if y != 2020]))
    col = _col(out)
    assert col[2020] is None
    assert col[2019] == _net(2019) and col[2021] == _net(2021)


def test_row_that_only_existed_through_the_refused_listed_revenue_is_dropped():
    us = _us(nii_years=range(2018, 2023), nonii_years=range(2018, 2023), assets_years=range(2018, 2023))
    out = _out(us)
    assert sorted(int(y) for y in out["history"]) == [2018, 2019, 2020, 2021, 2022]
    # the same facts without the components keep the listed-revenue rows
    plain = _out({k: v for k, v in us.items() if k not in (NII, NONII)})
    assert sorted(int(y) for y in plain["history"]) == list(YEARS)


def _restated_2021(nii_orig=100_000, nii_late=110_000):
    """FY2021 filed in acc-2021 (the row's filing: Assets, Revenues, net income, ocf, NII, NONII), then a
    later filing acc-2022 that carries FY2021 comparatives for Assets, Revenues and RESTATED components
    only (2 of the 4 vote fields: below the 0.8 bar, so acc-2021 stays the chosen accession)."""
    us = _us(listed=False)
    us["Revenues"] = _flow({y: 10_000 + y for y in YEARS})
    us["NetIncomeLoss"] = _flow({y: 30_000 + y for y in YEARS})
    us["NetCashProvidedByUsedInOperatingActivities"] = _flow({y: 50_000 + y for y in YEARS})
    us[NII]["units"]["USD"] = [e for e in us[NII]["units"]["USD"] if e["end"] != "2021-12-31"] + [
        _d(2021, nii_orig, accn="acc-2021", filed="2022-02-20"),
        _d(2021, nii_late, accn="acc-2022", filed="2023-02-20")]
    us[NONII]["units"]["USD"] += [_d(2021, 99_999, accn="acc-2022", filed="2023-02-20")]
    us["Assets"]["units"]["USD"] += [_i(2021, 9_000_000 + 2021, accn="acc-2022", filed="2023-02-20")]
    us["Revenues"]["units"]["USD"] += [_d(2021, 10_000 + 2021, accn="acc-2022", filed="2023-02-20")]
    return us


def test_sum_comes_from_the_chosen_accession_not_the_latest_filed_series_value():
    out = _out(_restated_2021())
    # series value of NII FY2021 is the later 110,000; the chosen accession acc-2021 files 100,000 and
    # its own NoninterestIncome (NOT the later filing's 99,999)
    assert _col(out)[2021] == 100_000 + (40_000 + 100 * 6)
    assert out["prov"]["period_end"]["2021"] == "2021-12-31"


def test_components_do_not_vote_everything_else_is_identical_without_them():
    with_c = _out(_restated_2021())
    us = _restated_2021()
    del us[NII], us[NONII]
    without = _out(us)
    for field in with_c["history"]["2021"]:
        if field != "revenue":
            assert _col(with_c, field) == _col(without, field), field
    assert with_c["prov"]["period_end"] == without["prov"]["period_end"]
    assert ({y: {f: a for f, a in m.items() if f != "revenue"} for y, m in with_c["prov"]["overrides"].items()}
            == {y: {f: a for f, a in m.items() if f != "revenue"} for y, m in without["prov"]["overrides"].items()})
    assert with_c["battery"]["f_score_checks_available"] is not None


def test_a_refused_listed_revenue_override_is_not_left_behind():
    us = _us()
    # a later sparse filing restates the listed revenue of FY2021 (1 of 2 vote fields: below the 0.8 bar, the
    # row stays on acc-2021): without the filer rule the cell is an accession override
    us["RevenueFromContractWithCustomerExcludingAssessedTax"]["units"]["USD"].append(
        _d(2021, 12_345, accn="acc-2022", filed="2023-02-20"))
    plain = _out({k: v for k, v in us.items() if k not in (NII, NONII)})
    assert plain["prov"]["overrides"].get("2021", {}).get("revenue") == "acc-2021"
    assert "revenue" not in _out(us)["prov"]["overrides"].get("2021", {})


def test_series_value_stands_in_when_the_chosen_accession_lacks_the_component():
    us = _us()
    # FY2020: the components are filed only by a later filing (a comparative in the FY2021 10-K); the
    # row's own accession (acc-2020) carries Assets and the listed revenue only
    for tag, base in ((NII, 100_000 + 5_000), (NONII, 40_000 + 500)):
        us[tag]["units"]["USD"] = [e for e in us[tag]["units"]["USD"] if e["end"] != "2020-12-31"] + [
            _d(2020, base, accn="acc-2021", filed="2022-02-20")]
    assert _col(_out(us))[2020] == _net(2020)


def test_series_value_on_another_period_is_not_used():
    us = _us(nonii_years=[y for y in YEARS if y != 2021])
    # the only FY2021-bin NoninterestIncome ends mid-year (a fiscal-year change): not the row's period
    us[NONII]["units"]["USD"].append(_d(2021, 777, accn="acc-x", filed="2022-09-01",
                                        start="2020-07-01", end="2021-06-30"))
    col = _col(_out(us))
    assert col[2021] is None
    assert col[2020] == _net(2020)


def test_power_of_1000_accession_value_is_refused_for_the_series_value():
    us = _restated_2021(nii_orig=100_000_000, nii_late=106_000)
    out = _out(us)
    # the chosen accession's 100,000,000 is a clean power of 1000 off the resolved 106,000: refused
    assert _col(out)[2021] == 106_000 + (40_000 + 100 * 6)


def test_a_non_power_of_1000_difference_keeps_the_accession_value():
    assert _col(_out(_restated_2021(nii_orig=100_000, nii_late=106_000)))[2021] == 100_000 + 40_600


def test_provenance_state_and_tag():
    us = _us(nii_years=range(2018, 2023), nonii_years=range(2018, 2023))
    out = _out(us)
    assert out["prov"]["states"]["revenue"][2020] == "bank_net_revenue"
    assert out["prov"]["tags"]["revenue"][2020] == "InterestIncomeExpenseNet+NoninterestIncome"
    for y in (2015, 2016, 2017):                      # refused to null: no revenue provenance
        assert y not in out["prov"]["states"]["revenue"] and y not in out["prov"]["tags"]["revenue"]
    prov = bfh.encode_provenance({"BANK": out["history"]}, {"BANK": out["prov"]})
    assert prov["_states"]["n"] == "bank_net_revenue"
    runs = prov["runs"]["BANK"]["revenue"]
    assert [r[0] for r in runs] == [2018] and runs[0][2] == "n"
    assert prov["_tags"][runs[0][1]] == "InterestIncomeExpenseNet+NoninterestIncome"
    assert "n" not in {c for f, seq in prov["runs"]["BANK"].items() if f != "revenue" for _, _, c in seq}


def test_non_filer_provenance_is_unchanged():
    out = _out(_us(nii_years=(), nonii_years=()), "PLAIN")
    assert set(out["prov"]["states"]["revenue"].values()) == {"primary"}
    prov = bfh.encode_provenance({"PLAIN": out["history"]}, {"PLAIN": out["prov"]})
    assert all(c != "n" for seq in prov["runs"]["PLAIN"].values() for _, _, c in seq)


# -- TTM and quarterly --------------------------------------------------------------------------

Q = [("2022-01-01", "2022-03-31"), ("2022-04-01", "2022-06-30"), ("2022-07-01", "2022-09-30"),
     ("2023-01-01", "2023-03-31")]


def _ttm_tag(fy, ytd_cur, ytd_pri, end_cur="2023-03-31", end_pri="2022-03-31"):
    return {"units": {"USD": [
        _d(2022, fy),
        {"start": "2023-01-01", "end": end_cur, "val": ytd_cur, "form": "10-Q", "accn": "q1-23",
         "filed": "2023-05-05"},
        {"start": "2022-01-01", "end": end_pri, "val": ytd_pri, "form": "10-Q", "accn": "q1-22",
         "filed": "2022-05-05"}]}}


def _ttm_facts(nii_end="2023-03-31", nonii_end="2023-03-31", nonii_pri="2022-03-31"):
    return {"NetIncomeLoss": _ttm_tag(1000, 300, 200),
            "Revenues": _ttm_tag(9_000, 2_000, 1_900),
            NII: _ttm_tag(400, 110, 100, nii_end),
            NONII: _ttm_tag(150, 40, 30, nonii_end, nonii_pri)}


def test_ttm_revenue_is_the_net_combine_never_a_listed_tag():
    snap = bfh.ttm_snapshot(_ttm_facts())
    assert snap["fields"]["revenue"] == (400 + 110 - 100) + (150 + 40 - 30)
    assert snap["through"] == "2023-03-31"
    plain = {k: v for k, v in _ttm_facts().items() if k not in (NII, NONII)}
    assert bfh.ttm_snapshot(plain)["fields"]["revenue"] == 9_000 + 2_000 - 1_900     # a non-filer: listed


def test_ttm_window_mismatch_is_absent_not_the_listed_tag():
    snap = bfh.ttm_snapshot(_ttm_facts(nonii_end="2023-06-30", nonii_pri="2022-06-30"))
    assert "revenue" not in snap["fields"]
    assert snap["fields"]["net_income"] == 1000 + 300 - 200


def _q_tag(vals):
    """vals {(start, end): value} -> 10-Q single quarters + the FY2022 annual leg the quarterly reader needs."""
    return {"units": {"USD": [_d(2022, 4_000)] + [
        {"start": s, "end": e, "val": v, "form": "10-Q", "accn": f"q-{e}", "filed": "2023-05-05"}
        for (s, e), v in vals.items()]}}


def test_quarterly_revenue_is_the_net_combine_per_quarter():
    facts = {"Revenues": _q_tag({q: 9_000 for q in Q}),
             NII: _q_tag({q: 100 + i for i, q in enumerate(Q)}),
             NONII: _q_tag({q: 40 + i for i, q in enumerate(Q)})}
    snap = bfh.quarterly_snapshot(facts)
    assert [r["revenue"] for r in snap["quarters"]] == [140 + 2 * i for i in range(4)]
    plain = bfh.quarterly_snapshot({"Revenues": facts["Revenues"]})
    assert [r["revenue"] for r in plain["quarters"]] == [9_000] * 4


def test_quarterly_filer_with_no_common_quarter_loses_the_snapshot():
    facts = {"Revenues": _q_tag({q: 9_000 for q in Q}),
             NII: _q_tag({q: 100 for q in Q[:2]}),
             NONII: _q_tag({q: 40 for q in Q[2:]})}
    assert bfh.bank_net_revenue_filer(facts)
    assert bfh.quarterly_snapshot(facts) is None


# -- --refresh-one goes through the same path -----------------------------------------------------

def test_refresh_one_patches_the_same_rows_and_leaves_other_tickers_untouched(tmp_path):
    saved = (bfh.DATA, bfh.STOCKS_JSON, bfh.ZIP_PATH, bfh.CIK_MAP_JSON, bfh.HISTORY_JSON, bfh.BATTERY_JSON,
             bfh.TTM_JSON, bfh.QTR_JSON)
    try:
        plain = _out(_us(nii_years=(), nonii_years=()), "PLAIN")
        hist = {"generated_at": "x", "provenance": bfh.encode_provenance(
                    {"PLAIN": plain["history"]}, {"PLAIN": plain["prov"]}),
                "shares_cover": {}, "tickers": {"PLAIN": plain["history"]}}
        # a production file that predates state "n"
        hist["provenance"]["_states"].pop("n")
        bfh._apply_path_overrides(None, str(tmp_path))
        bfh.HISTORY_JSON.write_text(bfh._dump_compact(hist), encoding="utf-8")
        bfh.BATTERY_JSON.write_text(bfh._dump_battery({"tickers": {"PLAIN": plain["battery"]}}), encoding="utf-8")
        bfh.TTM_JSON.write_text(bfh._dump_compact({"tickers": {}}), encoding="utf-8")
        bfh.QTR_JSON.write_text(bfh._dump_compact({"tickers": {}}), encoding="utf-8")
        before_plain = json.dumps(hist["tickers"]["PLAIN"], sort_keys=True)

        assert bfh.refresh_one("PLAIN", data=_doc(_us(nii_years=(), nonii_years=()))) == 0
        assert "n" not in json.loads(bfh.HISTORY_JSON.read_text(encoding="utf-8"))["provenance"]["_states"]

        bank = _out(_us(), "BANK")
        assert bfh.refresh_one("BANK", data=_doc(_us())) == 0
        got = json.loads(bfh.HISTORY_JSON.read_text(encoding="utf-8"))
        assert got["tickers"]["BANK"] == json.loads(json.dumps(bank["history"]))
        assert {y: r["revenue"] for y, r in got["tickers"]["BANK"].items()} == {str(y): _net(y) for y in YEARS}
        assert json.dumps(got["tickers"]["PLAIN"], sort_keys=True) == before_plain
        assert got["provenance"]["_states"]["n"] == "bank_net_revenue"
        runs = got["provenance"]["runs"]["BANK"]["revenue"]
        assert runs[0][2] == "n" and got["provenance"]["_tags"][runs[0][1]] == "InterestIncomeExpenseNet+NoninterestIncome"
    finally:
        (bfh.DATA, bfh.STOCKS_JSON, bfh.ZIP_PATH, bfh.CIK_MAP_JSON, bfh.HISTORY_JSON, bfh.BATTERY_JSON,
         bfh.TTM_JSON, bfh.QTR_JSON) = saved


if __name__ == "__main__":
    import sys
    import pytest
    sys.exit(pytest.main([__file__, "-q"]))

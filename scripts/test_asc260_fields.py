"""Three annual fields for the ASC 260 identity (brief_rev20_followup.md, section S, item S1):
`eps_diluted`, `net_income_available_to_common_diluted`, `preferred_dividends`.

Each test hands a synthetic companyfacts document to build_ticker_outputs. No network, no repo files.
Every test fails on bbf51b5547 (the fields do not exist there).

What is pinned:
  * eps_diluted: us-gaap EarningsPerShareDiluted, else ifrs DilutedEarningsLossPerShare, else (only in a year
    where no diluted figure is filed) EarningsPerShareBasicAndDiluted, the last marked `basic_and_diluted` in
    the provenance section `eps_rung`; unit USD/shares; the ladder is per fiscal year;
  * net_income_available_to_common_diluted: us-gaap NetIncomeLossAvailableToCommonStockholdersDiluted;
  * preferred_dividends: PreferredStockDividendsIncomeStatementImpact, else PreferredStockDividendsAndOtherAdjustments;
  * the candidate rules are those of the other annual-duration fields (300-400 days, annual forms, end within
    14 days of the bin end); a filed 0 is a value; a year nothing is filed for is null;
  * the three fields are vote-excluded: they never choose a row's accession and never form a year-row;
  * the share-scale step P-2 keeps its own EPS read.
"""

import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "bfh", str(Path(__file__).resolve().parent / "build_fundamentals_history.py"))
bfh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bfh)

YEARS = range(2015, 2023)
NEW = ("eps_diluted", "net_income_available_to_common_diluted", "preferred_dividends")
EPS_US, EPS_IFRS, EPS_BD = "EarningsPerShareDiluted", "DilutedEarningsLossPerShare", "EarningsPerShareBasicAndDiluted"
NIC = "NetIncomeLossAvailableToCommonStockholdersDiluted"
PD1, PD2 = "PreferredStockDividendsIncomeStatementImpact", "PreferredStockDividendsAndOtherAdjustments"


def _i(y, val, accn=None, filed=None, form="10-K"):
    return {"end": f"{y}-12-31", "val": val, "form": form,
            "accn": accn or f"acc-{y}", "filed": filed or f"{y + 1}-02-20"}


def _d(y, val, accn=None, filed=None, form="10-K"):
    return {"start": f"{y}-01-01", "end": f"{y}-12-31", "val": val, "form": form,
            "accn": accn or f"acc-{y}", "filed": filed or f"{y + 1}-02-20"}


def _flow(vals, unit="USD"):
    return {"units": {unit: [_d(y, v) for y, v in sorted(vals.items())]}}


def _inst(vals):
    return {"units": {"USD": [_i(y, v) for y, v in sorted(vals.items())]}}


def _doc(us=None, ifrs=None):
    return {"facts": {"us-gaap": us or {}, "ifrs-full": ifrs or {}}}


def _base_us():
    return {"Assets": _inst({y: 1_000_000 + y for y in YEARS}),
            "Revenues": _flow({y: 500_000 + 1_000 * (y - 2015) for y in YEARS})}


def _eps(vals):
    return _flow(vals, "USD/shares")


def _out(doc, ticker="TEST"):
    out = bfh.build_ticker_outputs(doc, ticker)
    assert out is not None
    return out


def _col(out, field):
    return {int(y): row[field] for y, row in out["history"].items()}


def _prov(out, ticker="TEST"):
    return bfh.encode_provenance({ticker: out["history"]}, {ticker: out["prov"]})


def _section(out, name, ticker="TEST"):
    return {int(y): v for y, v in (_prov(out, ticker).get(name) or {}).get(ticker, {}).items()}


def _run_tags(out, field, ticker="TEST"):
    """{year: tag name} the provenance runs record for `field`."""
    p = _prov(out, ticker)
    runs = p["runs"].get(ticker, {}).get(field, [])
    res = {}
    for y in out["history"]:
        y = int(y)
        cur = None
        for first, ti, _code in runs:
            if first <= y:
                cur = p["_tags"][ti]
        if out["history"][str(y)].get(field) is not None:
            res[y] = cur
    return res


# ── eps_diluted ─────────────────────────────────────────────────────────────────────────────

def test_eps_rung1_us_gaap_diluted():
    us = _base_us()
    us[EPS_US] = _eps({y: 1.5 + 0.1 * (y - 2015) for y in YEARS})
    out = _out(_doc(us))
    assert _col(out, "eps_diluted") == {y: 1.5 + 0.1 * (y - 2015) for y in YEARS}
    assert _section(out, "eps_rung") == {y: "diluted" for y in YEARS}
    assert set(_run_tags(out, "eps_diluted").values()) == {EPS_US}


def test_eps_rung2_ifrs_diluted_when_no_us_gaap_figure():
    us = _base_us()
    ifrs = {EPS_IFRS: _eps({y: 2.25 for y in YEARS})}
    out = _out(_doc(us, ifrs))
    assert _col(out, "eps_diluted") == {y: 2.25 for y in YEARS}
    assert _section(out, "eps_rung") == {y: "ifrs_diluted" for y in YEARS}
    assert set(_run_tags(out, "eps_diluted").values()) == {EPS_IFRS}


def test_eps_the_ladder_is_per_fiscal_year():
    us = _base_us()
    us[EPS_US] = _eps({y: 1.0 for y in range(2019, 2023)})
    ifrs = {EPS_IFRS: _eps({y: 3.0 for y in range(2015, 2019)})}
    out = _out(_doc(us, ifrs))
    assert _col(out, "eps_diluted") == {**{y: 3.0 for y in range(2015, 2019)}, **{y: 1.0 for y in range(2019, 2023)}}
    assert _section(out, "eps_rung") == {**{y: "ifrs_diluted" for y in range(2015, 2019)},
                                          **{y: "diluted" for y in range(2019, 2023)}}


def test_eps_basic_and_diluted_is_used_only_where_no_diluted_figure_is_filed_and_is_marked():
    us = _base_us()
    us[EPS_US] = _eps({y: 1.0 for y in range(2018, 2023)})
    us[EPS_BD] = _eps({y: -0.5 for y in YEARS})                       # the LONGER series must not win
    out = _out(_doc(us))
    assert _col(out, "eps_diluted") == {**{y: -0.5 for y in range(2015, 2018)}, **{y: 1.0 for y in range(2018, 2023)}}
    rung = _section(out, "eps_rung")
    assert {y: rung[y] for y in range(2015, 2018)} == {y: "basic_and_diluted" for y in range(2015, 2018)}
    assert all(rung[y] == "diluted" for y in range(2018, 2023))
    assert _run_tags(out, "eps_diluted")[2016] == EPS_BD and _run_tags(out, "eps_diluted")[2020] == EPS_US


def test_eps_basic_and_diluted_never_beats_a_filed_diluted_figure_in_the_same_year():
    us = _base_us()
    us[EPS_US] = _eps({y: 1.0 for y in YEARS})
    us[EPS_BD] = _eps({y: 9.0 for y in YEARS})
    out = _out(_doc(us))
    assert _col(out, "eps_diluted") == {y: 1.0 for y in YEARS}
    assert set(_section(out, "eps_rung").values()) == {"diluted"}


def test_eps_a_filed_zero_is_a_value_and_a_year_with_nothing_filed_is_null():
    us = _base_us()
    us[EPS_US] = _eps({y: 0.0 for y in range(2016, 2022)})
    out = _out(_doc(us))
    col = _col(out, "eps_diluted")
    assert col[2016] == 0.0 and col[2021] == 0.0 and col[2016] is not None
    assert col[2015] is None and col[2022] is None
    assert 2015 not in _section(out, "eps_rung")                       # no cell, no rung


def test_eps_candidate_rules_annual_form_and_duration():
    """A 10-Q fact, a 90-day fact and a quarterly-only year never become an annual cell."""
    us = _base_us()
    q = {"start": "2022-01-01", "end": "2022-03-31", "val": 9.9, "form": "10-K", "accn": "q", "filed": "2023-02-20"}
    qf = {"start": "2022-01-01", "end": "2022-12-31", "val": 8.8, "form": "10-Q", "accn": "q2", "filed": "2023-02-20"}
    us[EPS_US] = {"units": {"USD/shares": [_d(y, 1.0) for y in range(2015, 2022)] + [q, qf]}}
    out = _out(_doc(us))
    assert _col(out, "eps_diluted")[2022] is None
    assert _col(out, "eps_diluted")[2021] == 1.0


def test_eps_reads_the_usd_per_share_unit_only():
    us = _base_us()
    us[EPS_US] = {"units": {"USD": [_d(y, 7.0) for y in YEARS]}}     # a wrong unit is no EPS figure
    out = _out(_doc(us))
    assert set(_col(out, "eps_diluted").values()) == {None}


def test_eps_the_cell_comes_from_the_rows_chosen_accession():
    """The latest 10-K/A restates 2022 EPS; the row's chosen accession (the one with the most fields) holds
    the original figure. The field receives the accession's correction like every other field."""
    us = _base_us()
    us[EPS_US] = {"units": {"USD/shares": [_d(y, 1.0) for y in YEARS] +
                            [_d(2022, 1.2, accn="late-2022", filed="2023-06-01", form="10-K/A")]}}
    out = _out(_doc(us))
    assert _col(out, "eps_diluted")[2022] == 1.0                      # the chosen accession's figure, not the later 10-K/A's
    assert _col(out, "revenue")[2022] == 507_000
    assert "eps_diluted" in _prov(out)["overrides"]["TEST"]["2022"]    # recorded as an accession override


# ── net_income_available_to_common_diluted ──────────────────────────────────────────────────

def test_net_income_available_to_common_diluted_is_resolved_per_year():
    us = _base_us()
    us[NIC] = _flow({y: 80_000 + y for y in range(2017, 2023)})
    out = _out(_doc(us))
    col = _col(out, "net_income_available_to_common_diluted")
    assert {y: col[y] for y in range(2017, 2023)} == {y: 80_000 + y for y in range(2017, 2023)}
    assert col[2015] is None and col[2016] is None
    assert set(_run_tags(out, "net_income_available_to_common_diluted").values()) == {NIC}


def test_net_income_available_to_common_diluted_keeps_a_loss_and_a_zero():
    us = _base_us()
    us[NIC] = _flow({2020: -5_000, 2021: 0, 2022: 3_000})
    col = _col(_out(_doc(us)), "net_income_available_to_common_diluted")
    assert col[2020] == -5_000 and col[2021] == 0 and col[2021] is not None and col[2022] == 3_000


# ── preferred_dividends ─────────────────────────────────────────────────────────────────────

def test_preferred_dividends_rung1_then_rung2():
    us = _base_us()
    us[PD1] = _flow({y: 4_000 for y in range(2020, 2023)})
    us[PD2] = _flow({y: 6_000 for y in range(2015, 2023)})          # the longer series; rung 1 still wins its years
    out = _out(_doc(us))
    col = _col(out, "preferred_dividends")
    assert {y: col[y] for y in range(2020, 2023)} == {y: 4_000 for y in range(2020, 2023)}
    assert {y: col[y] for y in range(2015, 2020)} == {y: 6_000 for y in range(2015, 2020)}
    tags = _run_tags(out, "preferred_dividends")
    assert tags[2021] == PD1 and tags[2016] == PD2


def test_preferred_dividends_a_filed_zero_is_kept():
    us = _base_us()
    us[PD1] = _flow({y: 0 for y in YEARS})
    col = _col(_out(_doc(us)), "preferred_dividends")
    assert all(v == 0 and v is not None for v in col.values())


def test_preferred_dividends_a_filed_zero_on_rung1_is_not_replaced_by_rung2_and_is_noted():
    us = _base_us()
    us[PD1] = _flow({2022: 0})
    us[PD2] = _flow({y: 2_500 for y in YEARS})
    out = _out(_doc(us))
    col = _col(out, "preferred_dividends")
    assert col[2022] == 0 and col[2021] == 2_500
    notes = _prov(out)["ladder_notes"]["TEST"]["preferred_dividends"]["2022"]
    assert notes[0]["note"] == "rung_conflict" and notes[0]["later_value"] == 2_500


def test_preferred_dividends_null_when_nothing_is_filed():
    col = _col(_out(_doc(_base_us())), "preferred_dividends")
    assert set(col.values()) == {None}


# ── the vote, the year-rows, the provenance ─────────────────────────────────────────────────

def test_the_three_fields_are_vote_excluded():
    for f in NEW:
        assert f in bfh.VOTE_EXCLUDED_FIELDS


def test_the_vote_is_unchanged_a_field_filed_only_in_a_late_accession_does_not_move_the_row():
    """Original accession: revenue + assets. A later 10-K/A restates 2022 revenue and files the three new
    fields. Were the new fields to vote, the 10-K/A would cover as many fields as the original and, being
    later, win the row (revenue 480,000). Vote-excluded, the row stays the original's."""
    us = _base_us()
    late = dict(accn="late-2022", filed="2023-06-01", form="10-K/A")
    us["Revenues"]["units"]["USD"].append(_d(2022, 480_000, **late))
    us[EPS_US] = {"units": {"USD/shares": [_d(2022, 1.1, **late)]}}
    us[NIC] = {"units": {"USD": [_d(2022, 90_000, **late)]}}
    us[PD1] = {"units": {"USD": [_d(2022, 1_000, **late)]}}
    out = _out(_doc(us))
    assert _col(out, "revenue")[2022] == 507_000
    assert _prov(out)["period_end"]["TEST"]["2022"] == "2022-12-31"
    # the cells still take the late accession's figures: it is the only one that files them
    assert _col(out, "eps_diluted")[2022] == 1.1
    assert _col(out, "net_income_available_to_common_diluted")[2022] == 90_000
    assert _col(out, "preferred_dividends")[2022] == 1_000


def test_a_year_with_only_the_new_fields_forms_no_row():
    us = _base_us()
    us[EPS_US] = _eps({y: 1.0 for y in list(YEARS) + [2023]})
    us[PD1] = _flow({2023: 5})
    out = _out(_doc(us))
    assert 2023 not in {int(y) for y in out["history"]}
    assert _col(out, "eps_diluted")[2022] == 1.0 and _col(out, "preferred_dividends")[2022] is None


def test_the_new_fields_add_no_row_and_leave_every_other_cell_alone():
    base = _out(_doc(_base_us()))
    us = _base_us()
    us[EPS_US] = _eps({y: 1.0 for y in YEARS})
    us[NIC] = _flow({y: 9_000 for y in YEARS})
    us[PD1] = _flow({y: 100 for y in YEARS})
    new = _out(_doc(us))
    strip = lambda rows: {y: {k: v for k, v in r.items() if k not in NEW} for y, r in rows.items()}
    assert strip(new["history"]) == strip(base["history"])
    assert _col(new, "eps_diluted") == {y: 1.0 for y in YEARS} and _col(new, "preferred_dividends") == {y: 100 for y in YEARS}
    assert new["battery"] == base["battery"] and new["ttm"] == base["ttm"] and new["qtr"] == base["qtr"]


def test_p2_keeps_its_own_eps_read():
    """The share-scale step reads EarningsPerShareDiluted of the SAME filing (_filed_diluted_eps), never the
    new field: a count filed 1000x too small is rescaled from the diluted EPS identity, while a
    BasicAndDiluted-only figure (which feeds eps_diluted) does not drive the correction."""
    def doc(eps_tag):
        us = _base_us()
        us["NetIncomeLoss"] = _flow({y: 1_000_000 for y in YEARS})
        us["WeightedAverageNumberOfDilutedSharesOutstanding"] = {
            "units": {"shares": [_d(y, 1_000_000 if y == 2022 else 1_000_000_000) for y in YEARS]}}
        us[eps_tag] = _eps({y: 0.001 for y in YEARS})
        return _doc(us)
    with_diluted = _out(doc(EPS_US))
    assert _col(with_diluted, "shares_diluted")[2022] == 1_000_000_000      # rescaled by the EPS identity
    assert _col(with_diluted, "eps_diluted")[2022] == 0.001
    only_bd = _out(doc(EPS_BD))
    assert _col(only_bd, "shares_diluted")[2022] == 1_000_000               # P-2 does not read BasicAndDiluted
    assert _col(only_bd, "eps_diluted")[2022] == 0.001
    assert _section(only_bd, "eps_rung")[2022] == "basic_and_diluted"


def test_the_provenance_schema_documents_the_new_fields_and_section():
    schema = _prov(_out(_doc(_base_us())))["_schema"]
    assert "eps_rung" in schema and "basic_and_diluted" in schema
    for f in NEW:
        assert f in schema


def test_merge_ticker_provenance_carries_eps_rung():
    us = _base_us()
    us[EPS_BD] = _eps({y: 1.0 for y in YEARS})
    out = _out(_doc(us))
    prov = {"_tags": [], "_accns": [], "runs": {}, "overrides": {}, "period_end": {}, "untagged_fields": {},
            "ladder_notes": {}, "scale_corrected": {}}
    bfh.merge_ticker_provenance(prov, "TEST", out["history"], out["prov"])
    assert prov["eps_rung"]["TEST"] == {str(y): "basic_and_diluted" for y in YEARS}
    stale = _out(_doc(_base_us()))
    bfh.merge_ticker_provenance(prov, "TEST", stale["history"], stale["prov"])      # a refresh drops the old section
    assert "TEST" not in prov["eps_rung"]


# ── eps_diluted is exempt from the power-of-1000 scale defences (coordinator ruling, 2026-10-02) ──
# The defences catch dollar amounts filed in the wrong unit; a per-share figure has no such slip.

def test_eps_a_small_value_among_large_neighbours_keeps_its_filed_value():
    us = _base_us()
    vals = {2015: -0.02, 2016: -10.0, 2017: -15.0, 2018: -20.0, 2019: -25.0, 2020: -30.0, 2021: -40.0, 2022: -35.0}
    us[EPS_US] = _eps(vals)
    assert _col(_out(_doc(us)), "eps_diluted") == vals              # series normalisation would give 2015 -> -20.0


def test_eps_duplicate_filings_resolve_to_the_latest_filed_not_by_a_power_of_1000_tie_break():
    """Two filings of FY2022 EPS 1000x apart, neither of them the row's chosen accession (revenue and assets come
    from a third one). The dollar-amount tie-break would keep the value nearest the series; EPS takes the latest filed."""
    us = _base_us()
    us["Revenues"]["units"]["USD"].append(_d(2022, 507_000, accn="rev-2022", filed="2023-03-01"))
    us["Assets"]["units"]["USD"].append(_i(2022, 1_002_022, accn="rev-2022", filed="2023-03-01"))
    us[EPS_US] = {"units": {"USD/shares": [_d(y, 1.0) for y in range(2015, 2022)] +
                            [_d(2022, 1.0, accn="eps-a", filed="2023-02-10"),
                             _d(2022, 0.001, accn="eps-b", filed="2023-06-01", form="10-K/A")]}}
    assert _col(_out(_doc(us)), "eps_diluted")[2022] == 0.001


def test_eps_the_chosen_accessions_figure_is_not_arbitrated_by_scale():
    """The row's chosen accession files 0.02; a later 10-K/A files 20.0 (the series value). The row loop's
    power-of-1000 arbitration for dollar amounts would keep the figure nearest the series median (20.0); a
    per-share cell takes the chosen accession's filed 0.02, like any accession override."""
    us = _base_us()
    us[EPS_US] = {"units": {"USD/shares": [_d(y, 20.0) for y in range(2015, 2022)] +
                            [_d(2022, 0.02),
                             _d(2022, 20.0, accn="late-2022", filed="2023-06-01", form="10-K/A")]}}
    out = _out(_doc(us))
    assert _col(out, "eps_diluted")[2022] == 0.02
    assert "eps_diluted" in _prov(out)["overrides"]["TEST"]["2022"]


def test_the_dollar_amount_fields_keep_the_scale_defence():
    us = _base_us()
    us[NIC] = _flow({y: 90_000 for y in range(2016, 2023)})
    us[NIC]["units"]["USD"].append(_d(2022, 90_000_000, accn="late-2022", filed="2023-06-01", form="10-K/A"))
    us[PD1] = _flow({y: 1_000 for y in range(2016, 2023)})
    us[PD1]["units"]["USD"].append(_d(2022, 1_000_000, accn="late-2022", filed="2023-06-01", form="10-K/A"))
    out = _out(_doc(us))
    assert _col(out, "net_income_available_to_common_diluted")[2022] == 90_000
    assert _col(out, "preferred_dividends")[2022] == 1_000

"""R17 fields in build_fundamentals_history: goodwill, intangibles_ex_goodwill,
amortization_intangibles (+ the per-ticker `untagged_fields` and `ladder_notes` provenance).

Each test hands a synthetic companyfacts document to build_ticker_outputs (the single extraction
path shared by the weekly build and --refresh-one). No network, no repo files.

What is pinned:
  * ladders — the first rung to resolve a year wins it, tags are never summed except the one
    declared Finite+Indefinite pair (both required that year), Finite alone is the last rung;
  * None stays None — a year the filer does not tag is null, never 0 (a filed 0 stays 0);
  * `untagged_fields` lists the fields with no non-null value in any shipped year;
  * nothing else moves: every pre-existing field, the battery, TTM and quarterly outputs are
    identical with and without the R17 tags in the document — including the accession-coverage
    vote, where the new fields must NOT get a say in which filing wins a year-row;
  * A2: AdjustmentForAmortization is not a rung; the ifrs roll-forward element
    AmortisationIntangibleAssetsOtherThanGoodwill is stored as its absolute value (`sign_flipped`),
    every other negative amortization and any negative goodwill/intangible balance is refused for
    that rung (`negative_rejected`, next rung tried, null if none), and a filed 0 that beats a later
    positive rung is recorded as `rung_conflict` without changing the ladder rule.
"""

import copy
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "bfh", str(Path(__file__).resolve().parent / "build_fundamentals_history.py"))
bfh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bfh)

R17 = ("goodwill", "intangibles_ex_goodwill", "amortization_intangibles")
R17_TAGS = ("Goodwill", "IntangibleAssetsNetExcludingGoodwill", "AmortizationOfIntangibleAssets")
YEARS = range(2015, 2023)          # 8 fiscal years, calendar FY


def _i(y, val, accn=None, filed=None, form="10-K"):
    """One annual balance-sheet (instant) fact for FY y."""
    return {"end": f"{y}-12-31", "val": val, "form": form,
            "accn": accn or f"acc-{y}", "filed": filed or f"{y + 1}-02-20"}


def _d(y, val, accn=None, filed=None, form="10-K"):
    """One annual (12-month duration) fact for FY y."""
    return {"start": f"{y}-01-01", "end": f"{y}-12-31", "val": val, "form": form,
            "accn": accn or f"acc-{y}", "filed": filed or f"{y + 1}-02-20"}


def _inst(vals):
    return {"units": {"USD": [_i(y, v) for y, v in sorted(vals.items())]}}


def _flow(vals):
    return {"units": {"USD": [_d(y, v) for y, v in sorted(vals.items())]}}


def _doc(us=None, ifrs=None):
    return {"facts": {"us-gaap": us or {}, "ifrs-full": ifrs or {}}}


def _base_us():
    """Row-forming facts every fixture shares (revenue + total assets, all 8 years)."""
    return {"Assets": _inst({y: 1_000_000 + y for y in YEARS}),
            "Revenues": _flow({y: 500_000 + 1_000 * (y - 2015) for y in YEARS})}


def _out(doc, ticker="TEST"):
    out = bfh.build_ticker_outputs(doc, ticker)
    assert out is not None
    return out


def _col(out, field):
    """{year int: value} across the shipped rows (None kept)."""
    return {int(y): row[field] for y, row in out["history"].items()}


def _untagged(out, ticker="TEST"):
    prov = bfh.encode_provenance({ticker: out["history"]}, {ticker: out["prov"]})
    return prov["untagged_fields"][ticker]


def _rung_tags(out, field, ticker="TEST"):
    """{first_year: tag} decoded from the ENCODED provenance runs (what actually ships)."""
    prov = bfh.encode_provenance({ticker: out["history"]}, {ticker: out["prov"]})
    return {y: prov["_tags"][ti] for y, ti, _ in prov["runs"][ticker][field]}


# ── a filer with all three tags ──────────────────────────────────────────────────────────────

def test_all_three_tags_ship_values_and_nothing_is_untagged():
    us = _base_us()
    us["Goodwill"] = _inst({y: 200_000 + y for y in YEARS})
    us["IntangibleAssetsNetExcludingGoodwill"] = _inst({y: 80_000 + y for y in YEARS})
    us["AmortizationOfIntangibleAssets"] = _flow({y: 9_000 + y for y in YEARS})
    out = _out(_doc(us))
    assert _col(out, "goodwill") == {y: 200_000 + y for y in YEARS}
    assert _col(out, "intangibles_ex_goodwill") == {y: 80_000 + y for y in YEARS}
    assert _col(out, "amortization_intangibles") == {y: 9_000 + y for y in YEARS}
    assert _untagged(out) == []
    assert _rung_tags(out, "goodwill") == {2015: "Goodwill"}
    assert _rung_tags(out, "intangibles_ex_goodwill") == {2015: "IntangibleAssetsNetExcludingGoodwill"}
    assert _rung_tags(out, "amortization_intangibles") == {2015: "AmortizationOfIntangibleAssets"}


def test_new_fields_ride_every_row_and_never_leave_the_year_keys():
    us = _base_us()
    us["Goodwill"] = _inst({2020: 1_000})
    out = _out(_doc(us))
    for y, row in out["history"].items():
        int(y)                                    # rows stay keyed by fiscal year only
        assert all(f in row for f in R17)         # key present in every row, value may be null
    # the marker lives in the provenance sibling, never inside the per-ticker year map
    assert all(k.isdigit() for k in out["history"])


# ── intangibles ladder: primary tags, then the Finite+Indefinite pair, then Finite alone ─────

def test_finite_lived_pair_sum_rung_then_finite_alone():
    us = _base_us()
    us["FiniteLivedIntangibleAssetsNet"] = _inst({y: 60_000 + y for y in range(2015, 2021)})
    us["IndefiniteLivedIntangibleAssetsExcludingGoodwill"] = _inst(
        {**{y: 25_000 for y in range(2015, 2019)}, 2021: 7_000})
    out = _out(_doc(us))
    col = _col(out, "intangibles_ex_goodwill")
    for y in range(2015, 2019):                   # both resolve -> the sum
        assert col[y] == 60_000 + y + 25_000
    for y in (2019, 2020):                        # finite only -> finite alone
        assert col[y] == 60_000 + y
    assert col[2021] is None                      # indefinite alone is NOT a rung
    assert col[2022] is None
    pair = "FiniteLivedIntangibleAssetsNet+IndefiniteLivedIntangibleAssetsExcludingGoodwill"
    assert _rung_tags(out, "intangibles_ex_goodwill") == {
        2015: pair, 2019: "FiniteLivedIntangibleAssetsNet"}
    assert _col(out, "goodwill") == {y: None for y in YEARS}
    assert _untagged(out) == ["goodwill", "amortization_intangibles"]


def test_primary_tags_beat_the_pair_and_are_never_summed():
    us = _base_us()
    us["IntangibleAssetsNetExcludingGoodwill"] = _inst({y: 50_000 for y in range(2015, 2019)})
    us["FiniteLivedIntangibleAssetsNet"] = _inst({y: 30_000 for y in YEARS})
    us["IndefiniteLivedIntangibleAssetsExcludingGoodwill"] = _inst({y: 10_000 for y in YEARS})
    ifrs = {"IntangibleAssetsOtherThanGoodwill": _inst({y: 44_000 for y in range(2018, 2021)})}
    out = _out(_doc(us, ifrs))
    col = _col(out, "intangibles_ex_goodwill")
    assert [col[y] for y in range(2015, 2019)] == [50_000] * 4     # rung 1 wins, even where rung 2 exists (2018)
    assert [col[y] for y in (2019, 2020)] == [44_000, 44_000]      # rung 2 beats the pair
    assert [col[y] for y in (2021, 2022)] == [40_000, 40_000]      # pair sum
    assert _rung_tags(out, "intangibles_ex_goodwill") == {
        2015: "IntangibleAssetsNetExcludingGoodwill",
        2019: "IntangibleAssetsOtherThanGoodwill",
        2021: "FiniteLivedIntangibleAssetsNet+IndefiniteLivedIntangibleAssetsExcludingGoodwill"}


# ── an ifrs-full filer (USD units) ───────────────────────────────────────────────────────────

def test_ifrs_filer_resolves_all_three_fields():
    ifrs = {"Assets": _inst({y: 2_000_000 + y for y in YEARS}),
            "Revenue": _flow({y: 900_000 + y for y in YEARS}),
            "Goodwill": _inst({y: 300_000 + y for y in YEARS}),
            "IntangibleAssetsOtherThanGoodwill": _inst({y: 120_000 + y for y in YEARS}),
            "AmortisationIntangibleAssetsOtherThanGoodwill": _flow({y: 15_000 + y for y in YEARS})}
    out = _out(_doc(ifrs=ifrs))
    assert _col(out, "goodwill") == {y: 300_000 + y for y in YEARS}
    assert _col(out, "intangibles_ex_goodwill") == {y: 120_000 + y for y in YEARS}
    assert _col(out, "amortization_intangibles") == {y: 15_000 + y for y in YEARS}
    assert _untagged(out) == []
    assert _rung_tags(out, "intangibles_ex_goodwill") == {2015: "IntangibleAssetsOtherThanGoodwill"}
    assert _rung_tags(out, "amortization_intangibles") == {
        2015: "AmortisationIntangibleAssetsOtherThanGoodwill"}


# ── amortization ladder: first tag to resolve a year wins that year, never summed ─────────────

def test_amortization_ladder_is_per_year_first_rung_and_never_summed():
    us = _base_us()
    us["AmortizationOfIntangibleAssets"] = _flow({y: 4_000 for y in range(2015, 2020)})
    us["AmortisationExpense"] = _flow({y: 999 for y in YEARS})     # rung 6: must not add to rung 1
    out = _out(_doc(us))
    col = _col(out, "amortization_intangibles")
    assert [col[y] for y in range(2015, 2020)] == [4_000] * 5
    assert [col[y] for y in range(2020, 2023)] == [999] * 3
    assert _rung_tags(out, "amortization_intangibles") == {
        2015: "AmortizationOfIntangibleAssets", 2020: "AmortisationExpense"}


def test_amortization_uses_annual_form_and_year_alignment_like_other_duration_fields():
    us = _base_us()
    us["AmortizationOfIntangibleAssets"] = {"units": {"USD": [
        _d(2019, 5_000),
        _d(2020, 6_000, form="10-Q"),                                     # not an annual form
        {**_d(2021, 7_000), "start": "2021-07-01"},                       # 6-month span, not annual
        _d(2022, 8_000, form="10-K/A")]}}                                 # amended annual counts
    col = _col(_out(_doc(us)), "amortization_intangibles")
    assert col[2019] == 5_000 and col[2022] == 8_000
    assert col[2020] is None and col[2021] is None


# ── a filer with none of the tags ────────────────────────────────────────────────────────────

def test_filer_with_none_gets_null_fields_and_lists_all_three_untagged():
    out = _out(_doc(_base_us()))
    for f in R17:
        assert _col(out, f) == {y: None for y in YEARS}
    assert _untagged(out) == ["goodwill", "intangibles_ex_goodwill", "amortization_intangibles"]


# ── a year gap inside a tagged series stays a gap ────────────────────────────────────────────

def test_year_gap_in_a_tagged_series_is_null_not_zero_and_not_untagged():
    us = _base_us()
    us["Goodwill"] = _inst({y: 100_000 for y in YEARS if y != 2017})
    us["AmortizationOfIntangibleAssets"] = _flow({y: 3_000 for y in YEARS if y not in (2016, 2019)})
    out = _out(_doc(us))
    gw, am = _col(out, "goodwill"), _col(out, "amortization_intangibles")
    assert gw[2017] is None and gw[2016] == 100_000 and gw[2018] == 100_000
    assert am[2016] is None and am[2019] is None and am[2018] == 3_000
    assert _untagged(out) == ["intangibles_ex_goodwill"]     # gaps do not make a field "untagged"


def test_a_filed_zero_is_a_value_not_an_absence():
    us = _base_us()
    us["Goodwill"] = _inst({y: 0 for y in YEARS})
    out = _out(_doc(us))
    assert _col(out, "goodwill") == {y: 0 for y in YEARS}
    assert "goodwill" not in _untagged(out)                  # tagged (0), so not "never tagged"


# ── nothing else moves ───────────────────────────────────────────────────────────────────────

def _without_intangible_tags(doc):
    """Same document minus the balance-sheet R17 tags. Amortization tags stay: the `da`
    component slots read them too, so removing them would legitimately move `da`."""
    d = copy.deepcopy(doc)
    for ns in d["facts"].values():
        for tag in ("Goodwill", "IntangibleAssetsNetExcludingGoodwill",
                    "IntangibleAssetsOtherThanGoodwill", "FiniteLivedIntangibleAssetsNet",
                    "IndefiniteLivedIntangibleAssetsExcludingGoodwill"):
            ns.pop(tag, None)
    return d


def _existing_only(out):
    """Everything an R17-unaware consumer could read, with the R17 keys removed."""
    hist = {y: {k: v for k, v in r.items() if k not in R17} for y, r in out["history"].items()}
    prov = out["prov"]
    ov = {y: {f: a for f, a in m.items() if f not in R17} for y, m in prov["overrides"].items()}
    return json.dumps({
        "history": hist,
        "battery": out["battery"], "ttm": out["ttm"], "qtr": out["qtr"],
        "states": {f: v for f, v in prov["states"].items() if f not in R17},
        "tags": {f: v for f, v in prov["tags"].items() if f not in R17},
        "overrides": {y: m for y, m in ov.items() if m},
        "period_end": prov["period_end"]}, sort_keys=True)


def test_existing_fields_battery_ttm_quarterly_and_provenance_are_unchanged():
    us = _base_us()
    us["NetIncomeLoss"] = _flow({y: 40_000 + 100 * (y - 2015) for y in YEARS})
    us["NetCashProvidedByUsedInOperatingActivities"] = _flow({y: 70_000 for y in YEARS})
    us["StockholdersEquity"] = _inst({y: 600_000 + y for y in YEARS})
    us["Depreciation"] = _flow({y: 12_000 for y in YEARS})
    us["Goodwill"] = _inst({y: 200_000 + y for y in YEARS})
    us["IntangibleAssetsNetExcludingGoodwill"] = _inst({y: 80_000 for y in YEARS})
    us["AmortizationOfIntangibleAssets"] = _flow({y: 9_000 for y in YEARS})
    with_r17 = _out(_doc(us))
    without = _out(_without_intangible_tags(_doc(us)))
    assert _existing_only(with_r17) == _existing_only(without)
    # and the R17 keys really were populated in the "with" run, so the comparison is not vacuous
    assert _col(with_r17, "goodwill")[2020] == 200_000 + 2020
    assert _col(without, "goodwill")[2020] is None
    assert _col(with_r17, "da")[2020] == 12_000 + 9_000     # `da` component-slot logic untouched


def test_new_fields_do_not_vote_in_the_accession_coverage_rule():
    """FY2020 is filed twice: 10-K accession A (5 vote fields + the 3 R17 fields) and a later
    10-K/A accession B (4 vote fields). Without R17 in the vote B clears the 0.8 coverage bar and,
    being latest, supplies the row (revenue 555). If R17 fields voted, A would reach 8 fields, B
    (4) would fall below 0.8*8 and A would win the row (revenue 500) — silently rewriting a
    pre-existing cell. The R17 values themselves still ship from the resolved series."""
    A = dict(accn="acc-A", filed="2021-02-20", form="10-K")
    B = dict(accn="acc-B", filed="2021-06-01", form="10-K/A")
    us = {
        "Revenues": {"units": {"USD": [_d(2020, 500, **A), _d(2020, 555, **B)]}},
        "NetIncomeLoss": {"units": {"USD": [_d(2020, 50, **A), _d(2020, 55, **B)]}},
        "Assets": {"units": {"USD": [_i(2020, 5_000, **A), _i(2020, 5_500, **B)]}},
        "StockholdersEquity": {"units": {"USD": [_i(2020, 3_000, **A), _i(2020, 3_300, **B)]}},
        "CashAndCashEquivalentsAtCarryingValue": {"units": {"USD": [_i(2020, 400, **A)]}},
        "Goodwill": {"units": {"USD": [_i(2020, 900, **A)]}},
        "IntangibleAssetsNetExcludingGoodwill": {"units": {"USD": [_i(2020, 700, **A)]}},
        "AmortizationOfIntangibleAssets": {"units": {"USD": [_d(2020, 60, **A)]}},
    }
    out = _out(_doc(us))
    row = out["history"]["2020"]
    assert row["revenue"] == 555 and row["net_income"] == 55 and row["total_assets"] == 5_500
    assert (row["goodwill"], row["intangibles_ex_goodwill"], row["amortization_intangibles"]) == (
        900, 700, 60)
    assert _existing_only(out) == _existing_only(_out(_doc({k: v for k, v in us.items()
                                                            if k not in R17_TAGS})))



# ── the untagged marker survives the production encoders (bulk build and --refresh-one) ──────

def test_untagged_fields_marker_in_bulk_encoder_and_single_ticker_merge():
    tagged = _base_us()
    tagged["Goodwill"] = _inst({y: 1_000 for y in YEARS})
    tagged["IntangibleAssetsNetExcludingGoodwill"] = _inst({y: 2_000 for y in YEARS})
    tagged["AmortizationOfIntangibleAssets"] = _flow({y: 300 for y in YEARS})
    a, b = _out(_doc(tagged), "AAA"), _out(_doc(_base_us()), "BBB")
    prov = bfh.encode_provenance({"AAA": a["history"], "BBB": b["history"]},
                                 {"AAA": a["prov"], "BBB": b["prov"]})
    assert prov["untagged_fields"] == {"AAA": [], "BBB": list(R17)}
    assert "untagged_fields" in prov["_schema"]

    # --refresh-one path: BBB is re-extracted from a filing that now tags goodwill only
    b2 = _out(_doc({**_base_us(), "Goodwill": _inst({y: 5 for y in YEARS})}), "BBB")
    bfh.merge_ticker_provenance(prov, "BBB", b2["history"], b2["prov"])
    assert prov["untagged_fields"] == {"AAA": [], "BBB": ["intangibles_ex_goodwill",
                                                          "amortization_intangibles"]}
    # a merge into a pinned file that predates R17 creates the section for that ticker only
    old_style = {k: v for k, v in prov.items() if k != "untagged_fields"}
    bfh.merge_ticker_provenance(old_style, "AAA", a["history"], a["prov"])
    assert old_style["untagged_fields"] == {"AAA": []}


def test_refresh_one_patches_the_new_fields_and_marker_without_network(tmp_path, monkeypatch):
    files = {"HISTORY_JSON": (tmp_path / "fundamentals_history.json", bfh._dump_compact,
                              {"tickers": {}, "provenance": bfh.encode_provenance({}, {})}),
             "BATTERY_JSON": (tmp_path / "fundamentals_battery.json", bfh._dump_battery,
                              {"tickers": {}}),
             "TTM_JSON": (tmp_path / "fundamentals_ttm.json", bfh._dump_compact, {"tickers": {}}),
             "QTR_JSON": (tmp_path / "fundamentals_quarterly.json", bfh._dump_compact,
                          {"tickers": {}})}
    for name, (path, dump, doc) in files.items():
        path.write_text(dump(doc), encoding="utf-8")
        monkeypatch.setattr(bfh, name, path)
    us = _base_us()
    us["Goodwill"] = _inst({y: 111 for y in YEARS})
    assert bfh.refresh_one("tst", data=_doc(us)) == 0
    hist = json.loads(files["HISTORY_JSON"][0].read_text(encoding="utf-8"))
    row = hist["tickers"]["TST"]["2020"]
    assert row["goodwill"] == 111 and row["intangibles_ex_goodwill"] is None
    assert row["amortization_intangibles"] is None
    assert hist["provenance"]["untagged_fields"] == {
        "TST": ["intangibles_ex_goodwill", "amortization_intangibles"]}


# ══ A2 (2026-09-30): AdjustmentForAmortization out, signs, rung_conflict ═════════════════════════

def _notes(out, ticker="TEST"):
    """{field: {year: [notes]}} as ENCODED into the provenance payload (what actually ships)."""
    prov = bfh.encode_provenance({ticker: out["history"]}, {ticker: out["prov"]})
    return prov["ladder_notes"].get(ticker, {})


# ── 1. AdjustmentForAmortization is not a rung ───────────────────────────────────────────────

def test_adjustment_for_amortization_is_not_a_rung():
    us = _base_us()
    us["AdjustmentForAmortization"] = _flow({y: 1_500 for y in YEARS})      # generic CF adjustment
    out = _out(_doc(us))
    assert _col(out, "amortization_intangibles") == {y: None for y in YEARS}
    assert "amortization_intangibles" in _untagged(out)
    assert _notes(out) == {}                                               # nothing to note either
    # and it does not backfill the gaps of a real rung
    us["AmortizationOfIntangibleAssets"] = _flow({y: 4_000 for y in range(2015, 2019)})
    col = _col(_out(_doc(us)), "amortization_intangibles")
    assert [col[y] for y in range(2015, 2019)] == [4_000] * 4
    assert [col[y] for y in range(2019, 2023)] == [None] * 4


# ── 2. signs: the ifrs roll-forward element is flipped, everything else negative is refused ──

def test_ifrs_roll_forward_negative_is_stored_as_absolute_value_and_noted():
    ifrs = {"Assets": _inst({y: 2_000_000 + y for y in YEARS}),
            "Revenue": _flow({y: 900_000 + y for y in YEARS}),
            "AmortisationIntangibleAssetsOtherThanGoodwill": _flow(
                {**{y: 60_000 + y for y in range(2015, 2020)},
                 2020: -63_778, 2021: -71_379, 2022: -82_334})}
    out = _out(_doc(ifrs=ifrs))
    col = _col(out, "amortization_intangibles")
    assert [col[y] for y in range(2015, 2020)] == [60_000 + y for y in range(2015, 2020)]
    assert [col[y] for y in (2020, 2021, 2022)] == [63_778, 71_379, 82_334]
    notes = _notes(out)["amortization_intangibles"]
    assert sorted(notes) == ["2020", "2021", "2022"]                       # only the flipped years
    assert notes["2020"] == [{"note": "sign_flipped",
                              "tag": "AmortisationIntangibleAssetsOtherThanGoodwill", "value": -63_778}]
    # the flip must survive the accession step: no override may restore the negative raw value
    # (every fact here carries the chosen accession, so an unguarded row-build would restore it)
    assert not any("amortization_intangibles" in m for m in out["prov"]["overrides"].values())
    assert _rung_tags(out, "amortization_intangibles") == {
        2015: "AmortisationIntangibleAssetsOtherThanGoodwill"}
    assert "amortization_intangibles" not in _untagged(out)


def test_negative_amortization_from_any_other_rung_is_rejected_and_the_next_rung_is_tried():
    us = _base_us()
    us["AmortizationOfIntangibleAssets"] = _flow(
        {2015: 4_000, 2016: 4_100, 2017: 4_200, 2018: 4_300, 2019: -1_200, 2020: -900,
         2021: 4_500, 2022: 4_600})
    us["AmortisationExpense"] = _flow({2019: 2_500})                       # rung 6, only 2019
    us["AdjustmentsForAmortisationExpense"] = _flow({2016: -777})          # negative, year already won
    out = _out(_doc(us))
    col = _col(out, "amortization_intangibles")
    assert col[2019] == 2_500                                              # next rung tried
    assert col[2020] is None                                               # none left -> null, not 0
    assert col[2018] == 4_300 and col[2021] == 4_500
    notes = _notes(out)["amortization_intangibles"]
    assert notes["2019"] == [{"note": "negative_rejected", "tag": "AmortizationOfIntangibleAssets",
                              "value": -1_200}]
    assert notes["2020"] == [{"note": "negative_rejected", "tag": "AmortizationOfIntangibleAssets",
                              "value": -900}]
    assert "2016" not in notes                    # a later negative that never had a say is not noted
    assert _rung_tags(out, "amortization_intangibles")[2019] == "AmortisationExpense"
    assert "amortization_intangibles" not in _untagged(out)


def test_only_the_named_ifrs_element_is_sign_flipped():
    us = _base_us()
    us["AmortisationExpense"] = _flow({y: -3_000 for y in YEARS})          # negative, NOT the flip tag
    out = _out(_doc(us))
    assert _col(out, "amortization_intangibles") == {y: None for y in YEARS}
    notes = _notes(out)["amortization_intangibles"]
    assert sorted(notes) == [str(y) for y in YEARS]
    assert all([n["note"] for n in v] == ["negative_rejected"] for v in notes.values())
    assert "amortization_intangibles" in _untagged(out)


def test_negative_goodwill_is_rejected_null_not_absolute_not_zero():
    us = _base_us()
    us["Goodwill"] = _inst({**{y: 100_000 for y in YEARS}, 2018: -5_000})
    out = _out(_doc(us))
    gw = _col(out, "goodwill")
    assert gw[2018] is None and gw[2017] == 100_000 and gw[2019] == 100_000
    assert _notes(out)["goodwill"] == {"2018": [{"note": "negative_rejected", "tag": "Goodwill",
                                                 "value": -5_000}]}
    assert "goodwill" not in _untagged(out)                                # a gap, not "never tagged"
    us["Goodwill"] = _inst({y: -1 for y in YEARS})                         # all negative -> never held
    out2 = _out(_doc(us))
    assert _col(out2, "goodwill") == {y: None for y in YEARS}
    assert "goodwill" in _untagged(out2)


def test_negative_intangible_balance_falls_to_the_next_rung_and_pair_sides_may_not_be_negative():
    us = _base_us()
    us["IntangibleAssetsNetExcludingGoodwill"] = _inst(
        {2015: 50_000, 2016: 50_000, 2017: -3_000, 2018: -3_000, 2019: -3_000, 2020: 50_000})
    us["FiniteLivedIntangibleAssetsNet"] = _inst({2017: 30_000, 2018: 30_000, 2019: -8_000, 2021: -4_000})
    us["IndefiniteLivedIntangibleAssetsExcludingGoodwill"] = _inst({2017: 10_000, 2018: -2_000})
    out = _out(_doc(us))
    col = _col(out, "intangibles_ex_goodwill")
    assert col[2016] == 50_000 and col[2020] == 50_000
    assert col[2017] == 40_000                     # rung 1 refused -> Finite+Indefinite pair sum
    assert col[2018] == 30_000                     # pair has a negative side -> refused -> Finite alone
    assert col[2019] is None                       # Finite alone negative too -> nothing left
    assert col[2021] is None                       # Finite alone negative, no other rung
    notes = _notes(out)["intangibles_ex_goodwill"]
    pair = "FiniteLivedIntangibleAssetsNet+IndefiniteLivedIntangibleAssetsExcludingGoodwill"
    assert [(n["note"], n["tag"]) for n in notes["2017"]] == [
        ("negative_rejected", "IntangibleAssetsNetExcludingGoodwill")]
    assert [(n["note"], n["tag"]) for n in notes["2018"]] == [
        ("negative_rejected", "IntangibleAssetsNetExcludingGoodwill"), ("negative_rejected", pair)]
    assert [(n["note"], n["tag"]) for n in notes["2019"]] == [
        ("negative_rejected", "IntangibleAssetsNetExcludingGoodwill"),
        ("negative_rejected", "FiniteLivedIntangibleAssetsNet")]
    assert [(n["note"], n["tag"]) for n in notes["2021"]] == [
        ("negative_rejected", "FiniteLivedIntangibleAssetsNet")]
    assert "intangibles_ex_goodwill" not in _untagged(out)


def test_an_accession_cannot_put_a_negative_back_into_an_r17_field():
    """FY2020 is filed twice. The resolved (latest-filed) goodwill is +900 from the 10-K/A, but the
    accession the row is assembled from (the fuller original 10-K, A) filed -500 for the same tag.
    The accession step must not re-introduce the negative."""
    A = dict(accn="acc-A", filed="2021-02-20", form="10-K")
    B = dict(accn="acc-B", filed="2021-06-01", form="10-K/A")
    us = {
        "Revenues": {"units": {"USD": [_d(2020, 500, **A), _d(2020, 555, **B)]}},
        "NetIncomeLoss": {"units": {"USD": [_d(2020, 50, **A), _d(2020, 55, **B)]}},
        "Assets": {"units": {"USD": [_i(2020, 5_000, **A), _i(2020, 5_500, **B)]}},
        "StockholdersEquity": {"units": {"USD": [_i(2020, 3_000, **A)]}},
        "CashAndCashEquivalentsAtCarryingValue": {"units": {"USD": [_i(2020, 400, **A)]}},
        "Goodwill": {"units": {"USD": [_i(2020, -500, **A), _i(2020, 900, **B)]}},
    }
    out = _out(_doc(us))
    row = out["history"]["2020"]
    assert row["revenue"] == 500 and row["total_assets"] == 5_000     # A really was the chosen accession
    assert row["goodwill"] == 900


# ── 3. rung_conflict: a filed 0 beats a later positive rung — recorded, not resolved ─────────

def test_rung_conflict_is_noted_and_the_first_rung_still_wins():
    us = _base_us()
    us["AmortizationOfIntangibleAssets"] = _flow({y: (0 if y >= 2020 else 4_000) for y in YEARS})
    us["AmortisationExpense"] = _flow({2020: 5_000, 2021: 0, 2022: 6_000})   # 2021 later rung also 0
    us["AdjustmentsForAmortisationExpense"] = _flow({2020: 7_000})           # 2nd later positive rung
    out = _out(_doc(us))
    col = _col(out, "amortization_intangibles")
    assert col[2020] == 0 and col[2021] == 0 and col[2022] == 0            # ladder rule unchanged
    notes = _notes(out)["amortization_intangibles"]
    assert sorted(notes) == ["2020", "2022"]                               # 2021: later rung is 0 -> none
    assert notes["2020"] == [{"note": "rung_conflict", "tag": "AmortizationOfIntangibleAssets", "value": 0,
                              "later_tag": "AdjustmentsForAmortisationExpense",   # first later rung in ladder order
                              "later_value": 7_000}]                              # ONE note per year
    assert notes["2022"] == [{"note": "rung_conflict", "tag": "AmortizationOfIntangibleAssets", "value": 0,
                              "later_tag": "AmortisationExpense", "later_value": 6_000}]


def test_no_rung_conflict_when_the_first_rung_is_nonzero_or_nothing_later_is_positive():
    us = _base_us()
    us["AmortizationOfIntangibleAssets"] = _flow({2019: 3_000, 2020: 0, 2021: 0})
    us["AmortisationExpense"] = _flow({2019: 9_000, 2021: -50})            # 2019 first nonzero; 2021 negative
    out = _out(_doc(us))
    assert _col(out, "amortization_intangibles")[2019] == 3_000
    assert _col(out, "amortization_intangibles")[2020] == 0                # zero, no later rung at all
    assert _col(out, "amortization_intangibles")[2021] == 0
    assert _notes(out) == {}                                               # a negative later rung is not a conflict


def test_rung_conflict_on_the_intangibles_ladder():
    us = _base_us()
    us["IntangibleAssetsNetExcludingGoodwill"] = _inst({2019: 0, 2020: 0, 2021: 0})
    us["FiniteLivedIntangibleAssetsNet"] = _inst({2019: 8_000, 2020: 6_000, 2021: 0})
    us["IndefiniteLivedIntangibleAssetsExcludingGoodwill"] = _inst({2019: 2_000})
    out = _out(_doc(us))
    col = _col(out, "intangibles_ex_goodwill")
    assert col[2019] == 0 and col[2020] == 0 and col[2021] == 0
    notes = _notes(out)["intangibles_ex_goodwill"]
    pair = "FiniteLivedIntangibleAssetsNet+IndefiniteLivedIntangibleAssetsExcludingGoodwill"
    assert (notes["2019"][0]["note"], notes["2019"][0]["later_tag"], notes["2019"][0]["later_value"]) == (
        "rung_conflict", pair, 10_000)                                     # pair rung is the first later one
    assert (notes["2020"][0]["later_tag"], notes["2020"][0]["later_value"]) == (
        "FiniteLivedIntangibleAssetsNet", 6_000)                           # Finite-alone rung
    assert "2021" not in notes


# ── 4. the notes ride the production encoders ────────────────────────────────────────────────

def test_ladder_notes_in_bulk_encoder_and_single_ticker_merge():
    flagged = _base_us()
    flagged["Goodwill"] = _inst({**{y: 1_000 for y in YEARS}, 2019: -1})
    plain = _base_us()
    plain["Goodwill"] = _inst({y: 1_000 for y in YEARS})
    a, b = _out(_doc(flagged), "AAA"), _out(_doc(plain), "BBB")
    prov = bfh.encode_provenance({"AAA": a["history"], "BBB": b["history"]},
                                 {"AAA": a["prov"], "BBB": b["prov"]})
    assert set(prov["ladder_notes"]) == {"AAA"}                            # sparse: only tickers with notes
    assert "ladder_notes" in prov["_schema"]
    # --refresh-one: AAA re-extracted from a filing with no negative -> its notes are removed
    a2 = _out(_doc(plain), "AAA")
    bfh.merge_ticker_provenance(prov, "AAA", a2["history"], a2["prov"])
    assert prov["ladder_notes"] == {}
    # ... and BBB re-extracted with a rung_conflict gains an entry, AAA untouched
    conflicted = _base_us()
    conflicted["IntangibleAssetsNetExcludingGoodwill"] = _inst({2020: 0})
    conflicted["FiniteLivedIntangibleAssetsNet"] = _inst({2020: 5})
    b2 = _out(_doc(conflicted), "BBB")
    bfh.merge_ticker_provenance(prov, "BBB", b2["history"], b2["prov"])
    assert list(prov["ladder_notes"]) == ["BBB"]
    assert prov["ladder_notes"]["BBB"]["intangibles_ex_goodwill"]["2020"][0]["note"] == "rung_conflict"
    # a pinned file that predates the section gets it created for the merged ticker only
    old_style = {k: v for k, v in prov.items() if k != "ladder_notes"}
    bfh.merge_ticker_provenance(old_style, "AAA", a["history"], a["prov"])
    assert list(old_style["ladder_notes"]) == ["AAA"]


def test_notes_for_years_the_ticker_does_not_ship_are_dropped():
    us = _base_us()
    us["Goodwill"] = _inst({**{y: 1_000 for y in YEARS}, 2010: -7})        # 2010 has no row (before revenue/assets)
    out = _out(_doc(us))
    assert _notes(out) == {}

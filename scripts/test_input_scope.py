"""Input-scope fixes 1a and 2a in build_fundamentals_history (brief_input_scope_fixes.md, sections 1.2, 2.2, 4).

Each test hands a synthetic companyfacts document to build_ticker_outputs (the single extraction path shared by
the weekly build and --refresh-one). No network, no repo files.

What is pinned:
  * 1a: `net_income` is the parent's net income, resolved per fiscal year by the scope ladder
    (NetIncomeLoss; ifrs owners of the parent; ProfitLoss - NCI line, us-gaap then ifrs; ProfitLoss with no NCI
    element filed; ProfitLoss kept and marked when an NCI element is filed), with `ni_scope` and the subtracted
    NCI amount in the provenance; `net_income_incl_nci` and `equity_incl_nci` are new fields; `equity` is the
    parent's; TTM uses ONE rung for all three legs; quarterly resolves per quarter; the scale defences still act
    on the chosen rung; the battery's ratios against consolidated totals read the consolidated net income.
  * 2a: `cash` is the unrestricted line, resolved per year by the cash ladder, with `cash_scope` in the provenance;
    the restricted, customer-money and insurance-reserve instant fields are new.
"""

import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "bfh", str(Path(__file__).resolve().parent / "build_fundamentals_history.py"))
bfh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bfh)

YEARS = range(2015, 2023)          # 8 fiscal years, calendar FY


def _i(y, val, accn=None, filed=None, form="10-K"):
    """One annual balance-sheet (instant) fact for FY y."""
    return {"end": f"{y}-12-31", "val": val, "form": form,
            "accn": accn or f"acc-{y}", "filed": filed or f"{y + 1}-02-20"}


def _d(y, val, accn=None, filed=None, form="10-K"):
    """One annual (12-month duration) fact for FY y."""
    return {"start": f"{y}-01-01", "end": f"{y}-12-31", "val": val, "form": form,
            "accn": accn or f"acc-{y}", "filed": filed or f"{y + 1}-02-20"}


def _p(start, end, val, form="10-Q", filed=None, accn=None):
    """One duration fact of any span (10-Q YTD / single quarter rows)."""
    return {"start": start, "end": end, "val": val, "form": form,
            "accn": accn or f"acc-{end}", "filed": filed or end}


def _inst(vals):
    return {"units": {"USD": [_i(y, v) for y, v in sorted(vals.items())]}}


def _flow(vals):
    return {"units": {"USD": [_d(y, v) for y, v in sorted(vals.items())]}}


def _doc(us=None, ifrs=None, srt=None):
    facts = {"us-gaap": us or {}, "ifrs-full": ifrs or {}}
    if srt is not None:
        facts["srt"] = srt
    return {"facts": facts}


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
    return {int(y): row.get(field, "<absent>") for y, row in out["history"].items()}


def _prov(out, ticker="TEST"):
    return bfh.encode_provenance({ticker: out["history"]}, {ticker: out["prov"]})


def _section(out, name, ticker="TEST"):
    """{year int: value} of one per-ticker-year provenance section."""
    return {int(y): v for y, v in (_prov(out, ticker).get(name) or {}).get(ticker, {}).items()}


# ── 1a-1: NetIncomeLoss against a LONGER ProfitLoss series ───────────────────────────────────

def test_1a_1_parent_net_income_beats_a_longer_consolidated_series():
    us = _base_us()
    us["NetIncomeLoss"] = _flow({y: 90_000 + y for y in range(2018, 2023)})
    us["ProfitLoss"] = _flow({y: 100_000 + y for y in YEARS})                  # longer series
    us["NetIncomeLossAttributableToNoncontrollingInterest"] = _flow({y: 10_000 for y in YEARS})
    out = _out(_doc(us))
    ni = _col(out, "net_income")
    for y in range(2018, 2023):
        assert ni[y] == 90_000 + y                    # the parent's figure in every year both exist
    scope = _section(out, "ni_scope")
    assert all(scope[y] == "parent" for y in range(2018, 2023))
    assert _col(out, "net_income_incl_nci") == {y: 100_000 + y for y in YEARS}
    # the years only ProfitLoss covers resolve on rung 3 (ProfitLoss - NCI line)
    assert all(ni[y] == 100_000 + y - 10_000 for y in range(2015, 2018))
    assert all(scope[y] == "parent_derived" for y in range(2015, 2018))


# ── 1a-2: ProfitLoss with the NCI line ───────────────────────────────────────────────────────

def test_1a_2_profit_loss_minus_nci_line_is_parent_derived():
    us = _base_us()
    us["ProfitLoss"] = _flow({y: 100_000 for y in YEARS})
    us["NetIncomeLossAttributableToNoncontrollingInterest"] = _flow({y: 7_000 for y in YEARS})
    out = _out(_doc(us))
    assert _col(out, "net_income") == {y: 93_000 for y in YEARS}
    assert _section(out, "ni_scope") == {y: "parent_derived" for y in YEARS}
    assert _section(out, "nci_subtracted") == {y: 7_000 for y in YEARS}
    assert _col(out, "net_income_incl_nci") == {y: 100_000 for y in YEARS}


def test_1a_2_redeemable_and_nonredeemable_split_summed():
    us = _base_us()
    us["ProfitLoss"] = _flow({y: 100_000 for y in YEARS})
    us["NetIncomeLossAttributableToRedeemableNoncontrollingInterest"] = _flow({y: 2_000 for y in YEARS})
    us["NetIncomeLossAttributableToNonredeemableNoncontrollingInterest"] = _flow({y: 3_000 for y in YEARS})
    out = _out(_doc(us))
    assert _col(out, "net_income") == {y: 95_000 for y in YEARS}
    assert _section(out, "nci_subtracted") == {y: 5_000 for y in YEARS}


def test_1a_2_one_half_of_the_split_missing_does_not_resolve_the_rung():
    us = _base_us()
    us["ProfitLoss"] = _flow({y: 100_000 for y in YEARS})
    us["NetIncomeLossAttributableToRedeemableNoncontrollingInterest"] = _flow({y: 2_000 for y in YEARS})
    out = _out(_doc(us))
    # rung 3 fails; an NCI element is filed, so rung 6 keeps ProfitLoss and marks it
    assert _col(out, "net_income") == {y: 100_000 for y in YEARS}
    assert _section(out, "ni_scope") == {y: "nci_unknown" for y in YEARS}
    assert _section(out, "nci_subtracted") == {}


def test_1a_2_a_filed_zero_nci_line_resolves_the_rung():
    us = _base_us()
    us["ProfitLoss"] = _flow({y: 100_000 for y in YEARS})
    us["NetIncomeLossAttributableToNoncontrollingInterest"] = _flow({y: 0 for y in YEARS})
    out = _out(_doc(us))
    assert _col(out, "net_income") == {y: 100_000 for y in YEARS}
    assert _section(out, "ni_scope") == {y: "parent_derived" for y in YEARS}
    assert _section(out, "nci_subtracted") == {y: 0 for y in YEARS}


# ── 1a-3: IFRS ───────────────────────────────────────────────────────────────────────────────

def test_1a_3_ifrs_owners_of_parent_wins_rung_2():
    ifrs = {"ProfitLoss": _flow({y: 100_000 for y in YEARS}),
            "ProfitLossAttributableToOwnersOfParent": _flow({y: 96_000 for y in YEARS}),
            "ProfitLossAttributableToNoncontrollingInterests": _flow({y: 4_000 for y in YEARS})}
    out = _out(_doc(_base_us(), ifrs))
    assert _col(out, "net_income") == {y: 96_000 for y in YEARS}
    assert _section(out, "ni_scope") == {y: "parent" for y in YEARS}
    assert _col(out, "net_income_incl_nci") == {y: 100_000 for y in YEARS}


def test_1a_3_ifrs_profit_loss_minus_nci_is_rung_4():
    ifrs = {"ProfitLoss": _flow({y: 100_000 for y in YEARS}),
            "ProfitLossAttributableToNoncontrollingInterests": _flow({y: 4_000 for y in YEARS})}
    out = _out(_doc(_base_us(), ifrs))
    assert _col(out, "net_income") == {y: 96_000 for y in YEARS}
    assert _section(out, "ni_scope") == {y: "parent_derived" for y in YEARS}
    assert _section(out, "nci_subtracted") == {y: 4_000 for y in YEARS}


# ── 1a-4: ProfitLoss only ────────────────────────────────────────────────────────────────────

def test_1a_4_profit_loss_without_any_nci_element_is_no_nci_filed():
    us = _base_us()
    us["ProfitLoss"] = _flow({y: 100_000 for y in YEARS})
    out = _out(_doc(us))
    assert _col(out, "net_income") == {y: 100_000 for y in YEARS}
    assert _section(out, "ni_scope") == {y: "no_nci_filed" for y in YEARS}
    assert _col(out, "net_income_incl_nci") == {y: 100_000 for y in YEARS}


def test_1a_4_profit_loss_with_minority_interest_filed_is_kept_and_marked():
    us = _base_us()
    us["ProfitLoss"] = _flow({y: 100_000 for y in YEARS})
    us["MinorityInterest"] = _inst({y: 50_000 for y in YEARS})
    out = _out(_doc(us))
    assert _col(out, "net_income") == {y: 100_000 for y in YEARS}       # value kept
    assert _section(out, "ni_scope") == {y: "nci_unknown" for y in YEARS}


# ── 1a-5: equity and equity_incl_nci ─────────────────────────────────────────────────────────

def test_1a_5_equity_is_the_parents_and_incl_nci_from_the_incl_tag():
    us = _base_us()
    us["StockholdersEquity"] = _inst({y: 300_000 for y in range(2018, 2023)})
    us["StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"] = \
        _inst({y: 320_000 for y in YEARS})                                    # longer series
    out = _out(_doc(us))
    eq = _col(out, "equity")
    assert all(eq[y] == 300_000 for y in range(2018, 2023))
    assert _col(out, "equity_incl_nci") == {y: 320_000 for y in YEARS}
    assert _section(out, "equity_incl_nci_rung") == {y: "incl_tag" for y in YEARS}


def test_1a_5_equity_incl_nci_sum_with_redeemable_nci():
    us = _base_us()
    us["StockholdersEquity"] = _inst({y: 300_000 for y in YEARS})
    us["MinorityInterest"] = _inst({y: 20_000 for y in YEARS})
    us["RedeemableNoncontrollingInterestEquityCarryingAmount"] = _inst({y: 5_000 for y in YEARS})
    out = _out(_doc(us))
    assert _col(out, "equity_incl_nci") == {y: 325_000 for y in YEARS}
    assert _section(out, "equity_incl_nci_rung") == {y: "parent_plus_minority" for y in YEARS}


def test_1a_5_equity_incl_nci_is_the_parents_when_no_nci_element_is_filed():
    us = _base_us()
    us["StockholdersEquity"] = _inst({y: 300_000 for y in YEARS})
    out = _out(_doc(us))
    assert _col(out, "equity_incl_nci") == {y: 300_000 for y in YEARS}
    assert _section(out, "equity_incl_nci_rung") == {y: "parent_no_nci" for y in YEARS}


def test_1a_5_equity_incl_nci_null_when_an_nci_element_is_filed_without_a_split():
    us = _base_us()
    us["StockholdersEquity"] = _inst({y: 300_000 for y in YEARS})
    us["RedeemableNoncontrollingInterestEquityCarryingAmount"] = _inst({y: 5_000 for y in YEARS})
    out = _out(_doc(us))
    assert _col(out, "equity_incl_nci") == {y: None for y in YEARS}


# ── 1a-6: TTM and quarterly ──────────────────────────────────────────────────────────────────

def _ttm_flow(fy, cur, pri, fy_extra_years=()):
    """FY2022 + YTD-H1-2023 + YTD-H1-2022, plus optional older annual years (more coverage)."""
    rows = [_d(2022, fy)] + [_d(y, fy) for y in fy_extra_years]
    if cur is not None:
        rows.append(_p("2023-01-01", "2023-06-30", cur, filed="2023-08-01", accn="q-2023"))
    if pri is not None:
        rows.append(_p("2022-01-01", "2022-06-30", pri, filed="2023-08-01", accn="q-2023"))
    return {"units": {"USD": rows}}


def _ttm_base():
    us = _base_us()
    us["Revenues"]["units"]["USD"] += [
        _p("2023-01-01", "2023-06-30", 260_000, filed="2023-08-01", accn="q-2023"),
        _p("2022-01-01", "2022-06-30", 250_000, filed="2023-08-01", accn="q-2023")]
    return us


def test_1a_6_ttm_takes_all_three_legs_from_the_first_rung():
    us = _ttm_base()
    us["NetIncomeLoss"] = _ttm_flow(90_000, 50_000, 40_000)
    us["ProfitLoss"] = _ttm_flow(100_000, 55_000, 44_000, fy_extra_years=range(2015, 2022))
    us["NetIncomeLossAttributableToNoncontrollingInterest"] = _ttm_flow(10_000, 5_000, 4_000)
    out = _out(_doc(us))
    f = out["ttm"]["fields"]
    assert f["net_income"] == 90_000 + 50_000 - 40_000
    assert f["net_income_incl_nci"] == 100_000 + 55_000 - 44_000


def test_1a_6_ttm_rung_missing_a_leg_is_skipped_for_the_next():
    us = _ttm_base()
    us["NetIncomeLoss"] = _ttm_flow(90_000, 50_000, None)                       # no prior YTD leg
    us["ProfitLoss"] = _ttm_flow(100_000, 55_000, 44_000)
    us["NetIncomeLossAttributableToNoncontrollingInterest"] = _ttm_flow(10_000, 5_000, 4_000)
    out = _out(_doc(us))
    assert out["ttm"]["fields"]["net_income"] == (100_000 - 10_000) + (55_000 - 5_000) - (44_000 - 4_000)


def test_1a_6_quarterly_resolves_net_income_per_quarter():
    us = _base_us()
    q_ends = [("2022-01-01", "2022-03-31"), ("2022-04-01", "2022-06-30"), ("2022-07-01", "2022-09-30")]
    us["Revenues"]["units"]["USD"] += [_p(s, e, 120_000) for s, e in q_ends]
    # NetIncomeLoss files only the first quarter; ProfitLoss and the NCI line file all three (and more years)
    us["NetIncomeLoss"] = {"units": {"USD": [_d(2022, 90_000), _p(*q_ends[0], 20_000)]}}
    us["ProfitLoss"] = {"units": {"USD": [_d(y, 100_000) for y in YEARS] + [_p(s, e, 25_000) for s, e in q_ends]}}
    us["NetIncomeLossAttributableToNoncontrollingInterest"] = {
        "units": {"USD": [_d(y, 10_000) for y in YEARS] + [_p(s, e, 3_000) for s, e in q_ends]}}
    out = _out(_doc(us))
    by_end = {q["end"]: q["net_income"] for q in out["qtr"]["quarters"]}
    assert by_end["2022-03-31"] == 20_000                 # rung 1 where filed
    assert by_end["2022-06-30"] == 22_000                 # rung 3 elsewhere
    assert by_end["2022-09-30"] == 22_000


# ── 1a-7: the scale defences still act on the chosen rung ───────────────────────────────────

def test_1a_7_pick_consistent_still_resolves_a_power_of_1000_contradiction_in_net_income_loss():
    us = _base_us()
    rows = [_d(y, 90_000_000 + y) for y in YEARS]
    rows.append(_d(2020, (90_000_000 + 2020) * 1000, accn="acc-late", filed="2023-03-01", form="10-K/A"))
    us["NetIncomeLoss"] = {"units": {"USD": rows}}
    us["ProfitLoss"] = _flow({y: 100_000_000 for y in YEARS})
    us["NetIncomeLossAttributableToNoncontrollingInterest"] = _flow({y: 10_000_000 for y in YEARS})
    out = _out(_doc(us))
    assert _col(out, "net_income")[2020] == 90_000_000 + 2020
    assert _section(out, "ni_scope")[2020] == "parent"


# ── 1a (e): the battery's ratios against consolidated totals read the consolidated net income ─

def test_1a_e_battery_accruals_read_consolidated_net_income():
    us = _base_us()
    us["NetIncomeLoss"] = _flow({y: 90_000 for y in YEARS})
    us["ProfitLoss"] = _flow({y: 100_000 for y in YEARS})
    us["NetIncomeLossAttributableToNoncontrollingInterest"] = _flow({y: 10_000 for y in YEARS})
    us["NetCashProvidedByUsedInOperatingActivities"] = _flow({y: 95_000 for y in YEARS})
    out = _out(_doc(us))
    b = out["battery"]
    avg_assets = ((1_000_000 + 2022) + (1_000_000 + 2021)) / 2
    assert b["accruals_ratio"] == round((100_000 - 95_000) / avg_assets, 4)


# ── 2a-1: the unrestricted line beats a longer CCERCRCE series ───────────────────────────────

CCER = "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"


def test_2a_1_unrestricted_line_beats_a_longer_ccercrce_series():
    us = _base_us()
    us["CashAndCashEquivalentsAtCarryingValue"] = _inst({y: 40_000 for y in range(2016, 2023)})
    us[CCER] = _inst({y: 45_000 for y in YEARS})                              # one year-end further back
    out = _out(_doc(us))
    cash = _col(out, "cash")
    assert all(cash[y] == 40_000 for y in range(2016, 2023))
    scope = _section(out, "cash_scope")
    assert all(scope[y] == "unrestricted_line" for y in range(2016, 2023))
    # 2015: no unrestricted line and no restricted element filed -> rung 4, annotated
    assert cash[2015] == 45_000 and scope[2015] == "total_no_restricted_filed"


# ── 2a-2: rung 3, the negative difference, rung 4 ───────────────────────────────────────────

def test_2a_2_ccercrce_minus_restricted_and_the_negative_difference():
    us = _base_us()
    us[CCER] = _inst({y: 45_000 for y in YEARS})
    us["RestrictedCashCurrent"] = _inst({y: 3_000 for y in YEARS})
    us["RestrictedCashNoncurrent"] = _inst({y: (2_000 if y != 2019 else 50_000) for y in YEARS})
    out = _out(_doc(us))
    cash, scope = _col(out, "cash"), _section(out, "cash_scope")
    for y in YEARS:
        if y == 2019:
            assert cash[y] is None and scope[y] == "cash_unresolved"
        else:
            assert cash[y] == 40_000 and scope[y] == "derived_minus_restricted"


def test_2a_2_ifrs_cash_and_equivalents_is_rung_2():
    ifrs = {"CashAndCashEquivalents": _inst({y: 41_000 for y in YEARS})}
    out = _out(_doc(_base_us(), ifrs))
    assert _col(out, "cash") == {y: 41_000 for y in YEARS}
    assert _section(out, "cash_scope") == {y: "ifrs_cash_and_equivalents" for y in YEARS}


# ── 2a-3: the new instant fields and cash_scope provenance ───────────────────────────────────

def test_2a_3_new_instant_fields():
    us = _base_us()
    us["CashAndCashEquivalentsAtCarryingValue"] = _inst({y: 40_000 for y in YEARS})
    us["RestrictedCashCurrent"] = _inst({y: 3_000 for y in YEARS})
    us["CashSegregatedUnderFederalAndOtherRegulations"] = _inst({y: 7_000 for y in YEARS})
    us["FundsHeldForClients"] = _inst({y: 11_000 for y in YEARS})
    us["SettlementAssetsCurrent"] = _inst({y: 13_000 for y in YEARS})
    us["PayablesToCustomers"] = _inst({y: 17_000 for y in range(2015, 2019)})
    us["SettlementLiabilitiesCurrent"] = _inst({y: 19_000 for y in YEARS})
    us["LiabilityForFuturePolicyBenefits"] = _inst({y: 23_000 for y in YEARS})
    us["UnearnedPremiums"] = _inst({y: 29_000 for y in YEARS})
    srt = {"PayablesToCustomers": _inst({y: 17_000 for y in range(2019, 2023)})}
    out = _out(_doc(us, srt=srt))
    assert _col(out, "cash") == {y: 40_000 for y in YEARS}                     # restricted never subtracted from rung 1
    assert _col(out, "cash_restricted") == {y: 10_000 for y in YEARS}
    assert _col(out, "customer_money_assets") == {y: 24_000 for y in YEARS}
    assert _col(out, "customer_money_liabilities") == {y: 36_000 for y in YEARS}
    assert _col(out, "insurance_reserves") == {y: 52_000 for y in YEARS}
    assert _section(out, "cash_scope") == {y: "unrestricted_line" for y in YEARS}


def test_2a_3_new_fields_null_when_nothing_filed_and_never_vote():
    us = _base_us()
    us["CashAndCashEquivalentsAtCarryingValue"] = _inst({y: 40_000 for y in YEARS})
    out = _out(_doc(us))
    for f in ("cash_restricted", "customer_money_assets", "customer_money_liabilities", "insurance_reserves"):
        assert _col(out, f) == {y: None for y in YEARS}
    for f in ("net_income_incl_nci", "equity_incl_nci", "cash_restricted", "customer_money_assets",
              "customer_money_liabilities", "insurance_reserves"):
        assert f in bfh.VOTE_EXCLUDED_FIELDS

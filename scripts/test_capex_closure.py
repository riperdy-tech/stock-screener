"""Capex by investing-section closure (build_fundamentals_history, 2026-09-28).

Fixtures in scripts/fixtures/capex_closure/ are VERBATIM companyfacts entries (SEC bulk archive of
2026-08-07), trimmed only by accession and by concept; MANIFEST.json holds their sha256. No network.
Run: python -m pytest scripts/test_capex_closure.py -q   (or: python scripts/test_capex_closure.py)
"""

import copy
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("bfh", str(HERE / "build_fundamentals_history.py"))
bfh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bfh)
FIX = HERE / "fixtures" / "capex_closure"


def _doc(t):
    return json.loads((FIX / f"{t}.json").read_text(encoding="utf-8"))


def _facts(t):
    d = _doc(t)["facts"]
    facts = dict(d.get("ifrs-full", {}))
    facts.update(d.get("us-gaap", {}))
    return facts


def _proofs(t, year):
    return bfh.resolve_capex_by_closure(_facts(t), set()).get(year, {})


def _build(t, closure=True):
    saved = bfh.FIELD_SPECS["capex"].get("INVESTING_CLOSURE")
    bfh.FIELD_SPECS["capex"]["INVESTING_CLOSURE"] = closure
    try:
        return bfh.build_ticker_outputs(copy.deepcopy(_doc(t)), t)
    finally:
        bfh.FIELD_SPECS["capex"]["INVESTING_CLOSURE"] = saved


# ── proofs: the filing's own investing section decides ─────────────────────────────────────────

def test_fang_separately_presented_acquisitions_are_not_capex():
    # -7,809M = -18 other - 5,938 property acquisitions - 3,523 development + 1,670 sale proceeds
    assert _proofs("FANG", 2025) == {"0001539838-26-000010": (
        3_523_000_000, "PaymentsToExploreAndDevelopOilAndGasProperties", "2025-12-31")}


def test_gpor_lone_acquisition_typed_line_proven_by_asc932():
    # the only capex-type face line is PaymentsToAcquireOilAndGasProperty; the same filing's costs
    # incurred show development 480,442,000 and acquisitions 83,601,000 < 527,569,000
    assert _proofs("GPOR", 2025) == {"0001628280-26-011487": (
        527_569_000, "PaymentsToAcquireOilAndGasProperty", "2025-12-31")}


def test_vz_other_productive_assets_is_the_capex_line():
    # -16,660M = +801 other - 450 licences (intangible, not capex) - 17,011 capital expenditures
    assert _proofs("VZ", 2025) == {"0000732712-26-000007": (
        17_011_000_000, "PaymentsToAcquireOtherProductiveAssets", "2025-12-31")}


def test_bp_ifrs_combined_capex_line():
    assert _proofs("BP", 2025) == {"0000313807-26-000006": (
        13_221_000_000,
        "PurchaseOfPropertyPlantAndEquipmentIntangibleAssetsOtherThanGoodwillInvestmentPropertyAndOtherNoncurrentAssets",
        "2025-12-31")}


def test_krc_real_estate_acquisitions_excluded_note_level_capitalized_interest_ignored():
    # 116,025,000 improvements + 174,687,000 development; 397,251,000 acquisitions excluded; the
    # 79,542,000 InterestPaidCapitalized fact is not a face line (the section closes without it)
    assert _proofs("KRC", 2025) == {"0001628280-26-007051": (
        290_712_000, "PaymentsForCapitalImprovements+PaymentsToDevelopRealEstateAssets", "2025-12-31")}


def test_mur_2024():
    assert _proofs("MUR", 2024) == {"0000717423-25-000006": (
        908_164_000, "PaymentsToAcquireOtherProductiveAssets", "2024-12-31")}


def test_asc_component_trap_stays_null():
    # PaymentsToAcquireOtherProductiveAssets 284,000 against a -121,003,000 investing total: the
    # rest is an extension line companyfacts never carries -> no closure -> no capex (CH-4 GSAT class)
    assert _proofs("ASC", 2025) == {}


def test_ar_unexplained_extension_line_stays_null():
    # three standard capex-type lines leave -150,087,000 of the section unexplained
    assert _proofs("AR", 2025) == {}


def test_nnn_lone_real_estate_acquisition_line_stays_null():
    assert _proofs("NNN", 2025) == {}


def test_gme_twin_cannot_double_count():
    # PPE and ProductiveAssets are same-value twins in every GME year. FY2024 (ends 2025-02-01, bin 2025)
    # closes with either twin alone -> 16,100,000 once. FY2025 (ends 2026-01-31, bin 2026) closes only
    # when BOTH 17,500,000 twins are used, i.e. a twin stands in for an unseen line -> refused, never 35,000,000
    assert _proofs("GME", 2025) == {"0001326380-26-000013": (
        16_100_000, "PaymentsToAcquireProductiveAssets", "2025-02-01")}
    assert _proofs("GME", 2026) == {}


# ── end to end through build_ticker_outputs ────────────────────────────────────────────────────

def test_gpor_fills_latest_year_and_moves_nothing_else():
    old, new = _build("GPOR", closure=False), _build("GPOR", closure=True)
    assert old["history"]["2025"]["capex"] is None
    row = new["history"]["2025"]
    assert row["capex"] == 527_569_000
    assert row["fcf"] == row["ocf"] - 527_569_000
    assert new["prov"]["states"]["capex"][2025] == "closure_sum"
    assert new["prov"]["tags"]["capex"][2025] == "PaymentsToAcquireOilAndGasProperty"
    filled = set()
    for y, r in old["history"].items():
        n = new["history"][y]
        if r["capex"] is None and n["capex"] is not None:       # a backfill: proven, and fcf follows it
            assert new["prov"]["states"]["capex"][int(y)] == "closure_sum"
            assert n["fcf"] == (n["ocf"] - n["capex"] if n["ocf"] is not None else None)
            filled.add(y)
        for f, v in r.items():
            if y in filled and f in ("capex", "fcf"):
                continue
            assert n[f] == v and type(n[f]) is type(v), (y, f)
    assert filled == {"2023", "2024", "2025"}   # the FY2025 10-K's comparative columns prove 2023-2024 too
    for key in ("battery", "ttm", "qtr"):
        assert json.dumps(old[key], sort_keys=True) == json.dumps(new[key], sort_keys=True), key
    assert old["prov"]["overrides"] == new["prov"]["overrides"]
    assert old["prov"]["period_end"] == new["prov"]["period_end"]


def test_backfill_alone_never_replaces_a_filled_value():
    # WLFC FY2025 ships PaymentsToAcquirePropertyPlantAndEquipment 31,082,000 while its section proves
    # 555,661,000 (equipment on lease + PP&E). With the replacement rule off, the backfill leaves the shipped
    # value alone; test_capex_replace.py pins what the replacement rule does with it.
    assert _proofs("WLFC", 2025)["0001018164-26-000041"][0] == 555_661_000
    saved = bfh.FIELD_SPECS["capex"]["CLOSURE_REPLACES_FILLED"]
    bfh.FIELD_SPECS["capex"]["CLOSURE_REPLACES_FILLED"] = False
    try:
        new = _build("WLFC", closure=True)
    finally:
        bfh.FIELD_SPECS["capex"]["CLOSURE_REPLACES_FILLED"] = saved
    assert new["history"]["2025"]["capex"] == 31_082_000
    assert new["prov"]["states"]["capex"][2025] not in ("closure_sum", "closure_replaced")


def test_fresh_start_stub_is_another_periods_capex():
    # CHRD 2020: every proof is for the predecessor period ending 2020-11-19; the row ends 2020-12-31
    assert {p[2] for p in _proofs("CHRD", 2020).values()} == {"2020-11-19"}
    new = _build("CHRD", closure=True)
    assert new["prov"]["period_end"]["2020"] == "2020-12-31"
    assert new["history"]["2020"]["capex"] is None


def test_only_the_rows_own_filing_may_prove():
    # AIV 2018: the original 10-K proves 348,207,000 and the post-separation 10-K proves a restated
    # 37,844,000, but the row's vote chose the FY2019 10-K, which proves nothing -> null
    assert set(_proofs("AIV", 2018)) == {"0000922864-19-000007", "0001564590-21-012671"}
    new = _build("AIV", closure=True)
    assert new["prov"]["overrides"]["2018"]["revenue"] == "0001564590-20-006053"
    assert new["history"]["2018"]["capex"] is None


# ── mechanics ──────────────────────────────────────────────────────────────────────────────────

def test_grammar_and_classes():
    s, k = bfh._investing_sign, bfh._investing_class
    assert s("ProceedsFromIssuanceOfCommonStock") == 0 and s("PaymentsOfDividends") == 0
    assert s("NetCashProvidedByUsedInInvestingActivities") == 0
    assert s("PaymentsToAcquirePropertyPlantAndEquipment") == -1 and k("PaymentsToAcquirePropertyPlantAndEquipment") == "capex"
    assert s("ProceedsFromSaleOfPropertyPlantAndEquipment") == 1 and k("ProceedsFromSaleOfPropertyPlantAndEquipment") == "noncapex"
    assert k("PaymentsToDevelopSoftware") == "noncapex" and k("PaymentsToAcquireIntangibleAssets") == "noncapex"
    assert k("PaymentsToAcquireBusinessesNetOfCashAcquired") == "noncapex"
    assert k("PaymentsForProceedsFromProductiveAssets") == "poison"
    assert k("PaymentsToAcquireProjects") == "poison" and k("InterestPaidCapitalized") == "poison"
    assert k("PaymentsToAcquireOilAndGasProperty") == "acquisition"


def test_closing_subsets_is_exact_and_bounded():
    lines = [("A", -5), ("B", -7), ("C", 3)]
    assert sorted(sorted(x) for x in bfh._closing_subsets(lines, -9)) == [["A", "B", "C"]]
    assert bfh._closing_subsets(lines, -10) == []
    assert bfh._closing_subsets([(f"L{i}", -i - 1) for i in range(bfh.CLOSURE_MAX_LINES + 1)], -1) is None


def test_conflicting_duplicate_voids_the_period():
    facts = copy.deepcopy(_facts("FANG"))
    rows = facts["PaymentsToExploreAndDevelopOilAndGasProperties"]["units"]["USD"]
    twin = dict(next(r for r in rows if r["accn"] == "0001539838-26-000010" and r["end"] == "2025-12-31"))
    twin["val"] += 1
    rows.append(twin)
    assert bfh.resolve_capex_by_closure(facts, set()).get(2025, {}).get("0001539838-26-000010") is None


def test_provenance_state_code():
    new = _build("GPOR", closure=True)
    enc = bfh.encode_provenance({"GPOR": new["history"]}, {"GPOR": new["prov"]})
    assert enc["_states"]["c"] == "closure_sum"
    runs = enc["runs"]["GPOR"]["capex"]
    assert [[first, enc["_tags"][ti], code] for first, ti, code in runs] == [
        [2023, "PaymentsToAcquireOilAndGasProperty", "c"]]


if __name__ == "__main__":
    passed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            passed += 1
            print(f"  ok  {name}")
    print(f"\n{passed} passed")

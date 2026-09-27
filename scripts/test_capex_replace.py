"""Capex REPLACEMENT by the row's own proven total (build_fundamentals_history, 2026-09-28).

A filled capex is replaced only when the row's own filing proves a larger total made ENTIRELY of specific
PP&E lines, today's figure is one of those lines (or a filed zero), and no other filing proves a different
figure for the period. Fixtures in scripts/fixtures/capex_closure/ are VERBATIM companyfacts entries (SEC
bulk archive of 2026-08-07), trimmed only by accession and by concept; MANIFEST_REPLACE.json holds their
sha256. No network.
Run: python -m pytest scripts/test_capex_replace.py -q   (or: python scripts/test_capex_replace.py)
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
    return {a: p[0] for a, p in bfh.resolve_capex_by_closure(_facts(t), set()).get(year, {}).items()}


def _build(t, replace=True):
    saved = bfh.FIELD_SPECS["capex"].get("CLOSURE_REPLACES_FILLED")
    bfh.FIELD_SPECS["capex"]["CLOSURE_REPLACES_FILLED"] = replace
    try:
        return bfh.build_ticker_outputs(copy.deepcopy(_doc(t)), t)
    finally:
        bfh.FIELD_SPECS["capex"]["CLOSURE_REPLACES_FILLED"] = saved


def _replaced_years(old, new):
    """Years whose capex moved; asserts each is a replacement (larger, state closure_replaced, fcf follows)
    and that nothing else moved: every other cell, the battery, quarterly, overrides and period_end."""
    moved = set()
    for y, r in old["history"].items():
        n = new["history"][y]
        if n["capex"] != r["capex"]:
            assert r["capex"] is not None and n["capex"] > r["capex"], y
            assert new["prov"]["states"]["capex"][int(y)] == "closure_replaced", y
            assert n["fcf"] == (n["ocf"] - n["capex"] if n["ocf"] is not None else None), y
            moved.add(y)
        for f, v in r.items():
            if y in moved and f in ("capex", "fcf"):
                continue
            assert n[f] == v and type(n[f]) is type(v), (y, f)
    assert json.dumps(old["battery"], sort_keys=True) == json.dumps(new["battery"], sort_keys=True)
    assert json.dumps(old["qtr"], sort_keys=True) == json.dumps(new["qtr"], sort_keys=True)
    assert old["prov"]["overrides"] == new["prov"]["overrides"]
    assert old["prov"]["period_end"] == new["prov"]["period_end"]
    return moved


# ── replaced: the shipped line is one line of a larger proven face ─────────────────────────────

def test_wlfc_equipment_on_lease_joins_the_ppe_line():
    # -256,397,000 = -524,579,000 equipment on lease - 31,082,000 PP&E - 9,246,000 JV + 16,910,000
    # + 21,938,000 + 269,662,000; the lessor's fleet purchases are depreciated in its D&A, so they are capex
    old, new = _build("WLFC", replace=False), _build("WLFC")
    assert old["history"]["2025"]["capex"] == 31_082_000
    row = new["history"]["2025"]
    assert row["capex"] == 555_661_000 and row["fcf"] == row["ocf"] - 555_661_000
    assert new["prov"]["states"]["capex"][2025] == "closure_replaced"
    assert new["prov"]["tags"]["capex"][2025] == \
        "PaymentsToAcquireEquipmentOnLease+PaymentsToAcquirePropertyPlantAndEquipment"
    assert _replaced_years(old, new) == {"2025"}


def test_ionr_filed_zero_is_an_anchor():
    # PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities filed as 0 beside 14,510,000 of
    # PurchaseOfMiningAssets: -13,830,000 = -14,510,000 + 680,000 interest received
    old, new = _build("IONR", replace=False), _build("IONR")
    assert old["history"]["2025"]["capex"] == 0
    assert new["history"]["2025"]["capex"] == 14_510_000
    # the FY2025 20-F's comparative columns prove FY2023 (601,000 -> 33,934,000) and FY2024 (2,000 -> 36,637,000)
    assert new["history"]["2023"]["capex"] == 33_934_000 and new["history"]["2024"]["capex"] == 36_637_000
    assert _replaced_years(old, new) == {"2023", "2024", "2025"}


def test_rrc_field_service_line_replaced_acquisitions_still_excluded():
    # FY2015 ships 4,441,000 ("other" PP&E); the face also holds 1,030,644,000 of oil-and-gas additions and
    # 74,880,000 of property acquisitions, which ACQ-1 keeps out -> 1,035,085,000
    old, new = _build("RRC", replace=False), _build("RRC")
    assert old["history"]["2015"]["capex"] == 4_441_000
    assert new["history"]["2015"]["capex"] == 1_035_085_000
    assert new["prov"]["tags"]["capex"][2015].split("+") == [
        "PaymentsToAcquireOilAndGasPropertyAndEquipment", "PaymentsToAcquirePropertyPlantAndEquipment"]
    assert "2015" in _replaced_years(old, new)


def test_docn_ttm_capex_is_withheld_when_the_latest_year_is_replaced():
    # the TTM is built on the PP&E tag the FY2025 proof shows to be a component (129,086,000 of 255,915,000)
    old, new = _build("DOCN", replace=False), _build("DOCN")
    assert new["history"]["2025"]["capex"] == 255_915_000
    assert old["ttm"]["fields"]["capex"] == 115_502_000 and "fcf" in old["ttm"]["fields"]
    assert "capex" not in new["ttm"]["fields"] and "fcf" not in new["ttm"]["fields"]
    left = {k: v for k, v in old["ttm"]["fields"].items() if k not in ("capex", "fcf")}
    assert new["ttm"]["fields"] == left
    assert {k: v for k, v in new["ttm"].items() if k != "fields"} == \
        {k: v for k, v in old["ttm"].items() if k != "fields"}


# ── kept: the proof exists but does not qualify ────────────────────────────────────────────────

def test_tonx_generic_line_is_never_added():
    # the face adds 295,000,000 of PaymentsToAcquireOtherProductiveAssets (a token purchase) to 88,000 of PP&E
    assert _proofs("TONX", 2025) == {"0001493152-26-013931": 295_088_000}
    assert _build("TONX")["history"]["2025"]["capex"] == 88_000


def test_dvn_generic_anchor_is_never_replaced():
    # ships its "capital expenditures" line (ProductiveAssets 6,988,000,000); the other 6,462,000,000 line is
    # the year's property acquisitions by the same filing's ASC 932 costs incurred
    assert set(_proofs("DVN", 2014).values()) == {13_450_000_000}
    new = _build("DVN")
    assert new["history"]["2014"]["capex"] == 6_988_000_000
    assert new["prov"]["states"]["capex"][2014] != "closure_replaced"


def test_epr_generic_anchor_is_never_replaced():
    assert _proofs("EPR", 2025) == {"0001045450-26-000007": 240_794_000}
    assert _build("EPR")["history"]["2025"]["capex"] == 151_749_000


def test_tho_unanchored_proof_replaces_nothing():
    # the proof (other PP&E 122,987,000) does not contain the shipped 121,616,000 at all
    assert _proofs("THO", 2025) == {"0000730263-25-000019": 122_987_000}
    assert _build("THO")["history"]["2025"]["capex"] == 121_616_000


def test_krg_conflicting_filings_replace_nothing():
    # the row's own filing proves 97,635,000; two other filings prove 97,343,000 for the same period
    assert _proofs("KRG", 2016) == {"0001286043-17-000025": 97_343_000, "0001286043-18-000020": 97_343_000,
                                    "0001286043-19-000021": 97_635_000}
    assert _build("KRG")["history"]["2016"]["capex"] == 94_611_000


# ── vocabulary corrections ─────────────────────────────────────────────────────────────────────

def test_an_rollforward_total_beside_a_cash_line_proves_nothing():
    # 244,500,000 cash + 253,200,000 PropertyPlantAndEquipmentAdditions "closed" the section in all three
    # filings (a double count); a roll-forward total may stand only alone
    assert _proofs("AN", 2016) == {}
    assert _build("AN")["history"]["2016"]["capex"] == 244_500_000


def test_chdn_rollforward_total_alone_still_proves():
    # 274,900,000 == 70,200,000 capital improvements + 204,700,000 other PP&E: both readings agree
    new = _build("CHDN")
    assert new["history"]["2025"]["capex"] == 274_900_000
    assert new["prov"]["states"]["capex"][2025] == "closure_sum"


def test_ifrs_industry_scoped_concepts_are_poison():
    for c in ("PaymentsForDevelopmentProjectExpenditure", "PurchaseOfExplorationAndEvaluationAssets",
              "PaymentsForExplorationAndEvaluationExpenses"):
        assert bfh._investing_class(c) == "poison", c
    # VS files IntangibleAssetsUnderDevelopment: its "development project" line is capitalized development
    assert _build("VS")["history"]["2019"]["capex"] is None


# ── mechanics ──────────────────────────────────────────────────────────────────────────────────

def test_replacement_rule_truth_table():
    ok = bfh._replacement_allowed
    ppe, eol = "PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireEquipmentOnLease"
    opa, pa = "PaymentsToAcquireOtherProductiveAssets", "PaymentsToAcquireProductiveAssets"
    assert ok({ppe: 10, eol: 90}, 10, None) is True                  # anchored, specific
    assert ok({ppe: 10, opa: 90}, 10, None) is False                 # generic line added
    assert ok({pa: 10, eol: 90}, 10, None) is False                  # generic anchor
    assert ok({ppe: 12, eol: 90}, 10, None) is False                 # no anchor
    assert ok({ppe: 10, eol: 10}, 10, None) is False                 # two candidate anchors
    assert ok({eol: 90}, 0, ppe) is True                             # filed zero of a specific concept
    assert ok({eol: 90}, 0, pa) is False                             # filed zero of a generic concept
    assert ok({eol: 90}, 0, None) is False                           # a zero nobody filed


def test_provenance_state_code_r():
    new = _build("WLFC")
    enc = bfh.encode_provenance({"WLFC": new["history"]}, {"WLFC": new["prov"]})
    assert enc["_states"]["r"] == "closure_replaced"
    assert any(first == 2025 and code == "r" for first, _, code in enc["runs"]["WLFC"]["capex"])


if __name__ == "__main__":
    passed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            passed += 1
            print(f"  ok  {name}")
    print(f"\n{passed} passed")

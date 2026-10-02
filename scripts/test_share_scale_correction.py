"""P-2 share-scale correction in build_fundamentals_history (extract_history / encode_provenance).

A filer can tag its diluted share count in thousands with no second filing to contradict it. The
cell is rescaled by 1000**k (k in -2, -1, 1, 2) only on SEC evidence from the filing that carries it:
  1. EPS identity: net income / (filed diluted EPS x shares) in [0.7, 1.4] x 1000**k
  2. cover count (dei:EntityCommonStockSharesOutstanding, classes summed) / shares likewise, only when the EPS
     identity is missing or inconclusive (a ratio in [0.7, 1.4] affirms the count and the cover test does not run)
Anything else, including a real 10x change (a split year), is left alone. The vendor's numbers are
never an input. Synthetic facts, no network; the archive-backed examples skip without the zip.
Run: python -m pytest scripts/test_share_scale_correction.py -q
"""

import importlib.util
import json
import zipfile
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("bfh", str(HERE / "build_fundamentals_history.py"))
bfh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bfh)


def _dur(tag_vals, unit="USD", accn="A1", form="10-K", year=2023, filed="2024-02-20"):
    return {"units": {unit: [{"start": f"{year}-01-01", "end": f"{year}-12-31", "val": tag_vals,
                               "accn": accn, "form": form, "filed": filed}]}}


def _facts(shares, ni=100_000_000, eps=1.0, accn="A1", year=2023, extra_years=()):
    """One-year facts (plus optional extra years), all in the same filing unless stated."""
    f = {
        "Revenues": _dur(900_000_000, accn=accn, year=year),
        "NetIncomeLoss": _dur(ni, accn=accn, year=year),
        "WeightedAverageNumberOfDilutedSharesOutstanding": _dur(shares, "shares", accn=accn, year=year),
    }
    if eps is not None:
        f["EarningsPerShareDiluted"] = _dur(eps, "USD/shares", accn=accn, year=year)
    return f


def _dei(*vals, accn="A1", end="2024-02-10", filed="2024-02-20"):
    return {"EntityCommonStockSharesOutstanding": {"units": {"shares": [
        {"end": end, "val": v, "accn": accn, "form": "10-K", "filed": filed} for v in vals]}}}


def _cell(facts, dei=None, year=2023):
    history, bundle = bfh.extract_history(facts, "TEST", dei)
    return history[year]["shares_diluted"], bundle["scale_corrected"].get(str(year), {}).get("shares_diluted")


# ── EPS identity ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("filed,true,k", [
    (100_000, 100_000_000, 1),            # filed in thousands: NI/(EPS x shares) = 1000
    (100, 100_000_000, 2),                # filed in millions
    (100_000_000_000, 100_000_000, -1),   # filed 1000x too large
    (100_000_000_000_000, 100_000_000, -2),
])
def test_eps_identity_rescales_a_power_of_1000_slip(filed, true, k):
    value, state = _cell(_facts(filed))
    assert value == true and state == "scale_corrected_eps"


def test_eps_identity_wins_over_the_cover_count():
    # both tests would rescale, to different counts: step 1 is the one that runs
    value, state = _cell(_facts(100_000), dei=_dei(120_000_000))
    assert (value, state) == (100_000_000, "scale_corrected_eps")


def test_eps_that_affirms_the_count_stops_the_cover_test():
    # NI / (EPS x shares) = 1: the filed count is right. A cover count 1000x larger (another unit, a class, an ADS count)
    # must not move it: the identity affirms the count and the cover test does not run.
    value, state = _cell(_facts(100_000_000), dei=_dei(100_000_000_000))
    assert (value, state) == (100_000_000, None)
    assert bfh.correct_share_scale(100_000_000, 100_000_000, 1.0, 100_000_000_000) == (100_000_000, None)
    for ni in (70_000_000, 140_000_000):                       # the affirming band's edges, inclusive
        assert bfh.correct_share_scale(100_000_000, ni, 1.0, 100_000_000_000) == (100_000_000, None)


def test_the_cover_test_runs_when_eps_is_inconclusive_not_just_missing():
    # ratio 3 is neither affirming nor a power of 1000: inconclusive, so the cover count decides
    assert bfh.correct_share_scale(100_000, 300_000, 1.0, 100_000_000) == (100_000_000, "scale_corrected_cover")
    # a ratio just outside the affirming band (1.41) is inconclusive too
    assert bfh.correct_share_scale(100_000, 141_000, 1.0, 100_000_000) == (100_000_000, "scale_corrected_cover")


def test_eps_identity_band_is_inclusive_at_0_7_and_1_4_and_exclusive_beyond():
    # shares 100,000, EPS 1.0: NI/(EPS x shares) = NI / 100,000, so NI = 1000 x r x 100,000
    for ni, expect in ((70_000_000, True), (140_000_000, True), (69_900_000, False), (140_100_000, False)):
        value, state = _cell(_facts(100_000, ni=ni, eps=1.0))
        assert (state is not None) is expect, ni
        assert value == (100_000_000 if expect else 100_000)


def test_ratio_of_one_is_not_a_slip():
    value, state = _cell(_facts(100_000_000))
    assert (value, state) == (100_000_000, None)


def test_eps_from_another_filing_is_not_used():
    facts = _facts(100_000)
    facts["EarningsPerShareDiluted"] = _dur(1.0, "USD/shares", accn="OTHER")
    assert _cell(facts) == (100_000, None)


def test_zero_eps_or_zero_net_income_skips_the_eps_test_and_falls_through_to_the_cover():
    # 0.0 is a value: it is neither defaulted nor divided by; the cover test still runs
    assert _cell(_facts(100_000, eps=0.0)) == (100_000, None)
    assert _cell(_facts(100_000, ni=0)) == (100_000, None)
    assert _cell(_facts(100_000, eps=0.0), dei=_dei(100_000_000)) == (100_000_000, "scale_corrected_cover")


def test_opposite_sign_net_income_and_eps_prove_nothing():
    assert _cell(_facts(100_000, ni=-100_000_000, eps=1.0)) == (100_000, None)


# ── cover count ──────────────────────────────────────────────────────────────────────────────

def test_cover_count_rescales_when_there_is_no_eps():
    assert _cell(_facts(100_000, eps=None), dei=_dei(100_000_000)) == (100_000_000, "scale_corrected_cover")


def test_cover_count_classes_are_summed():
    # two classes, 60M + 40M = 100M against a count filed in thousands
    assert _cell(_facts(100_000, eps=None), dei=_dei(60_000_000, 40_000_000)) == \
        (100_000_000, "scale_corrected_cover")


def test_cover_count_of_another_filing_is_not_used():
    assert _cell(_facts(100_000, eps=None), dei=_dei(100_000_000, accn="OTHER")) == (100_000, None)


def test_cover_within_the_band_but_not_a_power_of_1000_does_not_move():
    assert _cell(_facts(100_000, eps=None), dei=_dei(100_000)) == (100_000, None)
    assert _cell(_facts(100_000, eps=None), dei=_dei(3_000_000)) == (100_000, None)


# ── nothing to test with ─────────────────────────────────────────────────────────────────────

def test_neither_test_runs_leaves_the_value_unchanged():
    assert _cell(_facts(100_000, eps=None)) == (100_000, None)


# ── a real change must not move ──────────────────────────────────────────────────────────────

def test_a_real_10x_split_year_does_not_move():
    # shares really went 10x (a 10-for-1 split); EPS and cover agree with the filed count
    value, state = _cell(_facts(100_000_000, ni=100_000_000, eps=1.0), dei=_dei(110_000_000))
    assert (value, state) == (100_000_000, None)
    # and the 10x ratio itself is not a power of 1000 in either test
    assert bfh.correct_share_scale(10_000_000, 100_000_000, 1.0, 100_000_000) == (10_000_000, None)
    assert bfh.correct_share_scale(100_000_000, 10_000_000, 1.0, 10_000_000) == (100_000_000, None)


def test_no_other_cell_changes():
    facts = _facts(100_000, eps=None)
    history, _ = bfh.extract_history(facts, "TEST", _dei(100_000_000))
    base, _ = bfh.extract_history(facts, "TEST", None)
    changed = {f for f in history[2023] if history[2023][f] != base[2023][f]}
    assert changed == {"shares_diluted"}


def test_without_dei_extract_history_keeps_its_old_signature_behaviour():
    history, bundle = bfh.extract_history(_facts(100_000_000))
    assert history[2023]["shares_diluted"] == 100_000_000 and bundle["scale_corrected"] == {}


# ── provenance + the new per-ticker cover field ─────────────────────────────────────────────

def test_state_is_layered_in_provenance_and_base_runs_are_unchanged():
    facts = _facts(100_000)
    history, bundle = bfh.extract_history(facts, "TEST", None)
    base_hist, base_bundle = bfh.extract_history(_facts(100_000_000), "TEST", None)
    rows = {str(y): r for y, r in history.items()}
    prov = bfh.encode_provenance({"TEST": rows}, {"TEST": bundle})
    base_prov = bfh.encode_provenance({"TEST": {str(y): r for y, r in base_hist.items()}},
                                      {"TEST": base_bundle})
    assert prov["scale_corrected"] == {"TEST": {"2023": {"shares_diluted": "e"}}}
    assert base_prov["scale_corrected"] == {}
    assert prov["runs"] == base_prov["runs"]
    assert prov["_states"]["e"] == "scale_corrected_eps" and prov["_states"]["c"] == "scale_corrected_cover"


def test_latest_shares_cover_is_the_latest_filing_with_classes_summed():
    dei = {"EntityCommonStockSharesOutstanding": {"units": {"shares": [
        {"end": "2023-02-01", "val": 5, "accn": "OLD", "form": "10-K", "filed": "2023-02-10"},
        {"end": "2024-02-01", "val": 60, "accn": "NEW", "form": "10-K", "filed": "2024-02-10"},
        {"end": "2024-02-01", "val": 40, "accn": "NEW", "form": "10-K", "filed": "2024-02-10"}]}}}
    assert bfh.latest_shares_cover(dei) == {"val": 100, "date": "2024-02-01", "filed": "2024-02-10"}
    assert bfh.latest_shares_cover({}) is None


def test_build_ticker_outputs_carries_the_cover_and_the_corrected_cell():
    data = {"facts": {"us-gaap": _facts(100_000), "dei": _dei(100_000_000)}}
    out = bfh.build_ticker_outputs(data, "TEST")
    assert out["history"]["2023"]["shares_diluted"] == 100_000_000
    assert out["cover"] == {"val": 100_000_000, "date": "2024-02-10", "filed": "2024-02-20"}


# ── the documented examples, only where the archive reproduces them ─────────────────────────

ZIP = HERE.parent / "companyfacts.zip"
CIK_MAP = HERE.parent / "public" / "data" / "cik_map.json"


@pytest.mark.skipif(not (ZIP.exists() and CIK_MAP.exists()), reason="companyfacts.zip not present")
@pytest.mark.parametrize("ticker,field,year,expected", [
    ("COHR", "da", 2023, 681_687_000),
    ("INVE", "net_income", 2021, 1_620_000),
    ("BKTI", "shares_diluted", 2020, 12_561_000),
])
def test_documented_examples_still_resolve_and_are_not_touched(ticker, field, year, expected):
    cik = json.loads(CIK_MAP.read_text(encoding="utf-8"))["map"][ticker]
    with zipfile.ZipFile(ZIP) as z:
        data = json.loads(z.read(f"CIK{cik}.json"))
    out = bfh.build_ticker_outputs(data, ticker)
    assert out["history"][str(year)][field] == expected
    assert str(year) not in out["prov"]["scale_corrected"]

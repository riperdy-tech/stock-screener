"""KISClient.usd_funds() — the deposit/in-transit/orderable split.

Regression guard for two NAV failures with the same signature. Both made NAV a
step function of settlement timing, which is what manufactures a phantom
drawdown: sold shares leave the balance immediately while proceeds settle T+2,
so a NAV that misses in-transit money falls by the trade value and then
de-risks, selling more.

  2026-07-30 — NAV was built from the withdrawable deposit alone, dropping sale
  proceeds in transit. Read as -46% on an account at its high-water mark; would
  have tripped the sticky HALT and liquidated the book.

  2026-07-31 — the same withdrawable field was still preferred over the true
  deposit (외화예수금). It already has net in-transit buys removed, so
  `+ sell - buy` subtracted them a second time. NAV read $25,118.74 against KIS's
  $30,720.91 (18.2%) and the cross-check aborted the run. The 07-30 fixture could
  not catch it: that day frcr_buy_mgn_amt was 0.00, making the two USD fields
  numerically identical.

The second case is why PAYLOAD_0731 stubs the HTTP layer rather than
_present_usd — the field-picking itself is what broke, so it has to run for real.

No network: the client's API calls are stubbed with payloads captured from live
probes of the real account.
Run: python scripts/test_kis_funds.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kis.client import KISClient  # noqa: E402
from kis.dd_engine import decide  # noqa: E402

# --- real 2026-07-30 probe output (inquire-present-balance USD row) ----------
# frcr_buy_mgn_amt is 0.00 here: nothing in transit, so deposit == withdrawable
# and this fixture alone cannot distinguish them. PAYLOAD_0731 is the one that can.
ROW = {"crcy_cd": "USD", "frcr_buy_amt_smtl": "1015.09",
       "frcr_sll_amt_smtl": "11308.680000", "frcr_dncl_amt_2": "2349.890000",
       "frcr_drwg_psbl_amt_1": "2349.890000", "frcr_buy_mgn_amt": "0.00000000",
       "frst_bltn_exrt": "1450.10000000"}
# output3 from the same call — KIS's own total-assets figure, in KRW
TOTALS = {"tot_asst_amt": "32029150", "tot_dncl_amt": "13"}
# --- real 매수가능금액 (inquire-psamount) -----------------------------------
BP = {"ord_psbl_frcr_amt": "2349.89", "sll_ruse_psbl_amt": "10293.59",
      "ovrs_ord_psbl_amt": "12574.32", "frcr_ord_psbl_amt1": "12574.329646"}

HOLDINGS = 9443.71        # evlu_amt_smtl on the same probe
KIS_TOTAL = 22087.54      # tot_asst_amt less its 13 KRW leg, at the bulletin rate
PEAK = 21877.0726         # DD peak recorded before the fix

# --- real 2026-07-31 run (the 18.2% abort) ----------------------------------
# USD row verbatim from the failing run's log. output3 is reconstructed from the
# figures that run published ($25,118.74 / $30,720.91) using the decomposition
# verified against the 07-30 probe:
#   tot_asst_amt = holdings + USD cash + unsettled sells - unsettled buys + KRW
# The bulletin rate is recoverable from the row itself: frcr_evlu_amt2 divided by
# frcr_drwg_psbl_amt_1 is 1441.0999, and every figure below reconciles at it.
ROW_0731 = {"crcy_cd": "USD", "frcr_buy_amt_smtl": "12035.160000",
            "frcr_sll_amt_smtl": "7785.290000", "frcr_dncl_amt_2": "11809.040000",
            "frcr_buy_mgn_amt": "4249.87000000",
            "frcr_drwg_psbl_amt_1": "7559.170000",
            "frcr_evlu_amt2": "10893519.000000",
            "nxdy_frcr_drwg_psbl_amt": "7559.170000",
            "frst_bltn_exrt": "1441.09990000"}
TOTALS_0731 = {"tot_asst_amt": "44271900", "tot_dncl_amt": "1948799"}
PAYLOAD_0731 = {"output2": [ROW_0731], "output3": TOTALS_0731}

HOLDINGS_0731 = 21809.44  # implied by the abort message: 25,118.74 - 3,309.30
NAV_0731_BUGGY = 25118.74  # what the run computed
KIS_TOTAL_0731 = 30720.91  # what it compared against (KRW leg still included)
KRW_RESERVE_0731 = 1352.30  # ~1.95M KRW at the bulletin rate


def _client(row=ROW, bp=BP, deposit=2349.89, withdrawable=None, totals=TOTALS):
    wdr = deposit if withdrawable is None else withdrawable

    class Fake(KISClient):
        def __init__(self):
            pass

        def _present_usd(self):
            return deposit, wdr, row, totals

        def buying_power(self, *a):
            return bp
    return Fake()


def _client_from_payload(payload=PAYLOAD_0731, bp=BP):
    """Stubs the HTTP layer, so _present_usd's field picking runs for real."""
    class Fake(KISClient):
        def __init__(self):
            # _present_usd builds a real request from these before _get is called.
            self.env, self.cano, self.acnt_prdt_cd = "real", "00000000", "01"

        def _get(self, *a, **k):
            return payload, {}

        def buying_power(self, *a):
            return bp
    return Fake()


def test_split_matches_probe():
    f = _client().usd_funds()
    assert f["deposit"] == 2349.89
    assert f["sell_in_transit"] == 11308.68
    assert f["buy_in_transit"] == 1015.09
    assert round(f["nav_cash"], 2) == 12643.48, f["nav_cash"]


def test_nav_reconciles_with_kis_total_assets():
    nav = _client().usd_funds()["nav_cash"] + HOLDINGS
    assert abs(nav - KIS_TOTAL) < 1.0, f"NAV {nav} vs KIS {KIS_TOTAL}"


def test_orderable_includes_reusable_sale_proceeds():
    # The whole point: proceeds in transit ARE spendable (매도대금 재사용).
    f = _client().usd_funds()
    assert f["orderable"] == 12574.32
    assert f["orderable"] > f["deposit"] * 5


def test_orderable_never_exceeds_own_funds():
    # 통합증거금 can inflate ovrs_ord_psbl_amt with KRW collateral. We cap at
    # withdrawable + reusable proceeds so the strategy never trades on margin.
    levered = {**BP, "ovrs_ord_psbl_amt": "999999"}
    f = _client(bp=levered).usd_funds()
    assert f["orderable"] == 2349.89 + 10293.59, f["orderable"]


def test_zero_deposit_still_reports_buying_power_source():
    # KRW-seeded account: the caller's margin guard keys off this source string.
    f = _client(row={}, deposit=0.0).usd_funds()
    assert f["source"] == "buying_power"
    assert f["orderable"] > 0


def test_nav_cash_is_invariant_across_settlement():
    """The property that kills the phantom drawdown.

    Settling a trade only moves money between the deposit and the in-transit
    buckets, so NAV must not move at all. Modelled the way KIS actually reports
    it — withdrawable is DERIVED as deposit less net in-transit buys, which is
    precisely why feeding it to the NAV formula double-counts them.
    """
    def nav_cash(deposit, sell_it, buy_it):
        row = {"frcr_dncl_amt_2": str(deposit),
               "frcr_drwg_psbl_amt_1": str(deposit - (buy_it - sell_it)),
               "frcr_sll_amt_smtl": str(sell_it),
               "frcr_buy_amt_smtl": str(buy_it)}
        return _client(row=row, deposit=deposit,
                       withdrawable=deposit - (buy_it - sell_it)).usd_funds()["nav_cash"]

    before = nav_cash(11809.04, 7785.29, 12035.16)
    after_sell_settles = nav_cash(11809.04 + 7785.29, 0.0, 12035.16)
    after_buy_settles = nav_cash(11809.04 - 12035.16, 7785.29, 0.0)
    assert abs(before - after_sell_settles) < 0.01, after_sell_settles
    assert abs(before - after_buy_settles) < 0.01, after_buy_settles


def test_psamount_failure_degrades_instead_of_raising():
    # usd_funds() is called again AFTER sells are placed. An exception there
    # would leave the book sold but never bought — strictly worse than the bug
    # this file exists to fix. It must degrade to withdrawable cash and say so.
    class Boom(KISClient):
        def __init__(self):
            pass

        def _present_usd(self):
            return 2349.89, 2349.89, ROW, TOTALS

        def buying_power(self, *a):
            raise RuntimeError("psamount 500")

    f = Boom().usd_funds()
    assert f["orderable"] == 2349.89, f["orderable"]
    assert "psamount-failed" in f["source"], f["source"]
    # NAV does not depend on that endpoint, so it must survive intact.
    assert round(f["nav_cash"], 2) == 12643.48


def test_orderable_capped_at_own_money_even_if_kis_inflates_everything():
    # Belt and braces: if every psamount field came back levered, the own-money
    # invariant still holds.
    wild = {"ord_psbl_frcr_amt": "999999", "sll_ruse_psbl_amt": "999999",
            "ovrs_ord_psbl_amt": "999999"}
    f = _client(bp=wild).usd_funds()
    assert f["orderable"] == 2349.89 + 11308.68, f["orderable"]


def test_kis_total_usd_is_an_independent_cross_check():
    # tot_asst_amt (KRW) / bulletin FX == the account total KIS itself reports.
    f = _client().usd_funds()
    assert abs(f["kis_total_usd"] - KIS_TOTAL) < 1.0, f["kis_total_usd"]

    ours_fixed = f["nav_cash"] + HOLDINGS
    ours_buggy = f["deposit"] + HOLDINGS          # the pre-fix formula
    div_fixed = abs(ours_fixed - f["kis_total_usd"]) / f["kis_total_usd"]
    div_buggy = abs(ours_buggy - f["kis_total_usd"]) / f["kis_total_usd"]
    assert div_fixed < 0.001, div_fixed           # ~0.002% — well inside any tolerance
    assert div_buggy > 0.10, div_buggy            # ~47% — trips the 10% abort


def test_kis_total_usd_zero_when_unavailable():
    # No FX rate or no totals -> 0.0 so the caller skips the check rather than
    # dividing by zero or aborting the run on missing data.
    assert _client(totals={}).usd_funds()["kis_total_usd"] == 0.0
    no_fx = {k: v for k, v in ROW.items() if k != "frst_bltn_exrt"}
    assert _client(row=no_fx).usd_funds()["kis_total_usd"] == 0.0


def test_with_orderable_false_skips_psamount():
    calls = []

    class Counting(KISClient):
        def __init__(self):
            pass

        def _present_usd(self):
            return 2349.89, 2349.89, ROW, TOTALS

        def buying_power(self, *a):
            calls.append(1)
            return BP

    f = Counting().usd_funds(with_orderable=False)
    assert calls == [], "psamount must not be queried for a nav-only snapshot"
    assert round(f["nav_cash"], 2) == 12643.48
    assert f["kis_total_usd"] > 0     # still available, same call


def test_phantom_drawdown_is_gone():
    nav = _client().usd_funds()["nav_cash"] + HOLDINGS
    state = {"peak_nav": PEAK, "gross": 0.5, "halted": False}
    _, d = decide(dict(state), nav)
    assert d["action"] != "halt", d
    assert d["gross"] == 1.0, d

    # ...and prove the old settled-cash-only NAV really did halt.
    _, old = decide(dict(state), 2349.89 + HOLDINGS)
    assert old["action"] == "halt", old


# --- 2026-07-31: the two USD fields diverge ---------------------------------

def test_0731_deposit_and_withdrawable_are_picked_apart():
    """The bug in one assertion: these must not be the same number.

    Runs the real _present_usd against the live payload. 매수증거금 is exactly the
    net of unsettled buys, so withdrawable has them removed already.
    """
    deposit, withdrawable, row, _ = _client_from_payload()._present_usd()
    assert deposit == 11809.04, deposit
    assert withdrawable == 7559.17, withdrawable
    margin = float(row["frcr_buy_mgn_amt"])
    assert abs((deposit - withdrawable) - margin) < 0.01
    assert abs(margin - (float(row["frcr_buy_amt_smtl"])
                         - float(row["frcr_sll_amt_smtl"]))) < 0.01


def test_0731_nav_cash_no_longer_double_counts_buys_in_transit():
    f = _client_from_payload().usd_funds()
    assert round(f["nav_cash"], 2) == 7559.17, f["nav_cash"]
    # What the failing run actually computed, for contrast.
    buggy = f["withdrawable"] + f["sell_in_transit"] - f["buy_in_transit"]
    assert round(buggy, 2) == 3309.30, buggy
    assert round(f["nav_cash"] - buggy, 2) == 4249.87   # the margin, counted twice


def test_0731_abort_no_longer_fires():
    f = _client_from_payload().usd_funds()
    nav = f["nav_cash"] + HOLDINGS_0731
    div = abs(nav - f["kis_total_usd"]) / f["kis_total_usd"]
    assert div < 0.03, f"{div:.2%} — would still warn"     # in fact ~0.00%

    # And the pre-fix pair really did breach the 10% abort.
    buggy_nav = f["withdrawable"] + f["sell_in_transit"] - f["buy_in_transit"] \
        + HOLDINGS_0731
    assert round(buggy_nav, 2) == NAV_0731_BUGGY, buggy_nav
    buggy_div = abs(buggy_nav - KIS_TOTAL_0731) / KIS_TOTAL_0731
    assert buggy_div > 0.10, buggy_div
    assert round(buggy_div, 3) == 0.182, buggy_div        # the alert's 18.2%


def test_0731_krw_reserve_is_excluded_from_the_cross_check():
    """The KRW leg is real money that cannot buy US stock.

    It is absent from our USD NAV by design, so it must be absent from the figure
    we compare against too — otherwise a reserve reads as a NAV error and the
    tolerance has to be widened, blunting the check for everyone.
    """
    f = _client_from_payload().usd_funds()
    assert abs(f["kis_krw_reserve_usd"] - KRW_RESERVE_0731) < 1.0, f["kis_krw_reserve_usd"]
    assert abs(f["kis_total_usd"] - (KIS_TOTAL_0731 - KRW_RESERVE_0731)) < 1.0
    # Without the exclusion the KRW alone would sit above the 3% warn band.
    assert KRW_RESERVE_0731 / KIS_TOTAL_0731 > 0.03


def test_0731_buy_budget_is_not_loosened_by_the_nav_fix():
    """NAV grew; spending power must not.

    The deposit includes money already committed to unsettled buys. Sizing buys
    off it would double-spend, so `orderable` stays on the withdrawable basis.
    """
    f = _client_from_payload().usd_funds()
    assert f["orderable"] <= f["withdrawable"] + f["sell_in_transit"] + 0.01
    assert f["orderable"] < f["nav_cash"] + f["buy_in_transit"]


def test_0731_settlement_invariance_holds_with_a_live_buy_margin():
    """The 07-30 fixture cannot test this: it had no margin to double-count."""
    def nav(deposit, sell_it, buy_it):
        row = {**ROW_0731, "frcr_dncl_amt_2": str(deposit),
               "frcr_drwg_psbl_amt_1": str(deposit - (buy_it - sell_it)),
               "frcr_sll_amt_smtl": str(sell_it),
               "frcr_buy_amt_smtl": str(buy_it)}
        payload = {"output2": [row], "output3": TOTALS_0731}
        return _client_from_payload(payload).usd_funds()["nav_cash"]

    before = nav(11809.04, 7785.29, 12035.16)
    for settled in (1000.0, 5000.0, 7785.29):     # a sale settles, in stages
        after = nav(11809.04 + settled, 7785.29 - settled, 12035.16)
        assert abs(before - after) < 0.01, f"{settled}: {before} -> {after}"


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"  ok    {fn.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"  FAIL  {fn.__name__}: {e}")
    print(f"{len(fns) - failed}/{len(fns)} passed")
    sys.exit(1 if failed else 0)

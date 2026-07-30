"""KISClient.usd_funds() — the settled/in-transit/orderable split.

Regression guard for the 2026-07-30 phantom drawdown: NAV was built from the
withdrawable deposit alone, so sale proceeds in transit (shares already gone
from the balance, cash not yet settled) vanished from NAV. After a heavy sell
day that read as a -46% drawdown on an account sitting at its high-water mark,
which would have tripped the sticky HALT and liquidated the book.

No network: the client's two API calls are stubbed with the real payload
captured from the 2026-07-30 probe of the live account.
Run: python scripts/test_kis_funds.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kis.client import KISClient  # noqa: E402
from kis.dd_engine import decide  # noqa: E402

# --- real 2026-07-30 probe output (inquire-present-balance USD row) ----------
ROW = {"crcy_cd": "USD", "frcr_buy_amt_smtl": "1015.09",
       "frcr_sll_amt_smtl": "11308.680000", "frcr_dncl_amt_2": "2349.890000",
       "frcr_drwg_psbl_amt_1": "2349.890000", "frst_bltn_exrt": "1450.10000000"}
# output3 from the same call — KIS's own total-assets figure, in KRW
TOTALS = {"tot_asst_amt": "32029150"}
# --- real 매수가능금액 (inquire-psamount) -----------------------------------
BP = {"ord_psbl_frcr_amt": "2349.89", "sll_ruse_psbl_amt": "10293.59",
      "ovrs_ord_psbl_amt": "12574.32", "frcr_ord_psbl_amt1": "12574.329646"}

HOLDINGS = 9443.71        # evlu_amt_smtl on the same probe
KIS_TOTAL = 22087.55      # tot_asst_amt — KIS's own view of the account
PEAK = 21877.0726         # DD peak recorded before the fix


def _client(row=ROW, bp=BP, deposit=2349.89, totals=TOTALS):
    class Fake(KISClient):
        def __init__(self):
            pass

        def _present_usd(self):
            return deposit, row, totals

        def buying_power(self, *a):
            return bp
    return Fake()


def test_split_matches_probe():
    f = _client().usd_funds()
    assert f["settled"] == 2349.89
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
    assert f["orderable"] > f["settled"] * 5


def test_orderable_never_exceeds_own_funds():
    # 통합증거금 can inflate ovrs_ord_psbl_amt with KRW collateral. We cap at
    # settled + reusable proceeds so the strategy never trades on margin.
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

    Settling a trade only moves money between `settled` and the in-transit
    buckets, so NAV must not move at all. The old settled-cash-only NAV was a
    step function of settlement timing — it jumped by the full trade value,
    which is precisely how a flat account read as -46%.
    """
    def nav_cash(settled, sell_it, buy_it):
        row = {"frcr_drwg_psbl_amt_1": str(settled),
               "frcr_sll_amt_smtl": str(sell_it),
               "frcr_buy_amt_smtl": str(buy_it)}
        return _client(row=row, deposit=settled).usd_funds()["nav_cash"]

    before = nav_cash(2349.89, 11308.68, 1015.09)
    after_sell_settles = nav_cash(2349.89 + 7785.70, 11308.68 - 7785.70, 1015.09)
    after_buy_settles = nav_cash(2349.89 - 1015.09, 11308.68, 0.0)
    assert abs(before - after_sell_settles) < 0.01, after_sell_settles
    assert abs(before - after_buy_settles) < 0.01, after_buy_settles


def test_psamount_failure_degrades_instead_of_raising():
    # usd_funds() is called again AFTER sells are placed. An exception there
    # would leave the book sold but never bought — strictly worse than the bug
    # this file exists to fix. It must degrade to settled cash and say so.
    class Boom(KISClient):
        def __init__(self):
            pass

        def _present_usd(self):
            return 2349.89, ROW, TOTALS

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
    ours_buggy = f["settled"] + HOLDINGS          # the pre-fix formula
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
            return 2349.89, ROW, TOTALS

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

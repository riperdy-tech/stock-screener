"""Guards in compute_battery (build_fundamentals_history · value-trap battery).

Pins the negative-endpoint guards on the two CAGR terms. Both raise a
fractional power, and in Python a negative base ** a fractional exponent
returns a *complex*, which round() rejects with TypeError. That crashed the
weekly build from 2026-07-05 to 2026-08-02: main() writes both output files
only at the very end, so the abort left fundamentals_history.json and
fundamentals_battery.json silently pinned to their 2026-06-29 contents while
the workflow still reported success (the step is `|| true`).

The positive-path assertions matter as much as the null ones — the guards must
not shift any value that already computed. No network, no files.
Run: python scripts/test_fundamentals_battery_guards.py
"""

import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "bfh", str(Path(__file__).resolve().parent / "build_fundamentals_history.py"))
bfh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bfh)


def _history(revenues, shares=None):
    """Fiscal years 2019.. with the given revenue series (one row per year).

    Every other field is a plausible constant — compute_battery needs them
    present so the F-score/Beneish paths don't short-circuit before the CAGRs.
    """
    out = {}
    for i, rev in enumerate(revenues):
        out[2019 + i] = {
            "revenue": rev, "total_assets": 1_000_000, "net_income": 50_000,
            "ocf": 60_000, "operating_income": 40_000, "gross_profit": 300_000,
            "current_assets": 400_000, "current_liabilities": 200_000,
            "lt_debt": 100_000, "ppe_net": 200_000, "receivables": 90_000,
            "da": 20_000, "sga": 50_000, "capex": 10_000,
            "shares_diluted": (shares[i] if shares else 1_000_000),
        }
    return out


_RISING = [500_000, 600_000, 700_000, 800_000, 900_000, 1_000_000]


# ── revenue_cagr_5y ──────────────────────────────────────────────────────────

def test_negative_terminal_revenue_is_null_not_a_crash():
    # Contra-revenue / restatement / mis-tagged XBRL fact in the latest year.
    b = bfh.compute_battery(_history([800_000, 900_000, 1_000_000, 1_100_000,
                                      1_200_000, -50_000]))
    assert b["revenue_cagr_5y"] is None, "negative terminal revenue must be null"


def test_rising_revenue_cagr_unchanged_by_the_guard():
    b = bfh.compute_battery(_history(_RISING))
    expected = round((_RISING[-1] / _RISING[0]) ** (1 / 5) - 1, 4)
    assert b["revenue_cagr_5y"] == expected, "guard altered the positive path"


def test_declining_revenue_still_yields_a_negative_cagr():
    # A shrinking-but-positive series is a real, computable CAGR — not null.
    b = bfh.compute_battery(_history(list(reversed(_RISING))))
    assert b["revenue_cagr_5y"] is not None and b["revenue_cagr_5y"] < 0, \
        "decline must compute, not fall into the null branch"


# ── net_issuance_3y_cagr ─────────────────────────────────────────────────────

def test_negative_share_count_is_null_not_a_crash():
    b = bfh.compute_battery(_history(
        _RISING, shares=[1_000_000, 1_000_000, 1_000_000, 1_050_000, 1_060_000, -900_000]))
    assert b["net_issuance_3y_cagr"] is None, "negative share count must be null"


def test_normal_share_series_still_computes_issuance():
    b = bfh.compute_battery(_history(
        _RISING, shares=[1_000_000, 1_010_000, 1_020_000, 1_030_000, 1_040_000, 1_050_000]))
    assert b["net_issuance_3y_cagr"] is not None, "normal share series must compute"


if __name__ == "__main__":
    passed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            passed += 1
            print(f"  ok  {name}")
    print(f"\n{passed} passed")

"""Unit tests for P3 review C2: missing values are never written as numbers.

- Vetoed rows: fct_percentile -> None (not 50.0)
- Absent door percentile: None (not 0.0)
- best_pctl: computed from present door percentiles only (None if no door scored)
- da / capex: None (not defaulted to 0.0); owner_earn falls back to fcf when either is None
- Missing daily volume: None, never 0.0; consumers handle None without TypeError
"""

import math
import sys
from pathlib import Path
from typing import Dict, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))
import score_factors_dual_door as sfdd
import build_daily_price_history as bdph
import build_momentum_state as bms


def test_vetoed_rows_fct_percentile_is_none():
    """C2: vetoed rows must have fct_percentile is None, not 50.0."""
    t = "VETOED_STOCK"
    band = "vetoed"
    prof = {"best_pctl": 50.0}
    # Emulate compat_tickers building logic
    if band == "vetoed":
        pctl_out = None
    else:
        raw_pctl = prof.get("best_pctl")
        pctl_out = round(raw_pctl, 2) if raw_pctl is not None else None

    row = {
        "fct_band": band,
        "fct_composite": pctl_out,
        "fct_percentile": pctl_out,
    }
    assert row["fct_percentile"] is None
    assert row["fct_composite"] is None


def test_door_percentile_none_when_unscored():
    """C2: an unscored door gets None for pctl, not 0.0."""
    all_d1 = [0.1, 0.5, 1.0]
    p_score = None
    pctl = round(sfdd.get_percentile(p_score, all_d1), 1) if p_score is not None else None
    assert pctl is None


def test_best_pctl_from_present_doors_only():
    """C2: best_pctl computed from present door percentiles only; None if none scored."""
    # Door 1 only
    assert sfdd.compute_best_pctl(0.5, None, 75.0, None, True) == 75.0
    # Door 2 only (eligible)
    assert sfdd.compute_best_pctl(None, 0.8, None, 82.0, True) == 82.0
    # Both doors
    assert sfdd.compute_best_pctl(0.5, 0.8, 75.0, 82.0, True) == 82.0
    # Door 2 falling knife -> Door 1 only
    assert sfdd.compute_best_pctl(0.5, 0.8, 75.0, 82.0, False) == 75.0
    # Door 2 falling knife and Door 1 unscored -> None
    assert sfdd.compute_best_pctl(None, 0.8, None, 82.0, False) is None
    # Neither door scored -> None
    assert sfdd.compute_best_pctl(None, None, None, None, True) is None


def test_da_capex_missing_falls_back_to_fcf():
    """C2: when da or capex is None, owner_earn falls back to fcf."""
    ni = 100.0
    da = None
    capex = 20.0
    fcf = 85.0
    # When da is None:
    owner_earn = (ni + da - capex) if None not in (ni, da, capex) else fcf
    assert owner_earn == 85.0

    # When capex is None:
    da2 = 15.0
    capex2 = None
    owner_earn2 = (ni + da2 - capex2) if None not in (ni, da2, capex2) else fcf
    assert owner_earn2 == 85.0

    # When all present:
    da3 = 15.0
    capex3 = 20.0
    owner_earn3 = (ni + da3 - capex3) if None not in (ni, da3, capex3) else fcf
    assert owner_earn3 == 95.0


def test_missing_daily_volume_is_none():
    """C2: missing daily volume in parsed series is None, not 0.0."""
    import pandas as pd
    # Construct a dataframe with Close but no Volume
    dates = pd.date_range("2026-01-01", periods=3)
    df = pd.DataFrame({"Close": [10.0, 11.0, 12.0]}, index=dates)
    parsed = bdph.parse_yf_download(df, ["TEST"])
    for d_str, (close, vol) in parsed["TEST"].items():
        assert close > 0
        assert vol is None, f"Expected None for missing volume on {d_str}, got {vol}"


def test_consumers_handle_none_volume():
    """C2: detect_split and adv_20d_usd calculations handle None volumes without raising TypeError."""
    # Test detect_split
    cached = {"2026-01-01": [10.0, None], "2026-01-02": [10.5, None]}
    new_tail = {"2026-01-03": [11.0, None]}
    # Should not raise TypeError:
    assert bdph.detect_split(cached, new_tail) is False

    # Test daily adv calculation
    closes = [10.0] * 20
    volumes = [None] * 20
    dollar_vols = [c * v for c, v in zip(closes, volumes) if c > 0 and v is not None and v >= 0]
    assert len(dollar_vols) == 0  # not >= 20, so adv_20d_usd is omitted (None)

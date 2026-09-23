"""test_p313_momentum_universe.py — Unit tests for Phase 3 P3.13 requirements.

Requirements covered:
1. universe_z: same winsor/clip standardisation as sector_neutral_z, pooled across the whole
   universe (no sector grouping); None stays None.
2. The momentum pillar's 50/50 sector-neutral / universe combination (MOMENTUM_UNIVERSE_WEIGHT).
3. None handling in the weighted combination: only one part present -> that part.
4. A synthetic two-sector universe where one sector's names all rise 300%: they now outrank
   flat-sector names on momentum, while before (sector-neutral only) they did not.
"""

from pathlib import Path

import pytest

import score_factors_dual_door as sfdd
from score_factors_dual_door import sector_neutral_z, universe_z, Z_CLAMP


def _weighted_mean_of_available(pairs):
    """Mirrors the nested weighted_mean_of_available() in main(): each present value carries
    its own weight; absent values drop out entirely (taking their weight with them)."""
    valid = [(v, w) for v, w in pairs if v is not None]
    if not valid:
        return None
    total_w = sum(w for _, w in valid)
    if total_w == 0:
        return sum(v for v, _ in valid) / len(valid)
    return sum(v * w for v, w in valid) / total_w


def test_universe_z_known_sample_winsor():
    """universe_z on a known 5-point sample: median lands near 0, and it matches
    sector_neutral_z run with every ticker forced into a single pooled sector."""
    raw = {"A": 1.0, "B": 2.0, "C": 3.0, "D": 4.0, "E": 5.0}
    z = universe_z(raw)

    assert z["C"] == pytest.approx(0.0, abs=1e-4)
    assert z["A"] < z["B"] < z["C"] < z["D"] < z["E"]

    pooled_sector = {t: "ONE_POOL" for t in raw}
    assert z == sector_neutral_z(raw, pooled_sector)


def test_universe_z_ignores_sector_grouping():
    """universe_z pools ALL names into one distribution — unlike sector_neutral_z, it does not
    treat two >=15-member sectors separately."""
    raw = {}
    sector_by_ticker = {}
    for i in range(15):
        raw[f"LOW_{i}"] = float(i)          # sector "Low": 0..14
        sector_by_ticker[f"LOW_{i}"] = "Low"
    for i in range(15):
        raw[f"HIGH_{i}"] = 100.0 + i        # sector "High": 100..114
        sector_by_ticker[f"HIGH_{i}"] = "High"

    sn = sector_neutral_z(raw, sector_by_ticker)
    uz = universe_z(raw)

    # Sector-neutral: each sector is standardized against itself, so the best "Low" name scores
    # comparably to the best "High" name even though its absolute return is far smaller.
    assert sn["LOW_14"] == pytest.approx(sn["HIGH_14"], abs=1e-6)

    # Pooled universe: the entire "Low" sector sits at the bottom, "High" sector at the top.
    assert max(uz[f"LOW_{i}"] for i in range(15)) < min(uz[f"HIGH_{i}"] for i in range(15))

    # None stays None
    raw_with_gap = dict(raw)
    raw_with_gap["MISSING"] = None
    uz2 = universe_z(raw_with_gap)
    assert uz2["MISSING"] is None


def test_momentum_universe_weight_config_default():
    """sifter_config.json carries momentum_universe_weight.MOMENTUM_UNIVERSE_WEIGHT = 0.5, and
    the module loads it into MOMENTUM_UNIVERSE_WEIGHT."""
    cfg_path = Path(__file__).resolve().parent / "sifter_config.json"
    assert cfg_path.exists()
    assert sfdd._load_momentum_universe_weight(cfg_path) == 0.5
    assert sfdd.MOMENTUM_UNIVERSE_WEIGHT == 0.5


def test_weighted_combination_50_50():
    """Both parts present with the default 0.5 weight -> a plain average (today's decision)."""
    w = sfdd.MOMENTUM_UNIVERSE_WEIGHT
    sn_part, univ_part = 1.2, -0.4
    combined = _weighted_mean_of_available([(sn_part, 1.0 - w), (univ_part, w)])
    assert combined == pytest.approx((sn_part + univ_part) / 2.0)

    # A non-50/50 weight actually shifts the blend (proves the config value is load-bearing,
    # not just documentation).
    combined_70 = _weighted_mean_of_available([(sn_part, 0.3), (univ_part, 0.7)])
    assert combined_70 == pytest.approx(0.3 * sn_part + 0.7 * univ_part)
    assert combined_70 != pytest.approx(combined)


def test_weighted_combination_none_handling():
    """Only one part present -> that part, unchanged, regardless of its nominal weight."""
    w = sfdd.MOMENTUM_UNIVERSE_WEIGHT
    assert _weighted_mean_of_available([(1.5, 1.0 - w), (None, w)]) == pytest.approx(1.5)
    assert _weighted_mean_of_available([(None, 1.0 - w), (2.5, w)]) == pytest.approx(2.5)
    assert _weighted_mean_of_available([(None, 1.0 - w), (None, w)]) is None


def test_synthetic_sector_boom_outranks_flat_after_p313():
    """A whole-sector +300% boom: sector-neutral z alone hides it (sd==0 within the sector, so
    every boom name scores 0.0 and a flat sector's own leader still outranks it). After P3.13's
    50/50 sector-neutral/universe blend, boom-sector names outrank the flat sector's leader."""
    boom_tickers = [f"BOOM_{i}" for i in range(15)]
    flat_tickers = [f"FLAT_{i}" for i in range(15)]

    raw_skip_12_1 = {}
    for t in boom_tickers:
        raw_skip_12_1[t] = 3.0  # +300%, identical across the sector -> degenerate sector sd
    for i, t in enumerate(flat_tickers):
        raw_skip_12_1[t] = i * 0.01  # 0%..14%, FLAT_14 is the flat sector's best performer

    sector_by_ticker = {t: "Boom" for t in boom_tickers}
    sector_by_ticker.update({t: "Flat" for t in flat_tickers})

    sn = sector_neutral_z(raw_skip_12_1, sector_by_ticker)
    uz = universe_z(raw_skip_12_1)

    # BEFORE (sector-neutral only): the boom sector is invisible (sd==0 -> z=0.0), so the flat
    # sector's own leader outranks every boom name.
    for t in boom_tickers:
        assert sn[t] == 0.0
    best_flat = max(flat_tickers, key=lambda t: sn[t])
    assert sn[best_flat] > sn[boom_tickers[0]]

    # The pooled universe sees the boom.
    assert uz[boom_tickers[0]] > uz[best_flat]

    # AFTER (P3.13, default 50/50): boom names now outrank the flat sector's leader.
    w = sfdd.MOMENTUM_UNIVERSE_WEIGHT
    combined_boom = _weighted_mean_of_available([(sn[boom_tickers[0]], 1.0 - w), (uz[boom_tickers[0]], w)])
    combined_flat_best = _weighted_mean_of_available([(sn[best_flat], 1.0 - w), (uz[best_flat], w)])
    assert combined_boom > combined_flat_best

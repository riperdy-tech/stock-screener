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
from live_sifter_fixture import run_live_sifter


BOOM = [f"BOOM_{i}" for i in range(15)]
FLAT = [f"FLAT_{i}" for i in range(15)]


def _run_live_momentum(tmp_path, monkeypatch, weight=None, with_gap_name=False, with_high=True):
    """Runs the live sifter's main() on a boom sector (15 names, identical +300%) and a flat sector (15
    names, 0..14%), plus optionally one name with no momentum entry. The momentum blend lives inside main()
    (weighted_mean_of_available is nested there), so it is read from main()'s published output:
    z_momentum * pillar_sd["momentum_published"] is the blend of the published sector-neutral and universe
    parts. Returns (published rows by ticker, pillar sd, the momentum state by ticker)."""
    if weight is not None:
        monkeypatch.setattr(sfdd, "MOMENTUM_UNIVERSE_WEIGHT", weight)
    stocks, fundamentals, mom = {}, {}, {}
    names = [(t, "Boom", 3.0, -0.01) for t in BOOM] + [(t, "Flat", i * 0.01, -0.20 + i * 0.01) for i, t in enumerate(FLAT)]
    for t, sector, mom_12_1, high in names:
        stocks[t] = {"symbol": t, "sector": sector, "industry": "Software-Application", "marketCap": 5e9,
                     "price": 40.0, "volume": 2_000_000, "metrics": {"adv_20d_usd": 20_000_000.0}}
        mom[t] = {"mom_12_1": mom_12_1, "mom_break": False, "regime_shift_down": False}
        if with_high:
            mom[t]["pct_from_52w_high"] = high
    if with_gap_name:
        stocks["NOMOM"] = {"symbol": "NOMOM", "sector": "Flat", "industry": "Software-Application",
                           "marketCap": 5e9, "price": 40.0, "volume": 2_000_000,
                           "metrics": {"adv_20d_usd": 20_000_000.0}}
    for t in stocks:
        fundamentals[t] = {"2024": {"revenue": 1000.0, "operating_income": 100.0, "net_income": 80.0,
                                    "debt_lt_noncurrent": 0.0, "debt_current": 0.0, "cash": 10.0}}
    compat, summary = run_live_sifter(tmp_path, monkeypatch, stocks, fundamentals, momentum_state=mom)
    return compat["tickers"], summary["pillar_sd"]["momentum_published"], mom


def _blend_of_published(rows, sd, t):
    return rows[t]["fct_z"]["momentum"] * sd


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


def test_weighted_combination_50_50(tmp_path, monkeypatch):
    """Both parts present with the default 0.5 weight -> a plain average (today's decision)."""
    rows, sd, _ = _run_live_momentum(tmp_path, monkeypatch)
    assert sfdd.MOMENTUM_UNIVERSE_WEIGHT == 0.5
    assert sd is not None
    checked = 0
    for t, r in rows.items():
        sn_part, univ_part = r["z_momentum_sector_neutral"], r["z_momentum_universe"]
        assert _blend_of_published(rows, sd, t) == pytest.approx((sn_part + univ_part) / 2.0, abs=0.01)
        checked += 1
    assert checked == 30


def test_weighted_combination_weight_is_load_bearing(tmp_path, monkeypatch):
    """A non-50/50 weight actually shifts the blend (proves the config value is load-bearing,
    not just documentation)."""
    rows, sd, _ = _run_live_momentum(tmp_path, monkeypatch, weight=0.7)
    rows_even, sd_even, _ = _run_live_momentum(tmp_path / "even", monkeypatch, weight=0.5)
    moved = 0
    for t, r in rows.items():
        sn_part, univ_part = r["z_momentum_sector_neutral"], r["z_momentum_universe"]
        assert _blend_of_published(rows, sd, t) == pytest.approx(0.3 * sn_part + 0.7 * univ_part, abs=0.01)
        if abs(_blend_of_published(rows, sd, t) - _blend_of_published(rows_even, sd_even, t)) > 0.05:
            moved += 1
    assert moved > 0


def test_weighted_combination_none_handling(tmp_path, monkeypatch):
    """Only one part present -> that part, unchanged, regardless of its nominal weight; neither part
    present -> no published momentum."""
    # universe part absent (the live universe_z answers None for every name)
    monkeypatch.setattr(sfdd, "universe_z", lambda raw, method=None: {t: None for t in raw})
    rows, sd, _ = _run_live_momentum(tmp_path / "a", monkeypatch)
    for t, r in rows.items():
        assert r["z_momentum_universe"] is None
        assert _blend_of_published(rows, sd, t) == pytest.approx(r["z_momentum_sector_neutral"], abs=0.01)
    monkeypatch.undo()

    # sector-neutral part absent for the two momentum inputs (every other metric is left to the live function)
    real_sn = sfdd.sector_neutral_z
    momentum_inputs = []

    def sn_without_momentum(raw_by_ticker, sector_by_ticker, method=None):
        pooled = set(sector_by_ticker.values()) == {"__universe__"}   # universe_z reaches this function pooled
        if not pooled and any(raw_by_ticker == m for m in momentum_inputs):
            return {t: None for t in raw_by_ticker}
        return real_sn(raw_by_ticker, sector_by_ticker, method=method)

    for key in ("mom_12_1", "pct_from_52w_high"):
        momentum_inputs.append({**{t: 3.0 if key == "mom_12_1" else -0.01 for t in BOOM},
                                **{t: (i * 0.01 if key == "mom_12_1" else -0.20 + i * 0.01) for i, t in enumerate(FLAT)}})
    monkeypatch.setattr(sfdd, "sector_neutral_z", sn_without_momentum)
    rows, sd, _ = _run_live_momentum(tmp_path / "b", monkeypatch)
    for t, r in rows.items():
        assert r["z_momentum_sector_neutral"] is None
        assert _blend_of_published(rows, sd, t) == pytest.approx(r["z_momentum_universe"], abs=0.01)
    monkeypatch.undo()

    # a name with no momentum entry at all: neither part, nothing published
    rows, sd, _ = _run_live_momentum(tmp_path / "c", monkeypatch, with_gap_name=True)
    assert rows["NOMOM"]["z_momentum_sector_neutral"] is None
    assert rows["NOMOM"]["z_momentum_universe"] is None
    assert rows["NOMOM"]["fct_z"]["momentum"] is None


def test_synthetic_sector_boom_outranks_flat_after_p313(tmp_path, monkeypatch):
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

    # AFTER (P3.13, default 50/50): boom names now outrank the flat sector's leader. The blend is read
    # from the live main()'s published z_momentum (the blend is nested there), on a fixture whose
    # momentum inputs are these two sectors.
    rows, sd, _ = _run_live_momentum(tmp_path, monkeypatch, with_high=False)
    best_flat_live = max(flat_tickers, key=lambda t: _blend_of_published(rows, sd, t))
    assert _blend_of_published(rows, sd, boom_tickers[0]) > _blend_of_published(rows, sd, best_flat_live)

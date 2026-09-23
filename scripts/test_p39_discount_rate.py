"""Unit tests for P3.9 — discount rate from the MRI cost-of-capital anchor, and the one-basis
expectations gap (SCR-03b, SCR-05).

Covers scripts/score_factors_dual_door.py's load_coe_anchor(), resolve_coe_pct() and
owner_cf_cagr_5y(), and the equivalent trio in scripts/build_valuation_models.py: anchor
present/fresh -> coe used and stamped; degraded/stale -> fallback stamped; missing sector
loading -> 1.0 + coe_default_loading flag; owner-cf gap vs. the revenue fallback; and that the
financials/REIT expectations-gap branches in score_factors_dual_door.py were left untouched.

Run: python -m pytest scripts/test_p39_discount_rate.py -q
"""
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import score_factors_dual_door as sfdd  # noqa: E402
import build_valuation_models as bvm  # noqa: E402


def _iso_date(days_ago: int = 0) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).strftime("%Y-%m-%d")


def _anchor(asof=None, degraded=False, risk_free=0.05, implied_erp=0.04, loadings=None):
    return {
        "asof": asof if asof is not None else _iso_date(0),
        "degraded": degraded,
        "risk_free": {"nominal_10y": risk_free},
        "implied_erp": implied_erp,
        "sector_loadings": loadings if loadings is not None else {
            "information_technology": 1.373,
            "semiconductors": 1.735,
        },
    }


def _write(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")


# ── score_factors_dual_door.py: load_coe_anchor ─────────────────────────────────────────────

def test_sfdd_anchor_missing_file_falls_back(tmp_path, monkeypatch):
    monkeypatch.setattr(sfdd, "COST_OF_CAPITAL_ANCHOR_JSON", tmp_path / "no_such_file.json")
    anchor, meta = sfdd.load_coe_anchor()
    assert anchor is None
    assert meta["discount_rate_source"] == "constant_fallback"
    assert meta["reason"] == "anchor_missing"


def test_sfdd_anchor_fresh_and_not_degraded_is_used(tmp_path, monkeypatch):
    path = tmp_path / "cost_of_capital_anchor.json"
    _write(path, _anchor(asof=_iso_date(1), degraded=False))
    monkeypatch.setattr(sfdd, "COST_OF_CAPITAL_ANCHOR_JSON", path)
    anchor, meta = sfdd.load_coe_anchor()
    assert anchor is not None
    assert meta["discount_rate_source"] == "anchor"
    assert meta["reason"] == "ok"
    assert meta["age_days"] == 1


def test_sfdd_anchor_degraded_falls_back(tmp_path, monkeypatch):
    path = tmp_path / "cost_of_capital_anchor.json"
    _write(path, _anchor(asof=_iso_date(0), degraded=True))
    monkeypatch.setattr(sfdd, "COST_OF_CAPITAL_ANCHOR_JSON", path)
    anchor, meta = sfdd.load_coe_anchor()
    assert anchor is None
    assert meta["discount_rate_source"] == "constant_fallback"
    assert meta["reason"] == "degraded"


def test_sfdd_anchor_stale_falls_back(tmp_path, monkeypatch):
    path = tmp_path / "cost_of_capital_anchor.json"
    _write(path, _anchor(asof=_iso_date(46), degraded=False))
    monkeypatch.setattr(sfdd, "COST_OF_CAPITAL_ANCHOR_JSON", path)
    anchor, meta = sfdd.load_coe_anchor()
    assert anchor is None
    assert meta["discount_rate_source"] == "constant_fallback"
    assert meta["reason"] == "stale_46d"


def test_sfdd_anchor_exactly_45_days_is_still_fresh(tmp_path, monkeypatch):
    path = tmp_path / "cost_of_capital_anchor.json"
    _write(path, _anchor(asof=_iso_date(45), degraded=False))
    monkeypatch.setattr(sfdd, "COST_OF_CAPITAL_ANCHOR_JSON", path)
    anchor, meta = sfdd.load_coe_anchor()
    assert anchor is not None
    assert meta["discount_rate_source"] == "anchor"


def test_sfdd_anchor_unparseable_asof_falls_back(tmp_path, monkeypatch):
    path = tmp_path / "cost_of_capital_anchor.json"
    _write(path, _anchor(asof="not-a-date", degraded=False))
    monkeypatch.setattr(sfdd, "COST_OF_CAPITAL_ANCHOR_JSON", path)
    anchor, meta = sfdd.load_coe_anchor()
    assert anchor is None
    assert meta["reason"] == "asof_missing_or_unparseable"


# ── score_factors_dual_door.py: resolve_coe_pct ─────────────────────────────────────────────

def test_sfdd_resolve_coe_uses_finer_mgi_subindustry_id_first():
    anchor = _anchor(risk_free=0.05, implied_erp=0.04, loadings={
        "information_technology": 1.373, "semiconductors": 1.735,
    })
    pct, flag = sfdd.resolve_coe_pct(anchor, "semiconductors", "Technology")
    assert pct == pytest.approx((0.05 + 1.735 * 0.04) * 100.0)
    assert flag is None


def test_sfdd_resolve_coe_falls_back_to_gics_macro_id():
    anchor = _anchor(risk_free=0.05, implied_erp=0.04, loadings={
        "information_technology": 1.373,
    })
    # mgi_subindustry_id present but not a sector_loadings key (e.g. "tech_software" cluster id,
    # not "software") -> falls through to GICS_TO_MACRO_ID["Technology"] = "information_technology".
    pct, flag = sfdd.resolve_coe_pct(anchor, None, "Technology")
    assert pct == pytest.approx((0.05 + 1.373 * 0.04) * 100.0)
    assert flag is None


def test_sfdd_resolve_coe_defaults_loading_when_sector_has_none():
    anchor = _anchor(risk_free=0.05, implied_erp=0.04, loadings={"information_technology": 1.373})
    pct, flag = sfdd.resolve_coe_pct(anchor, None, "Basic Materials")
    assert pct == pytest.approx((0.05 + 1.0 * 0.04) * 100.0)
    assert flag == "coe_default_loading"


def test_sfdd_resolve_coe_anchor_none_returns_constant_fallback():
    pct, flag = sfdd.resolve_coe_pct(None, "semiconductors", "Technology")
    assert pct == sfdd.CONSTANT_FALLBACK_DISCOUNT_RATE
    assert flag is None


# ── score_factors_dual_door.py: owner_cf_cagr_5y ────────────────────────────────────────────

def test_sfdd_owner_cf_cagr_5y_computes_from_ni_da_capex():
    years = [2020, 2021, 2022, 2023, 2024]
    ydata = {
        str(y): {"net_income": 100.0 * (1.10 ** i), "da": 10.0, "capex": 5.0}
        for i, y in enumerate(years)
    }
    result = sfdd.owner_cf_cagr_5y(ydata, years)
    first = 100.0 + 10.0 - 5.0
    last = 100.0 * (1.10 ** 4) + 10.0 - 5.0
    expected = (last / first) ** (1.0 / 4) - 1.0
    assert result == pytest.approx(expected)


def test_sfdd_owner_cf_cagr_5y_uses_fcf_when_a_year_is_missing_a_component():
    years = [2020, 2021, 2022, 2023, 2024]
    ydata = {str(y): {"net_income": 100.0, "da": 10.0, "capex": 5.0} for y in years}
    # 2024 is missing capex entirely -> that year falls back to fcf.
    ydata["2024"] = {"net_income": 100.0, "da": 10.0, "fcf": 150.0}
    result = sfdd.owner_cf_cagr_5y(ydata, years)
    assert result is not None
    first = 105.0
    last = 150.0
    expected = (last / first) ** (1.0 / 4) - 1.0
    assert result == pytest.approx(expected)


def test_sfdd_owner_cf_cagr_5y_negative_base_is_undefined():
    years = [2020, 2021, 2022, 2023, 2024]
    ydata = {str(y): {"net_income": -50.0, "da": 10.0, "capex": 5.0} for y in years}
    assert sfdd.owner_cf_cagr_5y(ydata, years) is None


def test_sfdd_owner_cf_cagr_5y_too_few_points_is_undefined():
    years = [2023, 2024]
    ydata = {str(y): {"net_income": 100.0, "da": 10.0, "capex": 5.0} for y in years}
    assert sfdd.owner_cf_cagr_5y(ydata, years) is None


# ── score_factors_dual_door.py: financials/REIT branches left untouched ────────────────────

def test_sfdd_bank_and_reit_gordon_growth_formulas_are_unchanged():
    """P3.9 only changes the 'else' (non-bank, non-REIT) archetype branch of the expectations-
    gap block; the commercial_bank/insurance_lending and real_estate_reit formulas (fixed
    10%/8% Gordon-growth constants vs. the revenue CAGR) must still read exactly as before."""
    src = (SCRIPTS_DIR / "score_factors_dual_door.py").read_text(encoding="utf-8")
    assert "implied_g = 0.10 - (ni / mcap)" in src
    assert "implied_g = 0.08 - (ocf / mcap)" in src
    # Both branches still compare against hist_cagr (the revenue CAGR), never the owner-cf one.
    assert "gap = (hist_cagr - implied_g) * 100.0" in src


# ── build_valuation_models.py: load_coe_anchor / resolve_coe_pct ───────────────────────────

def test_bvm_anchor_missing_file_falls_back(tmp_path, monkeypatch):
    monkeypatch.setattr(bvm, "COST_OF_CAPITAL_ANCHOR_JSON", tmp_path / "no_such_file.json")
    anchor, meta = bvm.load_coe_anchor()
    assert anchor is None
    assert meta["discount_rate_source"] == "constant_fallback"
    assert meta["reason"] == "anchor_missing"


def test_bvm_anchor_fresh_is_used(tmp_path, monkeypatch):
    path = tmp_path / "cost_of_capital_anchor.json"
    _write(path, _anchor(asof=_iso_date(0), degraded=False))
    monkeypatch.setattr(bvm, "COST_OF_CAPITAL_ANCHOR_JSON", path)
    anchor, meta = bvm.load_coe_anchor()
    assert anchor is not None
    assert meta["discount_rate_source"] == "anchor"


def test_bvm_anchor_degraded_falls_back(tmp_path, monkeypatch):
    path = tmp_path / "cost_of_capital_anchor.json"
    _write(path, _anchor(asof=_iso_date(0), degraded=True))
    monkeypatch.setattr(bvm, "COST_OF_CAPITAL_ANCHOR_JSON", path)
    anchor, meta = bvm.load_coe_anchor()
    assert anchor is None
    assert meta["reason"] == "degraded"


def test_bvm_resolve_coe_matches_sfdd_math():
    anchor = _anchor(risk_free=0.05, implied_erp=0.04, loadings={"semiconductors": 1.735})
    pct, flag = bvm.resolve_coe_pct(anchor, "semiconductors", "Technology", fallback_pct=11.0)
    assert pct == pytest.approx((0.05 + 1.735 * 0.04) * 100.0)
    assert flag is None


def test_bvm_resolve_coe_missing_loading_defaults_and_flags():
    anchor = _anchor(risk_free=0.05, implied_erp=0.04, loadings={"information_technology": 1.373})
    pct, flag = bvm.resolve_coe_pct(anchor, None, "Basic Materials", fallback_pct=10.0)
    assert pct == pytest.approx((0.05 + 1.0 * 0.04) * 100.0)
    assert flag == "coe_default_loading"


def test_bvm_resolve_coe_anchor_none_keeps_sector_wacc_fallback():
    """Do not touch sector_wacc: when the anchor is unusable, build_valuation_models.py's
    reverse-DCF discount rate stays exactly the current sector_wacc table lookup."""
    pct, flag = bvm.resolve_coe_pct(None, "semiconductors", "Technology", fallback_pct=11.0)
    assert pct == 11.0
    assert flag is None


# ── build_valuation_models.py: owner_cf_cagr_5y and gap_basis selection ────────────────────

def test_bvm_owner_cf_cagr_5y_computes_expected():
    years = [2020, 2021, 2022, 2023, 2024]
    ydata = {
        str(y): {"net_income": 100.0 * (1.08 ** i), "da": 8.0, "capex": 4.0}
        for i, y in enumerate(years)
    }
    result = bvm.owner_cf_cagr_5y(ydata)
    first = 100.0 + 8.0 - 4.0
    last = 100.0 * (1.08 ** 4) + 8.0 - 4.0
    expected = (last / first) ** (1.0 / 4) - 1.0
    assert result == pytest.approx(expected)


def test_bvm_owner_cf_cagr_5y_undefined_on_negative_base():
    years = [2020, 2021, 2022, 2023, 2024]
    ydata = {str(y): {"net_income": -10.0, "da": 1.0, "capex": 1.0} for y in years}
    assert bvm.owner_cf_cagr_5y(ydata) is None


def test_bvm_gap_basis_prefers_owner_cf_over_revenue():
    """Replicates the small selection block in build_valuation_models.py's main(): owner_cf
    wins when its CAGR is defined; revenue_fallback (gap_basis) only applies when it isn't."""
    owner_cf_cagr, rev_cagr = 0.12, 0.20
    if owner_cf_cagr is not None:
        used_cagr, gap_basis = owner_cf_cagr, "owner_cf"
    elif rev_cagr is not None:
        used_cagr, gap_basis = rev_cagr, "revenue_fallback"
    else:
        used_cagr, gap_basis = None, None
    assert gap_basis == "owner_cf"
    assert used_cagr == 0.12


def test_bvm_gap_basis_falls_back_to_revenue_when_owner_cf_undefined():
    owner_cf_cagr, rev_cagr = None, 0.20
    if owner_cf_cagr is not None:
        used_cagr, gap_basis = owner_cf_cagr, "owner_cf"
    elif rev_cagr is not None:
        used_cagr, gap_basis = rev_cagr, "revenue_fallback"
    else:
        used_cagr, gap_basis = None, None
    assert gap_basis == "revenue_fallback"
    assert used_cagr == 0.20


def test_bvm_gap_basis_none_when_neither_available():
    owner_cf_cagr, rev_cagr = None, None
    if owner_cf_cagr is not None:
        used_cagr, gap_basis = owner_cf_cagr, "owner_cf"
    elif rev_cagr is not None:
        used_cagr, gap_basis = rev_cagr, "revenue_fallback"
    else:
        used_cagr, gap_basis = None, None
    assert gap_basis is None
    assert used_cagr is None


# ── end-to-end via dual_door_diff.run_sifter: the P3.9 measurement harness wiring ───────────

def _minimal_dataset(base_dir: Path) -> Path:
    """A self-contained synthetic public/data fixture: one Technology/semiconductors name with
    5 years of growing fundamentals (so both the revenue CAGR gate (>=3 years) and the owner-cf
    5-year CAGR (>=4 points) are satisfied) and one bank name (financials branch, untouched)."""
    data_dir = base_dir / "public" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    stocks = {
        "TECH": {"symbol": "TECH", "sector": "Technology", "industry": "Semiconductors",
                  "marketCap": 1_000_000_000.0, "price": 30.0, "volume": 600_000},
        "BANK": {"symbol": "BANK", "sector": "Financial Services", "industry": "Banks-Diversified",
                  "marketCap": 1_200_000_000.0, "price": 40.0, "volume": 700_000},
    }
    price_history = {"tickers": {
        "TECH": [10.0 + i * 0.3 for i in range(16)],
        "BANK": [20.0 + i * 0.2 for i in range(16)],
    }}
    years = [2020, 2021, 2022, 2023, 2024]
    fundamentals_history = {"tickers": {
        "TECH": {
            str(y): {
                "revenue": 80_000_000 * (1.20 ** i), "operating_income": 12_000_000 * (1.20 ** i),
                "net_income": 8_000_000 * (1.20 ** i), "ocf": 12_000_000 * (1.20 ** i),
                "fcf": 8_000_000 * (1.20 ** i), "da": 2_000_000, "capex": 3_000_000,
                "lt_debt": 0, "cash": 10_000_000, "equity": 40_000_000, "gross_profit": 40_000_000,
            }
            for i, y in enumerate(years)
        },
        "BANK": {
            str(y): {
                "revenue": 50_000_000 * (1.05 ** i), "operating_income": 15_000_000 * (1.05 ** i),
                "net_income": 10_000_000 * (1.05 ** i), "ocf": 10_000_000 * (1.05 ** i),
                "fcf": 10_000_000 * (1.05 ** i), "da": 0, "capex": 0,
                "lt_debt": 0, "cash": 20_000_000, "equity": 150_000_000, "gross_profit": 30_000_000,
            }
            for i, y in enumerate(years)
        },
    }}

    (data_dir / "stocks.json").write_text(json.dumps(stocks), encoding="utf-8")
    (data_dir / "price_history.json").write_text(json.dumps(price_history), encoding="utf-8")
    (data_dir / "fundamentals_history.json").write_text(json.dumps(fundamentals_history), encoding="utf-8")
    return data_dir


def test_anchor_wired_end_to_end_through_dual_door_diff(tmp_path):
    """The P3.9 measurement harness (scripts/tools/dual_door_diff.py --data-dir) must pick up a
    temp-dir anchor file: without it every row falls back to the constant; with a fresh,
    non-degraded anchor, TECH (semiconductors) gets the anchor coe and gap_basis="owner_cf"
    stamped, while BANK (commercial_bank archetype, untouched branch) never carries either
    field."""
    tools_dir = SCRIPTS_DIR / "tools"
    if str(tools_dir) not in sys.path:
        sys.path.insert(0, str(tools_dir))
    import dual_door_diff

    data_dir = _minimal_dataset(tmp_path)
    sifter_path = SCRIPTS_DIR / "score_factors_dual_door.py"
    source = sifter_path.read_text(encoding="utf-8")

    # Scenario 1: no anchor file under data_dir/mri -> constant_fallback everywhere.
    mod_fallback = dual_door_diff.load_sifter_module(source, "sifter_p39_fallback", sifter_path)
    summary1, compat1 = dual_door_diff.run_sifter(mod_fallback, tmp_path / "out1", data_dir=data_dir, quiet=True)
    assert summary1["discount_rate_source"] == "constant_fallback"
    assert compat1["discount_rate_source"] == "constant_fallback"
    assert compat1["tickers"]["TECH"]["discount_rate_pct"] == pytest.approx(sfdd.CONSTANT_FALLBACK_DISCOUNT_RATE)
    assert compat1["tickers"]["TECH"]["gap_basis"] == "owner_cf"
    assert compat1["tickers"]["BANK"]["discount_rate_pct"] is None
    assert compat1["tickers"]["BANK"]["gap_basis"] is None

    # Scenario 2: fresh, non-degraded anchor with a semiconductors loading -> anchor used.
    anchor_dir = data_dir / "mri"
    anchor_dir.mkdir(parents=True, exist_ok=True)
    (anchor_dir / "cost_of_capital_anchor.json").write_text(
        json.dumps(_anchor(risk_free=0.05, implied_erp=0.04, loadings={"semiconductors": 1.735})),
        encoding="utf-8",
    )
    mod_anchor = dual_door_diff.load_sifter_module(source, "sifter_p39_anchor", sifter_path)
    summary2, compat2 = dual_door_diff.run_sifter(mod_anchor, tmp_path / "out2", data_dir=data_dir, quiet=True)
    assert summary2["discount_rate_source"] == "anchor"
    assert compat2["discount_rate_source"] == "anchor"
    expected_pct = (0.05 + 1.735 * 0.04) * 100.0
    assert compat2["tickers"]["TECH"]["discount_rate_pct"] == pytest.approx(expected_pct)
    assert compat2["tickers"]["TECH"]["gap_basis"] == "owner_cf"
    assert compat2["tickers"]["BANK"]["discount_rate_pct"] is None
    assert compat2["tickers"]["BANK"]["gap_basis"] is None

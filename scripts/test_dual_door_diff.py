"""test_dual_door_diff.py — Tests for scripts/tools/dual_door_diff.py.

Verifies:
1. Baseline-vs-itself on small synthetic input set produces zero churn and empty in/out lists.
2. A fixture with one name's score changed moves it in/out as expected.
3. The tool writes nothing under a fixture's public/data.
4. Spearman rank correlation and distribution statistics math.
"""

import hashlib
import json
import shutil
import sys
from pathlib import Path
from typing import Dict, Any

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parent
ROOT = SCRIPTS_DIR.parent
TOOLS_DIR = SCRIPTS_DIR / "tools"

if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from dual_door_diff import (  # noqa: E402
    run_diff,
    compute_spearman_rank_correlation,
    compute_distribution_stats,
    pctl,
    DEFAULT_SIFTER_PATH,
)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _create_synthetic_dataset(base_dir: Path) -> Path:
    """Create a self-contained synthetic public/data fixture."""
    data_dir = base_dir / "public" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    tickers = ["TICK_A", "TICK_B", "TICK_C", "TICK_D", "TICK_E"]
    sectors = {
        "TICK_A": "Technology",
        "TICK_B": "Technology",
        "TICK_C": "Healthcare",
        "TICK_D": "Consumer Cyclical",
        "TICK_E": "Financial Services",
    }
    industries = {
        "TICK_A": "Software - Infrastructure",
        "TICK_B": "Semiconductors",
        "TICK_C": "Biotechnology",
        "TICK_D": "Auto Manufacturers",
        "TICK_E": "Banks - Diversified",
    }

    stocks = {
        t: {
            "symbol": t,
            "sector": sectors[t],
            "industry": industries[t],
            "marketCap": 1_000_000_000 + i * 200_000_000,
            "price": 25.0 + i * 5.0,
            "volume": 500_000 + i * 100_000,
        }
        for i, t in enumerate(tickers)
    }

    price_history = {
        "tickers": {
            t: [10.0 + i + month * 0.5 for month in range(16)]
            for i, t in enumerate(tickers)
        }
    }

    fundamentals_history = {
        "tickers": {
            t: {
                "2022": {
                    "revenue": 80_000_000, "operating_income": 12_000_000, "net_income": 8_000_000,
                    "ocf": 12_000_000, "fcf": 8_000_000, "da": 2_000_000, "capex": 4_000_000,
                    "lt_debt": 0, "cash": 10_000_000, "equity": 40_000_000, "gross_profit": 40_000_000,
                },
                "2023": {
                    "revenue": 100_000_000, "operating_income": 16_000_000, "net_income": 12_000_000,
                    "ocf": 16_000_000, "fcf": 11_000_000, "da": 3_000_000, "capex": 5_000_000,
                    "lt_debt": 0, "cash": 15_000_000, "equity": 50_000_000, "gross_profit": 50_000_000,
                },
                "2024": {
                    "revenue": 120_000_000, "operating_income": 20_000_000, "net_income": 15_000_000,
                    "ocf": 20_000_000, "fcf": 14_000_000, "da": 3_000_000, "capex": 6_000_000,
                    "lt_debt": 0, "cash": 20_000_000, "equity": 65_000_000, "gross_profit": 60_000_000,
                },
            }
            for t in tickers
        }
    }

    battery = {
        "tickers": {
            t: {
                "accruals_ratio": -0.05 + i * 0.01,
                "f_score": 7,
                "m_score": -2.8,
            }
            for i, t in enumerate(tickers)
        }
    }

    eps_trajectory = {
        "tickers": {
            t: {"trajectory_slope": 0.08 + i * 0.02}
            for i, t in enumerate(tickers)
        }
    }

    (data_dir / "stocks.json").write_text(json.dumps(stocks), encoding="utf-8")
    (data_dir / "price_history.json").write_text(json.dumps(price_history), encoding="utf-8")
    (data_dir / "fundamentals_history.json").write_text(json.dumps(fundamentals_history), encoding="utf-8")
    (data_dir / "fundamentals_battery.json").write_text(json.dumps(battery), encoding="utf-8")
    (data_dir / "eps_trajectory.json").write_text(json.dumps(eps_trajectory), encoding="utf-8")

    return data_dir


def test_baseline_vs_itself_zero_churn(tmp_path: Path):
    """Running baseline against itself on synthetic inputs produces zero churn and empty in/out."""
    data_dir = _create_synthetic_dataset(tmp_path)
    out_file = tmp_path / "diff_report.json"

    report, text_summary = run_diff(
        baseline_file=DEFAULT_SIFTER_PATH,
        working_file=DEFAULT_SIFTER_PATH,
        data_dir=data_dir,
        out_path=out_file,
        quiet=True,
    )

    # 1. Verification of empty in/out
    assert report["book"]["entered"] == []
    assert report["book"]["left"] == []
    assert report["research_now"]["entered"] == []
    assert report["research_now"]["left"] == []

    # 2. Size delta is 0
    assert report["book"]["size"]["delta"] == 0
    assert report["research_now"]["size"]["delta"] == 0
    assert report["book"]["size"]["baseline"] > 0

    # 3. Rank churn is 0 -> Spearman correlation is 1.0
    assert report["book"]["spearman_rank_correlation"] == 1.0
    assert report["research_now"]["spearman_rank_correlation"] == 1.0

    # 4. All deltas in mixes and distributions are 0
    for sec_data in report["sector_mix"]["book"].values():
        assert sec_data["delta"] == 0
    for cl_data in report["cluster_mix"]["book"].values():
        assert cl_data["delta"] == 0
    for door_data in report["door_mix"]["book"].values():
        assert door_data["delta"] == 0

    d2_delta = report["door2_z_momentum"]["delta"]
    assert d2_delta["count"] == 0
    assert d2_delta["min"] == 0.0 or d2_delta["min"] is None
    assert d2_delta["median"] == 0.0 or d2_delta["median"] is None
    assert d2_delta["count_under_minus_1_0"] == 0
    assert d2_delta["count_under_minus_1_5"] == 0
    assert d2_delta["count_under_minus_2_0"] == 0

    # 5. Effective weights are null with reason not_emitted_by_this_version
    assert report["effective_weights"] is None
    assert report["effective_weights_reason"] == "not_emitted_by_this_version"

    # 6. JSON output file was written and matches returned report
    assert out_file.exists()
    loaded_json = json.loads(out_file.read_text(encoding="utf-8"))
    assert loaded_json["book"] == report["book"]


def test_score_change_moves_name_in_out(tmp_path: Path):
    """When a stock's score or status changes between implementations, the tool records in/out movement."""
    data_dir = _create_synthetic_dataset(tmp_path)

    # Create modified working tree sifter script where TICK_A is explicitly vetoed
    original_code = DEFAULT_SIFTER_PATH.read_text(encoding="utf-8")
    # Insert a synthetic veto right after the eligible_count loop starts
    injection_target = "if t in untradable:"
    modified_code = original_code.replace(
        injection_target,
        'if t == "TICK_A":\n            vetoes[t] = "SYNTHETIC_TEST_VETO"\n            continue\n        ' + injection_target,
    )
    assert modified_code != original_code

    modified_sifter = tmp_path / "modified_sifter.py"
    modified_sifter.write_text(modified_code, encoding="utf-8")

    out_file = tmp_path / "diff_report_churn.json"
    report, text_summary = run_diff(
        baseline_file=DEFAULT_SIFTER_PATH,
        working_file=modified_sifter,
        data_dir=data_dir,
        out_path=out_file,
        quiet=True,
    )

    # TICK_A was nominated in baseline and is now vetoed in working tree
    assert "TICK_A" in report["book"]["left"]
    assert "TICK_A" not in report["book"]["entered"]
    assert report["veto_breakdown"]["by_reason"]["SYNTHETIC_TEST_VETO"]["delta"] == 1
    assert report["veto_breakdown"]["by_reason"]["SYNTHETIC_TEST_VETO"]["working"] == 1
    assert report["veto_breakdown"]["by_reason"]["SYNTHETIC_TEST_VETO"]["baseline"] == 0


def test_tool_writes_nothing_under_public_data(tmp_path: Path):
    """The diff tool must never write, alter, or add any file under public/data."""
    data_dir = _create_synthetic_dataset(tmp_path)

    # Snapshot files before run
    files_before: Dict[str, str] = {}
    for p in data_dir.rglob("*"):
        if p.is_file():
            rel = str(p.relative_to(data_dir))
            files_before[rel] = _sha256(p)

    out_file = tmp_path / "test_out.json"
    run_diff(
        baseline_file=DEFAULT_SIFTER_PATH,
        working_file=DEFAULT_SIFTER_PATH,
        data_dir=data_dir,
        out_path=out_file,
        quiet=True,
    )

    # Verify no files were created under public/data
    assert not (data_dir / "factor_scores_dual_door.json").exists()
    assert not (data_dir / "factor_scores.json").exists()
    assert not (data_dir / "mri" / "manifest.json").exists()

    # Snapshot files after run
    files_after: Dict[str, str] = {}
    for p in data_dir.rglob("*"):
        if p.is_file():
            rel = str(p.relative_to(data_dir))
            files_after[rel] = _sha256(p)

    assert files_before == files_after


def test_spearman_rank_correlation_math():
    """Unit tests for Spearman rank correlation edge cases and math."""
    # Identical
    assert compute_spearman_rank_correlation([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]) == 1.0
    # Inverted
    assert compute_spearman_rank_correlation([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]) == -1.0
    # Single element
    assert compute_spearman_rank_correlation([10], [10]) == 1.0
    # Empty
    assert compute_spearman_rank_correlation([], []) is None
    # Ties handled via midranks
    assert compute_spearman_rank_correlation([1, 2, 2, 4], [1, 2, 3, 4]) == pytest.approx(0.9487, abs=1e-4)


def test_compute_distribution_stats():
    """Unit tests for distribution calculation."""
    # Empty
    empty_stats = compute_distribution_stats([])
    assert empty_stats["count"] == 0
    assert empty_stats["min"] is None
    assert empty_stats["median"] is None

    # Known values: -2.5, -2.1, -1.6, -1.1, -0.5, 0.0, 1.0
    vals = [-2.5, -2.1, -1.6, -1.1, -0.5, 0.0, 1.0]
    stats = compute_distribution_stats(vals)
    assert stats["count"] == 7
    assert stats["min"] == -2.5
    assert stats["count_under_minus_2_0"] == 2
    assert stats["count_under_minus_1_5"] == 3
    assert stats["count_under_minus_1_0"] == 4
    assert stats["median"] == -1.1

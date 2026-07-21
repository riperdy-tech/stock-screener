"""Unit tests for the pure parts of the DD gate (scripts/kis/dd_gate.py)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kis.dd_gate import apply_gate  # noqa: E402

W = {"AAPL": 4.0, "MSFT": 4.0, "NVDA": 2.0}


def test_full_gross_untouched():
    w, note = apply_gate(W, 1.0, False)
    assert w == W and note == ""


def test_reduced_scales_all_weights():
    w, note = apply_gate(W, 0.5, False)
    assert w == {"AAPL": 2.0, "MSFT": 2.0, "NVDA": 1.0}
    assert "50%" in note


def test_halted_clears_targets():
    w, note = apply_gate(W, 0.0, True)
    assert w == {} and "HALTED" in note


def test_zero_gross_clears_even_unhalted():
    w, _ = apply_gate(W, 0.0, False)
    assert w == {}

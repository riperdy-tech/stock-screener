"""The daily fetch rebuilds metrics each run; the 20-day dollar-volume stamps written by refresh_prices.py survive it."""
import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("_fd_adv_stamps", HERE / "fetch_data.py")
fd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fd)


def test_stamps_travel_with_the_carried_figure():
    prev = {"adv_20d_usd": 1.5e6, "adv_20d_sessions": 20, "adv_20d_asof": "2026-11-13"}
    assert fd.carry_adv_stamps(prev, 1.5e6) == {"adv_20d_sessions": 20, "adv_20d_asof": "2026-11-13"}


def test_zero_figure_and_zero_sessions_are_values():
    prev = {"adv_20d_usd": 0.0, "adv_20d_sessions": 0, "adv_20d_asof": "2026-11-13"}
    assert fd.carry_adv_stamps(prev, 0.0) == {"adv_20d_sessions": 0, "adv_20d_asof": "2026-11-13"}


def test_reason_is_carried_when_there_is_no_figure():
    prev = {"adv_20d_sessions": 4, "adv_20d_asof": "2026-11-13", "adv_20d_reason": "fewer_than_10_sessions"}
    assert fd.carry_adv_stamps(prev, None) == prev


def test_a_new_figure_does_not_wear_the_old_stamps():
    prev = {"adv_20d_usd": 1.5e6, "adv_20d_sessions": 20, "adv_20d_asof": "2026-11-13"}
    assert fd.carry_adv_stamps(prev, 2.0e6) == {}


def test_a_row_without_stamps_gets_none_invented():
    assert fd.carry_adv_stamps({"adv_20d_usd": 1.5e6}, 1.5e6) == {}
    assert fd.carry_adv_stamps({}, None) == {}
    assert fd.carry_adv_stamps(None, None) == {}

"""The daily fetch keeps the weekly SEC growth figures (fetch_sec_data.py) instead of blanking them."""
import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("_fd_sec_growth", HERE / "fetch_data.py")
fd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fd)

CACHED = {"Calculated_Metrics": {"EPS_YoY_Growth": 0.44, "Prior_Year_TTM_EPS": 6.98, "Revenue_YoY_Growth": 0.0,
                                 "Consecutive_YoY_EPS_Growth": 4, "EPS_TTM": 7.1}}


def test_a_rebuilt_detail_carries_the_figures_from_the_cache():
    rebuilt = {"Calculated_Metrics": {"EPS_TTM": 7.5}}
    got = fd.carry_sec_growth(rebuilt, CACHED)
    assert got == {"EPS_YoY_Growth": 0.44, "Prior_Year_TTM_EPS": 6.98, "Revenue_YoY_Growth": 0.0, "Consecutive_YoY_EPS_Growth": 4}
    assert rebuilt["Calculated_Metrics"]["EPS_TTM"] == 7.5                     # the fresh figure is not overwritten
    assert rebuilt["Calculated_Metrics"]["Revenue_YoY_Growth"] == 0.0          # 0.0 is a value, kept


def test_the_cached_detail_itself_keeps_its_figures():
    got = fd.carry_sec_growth(CACHED, CACHED)
    assert got["Consecutive_YoY_EPS_Growth"] == 4


def test_no_detail_still_reads_the_cache_and_no_cache_gives_none():
    assert fd.carry_sec_growth(None, CACHED)["EPS_YoY_Growth"] == 0.44
    assert fd.carry_sec_growth({"Calculated_Metrics": {}}, None) == dict.fromkeys(fd.SEC_GROWTH_KEYS)

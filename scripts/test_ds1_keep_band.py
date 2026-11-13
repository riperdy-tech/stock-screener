"""test_ds1_keep_band.py - WO_DS1 B3 (2026-11-13): the research_now keep band is rank 100, not 60.

Measured on the 87 stored runs of 2026-10-05 to 2026-11-12 (REPORT_DS1_scorer_design.md): ranks 50
to 60 span 0.4 percentile points and a champion-tag flip moves a name a median of 40 ranks, so the
band of 60 held almost nothing (58 of 111 day-level changes reversed within 5 trading days). The
entry cut stays 50. The shipped value itself is pinned by test_p35_hysteresis.py. This test reads the shipped sifter_config.json through the scorer's own loader
and runs the scorer's band function.
"""

import score_factors_dual_door as sfdd


def test_previous_research_now_name_stays_to_rank_100_and_no_further():
    rn_buf, book_buf = sfdd._load_hysteresis_ranks(sfdd.SIFTER_CONFIG_PATH)
    ranked = [f"N{i:03d}" for i in range(1, 201)]
    rank = {t: i + 1 for i, t in enumerate(ranked)}
    held = {"N080", "N100", "N101"}
    rn, wl = sfdd.apply_band_hysteresis(ranked, rank, prev_rn=held, prev_book=held,
                                        rn_buffer_rank=rn_buf, book_buffer_rank=book_buf)
    assert {"N080", "N100"} <= rn                  # held inside the band
    assert "N101" not in rn and "N101" in wl       # outside it: watchlist
    assert "N050" in rn and "N051" not in rn       # entry is still the top 50

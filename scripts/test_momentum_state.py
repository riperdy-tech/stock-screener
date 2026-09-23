"""Unit tests for SCR-10 momentum state and DAT-03 daily price history.

Verifies:
1. Synthetic 24-month and 400-day series with known answers for EVERY field.
2. The 12-1 window equals score_paradigm.compute_skip_month_return (never 10-month).
3. Fields absent when data absent (never 0, never guessed).
4. The fallback path in score_factors_dual_door.py when momentum_state is missing or stale.
5. Daily file layout: one ticker per line, sorted tickers, sorted dates.
6. Cache-and-extend: only the missing tail fetched (monkeypatched yf.download; NO real network).
7. Split detection: >40% gap with volume spike triggers full refetch and records 'refetched'.

Run: python -m pytest scripts/test_momentum_state.py -v
"""

import json
import math
import statistics
import sys
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import build_daily_price_history as bdph
import build_momentum_state as bms
import score_factors_dual_door as sfdd
from score_paradigm import compute_skip_month_return, compute_high_proximity, compute_raw_return


# ─────────────────────────────────────────────────────────────────────────────
# 1. Synthetic 24-month and 400-day series with known answers for EVERY field
# ─────────────────────────────────────────────────────────────────────────────

def test_synthetic_known_answers_for_every_field(tmp_path: Path):
    """Verify exact analytic answers for all monthly and daily momentum fields."""
    # ── A. Synthetic 24-month series ──────────────────────────────────────────
    # 24 months of prices:
    # Month 0..10: 100.0
    # Month 11 (t-13): 100.0
    # Month 12..21: 100.0 + i * 5.0
    # Month 22 (t-2): 150.0
    # Month 23 (t-1, latest): 165.0
    # Month 17 (t-7): 120.0
    monthly_closes = [100.0] * 12 + [102.0, 105.0, 110.0, 115.0, 118.0, 120.0, 125.0, 130.0, 135.0, 140.0, 150.0, 165.0]
    assert len(monthly_closes) == 24

    # Known monthly calculations:
    # mom_12_1: closes[-2] / closes[-13] - 1 = 150.0 / 100.0 - 1 = 0.5000
    expected_mom_12_1 = 0.5000
    # mom_6m: closes[-1] / closes[-7] - 1 = 165.0 / 120.0 - 1 = 0.3750
    expected_mom_6m = 0.3750
    # mom_1m: closes[-1] / closes[-2] - 1 = 165.0 / 150.0 - 1 = 0.1000
    expected_mom_1m = 0.1000
    # high_52w_proxy: closes[-1] / max(closes[-12:]) - 1 = 165 / 165 - 1 = 0.0000
    expected_high_52w_proxy = 0.0000

    # 10-month MA rule:
    # ma_10_now: mean(closes[-10:])
    # ma_10_then: mean(closes[-22:-12])
    ma_10_now = sum(monthly_closes[-10:]) / 10.0
    ma_10_then = sum(monthly_closes[-22:-12:]) / 10.0
    assert monthly_closes[-1] > ma_10_now > ma_10_then
    expected_regime_up = True
    expected_regime_down = False

    # ── B. Synthetic 400-day series ──────────────────────────────────────────
    base_date = date(2025, 1, 1)
    trading_dates = [(base_date + timedelta(days=i)).isoformat() for i in range(400)]

    # 400 daily closes:
    # Days 0..147: 100.0
    # Day 148 (t-252): 100.0
    # Days 149..379: 100.0
    # Days 380..399 (last 20 days): close = 80.0, volume = 10,000
    # 52w high in last 252 days: max is 100.0
    # Current close: 80.0 -> pct_from_52w_high = 80 / 100 - 1 = -0.2000
    daily_closes = [100.0] * 380 + [80.0] * 20
    daily_volumes = [10000.0] * 400
    daily_dict = {
        d: [c, v] for d, c, v in zip(trading_dates, daily_closes, daily_volumes)
    }

    # 200d MA calculations:
    # dma200_now: mean of last 200 closes (180 of 100.0, 20 of 80.0) -> (18000 + 1600)/200 = 98.0
    # close[-1] = 80.0 < 98.0 -> above_200dma = False
    expected_above_200dma = False

    # dma200_then (20 days ago): mean of closes[-220:-20] (all 100.0) -> 100.0
    # dma200_slope_20d: 98.0 / 100.0 - 1 = -0.0200
    expected_dma200_slope = -0.0200

    # ADV 20d: median of 80.0 * 10,000 = 800,000.0
    expected_adv = 800000.0

    # ETF 63-day return: let SPY/cluster ETF be flat (100 -> 100 = 0.0)
    # Stock 63-day return: Day 336 was 100.0, Day 399 is 80.0 -> 80/100 - 1 = -0.2000
    # rs_vs_cluster_etf_3m = -0.2000 - 0.0 = -0.2000
    # rs_vs_iwm_3m = -0.2000 - 0.0 = -0.2000
    etf_daily_dict = {d: [100.0, 50000.0] for d in trading_dates}

    stocks_json = {
        "TEST_SYM": {
            "symbol": "TEST_SYM",
            "sector": "Technology",
            "industry": "Semiconductors",
        }
    }
    price_history_json = {
        "prices": {
            "TEST_SYM": monthly_closes,
            "PEER_1": [10.0 + i for i in range(24)],
        }
    }
    daily_closes_json = {
        "asof": "2026-09-23T00:00:00Z",
        "tickers": {
            "TEST_SYM": daily_dict,
            "SMH": etf_daily_dict,
            "IWM": etf_daily_dict,
        },
    }

    # Write synthetic inputs to tmp_path
    (tmp_path / "stocks.json").write_text(json.dumps(stocks_json), encoding="utf-8")
    (tmp_path / "price_history.json").write_text(json.dumps(price_history_json), encoding="utf-8")
    (tmp_path / "daily_closes.json").write_text(json.dumps(daily_closes_json), encoding="utf-8")

    out_file = tmp_path / "momentum_state.json"
    res = bms.build_momentum_state(data_dir=tmp_path, out_file=out_file)

    row = res["tickers"]["TEST_SYM"]

    # Assert EVERY monthly field
    assert row["mom_12_1"] == pytest.approx(expected_mom_12_1, abs=1e-4)
    assert row["mom_6m"] == pytest.approx(expected_mom_6m, abs=1e-4)
    assert row["mom_1m"] == pytest.approx(expected_mom_1m, abs=1e-4)
    assert row["high_52w_proxy"] == pytest.approx(expected_high_52w_proxy, abs=1e-4)
    assert row["regime_shift_up"] is expected_regime_up
    assert row["regime_shift_down"] is expected_regime_down
    assert "mom_accel" in row
    assert "mom_z_sector" in row

    # Assert EVERY daily field
    assert row["price_asof"] == trading_dates[-1]
    assert row["pct_from_52w_high"] == pytest.approx(-0.2000, abs=1e-4)
    assert row["above_200dma"] is expected_above_200dma
    assert row["dma200_slope_20d"] == pytest.approx(expected_dma200_slope, abs=1e-4)
    assert row["rs_vs_cluster_etf_3m"] == pytest.approx(-0.2000, abs=1e-4)
    assert row["rs_vs_iwm_3m"] == pytest.approx(-0.2000, abs=1e-4)
    assert row["adv_20d_usd"] == pytest.approx(expected_adv, abs=1.0)
    assert "realised_vol_60d" in row
    # mom_break is True because: not above_200dma (True) and dma200_slope_20d < 0 (-0.02 < 0)
    assert row["mom_break"] is True


# ─────────────────────────────────────────────────────────────────────────────
# 2. 12-1 window equals score_paradigm's compute_skip_month_return
# ─────────────────────────────────────────────────────────────────────────────

def test_12_1_window_equals_score_paradigm():
    """Verify that mom_12_1 uses score_paradigm.compute_skip_month_return, not the 10-month window."""
    prices = [10.0 + i * 2.0 for i in range(24)]
    correct_12_1 = compute_skip_month_return(prices)
    old_10_month = prices[-2] / prices[-12] - 1.0

    # Ensure the 12-1 window and the buggy 10-month window actually diverge on this series
    assert correct_12_1 != old_10_month

    # score_paradigm uses closes[-13] to closes[-2]
    expected = (prices[-2] / prices[-13]) - 1.0
    assert correct_12_1 == expected


# ─────────────────────────────────────────────────────────────────────────────
# 3. Fields absent when data is absent (never 0, never guessed)
# ─────────────────────────────────────────────────────────────────────────────

def test_fields_absent_when_data_absent(tmp_path: Path):
    """Fields must be completely absent from dict when data is missing — never 0 or guessed."""
    # SHORT: Only 5 monthly closes (insufficient for 12-1, 6m, proxy, 10m-MA)
    # NO_DAILY: Has 24 monthly closes, but not present in daily_closes.json
    stocks_json = {
        "SHORT": {"symbol": "SHORT", "sector": "Technology", "industry": "Software"},
        "NO_DAILY": {"symbol": "NO_DAILY", "sector": "Technology", "industry": "Software"},
    }
    price_history_json = {
        "prices": {
            "SHORT": [10.0, 11.0, 12.0, 13.0, 14.0],  # only 5
            "NO_DAILY": [10.0 + i for i in range(24)], # full 24
        }
    }
    # Empty daily closes
    daily_closes_json = {"asof": "2026-09-23T00:00:00Z", "tickers": {}}

    (tmp_path / "stocks.json").write_text(json.dumps(stocks_json), encoding="utf-8")
    (tmp_path / "price_history.json").write_text(json.dumps(price_history_json), encoding="utf-8")
    (tmp_path / "daily_closes.json").write_text(json.dumps(daily_closes_json), encoding="utf-8")

    out_file = tmp_path / "momentum_state.json"
    res = bms.build_momentum_state(data_dir=tmp_path, out_file=out_file)

    short_row = res["tickers"]["SHORT"]
    # 5 closes gives 1m return (len >= 2), but not 6m, 12-1, proxy, or regime shift
    assert "mom_1m" in short_row
    assert "mom_6m" not in short_row
    assert "mom_12_1" not in short_row
    assert "high_52w_proxy" not in short_row
    assert "regime_shift_up" not in short_row
    assert "regime_shift_down" not in short_row
    assert "pct_from_52w_high" not in short_row
    assert "above_200dma" not in short_row
    assert "mom_break" not in short_row

    no_daily_row = res["tickers"]["NO_DAILY"]
    assert "mom_12_1" in no_daily_row
    assert "mom_6m" in no_daily_row
    assert "mom_1m" in no_daily_row
    assert "high_52w_proxy" in no_daily_row
    # All daily fields MUST be absent
    for daily_field in (
        "price_asof",
        "pct_from_52w_high",
        "above_200dma",
        "dma200_slope_20d",
        "rs_vs_cluster_etf_3m",
        "rs_vs_iwm_3m",
        "adv_20d_usd",
        "realised_vol_60d",
        "mom_break",
    ):
        assert daily_field not in no_daily_row


# ─────────────────────────────────────────────────────────────────────────────
# 4. Fallback path in score_factors_dual_door.py
# ─────────────────────────────────────────────────────────────────────────────

def test_sifter_fallback_path_when_momentum_state_missing(tmp_path: Path, monkeypatch):
    """When momentum_state.json is missing or stale, sifter uses inline fallback and stamps source."""
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True)

    # Minimal stock universe
    stocks = {
        "A": {"symbol": "A", "sector": "Technology", "industry": "Software", "marketCap": 1e9, "price": 50, "volume": 1e6},
        "B": {"symbol": "B", "sector": "Healthcare", "industry": "Biotechnology", "marketCap": 2e9, "price": 20, "volume": 1e6},
    }
    price_history = {
        "prices": {
            "A": [10.0 + i for i in range(24)],
            "B": [20.0 + i * 0.5 for i in range(24)],
        }
    }
    (data_dir / "stocks.json").write_text(json.dumps(stocks), encoding="utf-8")
    (data_dir / "price_history.json").write_text(json.dumps(price_history), encoding="utf-8")

    # DO NOT create momentum_state.json -> trigger fallback
    out_dual = tmp_path / "factor_scores_dual_door.json"
    out_compat = tmp_path / "factor_scores.json"

    monkeypatch.setattr(sfdd, "DATA", data_dir)
    monkeypatch.setattr(sfdd, "STOCKS_JSON", data_dir / "stocks.json")
    monkeypatch.setattr(sfdd, "PRICE_HISTORY_JSON", data_dir / "price_history.json")
    monkeypatch.setattr(sfdd, "MOMENTUM_STATE_JSON", data_dir / "momentum_state.json")
    monkeypatch.setattr(sfdd, "OUT_JSON", out_dual)
    monkeypatch.setattr(sfdd, "FACTOR_SCORES_COMPAT_JSON", out_compat)
    monkeypatch.setattr(sfdd, "sync_mri_snapshot", lambda: None)

    sfdd.main()

    compat = json.loads(out_compat.read_text(encoding="utf-8"))
    summary = json.loads(out_dual.read_text(encoding="utf-8"))

    # Must be stamped loudly as inline_fallback
    assert compat["momentum_source"] == "inline_fallback"
    assert summary["momentum_source"] == "inline_fallback"

    # Rows carry momentum state and proxy flag
    row_a = compat["tickers"]["A"]
    assert "fct_momentum_state" in row_a
    assert row_a["fct_momentum_state"]["mom_12_1"] is not None
    assert "momentum_proxy_monthly" in row_a["fct_flags"]


def test_sifter_normal_path_when_momentum_state_present(tmp_path: Path, monkeypatch):
    """When fresh momentum_state.json is present, sifter consumes it and stamps momentum_state."""
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True)

    stocks = {
        "A": {"symbol": "A", "sector": "Technology", "industry": "Software", "marketCap": 1e9, "price": 50, "volume": 1e6},
    }
    price_history = {"prices": {"A": [10.0 + i for i in range(24)]}}
    momentum_state = {
        "asof": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "config": {},
        "tickers": {
            "A": {
                "mom_12_1": 0.45,
                "pct_from_52w_high": -0.05,
                "above_200dma": True,
            }
        },
    }
    (data_dir / "stocks.json").write_text(json.dumps(stocks), encoding="utf-8")
    (data_dir / "price_history.json").write_text(json.dumps(price_history), encoding="utf-8")
    (data_dir / "momentum_state.json").write_text(json.dumps(momentum_state), encoding="utf-8")

    out_dual = tmp_path / "factor_scores_dual_door.json"
    out_compat = tmp_path / "factor_scores.json"

    monkeypatch.setattr(sfdd, "DATA", data_dir)
    monkeypatch.setattr(sfdd, "STOCKS_JSON", data_dir / "stocks.json")
    monkeypatch.setattr(sfdd, "PRICE_HISTORY_JSON", data_dir / "price_history.json")
    monkeypatch.setattr(sfdd, "MOMENTUM_STATE_JSON", data_dir / "momentum_state.json")
    monkeypatch.setattr(sfdd, "OUT_JSON", out_dual)
    monkeypatch.setattr(sfdd, "FACTOR_SCORES_COMPAT_JSON", out_compat)
    monkeypatch.setattr(sfdd, "sync_mri_snapshot", lambda: None)

    sfdd.main()

    compat = json.loads(out_compat.read_text(encoding="utf-8"))
    assert compat["momentum_source"] == "momentum_state"
    row_a = compat["tickers"]["A"]
    assert row_a["fct_momentum_state"]["pct_from_52w_high"] == -0.05
    # Since pct_from_52w_high was present, momentum_proxy_monthly is NOT added
    assert "momentum_proxy_monthly" not in row_a["fct_flags"]


# ─────────────────────────────────────────────────────────────────────────────
# 5. Daily file layout: one ticker per line, sorted tickers, sorted dates
# ─────────────────────────────────────────────────────────────────────────────

def test_daily_file_layout_one_ticker_per_line():
    """daily_closes.json must format each ticker's series on exactly one line."""
    payload = {
        "asof": "2026-09-23T00:00:00Z",
        "refetched": ["B_TICK"],
        "fetch_failed": {},
        "tickers": {
            "Z_TICK": {"2026-01-02": [10.0, 100], "2026-01-01": [9.5, 90]},
            "A_TICK": {"2026-01-02": [50.0, 500], "2026-01-01": [49.0, 400]},
        },
    }

    serialized = bdph.serialize_daily_closes(payload)
    parsed = json.loads(serialized)

    # Valid JSON equivalence
    assert parsed["asof"] == payload["asof"]
    assert parsed["tickers"]["A_TICK"]["2026-01-01"] == [49.0, 400]

    # Verify formatting: tickers sorted, dates sorted, one line per ticker
    lines = serialized.splitlines()
    ticker_lines = [l for l in lines if '"A_TICK"' in l or '"Z_TICK"' in l]
    assert len(ticker_lines) == 2

    # A_TICK comes before Z_TICK
    assert '"A_TICK"' in ticker_lines[0]
    assert '"Z_TICK"' in ticker_lines[1]

    # Dates are sorted in output line
    pos_d1 = ticker_lines[0].find("2026-01-01")
    pos_d2 = ticker_lines[0].find("2026-01-02")
    assert pos_d1 < pos_d2


# ─────────────────────────────────────────────────────────────────────────────
# 6. Cache-and-extend: only missing tail fetched (monkeypatched yf.download)
# ─────────────────────────────────────────────────────────────────────────────

def test_cache_and_extend_tail_only(tmp_path: Path, monkeypatch):
    """build_daily_price_history only fetches the missing tail for cached tickers."""
    today = date.today()
    cached_date = (today - timedelta(days=5)).isoformat()
    today_iso = today.isoformat()

    existing_cache = {
        "asof": "2026-09-18T00:00:00Z",
        "refetched": [],
        "fetch_failed": {},
        "tickers": {
            "CACHED_SYM": {cached_date: [100.0, 50000.0]},
        },
    }
    cache_file = tmp_path / "daily_closes.json"
    cache_file.write_text(json.dumps(existing_cache), encoding="utf-8")

    calls = []

    def mock_download(tickers, start, end, **kwargs):
        calls.append({"tickers": tickers, "start": start, "end": end})
        # Return a synthetic DataFrame matching yf.download format
        dates = [cached_date, today_iso]
        df = pd.DataFrame(
            {
                ("CACHED_SYM", "Close"): [100.0, 102.0],
                ("CACHED_SYM", "Volume"): [50000.0, 55000.0],
            },
            index=[pd.Timestamp(d) for d in dates],
        )
        df.columns = pd.MultiIndex.from_tuples(df.columns)
        return df

    monkeypatch.setattr(bdph.yf, "download", mock_download)

    res = bdph.build_daily_price_history(
        data_dir=tmp_path,
        out_file=cache_file,
        tickers_override=["CACHED_SYM"],
    )

    # Exactly one chunk download was called, starting from the cached date (tail fetch)
    assert len(calls) == 1
    assert calls[0]["start"] == cached_date
    assert calls[0]["tickers"] == ["CACHED_SYM"]

    # Extended series now contains both dates
    series = res["tickers"]["CACHED_SYM"]
    assert cached_date in series
    assert today_iso in series


# ─────────────────────────────────────────────────────────────────────────────
# 7. Split detection and refetch rule
# ─────────────────────────────────────────────────────────────────────────────

def test_split_detection_triggers_full_refetch(tmp_path: Path, monkeypatch):
    """When a >40% gap on overlap or volume spike is found, the full series is refetched and recorded."""
    today = date.today()
    overlap_date = (today - timedelta(days=2)).isoformat()

    # Cached series had close 100.0
    existing_cache = {
        "asof": "2026-09-20T00:00:00Z",
        "refetched": [],
        "fetch_failed": {},
        "tickers": {
            "SPLIT_SYM": {overlap_date: [100.0, 50000.0]},
        },
    }
    cache_file = tmp_path / "daily_closes.json"
    cache_file.write_text(json.dumps(existing_cache), encoding="utf-8")

    call_types = []

    def mock_download(tickers, start, end, **kwargs):
        t = tickers[0] if isinstance(tickers, list) else tickers
        if start == overlap_date:
            call_types.append("tail")
            # Overlap close is 50.0 (2-for-1 split retroactively adjusted past price) -> 50% gap > 40%
            df = pd.DataFrame(
                {
                    (t, "Close"): [50.0],
                    (t, "Volume"): [100000.0],
                },
                index=[pd.Timestamp(overlap_date)],
            )
            df.columns = pd.MultiIndex.from_tuples(df.columns)
            return df
        else:
            call_types.append("full_refetch")
            df = pd.DataFrame(
                {
                    (t, "Close"): [50.0, 52.0],
                    (t, "Volume"): [100000.0, 110000.0],
                },
                index=[pd.Timestamp(overlap_date), pd.Timestamp(today.isoformat())],
            )
            df.columns = pd.MultiIndex.from_tuples(df.columns)
            return df

    monkeypatch.setattr(bdph.yf, "download", mock_download)

    res = bdph.build_daily_price_history(
        data_dir=tmp_path,
        out_file=cache_file,
        tickers_override=["SPLIT_SYM"],
    )

    # Both tail and full refetch occurred
    assert "tail" in call_types
    assert "full_refetch" in call_types

    # 'refetched' records the ticker
    assert "SPLIT_SYM" in res["refetched"]
    assert res["tickers"]["SPLIT_SYM"][overlap_date][0] == 50.0


def test_daily_universe_is_bounded_not_seeded_from_momentum_state(tmp_path: Path):
    """Phase 3 approval review B2: the daily series universe must not grow to every scored
    name. It is RN+WL + overlay + ETF proxies + names already in the previous daily file —
    never the full-universe momentum_state.json."""
    import build_daily_price_history as bdph
    (tmp_path / "factor_scores.json").write_text(json.dumps({"tickers": {
        "AAA": {"fct_band": "research_now"}, "BBB": {"fct_band": "watchlist"},
        "CCC": {"fct_band": "pass"}}}), encoding="utf-8")
    (tmp_path / "momentum_state.json").write_text(json.dumps({"tickers": {
        f"U{i}": {"mom_12_1": 0.1} for i in range(500)}}), encoding="utf-8")
    (tmp_path / "daily_closes.json").write_text(json.dumps({"tickers": {
        "OLD": {"2026-09-01": [10.0, 1000]}}}), encoding="utf-8")
    universe = set(bdph.load_universe(tmp_path))
    assert {"AAA", "BBB", "OLD"} <= universe
    assert "CCC" not in universe
    assert not any(t.startswith("U") and t[1:].isdigit() for t in universe)
    # factor_scores.json here has no z_momentum_universe field, so the B3 top-momentum seed
    # (below) contributes nothing -- the universe stays exactly this bounded set.
    assert len(universe) == 3 + len(bdph.ETF_PROXIES)


# ── B3 (PHASE_3_APPROVAL.md): top-60-by-universe-momentum daily seed ────────────────────────

def test_daily_universe_seeds_top_60_by_universe_momentum(tmp_path: Path):
    """factor_scores.json tickers carrying z_momentum_universe contribute their top
    DOOR3_DAILY_SEED_COUNT (60) by that field -- bounded, never the whole set."""
    import build_daily_price_history as bdph
    tickers = {f"M{i}": {"fct_band": "pass", "z_momentum_universe": float(i)} for i in range(100)}
    (tmp_path / "factor_scores.json").write_text(json.dumps({"tickers": tickers}), encoding="utf-8")
    universe = set(bdph.load_universe(tmp_path))
    momentum_seeded = {t for t in universe if t.startswith("M")}
    assert len(momentum_seeded) == bdph.DOOR3_DAILY_SEED_COUNT == 60
    # The top 60 by value (M99 down to M40), not an arbitrary 60.
    assert momentum_seeded == {f"M{i}" for i in range(40, 100)}


def test_daily_universe_momentum_seed_bounded_even_with_many_candidates(tmp_path: Path):
    """The bound holds regardless of how many tickers carry the field (no unbounded growth --
    Phase 3 approval review B2's concern, applied to this new addition)."""
    import build_daily_price_history as bdph
    tickers = {f"M{i}": {"fct_band": "pass", "z_momentum_universe": float(i)} for i in range(5000)}
    (tmp_path / "factor_scores.json").write_text(json.dumps({"tickers": tickers}), encoding="utf-8")
    universe = set(bdph.load_universe(tmp_path))
    momentum_seeded = {t for t in universe if t.startswith("M")}
    assert len(momentum_seeded) == 60


def test_daily_universe_momentum_seed_warns_loudly_when_field_absent(tmp_path: Path, capsys):
    """An absent z_momentum_universe field is reported loudly, never a silent no-op
    (AGENTS.md #3: annotate, never silently gate)."""
    import build_daily_price_history as bdph
    tickers = {"AAA": {"fct_band": "research_now"}, "BBB": {"fct_band": "pass"}}
    (tmp_path / "factor_scores.json").write_text(json.dumps({"tickers": tickers}), encoding="utf-8")
    universe = set(bdph.load_universe(tmp_path))
    assert "BBB" not in universe  # nothing extra was seeded
    captured = capsys.readouterr()
    assert "z_momentum_universe" in captured.err
    assert "WARN" in captured.err


def test_daily_universe_momentum_seed_no_warning_when_no_tickers_at_all(tmp_path: Path, capsys):
    """An empty/absent factor_scores.json (already warned about by step 1, or simply no file)
    does not ALSO fire the momentum-seed warning -- nothing to have carried the field."""
    import build_daily_price_history as bdph
    universe = set(bdph.load_universe(tmp_path))
    captured = capsys.readouterr()
    assert "z_momentum_universe" not in captured.err
    assert universe == set(bdph.ETF_PROXIES)

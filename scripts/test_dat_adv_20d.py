"""test_dat_adv_20d.py — Unit tests for the P3.6b DAT item: adv_20d_usd computed from the
stock_prices.parquet defeatbeta_source.py ALREADY downloads (for `latest`/`monthly`), with no
new network request. Exercises scripts/defeatbeta_source.py's
_compute_adv_20d_usd(con, prices_parquet_path, uni_filter) against small local parquet
fixtures built with duckdb — never scripts/defeatbeta_source.py's load() (which calls the
Hugging Face dataset over the network; forbidden in this test run).
"""

import statistics
from datetime import date, timedelta
from pathlib import Path

import duckdb
import pytest

import defeatbeta_source as dbs


def _write_prices_parquet(tmp_path: Path, rows) -> str:
    """rows: list of (symbol, day_offset, close, volume). Writes via duckdb COPY (no pyarrow
    dependency needed)."""
    con = duckdb.connect()
    con.execute("CREATE TABLE t(symbol VARCHAR, report_date DATE, close DOUBLE, volume DOUBLE)")
    base = date(2026, 1, 1)
    values = [(sym, base + timedelta(days=off), close, vol) for sym, off, close, vol in rows]
    con.executemany("INSERT INTO t VALUES (?,?,?,?)", values)
    out = str(tmp_path / "stock_prices.parquet").replace("\\", "/")
    con.execute(f"COPY t TO '{out}' (FORMAT PARQUET)")
    con.close()
    return out


def test_adv_20d_is_median_of_close_times_volume_over_last_20_sessions(tmp_path):
    # 25 daily sessions for AAA; only the last 20 (by report_date) should be used.
    rows = [("AAA", i, 10.0 + i * 0.1, 1000 + i) for i in range(25)]
    path = _write_prices_parquet(tmp_path, rows)
    con = duckdb.connect()

    result = dbs._compute_adv_20d_usd(con, path)

    expected = statistics.median([(10.0 + i * 0.1) * (1000 + i) for i in range(5, 25)])
    assert result["AAA"] == pytest.approx(expected)


def test_adv_20d_handles_short_history(tmp_path):
    rows = [("BBB", i, 5.0, 100) for i in range(5)]
    path = _write_prices_parquet(tmp_path, rows)
    con = duckdb.connect()

    result = dbs._compute_adv_20d_usd(con, path)

    assert result["BBB"] == pytest.approx(500.0)


def test_adv_20d_absent_symbol_is_not_a_fabricated_zero(tmp_path):
    rows = [("AAA", 0, 10.0, 1000)]
    path = _write_prices_parquet(tmp_path, rows)
    con = duckdb.connect()

    result = dbs._compute_adv_20d_usd(con, path)

    assert "ZZZ" not in result   # a symbol with no rows is simply absent, never 0.0


def test_adv_20d_null_volume_rows_excluded(tmp_path):
    # A row with volume IS NULL must not corrupt the median.
    con = duckdb.connect()
    con.execute("CREATE TABLE t(symbol VARCHAR, report_date DATE, close DOUBLE, volume DOUBLE)")
    con.execute("""
        INSERT INTO t VALUES
        ('CCC', DATE '2026-01-01', 10.0, NULL),
        ('CCC', DATE '2026-01-02', 10.0, 500)
    """)
    out = str(tmp_path / "stock_prices.parquet").replace("\\", "/")
    con.execute(f"COPY t TO '{out}' (FORMAT PARQUET)")
    con.close()

    con2 = duckdb.connect()
    result = dbs._compute_adv_20d_usd(con2, out)

    assert result == {"CCC": 5000.0}


def test_adv_20d_universe_filter_restricts_symbols(tmp_path):
    rows = [("AAA", 0, 10.0, 1000), ("BBB", 0, 5.0, 100)]
    path = _write_prices_parquet(tmp_path, rows)
    con = duckdb.connect()
    con.execute("CREATE TABLE uni(sym VARCHAR)")
    con.execute("INSERT INTO uni VALUES ('AAA')")

    result = dbs._compute_adv_20d_usd(con, path, uni_filter="AND symbol IN (SELECT sym FROM uni)")

    assert "AAA" in result
    assert "BBB" not in result

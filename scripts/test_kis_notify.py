"""Formatting + persistence helpers in scripts/kis/notify.py.

No network, no files. Mirrors the plain-assert style of the other suites.
Run: python scripts/test_kis_notify.py
"""

import importlib.util
import sys
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "kis_notify", str(Path(__file__).resolve().parent / "kis" / "notify.py"))
nf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(nf)


# Result rows have the exact shape sync_kis_portfolio.py appends: an order's
# vars() merged with the KIS place_order result. Skipped buys carry no "limit".
def _results():
    return [
        {"side": "sell", "ticker": "NVDA", "qty": 5, "price": 173.0, "est_value": 865.0,
         "reason": "trim", "ok": True, "order_no": "0000123", "msg": "", "limit": 172.48},
        {"side": "buy", "ticker": "AAPL", "qty": 3, "price": 209.5, "est_value": 628.5,
         "reason": "entry", "ok": True, "order_no": "0000124", "msg": "", "limit": 210.13},
        {"side": "buy", "ticker": "JLHL", "qty": 10, "price": 4.0, "est_value": 40.0,
         "reason": "entry", "ok": False, "order_no": None,
         "msg": "skipped: insufficient settled cash"},  # note: no "limit" key
    ]


# ── format_telegram ──────────────────────────────────────────────────────────

def test_format_has_header_and_counts():
    txt = nf.format_telegram("[KIS·trades]", "20260715T143500Z", "real",
                             "equal_llm", _results(), 12345.0, 210.0)
    assert "[KIS·trades]" in txt
    assert "20260715T143500Z" in txt
    assert "real/equal_llm" in txt
    assert "Placed 2/3" in txt, txt  # 2 ok of 3


def test_format_lists_every_order_and_reject_reason():
    txt = nf.format_telegram("[KIS·trades]", "rid", "paper", "equal", _results(), 1.0, 2.0)
    for tk in ("NVDA", "AAPL", "JLHL"):
        assert tk in txt, f"{tk} missing from message"
    assert "insufficient settled cash" in txt, "reject reason dropped"
    assert "NAV $12" not in txt  # nav here is 1.0; just ensure NAV line renders
    assert "NAV" in txt and "cash" in txt


def test_format_survives_order_without_limit():
    # The skipped buy has no "limit" key — must not raise / must render a placeholder.
    txt = nf.format_telegram("[p]", "rid", "paper", "equal",
                             [_results()[2]], 100.0, 50.0)
    assert "JLHL" in txt
    assert "Placed 0/1" in txt


# ── dropped orders: what the plan wanted and never sent ──────────────────────
#
# 2026-08-11 regression suite. A rotation exited 57% of NAV, the turnover cap
# discarded all 13 entries, and the digest said "Placed 14/14" with no hint that
# anything was suppressed.

def _dropped(n=13):
    return [{"side": "buy", "ticker": f"T{i}", "qty": 1, "est_value": 2000.0 - i,
             "why": "turnover cap"} for i in range(n)]


def test_dropped_orders_reach_the_header():
    # The header is the notification preview — the alarm has to be there, not
    # only in the body someone has to open the chat to read.
    txt = nf.format_telegram("[KIS·trades]", "rid", "real", "equal_llm",
                             _results(), 40_512.0, 23_456.0, None, _dropped())
    assert "Placed 2/3" in txt and "13 NOT placed" in txt, txt
    assert txt.splitlines()[1].startswith("Placed 2/3"), txt


def test_dropped_block_totals_and_truncates():
    txt = nf.format_telegram("[p]", "rid", "real", "equal_llm",
                             _results(), 40_512.0, 23_456.0, None, _dropped())
    assert "NOT placed (13, $25,922)" in txt, txt          # sum of est_value
    assert "BUY T0 x1 $2,000 — turnover cap" in txt, txt   # largest first
    assert "+10 more" in txt, txt                          # 3 shown of 13
    assert "T12" not in txt                                # smallest truncated


def test_no_dropped_no_warning_noise():
    """A clean run must look exactly as it did before this feature."""
    txt = nf.format_telegram("[p]", "rid", "real", "equal_llm",
                             _results(), 10_000.0, 500.0)
    assert "NOT placed" not in txt and "⚠" not in txt, txt


def test_sells_only_cash_heavy_is_flagged_even_without_dropped():
    """Independent backstop: any suppression path that forgets to record itself
    still trips this, because the account state alone gives it away."""
    sells = [{"side": "sell", "ticker": "STRL", "qty": 4, "ok": True,
              "limit": 531.77, "msg": ""}]
    txt = nf.format_telegram("[p]", "rid", "real", "equal_llm", sells,
                             40_512.0, 23_456.0)
    assert "SELLS ONLY" in txt and "58% of NAV in cash" in txt, txt


def test_no_sells_only_flag_when_buys_were_placed():
    mixed = [{"side": "sell", "ticker": "A", "qty": 1, "ok": True, "limit": 10.0},
             {"side": "buy", "ticker": "B", "qty": 1, "ok": True, "limit": 10.0}]
    txt = nf.format_telegram("[p]", "rid", "real", "equal_llm", mixed,
                             40_512.0, 23_456.0)
    assert "SELLS ONLY" not in txt, txt


def test_no_sells_only_flag_when_cash_is_normal():
    sells = [{"side": "sell", "ticker": "A", "qty": 1, "ok": True, "limit": 10.0}]
    txt = nf.format_telegram("[p]", "rid", "real", "equal_llm", sells,
                             40_512.0, 500.0)
    assert "SELLS ONLY" not in txt, txt


def test_failed_sell_does_not_trigger_the_cash_flag():
    """A rejected sell placed nothing; cash sitting there is a separate story."""
    rejected = [{"side": "sell", "ticker": "A", "qty": 1, "ok": False,
                 "msg": "REJECT", "limit": 10.0}]
    txt = nf.format_telegram("[p]", "rid", "real", "equal_llm", rejected,
                             40_512.0, 23_456.0)
    assert "SELLS ONLY" not in txt, txt


def test_cash_percentage_is_always_shown():
    txt = nf.format_telegram("[p]", "rid", "real", "equal_llm", _results(),
                             40_512.0, 23_456.0)
    assert "NAV $40,512 · cash $23,456 (58% of NAV)" in txt, txt


def test_zero_nav_does_not_divide_by_zero():
    txt = nf.format_telegram("[p]", "rid", "paper", "equal", _results(), 0.0, 0.0)
    assert "NAV $0" in txt


def test_dropped_tolerates_missing_fields():
    """plan.dropped is built by us, but the digest must never be the thing that
    breaks a trading run over a missing key."""
    txt = nf.format_telegram("[p]", "rid", "real", "equal", _results(), 100.0, 1.0,
                             None, [{"side": "buy"}])
    assert "NOT placed (1, $0)" in txt, txt


def test_plan_only_digest_renders_without_results():
    """The 'everything was suppressed, nothing attempted' run: results is empty."""
    txt = nf.format_telegram("[p]", "rid", "real", "equal_llm", [], 40_512.0,
                             23_456.0, None, _dropped(2))
    assert "Placed 0/0" in txt and "2 NOT placed" in txt, txt


def test_format_no_secrets_leak():
    # Sanity: message never echoes an env/secret-looking field.
    txt = nf.format_telegram("[KIS·trades]", "rid", "real", "equal_llm", _results(), 1.0, 2.0)
    assert "APP_KEY" not in txt and "SECRET" not in txt and "CANO" not in txt


# ── trades_rows ──────────────────────────────────────────────────────────────

def test_trades_rows_shape():
    rows = nf.trades_rows("rid", "real", _results(), 12345.0, 210.0)
    assert len(rows) == 3
    cols = {"run_id", "env", "side", "ticker", "qty", "limit_price",
            "ok", "order_no", "msg", "nav", "cash"}
    assert cols <= set(rows[0]), set(rows[0])
    assert rows[0]["run_id"] == "rid" and rows[0]["env"] == "real"
    assert rows[0]["nav"] == 12345.0 and rows[0]["cash"] == 210.0


def test_trades_rows_limit_mapping_and_missing_limit():
    rows = nf.trades_rows("rid", "real", _results(), 1.0, 2.0)
    assert rows[0]["limit_price"] == 172.48
    assert rows[2]["limit_price"] is None  # skipped buy had no "limit"
    assert rows[2]["ok"] is False and rows[2]["order_no"] is None


# ── sb_upsert / send_telegram: non-fatal no-ops without config ────────────────

def test_sb_upsert_noop_without_env(monkeypatch=None):
    for k in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_KEY"):
        import os
        os.environ.pop(k, None)
    assert nf.sb_upsert("kis_trades", [{"run_id": "x"}], "run_id,ticker,side") is False


def test_send_telegram_noop_without_config():
    import os
    for k in ("KIS_TG_BOT_TOKEN", "KIS_TG_CHAT_ID"):
        os.environ.pop(k, None)
    # No token/chat -> returns False, never touches the network.
    assert nf.send_telegram("hi") is False


def test_sb_upsert_empty_rows_is_noop_true():
    # Nothing to write is success, not an error.
    assert nf.sb_upsert("kis_trades", [], "run_id,ticker,side") is True


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed = 0
    for fn in fns:
        fn()
        passed += 1
        print(f"ok  {fn.__name__}")
    print(f"\n{passed}/{len(fns)} passed")

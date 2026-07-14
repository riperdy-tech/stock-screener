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

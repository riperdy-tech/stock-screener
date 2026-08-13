"""Unit tests for the tradability gate (scripts/tradability.py).

Run: python scripts/test_tradability.py
"""
import io
import json
import os
import sys
import tempfile
from contextlib import redirect_stderr
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tradability as tr  # noqa: E402

TODAY = date(2026, 8, 13)
CFG = {"grace_days": 5, "tickers": {"CPRX": {"reason": "suspended pending merger"}}}


def listed(days_ago):
    d = date.fromordinal(TODAY.toordinal() - days_ago)
    return {"last_listed": d.isoformat()}


# ── the single-name test ─────────────────────────────────────────────────────

def test_manual_entry_is_untradable():
    assert tr.untradable_reason("CPRX", listed(0), CFG, TODAY) == "suspended pending merger"


def test_manual_entry_beats_a_healthy_listing():
    # CPRX was still being price-refreshed daily; a fresh listing must not
    # override a hand-declared halt.
    assert tr.untradable_reason("CPRX", listed(0), CFG, TODAY) is not None


def test_still_listed_is_tradable():
    assert tr.untradable_reason("AAPL", listed(0), CFG, TODAY) is None


def test_inside_the_grace_period_is_tradable():
    # A one-day hiccup in the listing feed must not retire a name.
    assert tr.untradable_reason("AAPL", listed(5), CFG, TODAY) is None


def test_past_the_grace_period_is_untradable():
    assert tr.untradable_reason("AAPL", listed(6), CFG, TODAY) is not None


def test_unknown_listing_state_is_never_a_verdict():
    # Records written before last_listed existed, and runs where the listing
    # fetch was skipped, must not be read as delistings.
    assert tr.untradable_reason("AAPL", {}, CFG, TODAY) is None
    assert tr.untradable_reason("AAPL", {"last_listed": "garbage"}, CFG, TODAY) is None
    assert tr.days_unlisted({}, TODAY) is None


def test_case_insensitive_manual_match():
    assert tr.untradable_reason("cprx", listed(0), CFG, TODAY) is not None


def test_parse_day_accepts_both_stamp_formats():
    assert tr.parse_day("2026-08-13") == TODAY
    assert tr.parse_day("2026-08-13 14:20") == TODAY      # fetch_data's Last_Updated
    assert tr.parse_day("") is None and tr.parse_day(None) is None


# ── the universe sweep ───────────────────────────────────────────────────────

def _universe(n_ok, n_gone):
    u = {f"OK{i}": listed(0) for i in range(n_ok)}
    u.update({f"GONE{i}": listed(30) for i in range(n_gone)})
    return u


def test_scan_flags_only_the_departed():
    u = _universe(100, 3)
    out, note = tr.scan(u, CFG, TODAY)
    assert set(out) == {"GONE0", "GONE1", "GONE2"}, out
    assert "3 not tradable" in note


def test_scan_applies_the_manual_list():
    u = _universe(100, 0)
    u["CPRX"] = listed(0)
    out, _ = tr.scan(u, CFG, TODAY)
    assert out == {"CPRX": "suspended pending merger"}


def test_circuit_breaker_disables_the_listing_path():
    # A truncated listing feed makes every surviving record look delisted.
    # Vetoing the universe is far worse than trading a stale name for a day.
    u = _universe(50, 50)
    u["CPRX"] = listed(0)
    out, note = tr.scan(u, CFG, TODAY)
    assert out == {"CPRX": "suspended pending merger"}, "listing path should be dropped"
    assert "DISABLED" in note


def test_circuit_breaker_holds_at_the_boundary():
    u = _universe(91, 9)          # 9% unlisted — under the 10% ceiling
    out, note = tr.scan(u, CFG, TODAY)
    assert len(out) == 9 and "DISABLED" not in note


def test_empty_universe_does_not_divide_by_zero():
    out, note = tr.scan({}, CFG, TODAY)
    assert out == {} and note


# ── config loading ───────────────────────────────────────────────────────────

def _load_from_text(text):
    """load_config over a throwaway file, with stderr captured."""
    fd, path = tempfile.mkstemp(suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        buf = io.StringIO()
        with redirect_stderr(buf):
            cfg = tr.load_config(Path(path))
        return cfg, buf.getvalue()
    finally:
        os.unlink(path)


def test_missing_config_degrades_to_defaults_quietly():
    buf = io.StringIO()
    with redirect_stderr(buf):
        cfg = tr.load_config(Path("/nonexistent/not_tradable.json"))
    assert cfg["tickers"] == {} and cfg["grace_days"] == tr.DEFAULT_GRACE_DAYS
    assert buf.getvalue() == "", "an absent file is normal, not a warning"


def test_corrupt_config_degrades_to_defaults_loudly():
    # A typo in the manual blocklist must not silently un-block every
    # hand-declared name — the degrade is allowed, silence is not.
    cfg, err = _load_from_text('{"tickers": {"GRDN": }')
    assert cfg["tickers"] == {} and cfg["grace_days"] == tr.DEFAULT_GRACE_DAYS
    assert "TRADABILITY WARNING" in err, "parse failure of an existing file must be loud"


def test_boolean_grace_days_is_rejected():
    # bool is an int subclass: "grace_days": true must not become a 1-day grace.
    cfg, _ = _load_from_text('{"grace_days": true, "tickers": {}}')
    assert cfg["grace_days"] == tr.DEFAULT_GRACE_DAYS


def test_shipped_config_parses():
    # Key hygiene is asserted on the RAW file — load_config upper-cases keys
    # itself, so checking its output would pass even for a lowercase entry.
    raw = json.loads(tr.CONFIG_JSON.read_text(encoding="utf-8"))
    assert isinstance(raw.get("tickers"), dict)
    for sym, meta in raw["tickers"].items():
        assert sym == sym.upper(), f"{sym} must be upper-case to match a symbol"
        assert isinstance(meta, dict) and meta.get("reason"), f"{sym} needs a reason"
    cfg = tr.load_config()
    assert isinstance(cfg["grace_days"], int) and cfg["grace_days"] >= 0


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"  ok    {fn.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"  FAIL  {fn.__name__}: {e}")
        except Exception as e:
            failed += 1
            print(f"  ERROR {fn.__name__}: {type(e).__name__}: {e}")
    print(f"{len(fns) - failed}/{len(fns)} passed")
    sys.exit(1 if failed else 0)

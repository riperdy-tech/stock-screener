"""Target-weight reader for the KIS portfolio sync.

Reads the paper-trading ledger book (written by track_paper_portfolios.py)
and converts one ledger's holdings into {ticker: weight} where weight is the
fraction of ledger NAV (cash included, so weights sum to <= 1).

Source priority:
  1. Supabase paper_ledgers row id=1 (freshest — tracker mirrors here at runtime)
  2. LEDGER_URL env (e.g. the deployed site's /api/paper-ledgers)
  3. committed public/data/paper_ledgers.json (may be stale; staleness is checked)
"""

from __future__ import annotations

import json
import os
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LEDGERS_JSON = ROOT / "public" / "data" / "paper_ledgers.json"


def _from_supabase():
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not (url and key):
        return None, None
    try:
        import requests
        r = requests.get(f"{url}/rest/v1/paper_ledgers?id=eq.1&select=data",
                         headers={"apikey": key, "Authorization": f"Bearer {key}"},
                         timeout=30)
        if r.status_code == 200 and r.json():
            return r.json()[0]["data"], "supabase"
    except Exception as e:
        print(f"  supabase ledger fetch failed: {e}")
    return None, None


def _from_url():
    url = os.environ.get("LEDGER_URL")
    if not url:
        return None, None
    try:
        import requests
        r = requests.get(url, timeout=30)
        if r.status_code == 200 and r.json():
            return r.json(), "url"
    except Exception as e:
        print(f"  LEDGER_URL fetch failed: {e}")
    return None, None


def load_ledger_book() -> tuple[dict, str]:
    for fn in (_from_supabase, _from_url):
        book, src = fn()
        if book:
            return book, src
    if LEDGERS_JSON.exists():
        return json.loads(LEDGERS_JSON.read_text(encoding="utf-8")), "local-file"
    raise RuntimeError("no ledger source available (supabase env, LEDGER_URL, or local file)")


def ledger_weights(book: dict, ledger_key: str, max_stale_days: int = 5) -> dict:
    """Return {"weights": {ticker: frac}, "cash_weight": frac, "nav": float,
    "as_of": str, "source_marks": {ticker: price}}.

    Weights come from the ledger's own marks (shares x last mark / NAV), so
    they are internally consistent with how the site displays the portfolio.
    Raises if the ledger looks stale — trading on old targets is worse than
    skipping a day.
    """
    ledgers = book.get("ledgers") or {}
    if ledger_key not in ledgers:
        raise KeyError(f"ledger {ledger_key!r} not in book (have: {sorted(ledgers)})")
    led = ledgers[ledger_key]
    as_of = led.get("current_date")
    if not as_of:
        raise RuntimeError(f"ledger {ledger_key!r} has no current_date")
    staleness = (date.today() - date.fromisoformat(as_of)).days
    if staleness > max_stale_days:
        raise RuntimeError(
            f"ledger {ledger_key!r} is {staleness} days stale (as_of {as_of}); refusing to trade")

    state = led.get("state") or {}
    cash = float(state.get("cash") or 0)
    marks = led.get("last_marks") or {}
    values, missing = {}, []
    for t, h in (state.get("holdings") or {}).items():
        mark = marks.get(t) or h.get("entry_price")
        if not mark:
            missing.append(t)
            continue
        values[t] = float(h["shares"]) * float(mark)
    nav = cash + sum(values.values())
    if nav <= 0:
        raise RuntimeError(f"ledger {ledger_key!r} NAV <= 0")
    if missing:
        print(f"  WARNING: no mark for {missing}; excluded from targets")
    return {
        "weights": {t: v / nav for t, v in values.items()},
        "cash_weight": cash / nav,
        "nav": nav,
        "as_of": as_of,
        "source_marks": {t: float(marks[t]) for t in values if t in marks},
    }

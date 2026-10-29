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
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LEDGERS_JSON = ROOT / "public" / "data" / "paper_ledgers.json"
# G4: the overlay file a mirrored ledger's targets are derived from. Its own `generated_at`
# is the age of the verdicts, which the ledger's `current_date` (advanced by every scoring
# run) does not show. Only ledgers listed here have such a source.
OVERLAY_FILES = {"rn_depth": ROOT / "public" / "data" / "depth_overlay.json"}
# Ledgers driven by an unvalidated interim analyst (operator decision 2026-10-13: Gemini, paper only).
# ledger_weights refuses them, so no KIS_LEDGER setting or manual --ledger can route them to real money.
PAPER_ONLY_LEDGERS = frozenset({"rn_gemini", "rn_v4", "rn_v4_low", "rn_v4_abs"})   # engine v2.1, experimental and unpromoted (AK.84, AK.91)


# G4: why a higher-priority source was passed over in the last load_ledger_book() call.
_LOAD_NOTES: list[str] = []


def last_load_notes() -> list[str]:
    return list(_LOAD_NOTES)


def _from_supabase():
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not (url and key):
        _LOAD_NOTES.append("supabase: not configured (NEXT_PUBLIC_SUPABASE_URL or "
                           "SUPABASE_SERVICE_KEY missing)")
        return None, None
    try:
        import requests
        r = requests.get(f"{url}/rest/v1/paper_ledgers?id=eq.1&select=data",
                         headers={"apikey": key, "Authorization": f"Bearer {key}"},
                         timeout=30)
        if r.status_code == 200 and r.json():
            return r.json()[0]["data"], "supabase"
        _LOAD_NOTES.append(f"supabase: HTTP {r.status_code}" if r.status_code != 200
                           else "supabase: row id=1 is empty")
    except Exception as e:
        print(f"  supabase ledger fetch failed: {e}")
        _LOAD_NOTES.append(f"supabase: {type(e).__name__}: {e}")
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
        _LOAD_NOTES.append(f"LEDGER_URL: HTTP {r.status_code}" if r.status_code != 200
                           else "LEDGER_URL: empty body")
    except Exception as e:
        print(f"  LEDGER_URL fetch failed: {e}")
        _LOAD_NOTES.append(f"LEDGER_URL: {type(e).__name__}: {e}")
    return None, None


def load_ledger_book() -> tuple[dict, str]:
    _LOAD_NOTES.clear()
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
    if ledger_key in PAPER_ONLY_LEDGERS:
        raise ValueError(f"ledger {ledger_key!r} is paper-only (unvalidated interim analyst); "
                         f"it must never be mirrored to a real account")
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
    values, missing, bad = {}, [], []
    for t, h in (state.get("holdings") or {}).items():
        # G9 + fail closed (AUDIT_R2): a missing mark falls back to the entry price, as
        # before. A mark that is 0 or negative is bad data, not a price: valuing the name
        # at 0 (or excluding it) would give it a target weight of 0 and plan a sale of a
        # held position on a bad quote. Either case refuses the plan instead.
        mark = marks.get(t)
        if mark is None:
            mark = h.get("entry_price")
        if mark is None:
            missing.append(t)
            continue
        if float(mark) <= 0:
            bad.append(t)
            continue
        values[t] = float(h["shares"]) * float(mark)
    if missing or bad:
        raise RuntimeError(f"ledger {ledger_key!r}: holdings without a usable mark "
                           f"(no mark: {missing}; mark <= 0: {bad}); refusing to trade")
    nav = cash + sum(values.values())
    if nav <= 0:
        raise RuntimeError(f"ledger {ledger_key!r} NAV <= 0")
    return {
        "weights": {t: v / nav for t, v in values.items()},
        "cash_weight": cash / nav,
        "nav": nav,
        "as_of": as_of,
        "source_marks": {t: float(marks[t]) for t in values if t in marks},
    }


class StaleSourceError(RuntimeError):
    """The target source actually read is too old to trade on (G4)."""


def _parse_utc(text) -> datetime:
    ts = datetime.fromisoformat(str(text).replace("Z", "+00:00"))
    return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)   # overlays write naive UTC


def check_served_freshness(book: dict, src: str, ledger_key: str, *, now=None,
                           max_stale_days: int = 5, notes=()) -> dict:
    """G4: age of the target source ACTUALLY read, not of a copy nobody read.

    `src` is where load_ledger_book() got the book (supabase | url | local-file). Checks
    the served ledger's `current_date` and, for a ledger with an overlay source
    (OVERLAY_FILES), that overlay's `generated_at`/`generated`. Raises StaleSourceError
    beyond `max_stale_days`, or when the overlay's age cannot be read (fail closed).
    Returns a report to log: source, ages, and why a higher-priority source was passed over.
    """
    now = now or datetime.now(timezone.utc)
    ledger = (book.get("ledgers") or {}).get(ledger_key) or {}
    as_of = ledger.get("current_date")
    report = {"source": src, "ledger": ledger_key, "max_stale_days": max_stale_days,
              "current_date": as_of, "age_days": None,
              "book_last_updated": book.get("last_updated"),
              "overlay_file": None, "overlay_generated": None, "overlay_age_days": None,
              "passed_over": list(notes), "fallback": src != "supabase"}
    problems = []
    if not as_of:
        problems.append(f"ledger {ledger_key!r} has no current_date")
    else:
        report["age_days"] = (now.date() - date.fromisoformat(as_of)).days
        if report["age_days"] > max_stale_days:
            problems.append(f"{src} ledger {ledger_key!r} current_date {as_of} is "
                            f"{report['age_days']} days old (limit {max_stale_days})")
    overlay = OVERLAY_FILES.get(ledger_key)
    if overlay is not None:
        report["overlay_file"] = overlay.name
        try:
            raw = json.loads(Path(overlay).read_text(encoding="utf-8"))
            gen = raw.get("generated_at") if raw.get("generated_at") is not None                 else raw.get("generated")
            report["overlay_generated"] = gen
            report["overlay_age_days"] = round(
                (now - _parse_utc(gen)).total_seconds() / 86400, 2)
            if report["overlay_age_days"] > max_stale_days:
                problems.append(f"{overlay.name} was generated {gen}, "
                                f"{report['overlay_age_days']} days old (limit {max_stale_days})")
        except Exception as e:
            problems.append(f"{overlay.name} age unreadable ({type(e).__name__}: {e})")
    report["problems"] = problems
    if problems:
        err = StaleSourceError("; ".join(problems) + f" [source={src}]")
        err.report = report
        raise err
    return report

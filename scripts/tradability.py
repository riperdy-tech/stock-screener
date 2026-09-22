"""tradability.py — which names the engine is not allowed to trade.

Why this exists: stocks.json is a CARRY-FORWARD database. fetch_data.py scans
today's NASDAQ/NYSE/AMEX listing and writes results into the previous run's
records, but it never PRUNES — so a name that leaves the exchange listing
(acquired, taken private, ticker renamed, suspended pending a merger) keeps its
last good record forever and keeps getting scored on frozen fundamentals.

CPRX is the worked example: it left the listing after the 2026-07-16 scan, was
never fetched again, and 25 days later was still ranked #6 in the universe with
a research_now band in BOTH the quant and RS2 lanes — until KIS refused the buy
with 거래정지종목. The broker was the first thing in the stack to notice, four
weeks late. On 2026-08-13 stocks.json carried 231 such records.

Two independent inputs, one output:

  1. AUTOMATIC — `last_listed`, stamped by fetch_data.py from the live exchange
     listing on every run. Absent from the listing for longer than grace_days
     => delisted. This is the preemptive path: it fires the week a name leaves
     the tape, with no broker round-trip and no price heuristics.
  2. MANUAL — scripts/not_tradable.json, for names that are still LISTED but
     cannot be traded anyway (halt, suspension, a KIS-side gap). The listing
     cannot see these, so they are declared by hand.

Consumed by score_factors_dual_door.py, which maps a reason to fct_veto='NOT_TRADABLE'.
That veto strips fct_band and is already the guardrail apply_llm_overlay()
honours, so one veto removes the name from quant eval AND the RS2 lane.

CIRCUIT BREAKER: if the listing feed truncates or dies, every surviving record
looks unlisted and this would veto the whole universe. scan() therefore refuses
to act when more than MAX_UNLISTED_SHARE of the universe reads as unlisted —
a broken feed disables the automatic path instead of emptying the portfolio.
The manual list is never circuit-broken; it is a deliberate human statement.
"""

import json
import sys
from datetime import date, datetime
from pathlib import Path

CONFIG_JSON = Path(__file__).resolve().with_name("not_tradable.json")

DEFAULT_GRACE_DAYS = 5      # listing absence tolerated before a name is vetoed
MAX_UNLISTED_SHARE = 0.10   # above this the listing feed is presumed broken


def load_config(path=CONFIG_JSON):
    """Read not_tradable.json. A missing/corrupt file must never take the
    pipeline down — it degrades to 'no manual entries', and the automatic
    listing path keeps working. But a file that EXISTS and fails to parse is
    a typo silently erasing every hand-declared block, so that case is loud."""
    cfg = {"grace_days": DEFAULT_GRACE_DAYS, "tickers": {}}
    path = Path(path)
    if not path.exists():
        return cfg
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"TRADABILITY WARNING: {path.name} exists but is unreadable ({e}) — "
              "ALL manual non-tradable entries are OFF this run.", file=sys.stderr)
        return cfg
    # NB: bool is an int subclass — "grace_days": true must not become a 1-day grace.
    if type(raw.get("grace_days")) is int and raw["grace_days"] >= 0:
        cfg["grace_days"] = raw["grace_days"]
    tickers = raw.get("tickers")
    if isinstance(tickers, dict):
        cfg["tickers"] = {str(k).upper(): (v if isinstance(v, dict) else {})
                          for k, v in tickers.items()}
    return cfg


def parse_day(value):
    """Date out of 'YYYY-MM-DD' or fetch_data's 'YYYY-MM-DD HH:MM'. None if unparseable."""
    if not isinstance(value, str) or len(value) < 10:
        return None
    try:
        return datetime.strptime(value[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def days_unlisted(stock, today):
    """Days since this name was last seen in the exchange listing, or None when
    that is unknown. Unknown is NOT evidence of delisting: a record written
    before last_listed existed, or a run where the listing fetch was skipped,
    must never be read as a verdict."""
    last = parse_day((stock or {}).get("last_listed"))
    if last is None:
        return None
    return (today - last).days


def untradable_reason(symbol, stock, cfg, today):
    """Short reason string if `symbol` must not be traded, else None."""
    manual = cfg["tickers"].get(symbol.upper())
    if manual is not None:
        return manual.get("reason") or "manually blocked"
    gone = days_unlisted(stock, today)
    if gone is not None and gone > cfg["grace_days"]:
        return f"absent from the exchange listing for {gone}d"
    return None


def scan(stocks, cfg=None, today=None):
    """Sweep the universe once.

    `stocks` is {symbol: stock_record}. Returns ({symbol: reason}, note) where
    note is a human-readable line for the run log. Applies the circuit breaker:
    when the unlisted share is implausible the automatic path is dropped and
    only the manual list survives.
    """
    cfg = cfg or load_config()
    today = today or date.today()

    manual, unlisted = {}, {}
    for sym, rec in stocks.items():
        reason = untradable_reason(sym, rec, cfg, today)
        if reason is None:
            continue
        # Bucketed so the circuit breaker can drop the listing-derived half
        # while keeping the manual list.
        if sym.upper() in cfg["tickers"]:
            manual[sym] = reason
        else:
            unlisted[sym] = reason

    total = len(stocks)
    share = (len(unlisted) / total) if total else 0.0
    if share > MAX_UNLISTED_SHARE:
        note = (f"listing check DISABLED: {len(unlisted)}/{total} ({share:.1%}) read as "
                f"unlisted, above the {MAX_UNLISTED_SHARE:.0%} ceiling — the listing feed "
                f"is presumed broken. {len(manual)} manual entries still applied.")
        return dict(manual), note

    out = {**unlisted, **manual}
    note = (f"{len(out)} not tradable ({len(unlisted)} unlisted >{cfg['grace_days']}d, "
            f"{len(manual)} manual) of {total}")
    return out, note

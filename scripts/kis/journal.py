"""The order journal and idempotency key (SPEC 3R, guard G3).

Every order call is bracketed by journal lines:

    1. before the call:  state "sending"  (written, flushed and fsynced first)
    2. after the call:   state "accepted" (with the KIS order number),
                         "rejected" (with the reason) or "unknown"

"unknown" is a timeout, a connection error, any exception during the call, or an
HTTP reply that was not JSON (the broker may or may not have acted on it). A key
whose last state is "sending" or "unknown" blocks the next run until it is
reconciled against the broker (run_reconcile); reconciliation appends "accepted"
or "absent". The journal is append-only: nothing is ever rewritten.

A key already "accepted" is never sent again.

The store sits behind a two-method interface (append, entries) so a durable remote
store can replace the local file. Only the local file exists today: on GitHub
Actions the runner is ephemeral, so LocalFileJournal reports durable=False there
and the scripts refuse to execute with it (see docs in RR_R3).
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

OPEN_STATES = ("sending", "unknown")
STATES = ("sending", "accepted", "rejected", "unknown", "absent")


class JournalError(RuntimeError):
    """The journal cannot be read or written. Callers fail closed."""


# --------------------------------------------------------------------- keys
def plan_hash(env: str, ledger: str, trade_date: str, orders) -> str:
    """sha256 of the plan: environment, ledger, UTC trade date and the sorted
    (side, ticker, qty) lines. `orders` is an iterable of (side, ticker, qty)."""
    lines = sorted([str(s), str(t), int(q)] for s, t, q in orders)
    blob = json.dumps([env, ledger, trade_date, lines], separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def idempotency_key(plan_hash_: str, ticker: str, side: str, qty: int,
                    limit_price: float, seq: int = 0) -> str:
    """sha256 of (plan hash, ticker, side, quantity, limit price). `seq` separates
    identical lines inside one plan (a split position); it is 0 otherwise."""
    blob = json.dumps([plan_hash_, ticker, side, int(qty), f"{limit_price:.4f}", int(seq)],
                      separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


# ------------------------------------------------------------------- stores
class LocalFileJournal:
    """Append-only JSON-lines file. `durable` says whether it survives the run:
    True on a machine that keeps its disk, False on an ephemeral Actions runner."""

    def __init__(self, path, durable: bool | None = None):
        self.path = Path(path)
        self._durable = durable

    @property
    def durable(self) -> bool:
        if self._durable is not None:
            return self._durable
        return os.environ.get("GITHUB_ACTIONS", "").strip().lower() != "true"

    def append(self, entry: dict) -> None:
        """Write one line and fsync it before returning. Raises JournalError."""
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False, sort_keys=True) + "\n")
                f.flush()
                os.fsync(f.fileno())
        except OSError as e:
            raise JournalError(f"journal write failed ({self.path}): {e}") from e

    def entries(self) -> list[dict]:
        """All lines, oldest first. An unreadable line raises: a journal we cannot
        read is not evidence that nothing is open."""
        if not self.path.exists():
            return []
        try:
            text = self.path.read_text(encoding="utf-8")
        except OSError as e:
            raise JournalError(f"journal unreadable ({self.path}): {e}") from e
        out = []
        for n, line in enumerate(text.splitlines(), 1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except ValueError as e:
                raise JournalError(f"journal line {n} is not JSON ({self.path}): {e}") from e
            if not isinstance(row, dict) or "key" not in row or "state" not in row:
                raise JournalError(f"journal line {n} has no key/state ({self.path})")
            out.append(row)
        return out


# ------------------------------------------------------------------- queries
def last_entries(journal) -> dict[str, dict]:
    """{key: the last journal line for that key}."""
    last = {}
    for e in journal.entries():
        last[e["key"]] = e
    return last


def state_of(journal, key: str) -> str | None:
    e = last_entries(journal).get(key)
    return e["state"] if e else None


def open_entries(journal, env: str | None = None) -> list[dict]:
    """Keys whose last state is sending or unknown (optionally for one env)."""
    return [e for e in last_entries(journal).values()
            if e["state"] in OPEN_STATES and (env is None or e.get("env") == env)]


def describe_open(entries) -> list[str]:
    return [f"  {e['key'][:12]} {e.get('side')} {e.get('ticker')} x{e.get('qty')} "
            f"@ {e.get('price')} state={e['state']} run={e.get('run_id')} at {e.get('ts')}"
            for e in entries]


def blocked_message(entries) -> str:
    return ("refusing to trade: the order journal holds order(s) whose outcome is not "
            "known. Reconcile them against the broker first (--reconcile-journal):\n"
            + "\n".join(describe_open(entries)))


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ------------------------------------------------------------------- sending
def send_order(journal, client, *, run_id: str, env: str, ledger: str, plan_hash_: str,
               side: str, exch: str, ticker: str, qty: int, limit: float,
               seq: int = 0) -> dict:
    """Journal, send and journal one order. Returns the place_order result dict plus:

        key    the idempotency key
        state  accepted | rejected | unknown | duplicate | not_sent
        stop   True when the run must send nothing further (unknown, not_sent)

    "duplicate": the key is already accepted, nothing was sent.
    "not_sent":  the 'sending' line could not be written, so the order was NOT sent.
    Never raises on a broker failure: the exception is recorded as 'unknown'.
    """
    key = idempotency_key(plan_hash_, ticker, side, qty, limit, seq)
    try:
        if state_of(journal, key) == "accepted":
            return {"ok": False, "order_no": None, "key": key, "state": "duplicate",
                    "msg": "skipped: this idempotency key is already accepted"}
    except JournalError as e:
        return {"ok": False, "order_no": None, "key": key, "state": "not_sent", "stop": True,
                "msg": f"NOT SENT: {e}"}
    base = {"run_id": run_id, "key": key, "plan_hash": plan_hash_, "env": env,
            "ledger": ledger, "ticker": ticker, "side": side, "qty": int(qty),
            "price": round(float(limit), 4)}
    try:
        journal.append({**base, "state": "sending", "ts": _now()})
    except JournalError as e:
        return {"ok": False, "order_no": None, "key": key, "state": "not_sent", "stop": True,
                "msg": f"NOT SENT: {e}"}

    try:
        res = client.place_order(side, exch, ticker, qty, limit)
        failure = None
    except Exception as e:  # timeout, connection error, anything: the broker may have acted
        res, failure = None, f"{type(e).__name__}: {e}"

    if res is None or res.get("ambiguous"):
        why = failure or res.get("msg") or "ambiguous broker reply"
        out = {"ok": False, "order_no": None, "key": key, "state": "unknown", "stop": True,
               "msg": f"UNKNOWN: {why}"}
        line = {**base, "state": "unknown", "reason": why}
    elif res.get("ok"):
        out = {**res, "key": key, "state": "accepted"}
        line = {**base, "state": "accepted", "order_no": res.get("order_no")}
    else:
        out = {**res, "key": key, "state": "rejected"}
        line = {**base, "state": "rejected", "reason": res.get("msg")}
    try:
        journal.append({**line, "ts": _now()})
    except JournalError as e:
        # The 'sending' line stays, so the next run is blocked: fail closed.
        print(f"  ! journal result line not written ({e}); the next run will refuse "
              f"until {key[:12]} is reconciled", file=sys.stderr)
        out["stop"] = True
    return out


# ------------------------------------------------------------------ reconcile
def run_reconcile(journal, client, env: str, today: str | None = None) -> int:
    """Resolve open keys against the broker's same-day order list.

    Uses client.daily_orders() -> [{"ticker", "side", "qty", "order_no"}] if the
    client has it (KISClient.daily_orders, A13, 2026-10-30); a client without it makes
    the run say so and leave every key open. Returns 0 when nothing is left open.
    """
    try:
        open_ = open_entries(journal, env)
    except JournalError as e:
        print(f"reconcile: {e}", file=sys.stderr)
        return 2
    if not open_:
        print(f"reconcile: no open journal keys for env={env}.")
        return 0
    print(f"reconcile: {len(open_)} open key(s) for env={env}:")
    print("\n".join(describe_open(open_)))
    fetch = getattr(client, "daily_orders", None)
    if not callable(fetch):
        print("reconcile: STOP. The KIS client has no same-day order-history method "
              "(unfilled() lists only orders still open, so it cannot show a filled order "
              "or prove one was never placed). No endpoint is invented here. The keys stay "
              "open and trading stays refused; check the KIS app and append the resolution "
              "to the journal by hand, or add the method.")
        return 2
    try:
        rows = list(fetch())
    except Exception as e:
        print(f"reconcile: broker order list failed ({type(e).__name__}: {e}); keys stay open.")
        return 2
    today = today or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    pool = list(rows)
    for e in sorted(open_, key=lambda x: x.get("ts", "")):
        if str(e.get("ts", ""))[:10] != today:
            print(f"  {e['key'][:12]} {e.get('ticker')}: dated {str(e.get('ts', ''))[:10]}, "
                  f"the broker list is same-day only ({today}); left open")
            continue
        hit = next((r for r in pool
                    if r.get("ticker") == e.get("ticker") and r.get("side") == e.get("side")
                    and int(r.get("qty", -1)) == int(e.get("qty", -2))), None)
        if hit is not None:
            pool.remove(hit)
            journal.append({k: v for k, v in e.items() if k not in ("reason", "order_no")}
                           | {"state": "accepted", "order_no": hit.get("order_no"),
                              "by": "reconcile", "ts": _now()})
            print(f"  {e['key'][:12]} {e.get('ticker')}: found at the broker "
                  f"(order {hit.get('order_no')}) -> accepted")
        else:
            journal.append({k: v for k, v in e.items() if k not in ("reason", "order_no")}
                           | {"state": "absent", "by": "reconcile", "ts": _now()})
            print(f"  {e['key'][:12]} {e.get('ticker')}: not in the broker's same-day "
                  f"list -> absent")
    return 0 if not open_entries(journal, env) else 2

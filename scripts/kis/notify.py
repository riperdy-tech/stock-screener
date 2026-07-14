"""notify.py — trade-run surfacing for the KIS sync (Telegram + Supabase).

Two independent, best-effort sinks fired after an EXECUTE run that placed
orders. BOTH are non-fatal by contract: any failure here must never break the
trading run, so every entry point catches its own exceptions and returns a
bool. Dry runs never call in here (the caller gates on --execute).

  format_telegram()  -> digest text (pure; unit-tested, no network)
  trades_rows()      -> Supabase rows (pure)
  send_telegram()    -> POST to the Bot API; no-op False without token/chat
  sb_upsert()        -> PostgREST batch upsert; no-op False without env

No secrets or account numbers ever go into the message body (only run_id, env,
ledger name, and per-order side/ticker/qty/limit/reason).

Config (env):
    KIS_TG_BOT_TOKEN, KIS_TG_CHAT_ID       Telegram bot + destination chat
    NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY   PostgREST (service role)

Naming scheme: the caller passes a prefix (default '[KIS·trades]'); a future
'[KIS·alerts]' stream — or a second chat_id — can coexist without refactor.
"""

from __future__ import annotations

import json
import os
import sys


def _sign(ok) -> str:
    return "✅" if ok else "❌"


def format_telegram(prefix: str, run_id: str, env: str, ledger: str,
                    results: list[dict], nav: float, cash: float) -> str:
    """One digest message. `results` is the list sync_kis_portfolio.py builds:
    each an order's vars() merged with the place_order result. Skipped buys may
    lack a 'limit' key — rendered as '@ —'."""
    ok_n = sum(1 for r in results if r.get("ok"))
    lines = [f"{prefix} {run_id} {env}/{ledger}",
             f"Placed {ok_n}/{len(results)}"]
    for r in results:
        limit = r.get("limit")
        px = f"{limit:.2f}" if isinstance(limit, (int, float)) else "—"
        line = f"{_sign(r.get('ok'))} {str(r.get('side', '')).upper()} " \
               f"{r.get('ticker', '?')} x{r.get('qty', 0)} @ {px}"
        if not r.get("ok") and r.get("msg"):
            line += f" — {r['msg']}"
        lines.append(line)
    lines.append(f"NAV ${nav:,.0f} · cash ${cash:,.0f}")
    return "\n".join(lines)


def trades_rows(run_id: str, env: str, results: list[dict],
                nav: float, cash: float) -> list[dict]:
    """Map results -> kis_trades rows. ts is left to the DB default (now())."""
    rows = []
    for r in results:
        limit = r.get("limit")
        rows.append({
            "run_id": run_id,
            "env": env,
            "side": r.get("side"),
            "ticker": r.get("ticker"),
            "qty": r.get("qty"),
            "limit_price": limit if isinstance(limit, (int, float)) else None,
            "ok": bool(r.get("ok")),
            "order_no": r.get("order_no"),
            "msg": r.get("msg") or "",
            "nav": nav,
            "cash": cash,
        })
    return rows


def send_telegram(text: str, token: str | None = None,
                  chat_id: str | None = None) -> bool:
    """POST one message. Returns True on API ok, False on any failure or when
    unconfigured. Never raises."""
    token = token or os.environ.get("KIS_TG_BOT_TOKEN")
    chat_id = chat_id or os.environ.get("KIS_TG_CHAT_ID")
    if not (token and chat_id):
        return False
    try:
        import requests
        r = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text,
                  "disable_web_page_preview": True},
            timeout=15)
        if r.status_code == 200 and r.json().get("ok"):
            return True
        print(f"  telegram sendMessage -> {r.status_code}: {r.text[:200]}",
              file=sys.stderr)
    except Exception as e:
        print(f"  telegram sendMessage failed: {e}", file=sys.stderr)
    return False


def sb_upsert(table: str, rows: list[dict], on_conflict: str) -> bool:
    """Batch upsert rows via PostgREST (service key, merge-duplicates). Returns
    True on success or when there is nothing to write; False on failure or when
    Supabase env is absent. Never raises. Mirrors track_paper_portfolios.py."""
    if not rows:
        return True
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not (url and key):
        return False
    try:
        import requests
        r = requests.post(
            f"{url}/rest/v1/{table}?on_conflict={on_conflict}",
            headers={"apikey": key, "Authorization": f"Bearer {key}",
                     "Content-Type": "application/json",
                     "Prefer": "resolution=merge-duplicates,return=minimal"},
            data=json.dumps(rows), timeout=30)
        if r.status_code in (200, 201, 204):
            return True
        print(f"  supabase upsert {table} -> {r.status_code}: {r.text[:200]}",
              file=sys.stderr)
    except Exception as e:
        print(f"  supabase upsert {table} failed: {e}", file=sys.stderr)
    return False

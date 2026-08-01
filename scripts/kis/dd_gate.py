"""dd_gate.py — live wiring of the drawdown governor into the KIS sync.

State store: Supabase table `paper_ledgers`, row id=2 (piggybacks the existing
table and permissions — no schema setup):
    {"id": 2, "data": {"type": "kis_dd_state", "envs": {"real": {...}, "paper": {...}}}}
State is kept PER ENV so the paper account's rehearsals never disturb the real
account's peak/budget.

FAIL-OPEN by design: if the store is unreachable, the sync trades UNGATED for
that run and alerts loudly — the governor is protection, not a new single
point of failure; the KIS_HALT variable remains the manual backstop. Nothing
in here ever raises into the trade path."""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

from kis.notify import sb_upsert

ROW_ID = 2


def load_dd_states():
    """Returns (envs_dict, source) — source: 'supabase' | 'empty' | 'error'.
    'error' means the store is unreachable: caller fails open + alerts."""
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not (url and key):
        return None, "error"
    try:
        import requests
        r = requests.get(f"{url}/rest/v1/paper_ledgers?id=eq.{ROW_ID}&select=data",
                         headers={"apikey": key, "Authorization": f"Bearer {key}"},
                         timeout=30)
        if r.status_code != 200:
            print(f"  dd_gate: state GET -> {r.status_code}: {r.text[:150]}", file=sys.stderr)
            return None, "error"
        rows = r.json()
        if not rows:
            return {}, "empty"
        data = rows[0].get("data") or {}
        return (data.get("envs") or {}), "supabase"
    except Exception as e:
        print(f"  dd_gate: state GET failed: {e}", file=sys.stderr)
        return None, "error"


def save_dd_states(envs: dict) -> bool:
    return sb_upsert("paper_ledgers",
                     [{"id": ROW_ID,
                       "data": {"type": "kis_dd_state", "envs": envs,
                                "updated_at": datetime.now(timezone.utc).isoformat()}}],
                     "id")


def apply_gate(weights: dict, gross: float, halted: bool):
    """Pure: gate target weights by the governor's gross target.
    halted/zero -> empty targets (reconcile exits everything, no buys);
    reduced -> scale every weight (reconcile trims down; caller drops buys);
    full -> untouched."""
    if halted or gross <= 0:
        return {}, "HALTED — targets cleared; reconcile will liquidate, no buys"
    if gross < 1.0:
        return ({t: w * gross for t, w in weights.items()},
                f"reduced tier — targets scaled to {gross:.0%}, new buys suppressed")
    return weights, ""


def dd_log_line(env: str, dd: dict, state: dict) -> str:
    # peak_nav is the NAV that would put us back at the high-water mark AT THE
    # CURRENT UNIT COUNT — it moves with declared flows, while the underlying
    # per-unit peak does not. Units are shown only once they diverge from 1.0,
    # so a book that has never seen a flow logs exactly as it always did.
    units = float(state.get("units", 1.0))
    extra = f" [units {units:,.4f}]" if abs(units - 1.0) > 1e-9 else ""
    return (f"DD[{env}]: dd {dd['dd']:.1%} from peak {state['peak_nav']:,.2f} "
            f"-> gross {dd['gross']:.0%}{extra}"
            + (" [HALTED]" if state.get("halted") else ""))


def dd_alert_text(env: str, dd: dict, execute: bool) -> str:
    txt = f"[KIS·risk] {env}: {dd['action'].upper()} — {dd['reason']}"
    if dd["action"] == "halt":
        txt += ("\nBook will be liquidated and buys blocked. After review, resume via "
                "Actions -> KIS Portfolio Sync -> dd_resume=true (peak kept).")
    if not execute:
        txt += "\n(dry-run — no orders placed this run)"
    return txt

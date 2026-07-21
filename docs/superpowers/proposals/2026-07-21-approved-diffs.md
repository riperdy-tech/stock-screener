# Proposed diffs (approved in principle 2026-07-20; apply only on final "go")

Each diff is independent. On approval I apply, commit, and push together with the
docs commits so the orchestrator's next auto-push doesn't deploy them half-reviewed.

---

## Diff 1 — real cost default: 25 bps/side

`scripts/track_paper_portfolios.py:64`

```diff
-COST_BPS = 10
+COST_BPS = 25   # real KIS overseas commission (user 2026-07-20); was 10 (idealized)
```

Effect: every paper ledger charges 25 bps per side from the day this lands
(history is untouched — state carries). Paper NAVs will look worse and honest.
The website cost/turnover graph is a separate, larger diff (Validation tab,
recharts) — proposed next round, not here.

---

## Diff 2 — KIS_HALT kill switch

**2a** `.github/workflows/kis-sync.yml` — add to the `Run sync` step's `env:` block:

```diff
           KIS_MSG_PREFIX: ${{ vars.KIS_MSG_PREFIX || '[KIS·trades]' }}
+          # Phone-flippable halt: GitHub app -> repo Settings -> Variables -> KIS_HALT=true
+          KIS_HALT: ${{ vars.KIS_HALT || '' }}
```

**2b** `scripts/sync_kis_portfolio.py` — in `main()`, immediately after the
`print(f"KIS sync [{run_id}] ...")` line:

```diff
     print(f"KIS sync [{run_id}] env={args.env} ledger={args.ledger} "
           f"execute={args.execute}")
+
+    # Kill switch: repo variable KIS_HALT (any of 1/true/yes) stops the run
+    # before targets, prices, or any order. Flip it from the GitHub mobile app.
+    if os.environ.get("KIS_HALT", "").strip().lower() in ("1", "true", "yes"):
+        log_event({"run_id": run_id, "event": "halted", "reason": "KIS_HALT set"})
+        gh_summary([f"## KIS sync {run_id}", "**HALTED** — repo variable KIS_HALT is set; no orders."])
+        print("HALTED: KIS_HALT is set — exiting before any planning/orders.")
+        return
```

Behavior: halts paper and real alike, dry-run and execute alike; logged to
`kis_sync.jsonl`; visible in the Actions summary. Un-halt by clearing the variable.

---

## Diff 3 — ops alerts through the existing Telegram bot

**3a** `RS2 Local/orchestrate.py` — add after `heartbeat()`:

```diff
+BAD_HEARTBEATS = {"ollama_down", "stale_factor_scores", "push_failed"}
+
+
+def notify_telegram(text):
+    """Best-effort ops alert via the same Telegram bot as the KIS trade digests.
+    Reads telegram_bot_token / telegram_chat_id from .secrets.json; silent no-op
+    if absent or failing — must never break a run."""
+    try:
+        sec = json.loads((HERE / ".secrets.json").read_text(encoding="utf-8"))
+        tok, chat = sec.get("telegram_bot_token"), sec.get("telegram_chat_id")
+        if not (tok and chat):
+            return
+        req = urllib.request.Request(
+            f"https://api.telegram.org/bot{tok}/sendMessage",
+            data=json.dumps({"chat_id": chat, "text": text}).encode(),
+            headers={"Content-Type": "application/json"})
+        urllib.request.urlopen(req, timeout=10).read()
+    except Exception:
+        pass
```

and inside `heartbeat(...)`, after the `save(...)`:

```diff
+    if status in BAD_HEARTBEATS:
+        notify_telegram(f"[RS2 ops] {status} — {extra or ''}".strip())
```

One-time setup for you: add `"telegram_bot_token"` and `"telegram_chat_id"` to
`RS2 Local/.secrets.json` (same values as the GitHub `KIS_TG_*` secrets).

**3b — dead-man switch (covers "PC never ran at all", which 3a cannot):**
new file `.github/workflows/overlay-freshness-watchdog.yml`:

```yaml
# Alerts if the RS2 overlay stops updating (dead PC, dead scheduler, dead push).
# Cloud-side on purpose: a dead machine cannot alert about itself.
name: Overlay Freshness Watchdog
on:
  schedule:
    - cron: "30 10 * * 1-5"   # weekdays 10:30 UTC, after the 08:00 KST-run window
  workflow_dispatch:
jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - name: Check overlay age and alert
        env:
          TG_TOKEN: ${{ secrets.KIS_TG_BOT_TOKEN }}
          TG_CHAT: ${{ secrets.KIS_TG_CHAT_ID }}
        run: |
          AGE_H=$(python - <<'EOF'
          import json, datetime
          ts = json.load(open("public/data/llm_overlay.json"))["generated_at"]
          dt = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00"))
          print(round((datetime.datetime.now(datetime.timezone.utc) - dt).total_seconds() / 3600))
          EOF
          )
          echo "overlay age: ${AGE_H}h"
          if [ "$AGE_H" -gt 36 ] && [ -n "$TG_TOKEN" ]; then
            curl -s -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
              -d chat_id="${TG_CHAT}" \
              -d text="[RS2 ops] llm_overlay.json is ${AGE_H}h old (>36h) — orchestrator/PC/push may be down. Verdicts will decay toward neutral after 14d." >/dev/null
            echo "::warning::overlay stale ${AGE_H}h — Telegram alert sent"
          fi
```

---

## Explicitly NOT proposed (evidence said no / deferred)

- **Sync cadence change (weekly):** replay showed weekly is a phase lottery on
  3 weeks of data (mean +0.24pt, spread ±0.7pt). Re-evaluate as evidence grows.
- **Entry confirmation / slow exits / WL-hysteresis on the live LLM book:** all
  three *underperformed* current behavior in the replay. Dropped.
- **Quant `equal` band-hysteresis A/B (paper-only, +1.7pt in replay):** worth
  doing, but it touches ledger construction — proposed as its own diff after
  the verdict-stabilization design (next work item), not bundled here.
- **Website cost graph:** separate diff next round (bigger UI change).

# KIS Pipeline Audit — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce `docs/superpowers/audit/2026-07-kis-pipeline-audit.md` — a severity-ranked, evidence-cited audit of the five links of the live US→KIS money path, plus the attribution verdict on where underperformance came from.

**Architecture:** Read-only audit. Each task audits one link (static read with a fixed question set) and/or runs a forensic script over existing data (`public/data/*.json`, git history, Supabase read). Findings accumulate in one report file; forensic tools live in `docs/superpowers/audit/tools/` (clearly outside the live `scripts/` tree); their outputs go to `docs/superpowers/audit/tools/out/` (gitignored).

**Tech Stack:** Python 3 stdlib only (json, csv, statistics, subprocess, urllib), git plumbing, PowerShell. No new dependencies, no venv, no writes outside `docs/superpowers/audit/`.

## Global Constraints

- **READ-ONLY (user, 2026-07-20):** never modify, move, or delete anything outside `docs/superpowers/audit/` and `docs/superpowers/plans/`. Live `scripts/`, `public/data/`, workflows, configs are untouchable. Importing live modules read-only (e.g. `kis.reconcile.compute_plan`) is allowed; editing them is not.
- **REAL MONEY is live** on the `equal_llm` KIS mirror. Any **P0 finding** (can lose money silently) → stop, message the user immediately; do not queue it for the report.
- **Severity taxonomy (verbatim from spec §4):** P0 = can lose money silently · P1 = correctness bug · P2 = performance leak · P3 = hygiene/philosophy drift.
- **Evidence rule:** every finding cites `file:line` or a tools/out artifact + the number. No finding without evidence.
- **Secrets:** scripts may load `.env.local`/`.env` values into memory for read-only Supabase GETs but must never print, log, or write key values. If keys are absent, record an open item — never ask the user mid-task.
- **Working directory for all commands:** `C:\Users\riper\Downloads\Stock Screener\Stock Screener` (the inner repo root). All paths below are relative to it.
- **Commits:** local only, never push. One commit per task, message prefix `docs(audit):`.
- **Report file:** `docs/superpowers/audit/2026-07-kis-pipeline-audit.md`. Findings numbered `F-NN` in discovery order. Section skeleton is created in Task 1; later tasks fill their own section only.

---

### Task 1: Scaffold, environment check, evidence baseline

**Files:**
- Create: `docs/superpowers/audit/2026-07-kis-pipeline-audit.md`
- Create: `docs/superpowers/audit/tools/out/.gitignore`
- Create: `docs/superpowers/audit/tools/inspect_ledgers.py`

**Interfaces:**
- Produces: report skeleton with 8 fixed section headers; `tools/out/ledger_schema.json` + `tools/out/trades_sample.json` (schema ground truth consumed by Tasks 4, 5, 7); a confirmed python launcher (`py` or `python`) recorded in the report's Method section.

- [ ] **Step 1: Verify python + git availability**

Run: `python --version; git -C . rev-parse --short HEAD`
Expected: a Python 3.x version and a commit hash. If `python` is missing try `py -3 --version` and use `py -3` for every later step.

- [ ] **Step 2: Create the out/ gitignore**

`docs/superpowers/audit/tools/out/.gitignore`:
```
*
!.gitignore
```

- [ ] **Step 3: Create the report skeleton**

`docs/superpowers/audit/2026-07-kis-pipeline-audit.md`:
```markdown
# KIS Pipeline Audit — Phase 1 Report

**Date started:** 2026-07-20 · **Auditor:** Claude (read-only engagement per spec 2026-07-20)
**Spec:** docs/superpowers/specs/2026-07-20-kis-pipeline-audit-design.md

## 0. Executive summary
(written last — Task 8)

## Findings register
| ID | Sev | Link | Title | Evidence |
|----|-----|------|-------|----------|

## 1. Link 1 — RS2 verdict generation
## 2. Link 2 — Overlay → factor guardrail
## 3. Link 3 — Ledger mechanics & churn forensics
## 4. Link 4 — Reconcile & execution
## 5. Link 5 — Risk & philosophy coherence
## 6. Attribution verdict
## 7. Assumptions & open questions for the user
## 8. Method & environment
```

- [ ] **Step 4: Write the ledger schema inspector**

`docs/superpowers/audit/tools/inspect_ledgers.py`:
```python
"""Dump the actual schema of paper_ledgers.json so later forensic scripts
parse real field names, not guessed ones. Read-only."""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]   # repo root
OUT = Path(__file__).resolve().parent / "out"
book = json.loads((ROOT / "public/data/paper_ledgers.json").read_text(encoding="utf-8"))

def shape(x, depth=0):
    if depth > 3: return "..."
    if isinstance(x, dict):
        return {k: shape(v, depth+1) for k, v in list(x.items())[:8]}
    if isinstance(x, list):
        return [shape(x[0], depth+1), f"...{len(x)} items"] if x else []
    return type(x).__name__

schema = {name: shape(led) for name, led in book["ledgers"].items()}
OUT.mkdir(exist_ok=True)
(OUT / "ledger_schema.json").write_text(json.dumps(schema, indent=1), encoding="utf-8")

sample = {}
for name in ("equal", "equal_llm"):
    led = book["ledgers"][name]
    sample[name] = {
        "closed_first3": led.get("closed", [])[:3],
        "trades_first3": led.get("trades", [])[:3],
        "holdings_first3": dict(list((led.get("state") or {}).get("holdings", {}).items())[:3]),
    }
(OUT / "trades_sample.json").write_text(json.dumps(sample, indent=1, default=str), encoding="utf-8")
print("ledgers:", list(book["ledgers"]))
print("wrote out/ledger_schema.json, out/trades_sample.json")
```

- [ ] **Step 5: Run it and record the schema in the report**

Run: `python docs/superpowers/audit/tools/inspect_ledgers.py`
Expected: prints ledger names; both out files exist. Paste the closed/trades field names into report §8 (Method). **Every later script must use these observed field names.**

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/audit docs/superpowers/plans/2026-07-20-kis-pipeline-audit-phase1.md
git commit -m "docs(audit): phase-1 scaffold, ledger schema baseline"
```

---

### Task 2: Link 1 — RS2 verdict generation

**Files:**
- Read: `../../RS2 Local/orchestrate.py`, `../../RS2 Local/status.py`, `../../RS2 Local/publish_reports.py`, `../../RS2 Local/register_orchestrator_task.ps1`, `../../RS2 Local/valuation_engine.py`, `../../RS2 Local/valuation_io.py`, `../../RS2 Local/run_rs2.py` (paths relative to repo root; the RS2 project sits beside the screener in Downloads)
- Create: `docs/superpowers/audit/tools/verdict_history.py`
- Modify: report §1, findings register

**Interfaces:**
- Consumes: python launcher from Task 1.
- Produces: `tools/out/verdict_history.csv` (columns: `ticker,commit_iso,action,conviction`) and `tools/out/verdict_flips.json` (`{"per_ticker_flips": {...}, "flip_rate": float, "cadence_days": [...]}`) — consumed by Task 4 (churn attribution) and Task 7.

- [ ] **Step 1: Static read — answer this fixed question set in report §1** (cite file:line for each)

1. What exactly triggers `orchestrate.py` (schedule, conditions), and what happens when the PC is off/Ollama down — is there any alert, or does the overlay just go stale silently?
2. How does `llm_overlay.json` reach GitHub (who commits/pushes, what cadence do the `chore(llm)` commits show)?
3. Is a verdict deterministic for fixed inputs (temperature, seed, staged pipeline), or can two runs on the same data disagree? What re-analysis triggers exist (cadence-only vs event-driven)?
4. Valuation guardrails: confirm the `base_cf` bounds, unit normalization, non-monotonic-IV / |MoS|>70% re-prompt loop in `valuation_engine.py` / `run_rs2.py`; note any input that reaches the verdict *unclamped*.
5. Single-machine risk: list every failure mode between "Qwen3 emits text" and "overlay lands in the repo" (parse failure, partial ticker set, git conflict with CI commits, task-scheduler silent failure).

- [ ] **Step 2: Write the verdict oscillation forensic**

`docs/superpowers/audit/tools/verdict_history.py`:
```python
"""Rebuild per-ticker verdict timelines from git history of llm_overlay.json.
A verdict flip is a real trade in the live book. Read-only (git show)."""
import csv, json, subprocess
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent / "out"
PATH = "public/data/llm_overlay.json"

log = subprocess.run(["git", "-C", str(ROOT), "log", "--format=%H %cI", "--", PATH],
                     capture_output=True, text=True, check=True).stdout.split()
commits = list(zip(log[0::2], log[1::2]))[::-1]          # oldest -> newest
rows, timeline = [], defaultdict(list)
for sha, iso in commits:
    try:
        blob = subprocess.run(["git", "-C", str(ROOT), "show", f"{sha}:{PATH}"],
                              capture_output=True, text=True, check=True).stdout
        tickers = (json.loads(blob) or {}).get("tickers", {})
    except Exception:
        continue
    for t, v in tickers.items():
        action = str(v.get("action") or v.get("verdict") or "?").upper()
        conv = v.get("conviction")
        rows.append((t, iso, action, conv))
        timeline[t].append((iso, action))

flips = {t: sum(1 for a, b in zip(seq, seq[1:]) if a[1] != b[1])
         for t, seq in timeline.items()}
obs = sum(len(s) for s in timeline.values())
transitions = sum(len(s) - 1 for s in timeline.values() if len(s) > 1)
OUT.mkdir(exist_ok=True)
with (OUT / "verdict_history.csv").open("w", newline="", encoding="utf-8") as f:
    csv.writer(f).writerows([("ticker", "commit_iso", "action", "conviction"), *rows])
(OUT / "verdict_flips.json").write_text(json.dumps({
    "commits": len(commits), "tickers": len(timeline), "observations": obs,
    "per_ticker_flips": dict(sorted(flips.items(), key=lambda kv: -kv[1])[:40]),
    "flip_rate": round(sum(flips.values()) / transitions, 4) if transitions else None,
    "cadence_days": [c[1][:10] for c in commits],
}, indent=1), encoding="utf-8")
print(f"{len(commits)} overlay commits, {len(timeline)} tickers, "
      f"flip_rate={sum(flips.values())}/{transitions}")
```

- [ ] **Step 3: Run it**

Run: `python docs/superpowers/audit/tools/verdict_history.py`
Expected: prints commit/ticker counts and a flip ratio; both out files written. If the action field name differs (check one `git show` manually first), fix the two `v.get(...)` keys to the real ones before trusting output.

- [ ] **Step 4: Write report §1** — the five question answers, the flip-rate number with the top oscillating tickers, and any findings (each: `F-NN`, severity, evidence). Expected shape of findings here: silent-staleness (P0/P1 candidate), verdict nondeterminism driving churn (P2), single-machine fragility (P1/P2).

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/audit
git commit -m "docs(audit): link 1 (RS2 generation) findings + verdict oscillation forensics"
```

---

### Task 3: Link 2 — Overlay → factor guardrail

**Files:**
- Read: `scripts/score_factors.py` (whole file — bands, vetoes, `apply_llm_overlay`), `public/data/llm_overlay.json`, `public/data/factor_scores.json` (current snapshots)
- Create: `docs/superpowers/audit/tools/overlay_trace.py`
- Modify: report §2, findings register

**Interfaces:**
- Consumes: nothing new.
- Produces: `tools/out/overlay_trace.json` — per-ticker trace `{ticker: {rs2_action, conviction, quant_band, quant_veto, llm_band, in_llm_set}}` consumed by Tasks 4 and 6.

- [ ] **Step 1: Static read — answer in report §2** (cite lines)

1. Exact conviction→band thresholds (research_now vs watchlist), the bearish demotion list, and `llm_reject` semantics.
2. Staleness: what happens at day 15 (shrink math), and what happens if the overlay file vanishes entirely (STRICT NO-OP claim — verify the ledger side: does `equal_llm` then hold, sell everything, or fall back to quant? Follow the band's consumers into `track_paper_portfolios.py` far enough to answer; full ledger audit is Task 4).
3. Veto integrity: enumerate every code path by which a ticker enters the LLM set; prove each one checks the quant veto (`fct_percentile is None` skip). Look for order-of-operations holes (e.g. overlay applied before vetoes are final).
4. Live-price MoS recompute: which price is used, how stale can it be, and can a big rally silently keep a NOW verdict that RS2 priced 30% lower?

- [ ] **Step 2: Write the mechanical trace**

`docs/superpowers/audit/tools/overlay_trace.py`:
```python
"""Cross the current overlay against current factor scores: for every RS2
ticker, what did the guardrail decide and why. Read-only."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent / "out"
ov = json.loads((ROOT / "public/data/llm_overlay.json").read_text(encoding="utf-8")).get("tickers", {})
fs = json.loads((ROOT / "public/data/factor_scores.json").read_text(encoding="utf-8")).get("tickers", {})

trace, anomalies = {}, []
for t, v in ov.items():
    e = fs.get(t, {})
    row = {
        "rs2_action": v.get("action") or v.get("verdict"),
        "conviction": v.get("conviction"),
        "quant_band": e.get("fct_band"),
        "quant_veto": e.get("fct_veto"),
        "llm_band": e.get("fct_band_llm"),
        "llm_veto": e.get("fct_llm_veto"),
        "quant_pctl": e.get("fct_percentile"),
    }
    trace[t] = row
    if row["llm_band"] == "research_now" and (row["quant_veto"] or row["quant_pctl"] is None):
        anomalies.append(t)          # veto bypass = P0 candidate
    if row["llm_band"] == "research_now" and str(row["rs2_action"] or "").upper() in
       ("AVOID", "SELL", "REDUCE"):
        anomalies.append(t + ":bearish-in-set")
OUT.mkdir(exist_ok=True)
(OUT / "overlay_trace.json").write_text(json.dumps(
    {"anomalies": anomalies, "trace": trace}, indent=1), encoding="utf-8")
print(f"{len(trace)} RS2 tickers traced; anomalies: {anomalies or 'NONE'}")
```
(Note: the two-line `if` has a deliberate line-break to fit — join it to one line when writing the file. Field names must match Task 1/2 observations; adjust before running.)

- [ ] **Step 3: Run it**

Run: `python docs/superpowers/audit/tools/overlay_trace.py`
Expected: `NONE` anomalies proves the guardrail holds *on today's snapshot*; any anomaly is immediate P0-candidate territory → verify by hand against `score_factors.py` logic before escalating (a stale local factor_scores.json can false-positive — check `generated_at` first).

- [ ] **Step 4: Write report §2** with answers, trace numbers (how many RS2 names, how many vetoed away, how many in the live set), findings.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/audit
git commit -m "docs(audit): link 2 (overlay->guardrail) findings + veto trace"
```

---

### Task 4: Link 3 — Ledger mechanics & churn forensics

**Files:**
- Read: `scripts/track_paper_portfolios.py` (entire file, ~1400 lines — this is the core of the task)
- Create: `docs/superpowers/audit/tools/churn_forensics.py`
- Modify: report §3, findings register

**Interfaces:**
- Consumes: observed trade-record field names from `tools/out/trades_sample.json` (Task 1); `tools/out/verdict_flips.json` (Task 2).
- Produces: `tools/out/churn_summary.json` (`{ledger: {round_trips, median_hold_days, reentries_within_14d, cost_bps_of_nav, pnl_by_hold_bucket}}`) — consumed by Task 7.

- [ ] **Step 1: Static read — answer in report §3** (cite lines)

1. Trade-on-change: exactly what event sells a held `equal_llm` name (band exit? verdict downgrade? unevaluated?), and what the unevaluated-vs-demoted gates (`UNEVALUATED_BANDS`, `FACTOR_MAX_AGE_H`, `SCORED_COUNT_MIN_RATIO`) actually protect against — trace one hypothetical: "RS2 misses one daily run — what does the ledger do tomorrow?"
2. Entry funding (`ENTRY_FUND_TOL`), dividends, same-day rewind idempotency — any path where a rewind can double-count or drop a fill?
3. Cost model: confirm 10 bps/side and where it's applied; list what it *omits* (spread crossing via limit buffers ±0.3%, FX, actual KIS commission) for Task 5's real-fill comparison.
4. The `equal` vs `equal_llm` target-set construction: confirm equal-weight of which band exactly, and whether position count is capped anywhere.

- [ ] **Step 2: Write the churn forensic** (adjust field names to `trades_sample.json` — the code below uses the names as believed; verify each before running)

`docs/superpowers/audit/tools/churn_forensics.py`:
```python
"""Round-trip churn decomposition per ledger from paper_ledgers.json.
Read-only. Outputs churn_summary.json for the attribution task."""
import json, statistics
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent / "out"
book = json.loads((ROOT / "public/data/paper_ledgers.json").read_text(encoding="utf-8"))
COST_BPS = 10  # per side, tracker's own assumption

def d(s): return date.fromisoformat(str(s)[:10])

summary = {}
for name in ("equal", "equal_llm", "plan", "plan_llm"):
    led = book["ledgers"].get(name)
    if not led: continue
    closed = led.get("closed", [])
    holds, pnls, traded, exits_by_ticker = [], [], 0.0, defaultdict(list)
    for c in closed:
        entry, exit_ = d(c.get("entry_date")), d(c.get("exit_date"))
        holds.append((exit_ - entry).days)
        pnls.append(float(c.get("pnl_pct") or c.get("return_pct") or 0))
        traded += float(c.get("entry_value") or 0) + float(c.get("exit_value") or 0)
        exits_by_ticker[c.get("ticker")].append(exit_)
    # re-entries: an entry within 14d of the same ticker's previous exit
    reentries = 0
    for c in closed:
        t, e = c.get("ticker"), d(c.get("entry_date"))
        reentries += any(0 < (e - x).days <= 14 for x in exits_by_ticker.get(t, []))
    navs = [p.get("nav") for p in led.get("nav_series", []) if p.get("nav")]
    avg_nav = statistics.fmean(navs) if navs else 100.0
    total_traded = float((led.get("summary") or {}).get("total_traded_value") or traded)
    buckets = defaultdict(list)
    for h, p in zip(holds, pnls):
        buckets["<=5d" if h <= 5 else "6-15d" if h <= 15 else ">15d"].append(p)
    summary[name] = {
        "round_trips": len(closed),
        "median_hold_days": statistics.median(holds) if holds else None,
        "reentries_within_14d": reentries,
        "total_traded_value": round(total_traded, 2),
        "cost_bps_of_nav": round(total_traded / avg_nav * COST_BPS, 1),
        "pnl_by_hold_bucket": {k: [round(statistics.fmean(v), 3), len(v)]
                               for k, v in sorted(buckets.items())},
        "win_rate": round(sum(p > 0 for p in pnls) / len(pnls), 3) if pnls else None,
    }
OUT.mkdir(exist_ok=True)
(OUT / "churn_summary.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")
print(json.dumps(summary, indent=1))
```

- [ ] **Step 3: Run it**

Run: `python docs/superpowers/audit/tools/churn_forensics.py`
Expected: per-ledger dict printed. Key numbers for the report: `cost_bps_of_nav` (the mechanical churn drag), `reentries_within_14d` (flip-flop count), and whether `pnl_by_hold_bucket` shows short holds losing (selling too fast) or winning.

- [ ] **Step 4: Cross-reference churn against verdict flips** — join `churn_summary` re-entered tickers with `verdict_flips.per_ticker_flips` (Task 2): what fraction of `equal_llm` round-trips trace to an RS2 verdict flip vs a band/eligibility change? A one-paragraph answer with the counts, in report §3.

- [ ] **Step 5: Write report §3** — question answers, churn table, findings (expected shape: churn cost P2 with a bps number, any rewind/dividend correctness issues P1, uncapped position count P2/P3).

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/audit
git commit -m "docs(audit): link 3 (ledger mechanics) findings + churn forensics"
```

---

### Task 5: Link 4 — Reconcile & execution

**Files:**
- Read: `scripts/sync_kis_portfolio.py`, `scripts/kis/client.py`, `scripts/kis/reconcile.py`, `scripts/kis/targets.py`, `scripts/kis/notify.py`, `.github/workflows/kis-sync.yml`, `docs/KIS_SYNC.md`, `tests/` equivalents (`scripts/test_kis_reconcile.py`, `scripts/test_kis_notify.py`)
- Create: `docs/superpowers/audit/tools/plan_sim.py`, `docs/superpowers/audit/tools/fetch_kis_trades.py`
- Modify: report §4, findings register

**Interfaces:**
- Consumes: ledger weights via live module `scripts/kis/targets.py` (imported read-only).
- Produces: `tools/out/plan_sim.json` (orders/warnings/cash-drag at NAV 20k/50k/200k) and `tools/out/kis_trades.json` (real fills, if Supabase keys available) — consumed by Tasks 6 and 7.

- [ ] **Step 1: Static read — answer in report §4** (cite lines)

1. **Unfilled-order abort:** the sync exits when *any* unfilled order is open. With one chained run per day, can a resting unfilled limit block all trading for days? What is the KIS US default time-in-force here — does an unfilled day order die at the close, or persist? Evidence from `docs/KIS_SYNC.md`/code comments; mark unresolved parts as an open question for the user.
2. **Partial fills / sells-first:** sell placed, 3-min fill wait expires, buys sized off `usd_cash()` — walk one worked example of a partial sell fill; does anything double-buy or strand cash until the next run? (Self-healing claim — verify.)
3. **Limit buffers:** ±0.3% marketable limits on every order — quantify the worst-case spread cost per round trip and reconcile with the tracker's 10 bps assumption.
4. **FX / 통합증거금:** trace the KRW-seeded path (`usd_cash` fallback, `KIS_ALLOW_MARGIN` refusal) — under which configs can the real account buy on collateral, and is the current config (per user: real, auto-execute) exposed?
5. **Actions chain:** enumerate every hop from `Scheduled Data Fetch` success → sync trades; for each hop, what happens on failure (fetch fails / ledger stale >5d / secrets wrong / runner dies mid-order-loop)? Which failures alert (Telegram) and which are silent?
6. **Rate/token limits:** token 1/min + per-account 1/sec on paper vs real — any retry path that could double-place an order (`_retry_rate_limited` claims rejects happen before action — verify that claim's evidence comment).

- [ ] **Step 2: Write the reconcile simulation** (imports the live pure function — read-only)

`docs/superpowers/audit/tools/plan_sim.py`:
```python
"""Feed compute_plan the CURRENT live targets at synthetic NAVs (20k/50k/200k)
using last_marks as prices. Answers: whole-share granularity, cash drag,
unaffordable names, order counts, spread cost at each scale. No network."""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent / "out"
sys.path.insert(0, str(ROOT / "scripts"))
from kis.reconcile import compute_plan                      # noqa: E402
from kis.targets import ledger_weights                      # noqa: E402

book = json.loads((ROOT / "public/data/paper_ledgers.json").read_text(encoding="utf-8"))
tgt = ledger_weights(book, "equal_llm", max_stale_days=3650)  # bypass staleness for sim
weights, marks = tgt["weights"], tgt["source_marks"]
LIMIT_BUFFER_RT = 0.006          # 0.3% buy + 0.3% sell buffers, round trip

res = {}
for nav in (20_000, 50_000, 200_000):
    plan = compute_plan(weights, held={}, sellable={}, prices=marks, cash=float(nav))
    invested = sum(o.est_value for o in plan.orders if o.side == "buy")
    res[str(nav)] = {
        "names_targeted": len(weights),
        "orders": len(plan.orders),
        "unaffordable": [w for w in plan.warnings if "can't afford" in w],
        "warnings_other": [w for w in plan.warnings if "can't afford" not in w],
        "invested": round(invested, 2),
        "cash_drag_pct": round(100 * (1 - invested / nav), 2),
        "est_spread_cost_usd_rt": round(invested * LIMIT_BUFFER_RT, 2),
    }
OUT.mkdir(exist_ok=True)
(OUT / "plan_sim.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk != "warnings_other"}
                  for k, v in res.items()}, indent=1))
```

- [ ] **Step 3: Run it**

Run: `python docs/superpowers/audit/tools/plan_sim.py`
Expected: three NAV blocks. Report the 20k block prominently: how many of the ~25 targets are unaffordable/1-share-lumpy, the cash drag, and spread cost per full rebuild.

- [ ] **Step 4: Write the real-fill fetcher** (skip gracefully if no keys)

`docs/superpowers/audit/tools/fetch_kis_trades.py`:
```python
"""Pull kis_trades rows from Supabase (read-only) to compare REAL fills
against paper assumptions. Never prints secrets. Skips if keys absent."""
import json, os, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent / "out"
env = {}
for fn in (".env.local", ".env"):
    p = ROOT / fn
    if p.exists():
        for line in p.read_text(encoding="utf-8", errors="ignore").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, _, v = line.partition("=")
                env.setdefault(k.strip(), v.strip().strip('"').strip("'"))
url = env.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = (env.get("SUPABASE_SERVICE_KEY") or env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
       or os.environ.get("SUPABASE_SERVICE_KEY"))
if not (url and key):
    print("SKIP: no supabase url/key found (record as open item)"); raise SystemExit(0)
req = urllib.request.Request(
    f"{url}/rest/v1/kis_trades?select=*&order=run_id.desc&limit=500",
    headers={"apikey": key, "Authorization": f"Bearer {key}"})
rows = json.loads(urllib.request.urlopen(req, timeout=30).read())
OUT.mkdir(exist_ok=True)
(OUT / "kis_trades.json").write_text(json.dumps(rows, indent=1), encoding="utf-8")
print(f"fetched {len(rows)} kis_trades rows -> out/kis_trades.json")
```

- [ ] **Step 5: Run it, then cross-check**

Run: `python docs/superpowers/audit/tools/fetch_kis_trades.py`
Expected: row count, or a clean SKIP. If rows exist: in report §4, tabulate — orders placed vs rejected (reject reasons!), realized limit prices vs ledger marks that day (real slippage per trade), run cadence, and confirm env/ledger fields say `real`/`equal_llm` (assumption §7.2 of the spec).

- [ ] **Step 6: Write report §4** — answers, sim table, real-fill table, findings. Expected candidates: resting-order deadlock (P1), spread-cost vs 10 bps mismatch (P2), silent chain failures (P1), margin exposure config (P0 if actually exposed).

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/audit
git commit -m "docs(audit): link 4 (reconcile/execution) findings + 20k plan sim + real fills"
```

---

### Task 6: Link 5 — Risk & philosophy coherence

**Files:**
- Read: `../Integrated stock-selection ecosystem.md` (theory doc, outer folder), `docs/superpowers/specs/2026-07-20-kis-pipeline-audit-design.md`, `scripts/build_portfolio_plan.py`, `scripts/build_momo_plan.py` (risk-machinery contrast), plus everything already read
- Modify: report §5, findings register

**Interfaces:**
- Consumes: `tools/out/plan_sim.json`, `tools/out/overlay_trace.json`, `tools/out/churn_summary.json`.
- Produces: the coherence matrix consumed by Task 8's executive summary.

- [ ] **Step 1: Build the coherence matrix in report §5** — one row per theory-doc principle, three columns: *principle → where implemented → where violated on the live path*. Cover at minimum: multi-stage funnel with veto layers; equal-weight/shrinkage (no fitted weights); themes/macro as context not alpha; LLM fed verified data only; fractional Kelly sizing; forward paper validation before capital; decay assumption (live ≈ half of backtest); position sizing vs 15% DD constraint.

- [ ] **Step 2: Document the four structural risk findings** with evidence and numbers:

1. **No DD enforcement on the live book** (`equal_llm` mirror) — plan3's `PLAN3_DD_*` machinery exists (`scripts/track_paper_portfolios.py` constants) but is paper-only; nothing in `sync_kis_portfolio.py` tracks peak NAV. Severity call: P0 by the spec's own definition (unbounded risk, no alert). Note: **already escalated to user in brainstorm 2026-07-20** — the report records it formally.
2. **Live strategy selected on ~2 weeks of data** — quantify: `equal_llm` observations vs any reasonable minimum-track-record; the 7-ledger survivor-picking risk (theory doc §H).
3. **Equal-weight-of-N with uncapped N at $20k** — join with `plan_sim.json` 20k numbers.
4. **Single-PC dependency for the live signal** (from Task 2) — restate as portfolio-level operational risk with the staleness-behavior evidence.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/audit
git commit -m "docs(audit): link 5 coherence matrix + structural risk findings"
```

---

### Task 7: Attribution verdict

**Files:**
- Create: `docs/superpowers/audit/tools/attribution.py`
- Modify: report §6, findings register

**Interfaces:**
- Consumes: `tools/out/churn_summary.json`, ledger book, `public/data/stocks.json` current prices.
- Produces: `tools/out/attribution.json` — the decomposition table consumed by Task 8.

- [ ] **Step 1: Write the attribution forensic**

`docs/superpowers/audit/tools/attribution.py`:
```python
"""Decompose each ledger's live-to-date excess vs IWM into:
selection (day-1 buy&hold counterfactual), trading delta (actual minus
counterfactual), and modeled cost drag. Honest caveat: 5 weeks of data
supports mechanical decomposition, not statistical signal claims."""
import json, statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent / "out"
book = json.loads((ROOT / "public/data/paper_ledgers.json").read_text(encoding="utf-8"))
stocks = json.loads((ROOT / "public/data/stocks.json").read_text(encoding="utf-8"))
px_now = {}
for s in (stocks if isinstance(stocks, list) else stocks.get("stocks", [])):
    t, p = s.get("symbol") or s.get("ticker"), s.get("price")
    if t and p: px_now[t] = float(p)
churn = json.loads((Path(__file__).parent / "out/churn_summary.json").read_text())

res = {}
for name in ("equal", "equal_llm", "plan", "plan_llm"):
    led = book["ledgers"].get(name)
    if not led: continue
    ns = led.get("nav_series", [])
    if len(ns) < 2: continue
    nav0, nav1 = ns[0], ns[-1]
    actual = nav1["nav"] / ns[0]["nav"] - 1
    iwm = (nav1["benches"]["IWM"] / nav0["benches"]["IWM"] - 1
           if nav0.get("benches") and nav1.get("benches") else None)
    # day-1 counterfactual: first-seen trades on inception date, held to now
    trades = led.get("trades", [])
    day0 = min((t.get("date") for t in trades if t.get("date")), default=None)
    day1_buys = [t for t in trades if t.get("date") == day0 and
                 str(t.get("side", t.get("action", ""))).lower().startswith("b")]
    rets = []
    for t in day1_buys:
        tick, px_in = t.get("ticker"), float(t.get("price") or 0)
        if tick in px_now and px_in > 0:
            rets.append(px_now[tick] / px_in - 1)
    hold_ret = statistics.fmean(rets) if rets else None
    cost_drag = (churn.get(name) or {}).get("cost_bps_of_nav")
    res[name] = {
        "actual_ret_pct": round(actual * 100, 2),
        "iwm_ret_pct": round(iwm * 100, 2) if iwm is not None else None,
        "excess_pct": round((actual - iwm) * 100, 2) if iwm is not None else None,
        "day1_holdings_priced": f"{len(rets)}/{len(day1_buys)}",
        "day1_buyhold_ret_pct": round(hold_ret * 100, 2) if hold_ret is not None else None,
        "trading_delta_pct": (round((actual - hold_ret) * 100, 2)
                              if hold_ret is not None else None),
        "modeled_cost_drag_bps": cost_drag,
    }
OUT.mkdir(exist_ok=True)
(OUT / "attribution.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
print(json.dumps(res, indent=1))
```
(Field names for trades again come from `trades_sample.json`; dividends/deposits are excluded from the counterfactual — state this as a stated approximation in the report.)

- [ ] **Step 2: Run it**

Run: `python docs/superpowers/audit/tools/attribution.py`
Expected: per-ledger decomposition. The verdict sentence per ledger: "of X% excess vs IWM, roughly S% is day-1 selection, T% is subsequent trading, C bps is modeled cost" + the honesty caveat.

- [ ] **Step 3: Stops pre-check scope note** — in report §6, state explicitly: max-favorable/adverse-excursion analysis (would stops have helped?) requires a daily per-ticker price panel; defer to Phase 2 replay (which builds one) rather than fake it from monthly closes. One paragraph, no analysis.

- [ ] **Step 4: Write report §6** with the table and verdict; add findings if attribution reveals any (e.g., trading delta strongly negative ⇒ reinforces churn P2).

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/audit
git commit -m "docs(audit): attribution verdict (selection vs trading vs costs)"
```

---

### Task 8: Assemble, self-review, deliver

**Files:**
- Modify: report §0, §7, §8, findings register (final ordering)

**Interfaces:**
- Consumes: everything.
- Produces: the finished audit report; the user-facing summary message.

- [ ] **Step 1: Fill §7 (assumptions & open questions)** — resolve or restate each spec-§7 assumption with what the audit found: tax residency (unverifiable locally — ask), live config (from kis_trades/jsonl evidence if found), commission tier (ask; note what real fills implied), overlay publish path (verified in Task 2). Add any new open items collected during Tasks 2–7.

- [ ] **Step 2: Fill §8 (method)** — files read per link, scripts + out artifacts, data windows, and the standing limitation paragraph (5-week record; what this audit can and cannot conclude).

- [ ] **Step 3: Finalize the findings register** — re-sort rows by severity then link; verify every F-NN in the body appears in the register and vice versa; verify every finding has evidence and a *proposed* fix labeled "proposal — requires user approval".

- [ ] **Step 4: Write §0 executive summary** — ≤ 400 words: trust verdict per link (sound / sound-with-findings / not-trustworthy), the attribution answer, the P0 list, and the recommended Phase 2/3 backlog ordering. No new claims — everything traceable to a section.

- [ ] **Step 5: Self-review pass** — reread the whole report checking: (a) every number traces to an out/ artifact or file:line; (b) no recommendation is phrased as an action taken; (c) severity calls match the taxonomy definitions; (d) no secrets or account numbers anywhere in the report or tools. Fix inline.

- [ ] **Step 6: Commit and deliver**

```bash
git add docs/superpowers/audit
git commit -m "docs(audit): phase-1 report complete"
```

Then send the report to the user with the P0/P1 list up front and ask for the Phase 1 exit-checkpoint decision (which findings advance to Phase 2/3).

---

## Plan Self-Review (completed at write time)

- **Spec coverage:** spec §4 links 1–5 → Tasks 2–6; attribution → Task 7; deliverable + escalation + assumptions → Tasks 1, 8 and the P0 global constraint; read-only rule → Global Constraints. Phase 2/3 are out of scope for this plan by design.
- **Placeholders:** none — every script is complete code; every read step has a fixed question set; expected outputs stated.
- **Type consistency:** out-artifact names (`ledger_schema.json`, `trades_sample.json`, `verdict_history.csv`, `verdict_flips.json`, `overlay_trace.json`, `churn_summary.json`, `plan_sim.json`, `kis_trades.json`, `attribution.json`) match between producing and consuming tasks; all scripts use `ROOT = parents[3]` consistently from `docs/superpowers/audit/tools/`.
- **Known adaptation point (explicit, not a placeholder):** JSON field names in forensic scripts must be reconciled against `trades_sample.json` (Task 1) before each run — the schema-inspection step exists precisely so no script runs on guessed fields.

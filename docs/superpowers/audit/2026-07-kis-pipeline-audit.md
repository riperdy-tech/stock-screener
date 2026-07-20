# KIS Pipeline Audit — Phase 1 Report

**Date started:** 2026-07-20 · **Auditor:** Claude (read-only engagement per spec 2026-07-20)
**Spec:** docs/superpowers/specs/2026-07-20-kis-pipeline-audit-design.md

## 0. Executive summary
(written last — Task 8)

## Findings register
| ID | Sev | Link | Title | Evidence |
|----|-----|------|-------|----------|
| F-01 | P2 | 1 | Verdict family instability (35.4%/re-analysis) drives live churn | verdict_flips.json; run_rs2.py:348-372 |
| F-02 | P1 | 1 | Orchestrator/publish failures alert nowhere off-machine; staleness = silent slow liquidation | orchestrate.py:108-115,518; score_factors.py:171 |
| F-03 | P3 | 1 | Single-machine dependency for the live signal | register_orchestrator_task.ps1; §1 Q5 |

## 1. Link 1 — RS2 verdict generation

**Files audited:** `RS2 Local/orchestrate.py`, `run_rs2.py`, `valuation_engine.py`, `register_orchestrator_task.ps1`, `RS2-Analyst.Modelfile`, plus git history of `public/data/llm_overlay.json` (via `tools/verdict_history.py`).

**Q1 — Trigger & PC-off behavior.** Windows Task Scheduler `RS2-Orchestrator`: daily 08:00 local + at-logon, `StartWhenAvailable` + `WakeToRun`, no time limit (`register_orchestrator_task.ps1:23-27`). If the PC stays off, the overlay in the repo simply stops updating; cloud-side, each verdict older than 14 days has its conviction shrunk toward neutral (`scripts/score_factors.py:171`), which progressively demotes names out of the LLM set — i.e., the live book **gradually liquidates to cash** on signal staleness. That direction is conservative (fail-closed), but it is **silent**: the only notification the user gets is the after-the-fact sell digests from the KIS Telegram. → **F-02**.

**Q2 — Publish path (spec assumption §7.4: VERIFIED).** `orchestrate.py` itself commits and pushes `llm_overlay.json` + `rs2/` reports, with push *verification*: 3 attempts, each preceded by `fetch` + `merge -X ours origin/main` to reconcile CI-driven divergence (`orchestrate.py:500-518`). Failure writes `::ERROR::` + `heartbeat: push_failed` — **local log/JSON only**. Overlay commits observed daily 2026-06-29 → 2026-07-20 (22 commits; `tools/out/verdict_flips.json.cadence_days`), so the path works in practice. Note: the push sends the whole branch, so any local commits ride along.

**Q3 — Determinism & re-analysis triggers.** Valuation is now **deterministic**: `valuation_backbone.py` owns base_cf/growth/WACC/IV — "the model NO LONGER guesses DCF inputs" (`run_rs2.py:34-41`), superseding the README's older LLM-picks-assumptions design. Nondeterminism remains in the *action/conviction*: parsed from sampled FINAL text (temperature 0.4, `RS2-Analyst.Modelfile`) and then passed through the deterministic "don't-chase brake" whose tiers switch at exact thresholds — realistic MoS ≥25 / 15–25 / <15, 52w-high proximity ≥0.98, price vs consensus median (`run_rs2.py:348-372`) — with **no hysteresis**, so a small price move re-tiers the action on the next cadence run. Re-analysis triggers: cadence (RN 7d / WL 14d), band shift, re-add, ≤3 retries, earnings-window one-shot (`orchestrate.py:124-137`), RN-drop exit review. **There is no large-price-move trigger** — a −20% day does not force a re-look until cadence.

**Q4 — Valuation guardrails.** Deterministic backbone (above); replacement-value floor (`valuation_engine.py:51`); option-value probability clamped [0,1] (`valuation_engine.py:59-64`); JSON assumption parse has a one-shot repair re-prompt (`run_rs2.py:205`). Sound.

**Q5 — Failure-mode inventory (Qwen → repo).** All fail closed, none alert remotely: Ollama down → wait 3 min → clean exit + heartbeat (`orchestrate.py:357-365`); stale `factor_scores.json` >48h → refuse to analyze (`:376-380`); stale/dead lock → take over (`:89-105`); crash mid-run → per-ticker state persisted, resumable (`:477`); ticker run fails → ≤3 retries next runs; push fails → 3 verified attempts then local `::ERROR::`. Sound machinery, silent surface. → feeds **F-02**.

**Forensic result — verdict oscillation (`tools/out/verdict_flips.json`):** 22 overlay snapshots, 214 tickers, 500 *re-analysis* transitions → **177 action-family flips (BULL↔HOLD↔BEAR) = 35.4% of re-analyses change family**. Top flippers: MEDP ×3, MPWR ×3, twenty-three names ×2. On the live book a family change is a trade (demotion leaves the LLM set → sell; promotion → buy), so at RN cadence (7d) the expected verdict half-life is ~2 re-analyses ≈ 2 weeks — consistent with the `equal_llm` ledger's observed ~6-day average holds. → **F-01**.

**Findings:**
- **F-01 (P2) — Verdict action-family instability is the live book's churn engine.** 35.4% family-flip rate per re-analysis (evidence above). Contributors: sampled SECTION-12 text at temp 0.4; brake tiers without hysteresis; weekly re-rolls. *Proposal (requires approval): verdict TTL + family-change confirmation (two consecutive same-direction verdicts before acting) or brake hysteresis bands.*
- **F-02 (P1) — Orchestrator/publish failures alert nowhere off-machine.** Heartbeat + `::ERROR::` are local; staleness manifests as slow silent liquidation via conviction decay. Not P0: fail direction is de-risking and KIS sell digests do eventually surface it. *Proposal: reuse the existing KIS Telegram creds for orchestrator heartbeat alerts ("no successful run in 24h / push failed").*
- **F-03 (P3) — Single-machine live-signal dependency** (PC + Ollama + GPU + repo sync). Well-mitigated locally (locks, retries, resume, WakeToRun) but a hardware failure stalls the strategy into decay-liquidation. Acceptable at $20k; flagged for the scaling roadmap.

**Sound (verified, no finding):** factor-freshness guard (48h) prevents analyzing stale bands; resumable per-ticker state; earnings-window cache-bust forces post-earnings re-research; RN-drop **exit reviews** keep SELL/TRIM calls flowing for held names 30 days after they leave the list (`orchestrate.py:248-259`); hard-vetoed names are retired without wasting a run; RS2's own RN picks get accelerated 7d cadence so they can't stale-decay out (`orchestrate.py:184-199`).

## 2. Link 2 — Overlay → factor guardrail

## 3. Link 3 — Ledger mechanics & churn forensics

## 4. Link 4 — Reconcile & execution

## 5. Link 5 — Risk & philosophy coherence

## 6. Attribution verdict

## 7. Assumptions & open questions for the user

## 8. Method & environment

- **Environment:** Windows 11, Python 3.12.10 (system `python`), git @ `e211748487` (audit start). All forensic tools in `tools/`, stdlib-only, read-only; outputs in `tools/out/` (gitignored).
- **Ledger schema (observed via `tools/inspect_ledgers.py`):**
  - `ledgers.{name}.closed[]`: `ticker, entry_date, entry_price, exit_date, exit_price, hold_days, return_pct, post_exit_days(=30), post_exit_return_pct` — the tracker already records 30-day post-exit forward returns.
  - `ledgers.{name}.trades[]`: `date, side, ticker, price, value, reason` (value in NAV points; reasons like `entered_rank`).
  - `ledgers.{name}.state`: `cash, holdings{}, units`; plus `nav_series[]` with per-day `nav` and `benches{IWM,SPY,QQQ,SOXX,DRAM}`.
- **Plan deviation log:** forensic scripts use `ROOT = parents[4]` (the plan's `parents[3]` was one level short — mechanical fix, no scope change).
- **Data window caveat:** ledger inception 2026-06-12 → 2026-07-19 (~26 trading days). Mechanical decomposition is meaningful; statistical claims about signal quality are not.

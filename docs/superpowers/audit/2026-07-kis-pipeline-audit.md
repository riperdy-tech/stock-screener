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
| F-04 | P2 | 2 | Hard MoS/conviction boundaries, no hysteresis → mechanical set churn; sells strength | score_factors.py:244-246; §2 |
| F-05 | P3 | 2 | WL tier still classifies free action text ("accumulate on weakness" = bullish) | score_factors.py:187,210; run_rs2.py:369 |

## 1. Link 1 — RS2 verdict generation

**Files audited:** `RS2 Local/orchestrate.py`, `run_rs2.py`, `valuation_engine.py`, `register_orchestrator_task.ps1`, `RS2-Analyst.Modelfile`, plus git history of `public/data/llm_overlay.json` (via `tools/verdict_history.py`).

**Q1 — Trigger & PC-off behavior.** Windows Task Scheduler `RS2-Orchestrator`: daily 08:00 local + at-logon, `StartWhenAvailable` + `WakeToRun`, no time limit (`register_orchestrator_task.ps1:23-27`). If the PC stays off, the overlay in the repo simply stops updating; cloud-side, each verdict older than 14 days has its conviction shrunk toward neutral (`scripts/score_factors.py:171`), which progressively demotes conviction-gated names out of the LLM set — i.e., most of the live book **gradually liquidates to cash** on signal staleness (deep-value names with live-price MoS ≥30% persist regardless of staleness — see §2). That direction is conservative (fail-closed), but it is **silent**: the only notification the user gets is the after-the-fact sell digests from the KIS Telegram. → **F-02**.

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

**Files audited:** `scripts/score_factors.py` (bands/vetoes/`apply_llm_overlay`, lines 159-266, 395-412); snapshots `public/data/llm_overlay.json` + `factor_scores.json` (2026-07-19) via `tools/overlay_trace.py`.

**Q1 — Thresholds (exact).** LLM research_now requires NOT-bearish AND (live-MoS ≥30 [“deep value”], OR conviction ≥9.5 AND (live-MoS ≥15 OR entry_timing=="buy")) — a *structured* gate (`score_factors.py:244-246`), deliberately not keyed on action text after an earlier over-promotion bug (docstring `:190-193`). Bullish + conviction ≥8 → watchlist percentile 90–96.9. Bearish (AVOID/SELL/REDUCE/TRIM/EXIT/SHORT or stance=overvalued) → demoted below RN; hard AVOID/SELL/SHORT additionally sets `fct_llm_veto='llm_reject'` (`:247-252`).

**Q2 — Staleness & absence semantics.** Verdicts >14d: conviction shrinks 50% toward neutral 9.0 in one step (`:230-231`) — binary, not progressive. Consequence: conviction-gated names decay out of the set; **deep-value names (live MoS ≥30) are staleness-immune** and would persist indefinitely on a dead orchestrator (with a fair value frozen at last analysis). Overlay file absent/corrupt → `return 0`, STRICT NO-OP verified (`:174-179`): no `fct_band_llm` is written at all. What the *ledger* does when LLM bands vanish wholesale is the decisive question — answered in §3 (source-health gates).

**Q3 — Veto integrity: HOLDS, structurally and empirically.** Vetoes (`reverse_engine_reject`, `forensic_pair`, `heavy_issuance`) are assigned during scoring (`:401-409`), before the overlay runs (`:455-457`); the overlay has a single entry choke point — `if not e or e.get("fct_veto") is not None: continue` (`:203`) — so a vetoed name can never receive an LLM band by any path. Unscorable-but-unvetoed names keeping their verdict is by design (red-flag filter, not coverage filter, `:199-204`). Empirically (`tools/out/overlay_trace.json`): 171 RS2 names, 0 currently vetoed, **0 anomalies** (no veto bypass, no hard-sell inside the RN set). Today's live LLM set: **23 research_now**, 16 watchlist, 49 demoted, 1 llm_reject, 0 stale — RS2 is a heavy filter (23/171 ≈ 13%) on the quant nominations.

**Q4 — Live-price MoS recompute.** `fair_value / latest_close − 1` daily (`:236-242`) — well-designed freshness (a +30% rally no longer trades on a stale “cheap” claim). Uses `price_history.json` last close; a stale price file silently degrades the MoS input (minor; price fetch failures already gate the chain elsewhere).

**Findings:**
- **F-04 (P2) — Hard MoS/conviction boundaries with daily-moving inputs = a second mechanical churn engine.** RN membership flips when live MoS crosses 15 (or 30, or conviction crosses 9.5 after staleness shrink) with **no hysteresis and no confirmation delay** (`:244-246`). A name near a boundary oscillates in/out of the live set on ordinary price noise; note this also *sells strength mechanically* (a rally pushes MoS below 15 → demotion → sell). Together with F-01 (35.4% verdict family flips) this fully accounts for a conviction book averaging ~6-day holds. *Proposal: hysteresis bands (enter ≥15, exit <10; enter ≥9.5 conv, exit <8.5) and/or N-day membership confirmation.*
- **F-05 (P3) — Residual free-text keyword classification in the WL tier.** “Hold / accumulate on weakness (do not chase)” (a brake tier-3 HOLD, `run_rs2.py:369`) contains “ACCUMULAT” → classified bullish (`score_factors.py:187,210`); with conviction ≥8 it lands watchlist. RN is protected by the structured gate; impact limited to WL-tier optics and the orchestrator’s WL cadence. *Proposal: classify on the structured `entry_timing`/`stance` fields instead of action text.*

**Sound (verified):** single choke-point veto (structural + empirical); STRICT NO-OP on missing overlay; daily live-price MoS; structured RN gate (the historic text-keyword over-promotion is already fixed); exit-review verdicts flow through with a UI badge (`:218-224`).

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

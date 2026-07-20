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
| F-06 | P1 | 3 | Live-book turnover ≈15–35× NAV/yr → double-digit real cost drag at KIS fees | churn_summary.json; §3 |
| F-07 | P2 | 3 | Quant equal: 25/49 round trips are ≤14d re-entries (boundary flip-flops) | churn_summary.json |
| F-08 | P2 | 3 | Falling-knife entries: quant 6–15d holds avg −11 to −14% (hypothesis-grade, small n) | churn_summary.json |
| F-09 | P3 | 3 | Universe-dropout names carried forever (no exit path); stale exit_pending entries | track_paper_portfolios.py:326-330,1026 |

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

**Files audited:** `scripts/track_paper_portfolios.py` (core paths: `run_target_ledger:325-430`, health gates `:612-653`, equal/equal_llm orchestration `:940-1037`, buy/sell/trim/dividends/rewind `:238-322`); forensics via `tools/churn_forensics.py`.

**Q1 — What sells a held `equal_llm` name.** The target set is `fct_band_llm == "research_now"` minus `llm_reject`, equal-weighted over `max(N, 8)` (`:1026-1031`). A held name sells when it leaves that set on **2 consecutive evaluated daily runs** (exit grace `:352-370`) — the grace kills 1-day flaps but is powerless against verdict flips, which persist ~7 days until the next RS2 cadence run (F-01), and against multi-day MoS boundary crossings (F-04). Silence is handled correctly: `llm_overlay_applied` false → whole book held with a warn banner (`:1014-1024`); a held name missing `fct_band_llm` → carried as unevaluated, never sold, and its exit-arm is cleared so grace counts only evaluated misses (`:366-370`). The 2026-06-30/07-05 phantom-departure incidents (19 and 57 spurious exits) were root-caused to silence-as-verdict and are genuinely fixed.

**Q2 — Funding, dividends, idempotency.** Entrants fund at **full target weight or defer loudly** (`ENTRY_FUND_TOL=0.90`, `:410-427`) — correct, self-healing. Dividends are Approach-B total return credited to pre-rebalance ex-date holders, replay-safe (`:287-309`). Same-day rewind restores opening state and strips the day's trades/closed/dividends (`:312-322`); `exit_pending` arming is rerun-deterministic. Verified sound by code path; no double-count route found.

**Q3 — Cost model.** 10 bps **per side** via `cost_factor()` in buy/sell/trim/top-up (`:211-212` et al.). Omits: KIS commission, the ±0.3% marketable-limit crossing, actual spread, FX. Real-fill comparison in §4.

**Q4 — Set construction.** `equal` = quant `research_now` equal-weight; `equal_llm` as above. **No position-count cap** — N floats with the band (today 23; `equal` holds 53). At $20k this collides with whole shares (§4 sim).

**Forensics (`tools/out/churn_summary.json`), inception → 2026-07-19:**

| Ledger | Round trips | Median hold | Re-entries ≤14d | Turnover ×NAV | Cost @10bps | Mean closed | Win rate | 6–15d bucket |
|---|---|---|---|---|---|---|---|---|
| equal (5wk) | 49 | 5d | **25** | 2.72× | 27 bps | **−4.60%** | 30.6% | −10.84% (n=13) |
| equal_llm (2wk, LIVE) | 12 | 6d | 2 | **2.29×** | 23 bps | **+1.72%** | 66.7% | +3.05% (n=6) |
| plan (5wk) | 16 | 7d | 8 | 1.41× | 14 bps | −6.08% | 31.2% | −14.06% (n=7) |
| plan2 (5wk) | 35 | 5d | 17 | 2.40× | 24 bps | −4.72% | 28.6% | −11.01% (n=9) |
| plan_llm (2wk) | 18 | 4d | 4 | 1.53× | 15 bps | +0.24% | 44.4% | +0.90% (n=7) |
| plan2_llm (2wk) | 22 | 4d | 5 | 1.69× | 17 bps | +2.07% | 54.5% | +4.82% (n=9) |

Context: over this window IWM was roughly flat (292.3→294.0) — the quant losses are **not** market beta.

**Findings:**
- **F-06 (P1) — Live-book turnover is a real-money leak an order of magnitude beyond what paper shows.** `equal_llm` traded 2.29× NAV in 2 weeks (~1.31× beyond the one-time buy-in ⇒ steady-state ≈ **15–35× NAV/yr**). At the paper model (10 bps/side) that's ~3–4%/yr; at plausible real KIS cost per side (commission + the ±0.3% limit-buffer crossing + spread ≈ 0.4–0.6%) it extrapolates to **double-digit %/yr drag** — enough to consume any plausible alpha. Mechanism = F-01 (verdict flips) + F-04 (boundary crossings) surviving the 2-run grace. *Real-fill verification in §4; proposals live under F-01/F-04 (TTL, hysteresis, confirmation) plus rebalance-cadence reduction.*
- **F-07 (P2) — Quant `equal` flip-flops: 25 of its 49 round trips re-entered the same name within 14 days.** Band-boundary noise round-trips paying 2 sides each; the ledger-side grace is insufficient because signal-side crossings persist >2 runs. (Same root as F-04; kept separate because it's measured on the quant band, not the LLM path.)
- **F-08 (P2, hypothesis-grade) — Quant nominations enter falling knives.** The 6–15d hold bucket averages −10.8% to −14.1% across quant ledgers (n=13/7/9) while the LLM variants' same bucket is positive — consistent with RS2's entry-timing/MoS gates filtering names in active drawdown that the quant band nominates. Small n, one 5-week window: flag for a Phase 3 pre-registered test, **not** a conclusion.
- **F-09 (P3) — Zombie-position path.** A held name that vanishes from `factor_scores.json` entirely (universe drift, data drop) is permanently "unevaluated" → carried forever with stale marks; no exit path except manual. Related hygiene: `exit_pending` entries for already-sold names persist indefinitely (harmless — only consulted for held names).

**Sound (verified):** input-side health gates (content age 36h, scored-count collapse ratio, empty-set-while-holding, overlay_on flag); silence≠verdict discipline; exit grace; full-fund-or-defer; Approach-B dividends; idempotent rewind; unitized `mine` ledger (deposits can't fake performance).

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

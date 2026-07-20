# KIS Pipeline Audit — Phase 1 Report

**Date started:** 2026-07-20 · **Auditor:** Claude (read-only engagement per spec 2026-07-20)
**Spec:** docs/superpowers/specs/2026-07-20-kis-pipeline-audit-design.md

## 0. Executive summary

**Trust verdict per link** (sound / sound-with-findings / not-trustworthy):
- **RS2 verdict generation — sound-with-findings.** Deterministic valuation backbone, verified publish path, defensive ops. But verdicts flip action family on **35.4% of re-analyses** (the churn engine), and every failure mode alerts only on the local PC.
- **Overlay → guardrail — sound.** The quant veto cannot be bypassed (structural + empirical proof). Design flaw, not integrity flaw: hard MoS/conviction boundaries with daily-moving inputs and no hysteresis.
- **Ledger mechanics — sound machinery, harmful emergent behavior.** Health gates, idempotency, silence≠verdict are all genuinely well-built. Emergent result: the live strategy turns over **≈2.3× NAV in 2 weeks**.
- **Reconcile & execution — sound engineering, wrong scale fit.** Layered real-money gates, self-healing reconciliation, 0.5% cash drag at every scale ≥$20k. But the real account is **$9k running 25 names with 6–12 orders/day** and chronic "insufficient settled cash" skips.
- **Risk architecture — not trustworthy as a system.** Every risk layer that exists (macro de-risk, trailing stops, DD kill tiers) lives on a ledger that *doesn't* hold the money; the ledger that does (`equal_llm`) has none of them.

**Attribution (mechanical, small-window):** the quant flagship's −2.86% vs IWM came −0.25% from day-1 picks and **−2.00% from its own subsequent trading** (falling-knife entries + boundary flip-flops; modeled fees only −27 bps of it). The LLM overlay improved both components (+2.21% vs IWM, 67% win rate — 2 weeks, encouraging but not validated). Exits are fine; **entries and churn are the damage**.

**P0:** F-12 — the user's hard DD ≤ 15% constraint is enforced nowhere on the live path. **P1:** F-02 (silent ops failures), F-06 (turnover ≈15–35× NAV/yr ⇒ double-digit real-cost drag), F-10 ($9k × 25 names × daily churn), F-13 (live capital on 2 weeks of evidence).

**Recommended backlog order (all changes need approval):**
1. **Phase 2 risk engine** (F-12/F-14) — simulation-validated DD tiers + kill switch on whatever ledger is mirrored.
2. **Churn triad** (F-01+F-04+F-06) — verdict TTL/confirmation, boundary hysteresis, weekly sync cadence. Biggest expected-profit lever; attacks fees, taxes, and the measured −2% timing drag at once.
3. **NAV-aware position count** (F-10) — concentrate to ~NAV/$1,000 highest-conviction names until funding grows.
4. **Ops alerting** (F-02) — reuse the KIS Telegram for orchestrator heartbeat.
5. **Scaling gates** (F-13) — pre-agreed evidence milestones before each new tranche.
6. **Phase 3 hypotheses** (F-08 knife-filter, sizing sleeve from §6.3) — pre-registered paper A/Bs.

## Findings register
All proposed fixes are **proposals — every change requires user approval** (read-only engagement).
Severity note: F-06/F-10 are performance-leak class (taxonomy P2) and F-13 is process-drift class (taxonomy P3), all **promoted to P1 for magnitude** — real-fee drag and real capital at stake make them first-order.

| ID | Sev | Link | Title | Evidence |
|----|-----|------|-------|----------|
| F-12 | **P0** | 5 | Hard DD ≤ 15% constraint enforced nowhere on the live path; no kill switch on US sync | track_paper_portfolios.py:83-91; §5 |
| F-02 | P1 | 1 | Orchestrator/publish failures alert nowhere off-machine; staleness = silent slow liquidation | orchestrate.py:108-115,518; score_factors.py:171 |
| F-06 | P1 | 3 | Live-book turnover ≈15–35× NAV/yr → double-digit real cost drag at KIS fees | churn_summary.json; §3 §4 |
| F-10 | P1 | 4 | $9k real NAV × 25 names × daily churn: chronic partial mirror + realized commissions | kis_trades.json; plan_sim.json |
| F-13 | P1 | 5 | Live capital allocated on ~2 weeks of evidence (survivor-picking risk across 7 ledgers) | §5; churn_summary.json |
| F-01 | P2 | 1 | Verdict family instability (35.4%/re-analysis) drives live churn | verdict_flips.json; run_rs2.py:348-372 |
| F-04 | P2 | 2 | Hard MoS/conviction boundaries, no hysteresis → mechanical set churn; sells strength | score_factors.py:244-246; §2 |
| F-07 | P2 | 3 | Quant equal: 25/49 round trips are ≤14d re-entries (boundary flip-flops) | churn_summary.json |
| F-08 | P2 | 3 | Falling-knife entries: quant 6–15d holds avg −11 to −14% (hypothesis-grade, small n) | churn_summary.json |
| F-11 | P2 | 4 | One resting order halts the daily sync; KIS-unlisted names = permanent mirror gaps | sync_kis_portfolio.py:256-261; KIS_SYNC.md:94-99 |
| F-14 | P2 | 5 | Live book bypasses every existing risk layer (macro de-risk, stops, kill tiers) | §5 matrix |
| F-03 | P3 | 1 | Single-machine dependency for the live signal | register_orchestrator_task.ps1; §1 Q5 |
| F-05 | P3 | 2 | WL tier still classifies free action text ("accumulate on weakness" = bullish) | score_factors.py:187,210; run_rs2.py:369 |
| F-09 | P3 | 3 | Universe-dropout names carried forever (no exit path); stale exit_pending entries | track_paper_portfolios.py:326-330,1026 |
| F-15 | P3 | 5 | Dormant IC-recalibration machinery contradicts adopted equal-weight decision | factor-recalibration.yml |

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

**Files audited:** `scripts/sync_kis_portfolio.py`, `scripts/kis/{client,reconcile,targets,notify}.py`, `.github/workflows/kis-sync.yml`, `docs/KIS_SYNC.md`; forensics `tools/plan_sim.py` (granularity at 20k/50k/200k) + `tools/fetch_kis_trades.py` (real fills from Supabase).

**Live-config verification (spec §7.2): CONFIRMED REAL.** `kis_trades` holds 28 rows, all `env="real"`, three consecutive daily execute runs (2026-07-15/16/17, ~13:01 ET — mid-session as designed). **Real account NAV ≈ $9,039, cash ≈ $275** at the 07-17 run.

**Q1 — Unfilled-order abort.** Any open unfilled order aborts the whole run before planning (`sync_kis_portfolio.py:256-261`) — correct for double-order safety, but **global**: one resting limit costs the entire book its daily sync. Bounded in practice because the ±0.3% marketable limits are day orders that expire at the close (`docs/KIS_SYNC.md:94-96` "let them expire, next run reconciles"), so worst case ≈ one lost day per stuck order. → folded into **F-11**.

**Q2 — Partial fills / sells-first: self-heals, but real data shows chronic starvation.** Sells place first, up to 3-min fill wait, buys budgeted from live `usd_cash()` (`:314-347`). In the real rows, **PTC, CRUS, CLS were skipped "insufficient settled cash" on two consecutive days** — the mirror is persistently incomplete at this NAV; deltas roll forward daily (no double-ordering observed — reconcile-to-weights holds). → **F-10**.

**Q3 — Real cost per side.** Marketable-limit crossing ±0.3% + documented real commission "~25 bps + FX spread" (`docs/KIS_SYNC.md:84-85`) ⇒ realistic all-in ≈ **0.4–0.6%/side ≈ 5× the paper model's 10 bps**. Applied to §3's measured turnover, **F-06 is confirmed as a real, first-order leak**: at the observed 6–12 orders/day on a $9k book (~20–30% NAV/day traded in the buy-in/churn phase), cost drag is on the order of 0.1–0.2% of NAV *per day* while churn persists.

**Q4 — FX / margin.** `usd_cash()` prefers the plain USD deposit and deliberately ignores the levered `frcr_ord_psbl_amt1`; a real account with zero deposit refuses to trade on collateral without `KIS_ALLOW_MARGIN=1` (`client.py:297-315`, `sync:246-254`). Real rows show a positive cash deposit being spent down — no margin path observed. **Sound.**

**Q5 — Actions-chain failure modes.** Chained run requires fetch success (`kis-sync.yml:64`); stale ledger >5d refuses (`targets.py:81-84`); zero-priced-tickers refuses (`sync:269-272`); every-order-rejected exits nonzero so a misprovisioned account cannot look green (`sync:384-387`); Telegram digest fires only after a real execute. Silent branch: if the *fetch* fails, the sync never runs and nothing alerts (GitHub email only). Acceptable-with-note.

**Q6 — Rate/token limits & double-order risk.** EGW00201 retries are safe by KIS semantics (rejection precedes action, `client.py:103-110`) and, decisively, the layer above is reconcile-to-weights: even a phantom fill cannot compound because the next run plans from actual holdings. **Sound.**

**Granularity sim (`tools/out/plan_sim.json`, buy-in mode, current 25-name set, price range $12.81–$370.83):** at $20k/$50k/$200k — 25 orders, zero unaffordable names, zero forced single-share positions, **cash drag ~0.5% at every scale** (largest-remainder apportionment works as designed), spread cost of a full round-trip rebuild ≈ 0.6% of invested. Granularity is a **non-issue at ≥$20k**; the observed pain is specific to the current **$9k NAV × 25 names × daily churn** combination.

**Findings:**
- **F-10 (P1) — The real book cannot faithfully hold its target set at current NAV, and churns hard while failing.** $9k NAV ⇒ ~$390/slot vs share prices up to ~$370; whole-share lumps + settled-cash timing leave persistent underweights (PTC/CRUS/CLS skipped 2 days running), while 6–12 orders/day realize real commissions on every reshuffle. *Proposal: scale position count with NAV (e.g., N ≤ NAV/$800–1,000, concentrating highest-conviction names), and/or reduce sync cadence to weekly + event-driven until NAV grows.*
- **F-11 (P2) — Single resting order halts the whole daily sync; KIS-unlisted small caps create permanent mirror gaps.** Both bounded (day-order expiry; persistent-reject names logged every run per `docs/KIS_SYNC.md:97-99`) but at daily cadence each costs tracking error. *Proposal: cancel-and-replace stale resting orders at run start (cancel API already exists, `client.py:413-432`); maintain an explicit exclude-list for KIS-untradable names so the ledger and account agree on the investable set.*

**Sound (verified):** dry-run default + layered real gates (`--confirm-real`, `REAL MONEY` phrase, split secrets); concurrency group prevents overlapping syncs; loud zero-fill failure; Hamilton apportionment (0.5% cash drag at all scales); exchange-map caching; reconcile idempotence as the structural double-order backstop.

## 5. Link 5 — Risk & philosophy coherence

**Reference:** the theory doc (`../Integrated stock-selection ecosystem.md`) vs what actually runs on the live path (equal_llm → KIS).

| Theory-doc principle | Where implemented | Where violated on the live path |
|---|---|---|
| Multi-stage funnel; weak layers are vetoes/context, not alpha | Chain → Factor Lab → RS2 → guardrail; veto choke point (§2) | — intact |
| Equal-weight robust factors; no fitted weights | **Implemented:** `factor_lab_v2_equal`, scheme `equal_weight_robust5` (0.2×5, theme dropped from composite) | Recalibration workflow (`factor-recalibration.yml`) still alive — dormant contradiction, config ambiguity only |
| Combine slow signals with fast to **reduce turnover** | — | **Violated in effect:** 7d verdict re-rolls, hard boundaries, daily rebalance ⇒ 15–35× NAV/yr (F-01/F-04/F-06) |
| Macro/regime as risk layer ("sin a little") | `build_portfolio_plan.py` macro de-risk (halve sizing at ≥2 flags) | **`equal_llm` bypasses it entirely** — the live book has no macro layer (F-14) |
| LLM fed verified data only; never recalls financials | RS2 pipeline: screener-fed data, deterministic valuation backbone | — intact (strongest link) |
| Fractional Kelly sizing | `plan` ledger (quarter-Kelly, capped) | Live book is equal-weight — a deliberate A/B choice, but sizing science idles while real money trades |
| Forward paper validation **before** capital; minimum track record | Ledger system exists and is honest | **Violated:** live selection (equal_llm) was made on ~10 trading days of paper data (F-13) |
| Assume decay; validate with deflated statistics | No backtest overclaims anywhere (honest) | Dashboard shows raw Sharpe on 14–36 observations — decorative, not decision-grade; no minimum-track gate guards the ledger-picking decision |
| Position sizing respects a drawdown budget | plan3 only (tiers −15/−20/−25, paper) | **Violated: no DD enforcement anywhere on the live path** (F-12) |

**Structural findings:**
- **F-12 (P0, formally recorded — already escalated to the user during the 2026-07-20 brainstorm) — The user's hard constraint (max DD ≤ 15%) is enforced nowhere on the live path.** `PLAN3_DD_*` machinery exists (`track_paper_portfolios.py:83-91`) but is paper-only and plan3-only; `sync_kis_portfolio.py` tracks no peak NAV and has no halt flag; there is no manual kill switch on the US sync (the KOSPI project's KILL_SWITCH pattern was never ported). A 2020/2022-shaped market takes this book to −30%+ with no mechanical response. *Disposition: this is Phase 2's entire mandate (spec §5) — risk engine, simulation-validated, then wired with approval.*
- **F-13 (P1) — Live capital was allocated on ~2 weeks of evidence, against the system's own validation philosophy.** equal_llm went live with ~10 trading days of paper history (14 nav observations); with 7 ledgers running, picking the best-looking one is survivor-picking the theory doc (§H) explicitly warns against. The *decision* may still be right (selection quality signs are real — §3, §6); the *process* violated the standard. *Proposal: define scaling gates (spec §6 governance) so further tranches wait for pre-agreed evidence; do not add capital on green weeks alone.*
- **F-14 (P2) — The live book bypasses every risk layer that exists elsewhere in the system.** Macro de-risk lives only in `plan`; stops/kill-switch only in plan3; the book actually holding money (`equal_llm` mirror) has none of them. The system's risk engineering and its capital are in different places. *Disposition: same as F-12 — the Phase 2 risk engine must attach to whatever ledger is mirrored, not to a specific strategy.*
- **F-15 (P3) — Dormant IC-calibration machinery contradicts the adopted equal-weight philosophy.** `factor-recalibration.yml` + `calibrate_factor_weights.py` still exist and could silently reintroduce fitted weights. *Proposal: disable or clearly mark decision-of-record.*

## 6. Attribution verdict

**Method (`tools/attribution.py` → `tools/out/attribution.json`):** actual ledger return vs a *day-1 buy-&-hold counterfactual* (the inception-day basket, equal-weight, marked at current prices). `trading delta = actual − counterfactual` isolates what all subsequent trading added or destroyed. Approximations: counterfactual excludes dividends and the cash residual; windows differ per ledger (equal 5wk, `*_llm` 2wk).

| Ledger | Window | Actual | IWM | Excess | Day-1 B&H | **Trading delta** | Modeled cost |
|---|---|---|---|---|---|---|---|
| equal | 6/12→7/19 | −2.24% | +0.61% | **−2.86%** | −0.25% | **−2.00%** | −27 bps |
| equal_llm (LIVE) | 7/05→7/19 | +1.02% | −1.19% | **+2.21%** | +0.72% | **+0.30%** | −23 bps |
| plan | 6/12→7/19 | −1.33% | +0.61% | −1.94% | −2.68% | +1.35% | −14 bps |
| plan2 | 6/14→7/19 | −3.27% | +0.37% | −3.64% | −3.05% | −0.22% | −24 bps |
| plan_llm | 7/05→7/19 | −0.35% | −1.19% | +0.84% | −0.26% | −0.10% | −15 bps |
| plan2_llm | 7/05→7/19 | +0.69% | −1.19% | +1.88% | +0.95% | −0.26% | −17 bps |

**Verdict (mechanical, window-limited):**
1. **The quant flagship (`equal`) was hurt by its own trading, not its day-1 picks.** Of −2.86% vs IWM, the inception basket explains −0.25%; **−2.00% came from post-day-1 trading** — mid-period entries that immediately fell (F-08 falling knives) and boundary flip-flops (F-07), of which only ~27 bps is modeled fee; the rest is adverse *timing*. The churn engine isn't just a future fee problem (F-06) — it already destroyed ~2% in five paper weeks.
2. **The LLM overlay improved both components**: positive selection (+0.72% while IWM fell 1.19%) *and* positive trading delta (+0.30%), with 67% closed-trade win rate. Consistent across all three `_llm` variants (excess +0.84% to +2.21%). **Two weeks of data — an encouraging sign, not a validated edge** (F-13 stands).
3. **`plan`'s sizing layer added value on the same picks** (+1.35% trading delta from Kelly caps/trims) while its narrower selection hurt — weak evidence that the sizing science idling outside the live path (§5) has something to contribute.
4. **Costs at paper's 10 bps are NOT the realized story** (14–27 bps) — the realized damage was timing; the *prospective* danger is the same turnover at real ~0.4–0.6%/side (F-06/F-10).

**Stops pre-check (scope note):** testing whether per-position trailing stops would have helped requires max-favorable/adverse-excursion paths, i.e. a daily per-ticker price panel. Deferred to the Phase 2 replay harness (which builds that panel) rather than faking it from monthly closes. The one available proxy — 30-day post-exit returns (§3) — shows quant exits were roughly neutral (mean +0.41%, 36% bounce rate on n=11): no evidence the system sells winners too early; the damage is on the *entry* side.

## 7. Assumptions & open questions for the user

**Resolved by the audit:**
- **Spec §7.2 (live config):** VERIFIED real — `kis_trades` shows `env="real"`, three consecutive weekday executes at ~13:01 ET (chained cadence ⇒ `KIS_AUTO_EXECUTE=true`); traded tickers (UFPT/SAP/PTC/CRUS/CLS/SENEB…) match the equal_llm set. Residual: eyeball the repo variables once to confirm `KIS_LEDGER=equal_llm` formally.
- **Spec §7.4 (overlay publish path):** VERIFIED — orchestrator commits/pushes with verification; daily cadence observed since 2026-06-29 (§1).

**Open questions (user input needed):**
1. **Tax residency & bracket.** Assumed: Korean tax resident ⇒ overseas-stock capital gains ~22% on *realized* net gains above ₩2.5M/yr. At ~6-day holds, every gain realizes immediately — churn is a tax leak on top of fees. Confirm residency so Phase 3's metric can be after-tax.
2. **Actual KIS commission + FX.** The doc says ~25 bps; promos as low as ~7–9 bps exist. What is this account's actual overseas commission schedule, and is KRW→USD conversion manual or automatic (and at what spread)? Needed to pin F-06's real number.
3. **Account funding plan.** The real account shows **$9,039 NAV** vs the stated "initially $20k+". Is further funding imminent? F-10's urgency depends on it (at $20k+ the granularity pressure halves; the churn problem remains).
4. **KIS-untradable names.** Confirm whether any current target names persistently reject (GRDN/JLHL/WILC-class); if so they should be excluded upstream (F-11).
5. **PC uptime pattern.** How often is the RS2 machine off/asleep past 08:00? Determines how much F-02/F-03 matter in practice.

## 8. Method & environment

- **Environment:** Windows 11, Python 3.12.10 (system `python`), git @ `e211748487` (audit start). All forensic tools in `tools/`, stdlib-only, read-only; outputs in `tools/out/` (gitignored).
- **Ledger schema (observed via `tools/inspect_ledgers.py`):**
  - `ledgers.{name}.closed[]`: `ticker, entry_date, entry_price, exit_date, exit_price, hold_days, return_pct, post_exit_days(=30), post_exit_return_pct` — the tracker already records 30-day post-exit forward returns.
  - `ledgers.{name}.trades[]`: `date, side, ticker, price, value, reason` (value in NAV points; reasons like `entered_rank`).
  - `ledgers.{name}.state`: `cash, holdings{}, units`; plus `nav_series[]` with per-day `nav` and `benches{IWM,SPY,QQQ,SOXX,DRAM}`.
- **Plan deviation log:** forensic scripts use `ROOT = parents[4]` (the plan's `parents[3]` was one level short — mechanical fix, no scope change).
- **Data window caveat:** ledger inception 2026-06-12 → 2026-07-19 (~26 trading days). Mechanical decomposition is meaningful; statistical claims about signal quality are not.
- **Files read per link:** L1 — `RS2 Local/{orchestrate,run_rs2,valuation_engine,status}.py`, `register_orchestrator_task.ps1`, `RS2-Analyst.Modelfile`, README. L2 — `scripts/score_factors.py`. L3 — `scripts/track_paper_portfolios.py`. L4 — `scripts/sync_kis_portfolio.py`, `scripts/kis/*`, `.github/workflows/kis-sync.yml`, `docs/KIS_SYNC.md`. L5 — `Integrated stock-selection ecosystem.md` (theory doc), `scripts/build_portfolio_plan.py`, `scripts/build_momo_plan.py`, `SYSTEM_SUMMARY.md`.
- **Forensic artifacts:** `tools/out/{ledger_schema,trades_sample,verdict_flips,overlay_trace,churn_summary,plan_sim,kis_trades,attribution}.json` + `verdict_history.csv` (gitignored; regenerate by re-running the `tools/*.py` scripts).
- **What this audit cannot conclude:** whether the RS2 selection edge is real (2 weeks, one regime); whether stops would help (needs the Phase 2 daily price panel); exact real cost per side (needs the user's commission schedule, §7 Q2). Everything labeled hypothesis-grade must go through a Phase 3 pre-registered test before being believed.

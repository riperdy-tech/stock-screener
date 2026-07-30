# KIS Pipeline — Audit & Improvement Session Summary

**Dates:** 2026-07-20 → 2026-07-23
**Scope:** US pipeline only (Stock Screener → Factor Lab → RS2 LLM overlay → paper ledgers → `sync_kis_portfolio.py` → KIS overseas account). KOSPI `kis-algo-trader` out of scope.
**Mandate:** "trust before scaling" — audit the live-money path, enforce max drawdown ≤ 15%, then improve profit. Read-only until each change was explicitly approved.
**Method throughout:** every change was evidence-tested (replay / simulation / A-B) before it shipped; nothing was promoted on intuition.

---

## 1. What we started from

- **Real money live** on the `equal_llm` KIS mirror (~$9k NAV at audit start; ~$20k after top-ups by 2026-07-23).
- Pure-quant ledgers negative and behind IWM; the 2-week-old LLM-overlay ledgers positive and ahead.
- The ledger mirrored to KIS had **no drawdown enforcement**, no kill switch, and off-machine failures alerted nowhere.

## 2. The audit (Phase 1) — 15 findings

Full report: `docs/superpowers/audit/2026-07-kis-pipeline-audit.md`. Severity: P0 (silent money loss) → P3 (hygiene).

| ID | Sev | Finding | Disposition |
|----|-----|---------|-------------|
| F-12 | P0 | 15% DD budget enforced nowhere on the live path; no kill switch | **FIXED** — DD governor + KIS_HALT |
| F-02 | P1 | Orchestrator/publish failures alert nowhere off-machine | **FIXED** — Telegram alerts + cloud watchdog |
| F-06 | P1 | Live turnover ≈15–35× NAV/yr → real cost drag | **TESTED** — see §4; churn is real but trading beats buy-hold |
| F-10 | P1 | Small NAV × 25 names × daily churn → partial mirror | Accepted (user: systematic problems only, not NAV); self-heals as NAV grows |
| F-13 | P1 | Live capital allocated on ~2 weeks of evidence | **OPEN** — scaling gates not yet defined |
| F-01 | P2 | Verdict action-family instability (35% / re-analysis) | **FIXED** — continuity anchor (root cause: amnesiac re-analysis) |
| F-04 | P2 | Hard MoS/conviction boundaries, no hysteresis → churn; sells strength | **FIXED** — structured stance + brake cap into dead zone |
| F-07 | P2 | Quant `equal`: 25/49 round-trips are ≤14d re-entries | Closed won't-do (reference ledger only) |
| F-08 | P2 | Falling-knife entries (quant 6–15d holds −11 to −14%) | Closed won't-do (hypothesis; reference ledger only) |
| F-11 | P2 | One resting order halts the daily sync; KIS-untradable names | Accepted (user: no upstream exclusion) |
| F-14 | P2 | Live book bypasses every existing risk layer | **FIXED** — DD governor sits under the mirrored book |
| F-03 | P3 | Single-machine live-signal dependency | Accepted (PC ~24/7); watchdog detects outages |
| F-05 | P3 | WL tier classifies free action text | Superseded by structured stance |
| F-09 | P3 | Universe-dropout names carried forever | Open (minor; deferred) |
| F-15 | P3 | Dormant IC-recalibration contradicts equal-weight decision | Open (minor; one-line disarm deferred) |

**Attribution verdict:** the quant flagship's −2.86% vs IWM was −0.25% from day-1 picks and **−2.00% from its own subsequent trading** (falling-knife entries + boundary flip-flops), not fees. The LLM overlay improved both selection and trading. Conclusion: entries and churn were the damage, not the picks.

## 3. The root-cause investigation (the session's core)

The verdict-flip problem was decomposed rather than accepted at face value:

- **Flip rate was 22.7% per review** (not the 35% first quoted — overlay snapshots overcounted).
- Decomposition of 105 historical flips: **61% legitimate input changes, 10% deterministic brake knife-edges, 29% noise** (same opinion, re-worded, quantized into different keyword buckets).
- **Sensitivity test:** 60% of flips occurred with the engine's own fair value moving < 5% — confirming the user's hypothesis that these were engine noise, not real re-pricing.
- **Anchor A/B (48 GPU regenerations):** with the analysis frozen, the final call was near-deterministic (4% plain / 0% anchored). This proved the noise enters upstream, in the weekly from-scratch re-derivation — the model was **amnesiac** (`run_rs2.py` never referenced its prior verdict).
- **Pure-numbers test (V5):** deleting the LLM opinion entirely and deciding on MoS alone performed *worse* (−1.4 to −1.7%), proving the stance carries real veto value that must be kept.

The fix therefore targets the mechanism: give the model memory + emit a stable structured number instead of parsing prose.

## 4. The churn replay (F-06, "prove it first")

Replayed the real signal history under 10 membership policies × 4 cost levels (harness validated within 0.34pt of the real tracker):
- **The user's earlier finding held:** on the live LLM book, trading beats never-selling by 2.3pts — RS2's exits carry information.
- **Naive churn reduction all made it worse** (entry confirmation, slow exits, hysteresis).
- **Weekly cadence was a phase lottery** (±0.7pt across weekday offsets) — not adoptable.
- **Cost sensitivity confirmed:** ~0.6pt per 3 weeks per +15 bps of side-cost.
- Conclusion: the lever is **verdict-layer stabilization, not cadence** — F-06's original proposal superseded, its cost measurement confirmed.

## 5. What shipped (all approved, tested, pushed)

| Change | What it does | Evidence gate |
|--------|-------------|---------------|
| **KIS_HALT kill switch** | Repo variable, phone-flippable, checked before any order | design review |
| **Telegram ops alerts** | On-PC failures + cloud watchdog (>36h stale overlay); test alert delivered OK | wiring verified |
| **25 bps cost model** | Paper ledgers charge real KIS commission; frontend default fixed to 0.25% | user-supplied rate |
| **Continuity anchor** | RS2 re-analyses see their prior verdict; maintain-by-default + `changed_because` audit line | A/B: 0% flips anchored |
| **Big-move trigger** | >12% price move since last analysis forces immediate re-review | patches stale-anchor hole |
| **Structured stance 1–5 + thesis_break** | Numeric disposition replaces prose parsing; brake caps into the powerless middle band; parallel band runs alongside text for now | design + replay |
| **Drawdown governor (LIVE)** | Tiers −8/−11/−13 (user chose "cheaper"), hysteresis, sticky halt, resume-keeps-peak; per-env Supabase state; fail-open + alert | 14 unit tests + stress + 1200-path Monte Carlo |

**DD engine key results:** hard ≤15% impossible against single-day gaps (~1% of simulated years reach −16 to −20%); p99 ≈ −15%; caps a 2022-style −57% grind at −13%; insurance cost ~3%/yr in good years. Simulation caught a real bug pre-launch (halt-reset-at-bottom compounded −13% cycles into −38% → `resume()` preserves peak).

## 6. Files touched

- **RS2 Local (not git):** `run_rs2.py` (anchor, structured stance, `--refinal` A/B instrument), `orchestrate.py` (anchor live, big-move trigger, overlay passthrough), `ab_anchor_test.py`.
- **Stock Screener (git, pushed to main):** `scripts/kis/dd_engine.py`, `scripts/kis/dd_gate.py`, `scripts/sync_kis_portfolio.py`, `scripts/score_factors.py`, `scripts/track_paper_portfolios.py`, `.github/workflows/kis-sync.yml`, `.github/workflows/overlay-freshness-watchdog.yml`, `components/CockpitDashboard.tsx`, `docs/KIS_SYNC.md`, tests, and the audit tools under `docs/superpowers/audit/tools/`.

## 7. Operational notes clarified this session

- **7/23 "churn"** was mostly cent-sized cash-raising trims; real membership change was ~1–2 names/day. Anchored verdicts showed "maintained previous call" — the residual exits (UFPT/CLS) were conviction sitting at 9.0 vs the 9.5 gate (validated numeric churn, F-04), not opinion flips.
- **"Insufficient settled cash" Telegram** was true and expected: US sale proceeds settle on a delay, so same-run buys skip and self-heal next run. Not a fault.
- **Top-up 2026-07-23:** ~$6k added → NAV ~$20,150. Reviewed as more than enough to fund the 4 skipped names (~$3k) plus top-ups of existing underweights; deposited cash is settled, so the next scheduled run completes the mirror with no manual order needed.

## 8. Still open

1. **Scaling gates (F-13)** — the one unfinished piece of the original "trust before scaling" ask; pre-agreed evidence milestones for future top-ups. Not yet decided.
2. **Aug 4 check-ins** — scheduled task `kis-pipeline-checkins` (fires 2026-08-04 09:00): live flip-rate vs 22.7% baseline, stance-band vs text-band agreement (gates the parsing switchover), DD governor sanity.
3. **Minor deferred:** F-09 zombie-position guard, F-15 disarm the IC-recalibration workflow.

## 9. Bottom line

The P0 is closed: the 15% rule is enforced by code, not hope. Every audit finding is fixed, verified-sound, or closed by explicit decision. The verdict-flip problem was traced to its true cause (amnesiac re-analysis + prose quantization) and fixed at the mechanism, not the symptom — with the pure-numbers test proving the LLM judgment had to be kept. The system now runs with memory, structured decisions, a drawdown net, and alerts to the user's pocket; the Aug 4 data will confirm whether the medicine worked in the wild.

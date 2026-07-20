# KIS Pipeline Audit & Improvement Program — Design

**Date:** 2026-07-20
**Status:** Approved in brainstorm; awaiting written-spec review
**Scope decided with user:** US pipeline only (screener → Factor Lab → RS2 overlay → ledgers → `sync_kis_portfolio.py` → KIS overseas account). The KOSPI `kis-algo-trader` (Auto-Stock-Trade folder) is explicitly out of scope.

---

## 1. Context

The ecosystem under review, in money-flow order:

1. **Data + chain** — `fetch_data.py` (US universe via yfinance/FDR, SEC companyfacts ETL) → `run_chain.py` (FRED macro flags → reverse engine → paradigm themes → integrity invariants → nomination log).
2. **Factor Lab v2** — `score_factors.py`: sector-neutral winsorized z-scores, equal-weighted composite, hard vetoes; bands `research_now` / `watchlist` / `monitor` / `pass`.
3. **RS2 LLM overlay** — `RS2 Local/orchestrate.py` (scheduled task on the user's PC, local Qwen3 via Ollama) writes `llm_overlay.json`; `apply_llm_overlay()` maps RS2 verdicts to a parallel LLM band (RS2-primary / quant-guardrail). Deterministic valuation math lives in `valuation_engine.py` (LLM picks assumptions, Python computes IV/MoS).
4. **Ledgers** — `track_paper_portfolios.py` maintains paper ledgers (`equal`, `equal_llm`, `plan`, `plan_llm`, `plan2`, `plan2_llm`, `plan3`, `mine`), trade-on-change, 10 bps assumed cost, benchmarked vs IWM/SPY/QQQ/SOXX/DRAM.
5. **Execution** — `sync_kis_portfolio.py` mirrors one ledger into the KIS overseas (US) account: reconcile-to-weights, whole shares, sells-first, marketable limit orders (±0.3%), turnover caps, dry-run default, real-money gates. Chained in GitHub Actions after Scheduled Data Fetch.

**Live status (the reason this program exists):**
- **Real money is flowing on the `equal_llm` mirror.** Started ~$20k; contributions ongoing; destination ~$200k+ (eventually the user's entire portfolio).
- Track record is statistically tiny (inception 2026-06-12). As of 2026-07-19: pure-quant ledgers negative and behind IWM (`equal` −2.34%, −2.95% vs IWM, 30.6% win rate, 49 closed trades, 9.3-day avg hold); LLM-overlay ledgers ahead (`equal_llm` +0.92%, +2.11% vs IWM, 66.7% win rate — 2 weeks of data).
- The `equal*` ledgers and the KIS sync have **no drawdown enforcement**. The defense machinery (DD tiers, trailing stops, halt) exists only on the paper-only `plan3` momentum sleeve.

## 2. Objective and hard constraints

- **Objective:** maximize profit on the KIS book.
- **Hard risk constraint:** realized drawdown must never exceed **15%** (user, 2026-07-20: "I don't want to see drawdowns lower than 15%").
- **Capital envelope:** design must work at ~$20k (whole shares, per-order costs, concentration) and scale to $200k+.
- **Operating constraint (user, 2026-07-20): no changes to any trading-system code without explicit approval.** All phases produce artifacts that are read-only with respect to the live path: reports, standalone modules, simulations, shadow logs. Wiring anything into the live order path is always a separate, explicit user approval.
- **Motivation:** "trust before scaling" — the user wants independent verification that the logic and philosophy hold up before adding more capital.

## 3. Approach (decided)

Approach A — **audit first, then harden, then optimize** — absorbing the unified-risk-engine idea from Approach B (as Phase 2) and the attribution/measurement rigor from Approach C (inside Phase 1 and the Phase 3 gates). Phases run strictly in order; each ends at a user checkpoint.

---

## 4. Phase 1 — The Audit (read-only)

**Objective:** independently verify every link that touches real money, and answer one attribution question: *where exactly did the underperformance come from — selection, churn costs, timing, or sizing?*

**Severity taxonomy** (every finding gets exactly one):

| Severity | Meaning |
|---|---|
| P0 | Can lose money silently (wrong orders, unbounded risk, failure mode with no alert) |
| P1 | Correctness bug (logic does not do what its spec/comments/philosophy says) |
| P2 | Performance leak (costs, churn, taxes, avoidable slippage, dead weight) |
| P3 | Hygiene / philosophy drift (implementation diverges from the stated evidence-based design) |

**Scope — five links, audited in money-flow order:**

1. **RS2 verdict generation** (`RS2 Local/`): `orchestrate.py` scheduling and publish path for `llm_overlay.json`; verdict determinism and oscillation rate (a verdict flip is a real trade); `valuation_engine.py` clamps and re-prompt loop; operational fragility — the live signal depends on the user's PC + Ollama being up; staleness semantics when RS2 stops publishing.
2. **Overlay → guardrail** (`score_factors.py::apply_llm_overlay`): conviction→band mapping; >14-day staleness shrink; live-price MoS recompute; proof that quant hard-vetoes (reverse-reject / forensic-pair / heavy-issuance) cannot be bypassed by RS2.
3. **Ledger mechanics** (`track_paper_portfolios.py`): `equal_llm` trade-on-change behavior; unevaluated-vs-demoted gates; entry funding tolerance; dividends; idempotent same-day rewind; **churn forensics** — replay the trade history and decompose why average holds are ~6–9 days on a conviction book; realism of the 10 bps cost assumption vs actual KIS fills.
4. **Reconcile + execution** (`sync_kis_portfolio.py`, `scripts/kis/`): largest-remainder apportionment at $20k NAV with whole shares; overshoot tolerance; limit-buffer cost (±0.3% crossing every order); partial-fill and unfilled-abort behavior; FX/통합증거금 handling and the margin refusal path; GH Actions chain failure modes (stale-ledger gate, fetch failure, secrets split, workflow_run gating); cross-check `kis_sync.jsonl` + Supabase `kis_trades` real fills against paper assumptions.
5. **Risk & philosophy coherence:** implemented system vs the theory doc (`Integrated stock-selection ecosystem.md`) — funnel discipline, equal-weight verdict, veto-not-alpha layers, forward-validation honesty; the unenforced 15% DD constraint; 25 names × whole shares × $20k granularity; tax interaction of churn (assumption §7.1).

**Method:** static code review of the five links + data forensics on the existing record (ledger replay, per-trade cost attribution, real-fill cross-check). No code changes; no strategy changes; no re-weighting.

**Deliverables:**
- `docs/superpowers/audit/2026-07-kis-pipeline-audit.md` — severity-ranked findings; each finding carries: evidence (file:line or data), blast radius, and a proposed fix (proposal only).
- The attribution verdict: a decomposition of live-to-date P&L vs benchmark into selection / churn costs / timing / sizing, with the caveat that 5 weeks supports diagnosis of *mechanical* leaks (costs, churn) far better than *statistical* claims about signal quality.
- P0 findings are escalated to the user immediately on discovery, not queued for the report.

**Exit checkpoint:** user reads the audit report and decides which findings advance to Phase 2/3 backlogs.

## 5. Phase 2 — The Risk Engine (build standalone; validate by simulation only)

**Principle:** the 15% DD ceiling is enforced in one place, on whatever book reaches KIS — not re-implemented per ledger.

**Design:**
- **Account-side enforcement (authority):** logic computed from real KIS account NAV, with peak-NAV state persisted (Supabase, alongside `kis_trades`). The real account is ground truth — it catches paper/real divergence in fills, fees, FX.
- **Ledger-side mirror:** identical tier logic available to all paper ledgers so A/B comparisons stay honest and paper predicts the live guard.
- **Tier mechanics:** drawdown tiers off peak NAV with ~2-point recovery hysteresis. Initial simulation values: reduce gross to ~50% at −8%, ~25% at −11%, liquidate + halt at −13%. These are *inputs to simulation, not final parameters* — finals are chosen by the Phase 2 benchmark so that realized DD stays ≤ 15% under daily-mark granularity and overnight-gap stress.
- While reduced: sells allowed, buys blocked; cash stays USD (no FX round-trips).
- **Manual kill switch:** a halt flag checked before any order (repo variable or Supabase row, trippable from a phone), plus Telegram alerts on every tier change via the existing notify path.
- **No per-position trailing stops by default** on the conviction book; Phase 1 forensics tests on the actual trade history whether stops would have helped before any are considered.
- Deterministic, config-driven, every decision logged (`kis_sync.jsonl` convention).

**Validation (this IS Phase 2 — nothing touches the live order path):**
1. **Replay** against all existing NAV histories (7 ledgers + real account record): when would tiers have fired; resulting equity curves.
2. **Stress simulation** on synthetic paths (overnight gaps, 2020/2022-style crash shapes, boundary whipsaw): verify realized DD ≤ 15%; measure **false-trigger cost** (upside surrendered in normal volatility). This benchmark selects the final tier parameters.
3. **Shadow mode:** a *separate, read-only* scheduled job (new standalone script — no existing chain step is modified) reads the same inputs plus real KIS NAV and logs what the engine *would* do — placing nothing, changing nothing. Deploying even this read-only job requires user approval first, like everything else.

**Exit checkpoint:** shadow log reviewed with the user. Wiring the engine into the live sync (or its ledger-side mirror into the tracker) is a separate approval with its own diff review.

## 6. Phase 3 — The Profit Track (evidence-gated)

**Structure:** every improvement is a pre-registered experiment declared *before* it runs:

- **Hypothesis** (what changes, why it should make money)
- **Metric:** after-cost, after-tax excess vs a matched benchmark
- **Minimum observation window** and a **kill condition**
- **Vehicle:** replay test or a new paper A/B ledger

Nothing is promoted to the live book except by explicit user decision. The phase also **retires** experiments: 7 ledgers is already enough for accidental survivor-picking; dead variants get archived with their verdicts recorded.

**Seed candidates (audit will re-rank with evidence):**
1. **Churn reduction** — band hysteresis (enter high / exit low), minimum hold windows, weekly rebalance cadence for the conviction book. Attacks the spread leak and the realized-gains tax leak simultaneously.
2. **RS2 verdict stability** — verdict TTL, conviction smoothing, event-triggered re-analysis (price move, filing) instead of cadence-only, so one model flip ≠ one round trip.
3. **Concentration** — 10–15 name conviction-weighted book (capped quarter-Kelly) vs current ~25-name equal-weight, inside the DD budget; also fixes whole-share granularity at $20k.
4. **Sleeve allocation** — conviction core + `plan3` momentum satellite sharing one DD budget through the risk engine, once plan3 has its own record.
5. **Execution cost tuning** — limit-buffer width, commission tier confirmation, order batching.

**Governance — scaling gates:** contributions step up only at pre-agreed milestones (proposal, to be finalized with the user: e.g., a new tranche only after N months of DD-compliant live operation *and* positive after-cost excess vs benchmark since the last gate). Trust is earned by pre-registered evidence, not by feel.

## 7. Assumptions to confirm during Phase 1

1. **Tax:** user is a Korean tax resident — overseas-stock capital gains taxed ~22% on realized gains above ₩2.5M/yr, making churn a tax leak. (Confirm; changes the after-tax metric.)
2. **Live config:** `KIS_LEDGER=equal_llm`, `KIS_AUTO_EXECUTE=true`, `KIS_ENV=real` in the GitHub repo variables (user statement; verify against the repo settings and recent workflow logs).
3. **Commission tier:** actual KIS overseas commission rate and FX spread on the user's account (drives the true cost model replacing the 10 bps assumption).
4. **RS2 publish path:** how `llm_overlay.json` travels from the local PC to the repo the Actions runner sees (the `chore(llm)` commits suggest an automated push; verify cadence and failure alerting).

## 8. Non-goals

- No changes to the KOSPI `kis-algo-trader` (separate engagement).
- No new alpha signals, factor re-weighting, or universe changes in Phases 1–2.
- No backtest-driven weight optimization anywhere (theory doc §2: estimation error dominates); experiments are forward paper A/Bs or mechanical replays.
- Nothing in this program ever auto-wires into the live order path.

## 9. Success criteria

- **Phase 1:** audit report delivered; every finding severity-rated with evidence; attribution question answered to the resolution the data supports; user states trust level in each link.
- **Phase 2:** risk engine passes stress benchmark (realized DD ≤ 15% on all tested paths) with quantified false-trigger cost; shadow mode runs clean against the live book.
- **Phase 3:** every live change traceable to a pre-registered experiment that passed its gate; scaling gates agreed and in writing.
- **Program:** the user can justify each dollar of added capital by pointing at evidence, not vibes.

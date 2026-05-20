# Reverse Engine — Build Orchestration Runbook
## How to drive Codex (GPT-5.5) to implement Reverse Screening Engine v1.2 into `stock-screener` with minimal errors

You are the operator. Claude is the brain that designed the spec and writes each instruction packet. Codex is the hands that write code. This runbook governs how the three of you work so that errors are caught at gates instead of compounding.

**Golden rule:** Codex never starts a phase until the previous phase's gate has *passed*. One phase = one branch = one PR = one reviewable diff.

---

# Part A — Orchestration principles (read once)

These exist because coding LLMs fail in predictable ways. Each principle is a countermeasure.

| Codex failure mode | Countermeasure baked into this runbook |
|---|---|
| Hallucinates column names / field shapes | **Phase 0 is recon-only.** No logic is written until the real schema is verified and frozen in a contract file. |
| Edits files it shouldn't | Every packet has an **explicit file allowlist**. Gate includes a `git diff --stat` scope check. |
| Breaks existing features | **Regression gate**: the 100-bagger screen output, dashboard, and AI worker must behave identically after each phase. |
| Invents data it doesn't have | Spec mandates **graceful degradation** (§3.4 of v1.2). Gates check fallbacks fire, not crashes. |
| Non-deterministic output | **Determinism gate**: re-running scoring on identical input yields identical output. |
| Does too much at once | Phases are **atomic** — one concern each. A phase that "feels big" is split. |
| Drifts over a long session | Each packet is **self-contained**: it restates the contract, cites exact spec sections, and never says "remember earlier." |
| Silent assumption changes | Packets forbid Codex from changing the contract; if reality contradicts the spec, Codex must **STOP and report**, not improvise. |

**Two operator habits that prevent most damage:**
1. After each phase, read the diff yourself (or have Claude read it) *before* merging. The gate is not "Codex says done," it's "the diff passes the gate."
2. Keep `main` always-working. Each phase merges only after its gate passes. If a gate fails, fix or revert — never stack the next phase on a broken one.

---

# Part B — Phase / gate map (the whole plan at a glance)

Phases are ordered by **risk and coupling**: standalone new code first, edits to existing scanner in the middle, frontend wiring last. Three milestones mark shippable states.

| Phase | Title | Touches | Risk | Milestone |
|---|---|---|---|---|
| **0** | Recon & Schema Contract | nothing (read-only) | none | — |
| **1** | Config + module scaffold | new files only | low | — |
| **2** | Stage 0–1: universe + eliminators | `score_reverse.py` | low | — |
| **3** | Stage 2: archetype routing | `score_reverse.py` | low | — |
| **4** | Stage 3: quality scoring | `score_reverse.py` | low | — |
| **5** | Stage 4 + Stage 7 (partial): MoS + composite | `score_reverse.py`, CSV write | medium | **M1: ranked composite ships on existing data** |
| **6** | Extend `fetch_data.py` with new raw fields | existing scanner | **high** | — |
| **7** | Stage 5–6: survivability + CAGR/DD proxies | `score_reverse.py` | medium | — |
| **8** | Stage 8–9 + full haircuts: flags, diversification, nomination | `score_reverse.py` | medium | **M2: full backend funnel complete** |
| **9** | Frontend: read-only `rev_` columns + badges | dashboard (display) | medium | — |
| **10** | Frontend: Reverse Engine filter mode | FilterSidebar | medium | — |
| **11** | Deep-dive top N + prompt priming | API + modal + prompt-builder | **high** | **M3: end-to-end hand-off to v3.2** |
| **12** | Supabase calibration fields + logging | schema + worker | medium | — |
| **13** | Calibration loop / review tooling | new script | low | — |

**Stop points:** You can halt after M1 (you already solved "scroll 8,000 rows"), after M2 (full automated ranking), or after M3 (one-click deep-dive). Phases 12–13 are optimization, not core.

---

# Part C — Gate types (reusable definitions)

Every phase gate is composed of one or more of these. The packet for each phase names which apply.

| Gate | What it checks | How to verify |
|---|---|---|
| **SCOPE** | Codex edited only allowed files | `git diff --stat` matches the packet's allowlist; nothing else changed |
| **SCHEMA** | Output columns/JSON exactly match the frozen contract | Diff actual output header against `data_contract.md`; no renamed/missing/extra fields |
| **REGRESSION** | Existing features unchanged | Run the 100-bagger scan (or use a cached `stocks.csv`); existing `score`/`status`/`fail_codes` columns are byte-identical; dashboard still loads; AI worker still triggers |
| **DETERMINISM** | Same input → same output | Run scoring twice on the same `stocks.csv`; outputs are identical (diff is empty) |
| **DEGRADATION** | Missing fields don't crash | Run against a row with NULLs in new fields; engine produces a score with a data-quality penalty, no exception |
| **SPOT-CHECK** | Numbers are right, not just present | Hand-pick 3–5 tickers; manually verify their archetype tag and one score component against the spec rubric |
| **SMOKE** | It runs at all | The script executes end-to-end on real data without error and writes its output file |
| **NO-NET** | No new network calls | `score_reverse.py` makes zero network requests (grep for `requests`/`yfinance`/`urllib`; should be absent) |
| **BUILD** | Frontend compiles | `npm run build` (or `tsc --noEmit`) passes with no new errors |
| **UI-MANUAL** | Frontend behaves | Operator loads the page, exercises the new control, confirms expected behavior + existing modes still work |

---

# Part D — The instruction packet template (what Claude hands you per phase)

Every phase is delivered as a packet in this exact shape. You paste it into Codex verbatim. Claude writes one packet at a time, *after* the prior gate passes, so each is written against verified reality.

```
## CODEX PACKET — Phase N: <title>

### Context (read-only, do not modify)
- Repo: riperdy-tech/stock-screener
- You are implementing Reverse Screening Engine v1.2, Stage(s) <X>.
- The frozen data contract is in <path>. Treat it as ground truth.
- Relevant spec sections: <§ refs, pasted inline so you need no other file>.

### Your task
<numbered, concrete steps>

### Files you MAY edit (allowlist — touch nothing else)
- <file 1>
- <file 2>

### Files you MUST NOT touch
- <explicit list of existing critical files>

### Hard constraints (non-goals / guardrails)
- <e.g. no network calls; no changes to existing columns; no new dependencies without asking>
- If reality contradicts this packet (a field doesn't exist, a function signature differs),
  STOP and report what you found. Do NOT improvise a workaround.

### Definition of done
- <observable, checkable outcomes>

### Self-check before you return
- <the gate criteria, so Codex pre-verifies>
```

The `STOP and report` clause is the single most important line. It converts a silent wrong-assumption (which compounds) into a question (which you route back to Claude).

---

# Part E — Phase-by-phase specification

For each phase: objective, allowlist, inputs Codex needs, task summary, guardrails, definition of done, and which gates apply. Claude expands the relevant one into a full packet on demand.

## Phase 0 — Recon & Schema Contract  *(read-only)*
- **Objective:** Replace every *assumed* field name in v1.2 with a *verified* one, and freeze it.
- **Allowlist:** create `docs/reverse_engine/data_contract.md` only. No code.
- **Inputs:** the repo; v1.2 §3 (data mapping).
- **Task:** Codex inspects `fetch_data.py`, a real `stocks.csv` header, and a sample `financials/{TICKER}.json`, then writes `data_contract.md` listing the **actual** column names, types, units, and which v1.2 fields exist / are derivable / are missing. It does NOT change anything.
- **Guardrails:** read-only; report mismatches between v1.2's assumed names and reality.
- **Done:** `data_contract.md` exists, every v1.2 §3 row is marked EXISTS / DERIVABLE / MISSING with the real column name.
- **Gates:** SCOPE (only the doc created), SPOT-CHECK (operator confirms 5 column names against the real CSV).

> This phase is non-negotiable and comes first. Everything downstream cites the contract, not the spec's assumptions.

## Phase 1 — Config + module scaffold
- **Objective:** Stand up `score_reverse.py` and `reverse_config.json` with structure but no scoring logic.
- **Allowlist:** create `scripts/score_reverse.py`, `scripts/reverse_config.json`; optional `run_reverse.bat`.
- **Inputs:** `data_contract.md`; v1.2 §12 (WACC + base-rate tables), §4 (column list).
- **Task:** Build the CLI skeleton: read `stocks.csv`, load config, iterate rows, write back an unchanged CSV plus empty `rev_*` columns (all null). Config holds WACC table, thresholds, archetype maps as data (not hardcoded).
- **Guardrails:** no scoring yet; no network; no new pip dependencies beyond what the repo already uses; existing columns untouched.
- **Done:** running `python scripts/score_reverse.py` reads and rewrites the CSV with empty `rev_*` columns added, existing columns intact.
- **Gates:** SCOPE, SMOKE, NO-NET, REGRESSION (existing columns byte-identical), SCHEMA (the 17 `rev_*` columns from v1.2 §4 all present, correctly named).

## Phase 2 — Stage 0 + Stage 1 (universe + eliminators)
- **Objective:** Filter the scoring universe and flag hard-eliminated stocks.
- **Allowlist:** `scripts/score_reverse.py`, `scripts/reverse_config.json`.
- **Inputs:** contract; v1.2 §5 (Stage 0), §6 (Stage 1 + archetype suspensions + degraded scoring).
- **Task:** Implement Stage 0 universe filter and Stage 1 universal eliminators (Z-Score, leverage, coverage, dilution, cash burn, data quality), with archetype suspensions stubbed (archetype not yet computed → use universal defaults, leave a TODO hook). Populate `rev_band = Reject` for eliminated rows; everything else stays scoreable.
- **Guardrails:** eliminators set `rev_band`, they do NOT delete rows; missing fields trigger degradation per §3.4, never a crash; do not read `fail_codes` (independence rule, §2.3).
- **Done:** each row has a Stage-1 disposition; eliminated rows marked; a count summary printed.
- **Gates:** SCOPE, SMOKE, NO-NET, DETERMINISM, DEGRADATION, SPOT-CHECK (verify 3 rejects are correctly rejected and 2 survivors correctly survive).

## Phase 3 — Stage 2 (archetype routing)
- **Objective:** Tag every scoreable stock with archetype A–I (+ secondary on transitions).
- **Allowlist:** `score_reverse.py`, `reverse_config.json`.
- **Inputs:** contract; v1.2 §7 (routing logic, priority order, transition/ambiguity).
- **Task:** Implement the 9-rule priority router using `sector`/`industry`/growth/margins/FCF/dividend. Write `rev_archetype`, `rev_archetype_secondary`. Wire back the Stage-1 archetype suspensions stubbed in Phase 2.
- **Guardrails:** one primary archetype per row; ambiguity → conservative default + flag; no moonshot lane (independence from 100-bagger).
- **Done:** every scoreable row has a primary archetype; suspensions now active.
- **Gates:** SCOPE, SMOKE, DETERMINISM, SPOT-CHECK (verify a bank→G, a REIT→H, a compounder→B, a pre-revenue→E by hand).

## Phase 4 — Stage 3 (quality scoring)
- **Objective:** Archetype-specific quality 0–100.
- **Allowlist:** `score_reverse.py`, `reverse_config.json`.
- **Inputs:** contract; v1.2 §8 + v1.0 §7 rubrics (paste the relevant rubric tables into the packet).
- **Task:** Implement per-archetype quality rubrics; missing rubric inputs score "limited" + data-quality cap (§6.4), never false zero. Write `rev_quality`, `rev_data_quality`.
- **Guardrails:** never apply one rubric across all archetypes; degradation over fabrication.
- **Done:** `rev_quality` populated for all scoreable rows with correct rubric per archetype.
- **Gates:** SCOPE, SMOKE, DETERMINISM, DEGRADATION, SPOT-CHECK (hand-compute one A/B stock's quality and match).

## Phase 5 — Stage 4 + Stage 7 partial  **→ MILESTONE M1**
- **Objective:** MoS proxy + a composite score, written to CSV and sortable.
- **Allowlist:** `score_reverse.py`, `reverse_config.json`.
- **Inputs:** contract; v1.2 §9 (Stage 4 mapping), v1.0 §8 (MoS), §11 (composite formula + haircuts — but only the haircuts whose inputs exist yet: data-quality, archetype-ambiguity).
- **Task:** Implement MoS proxy (FCF yield, EV multiples vs history, reverse-DCF using §12 WACC table). Implement composite with the subset of haircuts available pre-Phase-6. Write `rev_mos`, `rev_composite`, `rev_band`, `rev_rank`, `rev_pro`, `rev_con`.
- **Guardrails:** clearly mark which Stage-6/8 haircuts are not yet applied (so M1 composite is honestly labeled "partial").
- **Done:** sortable `rev_composite`; top-N inspectable; a stock can be ranked.
- **Gates:** SCOPE, SMOKE, NO-NET, DETERMINISM, DEGRADATION, SPOT-CHECK, **+ operator acceptance: sort by `rev_composite`, eyeball top 25, sanity-confirm they're plausible candidates.**

> **M1 reached: the original problem ("don't make me scroll 8,000 stocks") is solved.** You can stop here and use it, or continue to sharpen.

## Phase 6 — Extend `fetch_data.py`  *(HIGH RISK — existing scanner)*
- **Objective:** Add the raw fields Stages 5/6/8 need, fetched where the `yf.Ticker` object already lives.
- **Allowlist:** `scripts/fetch_data.py` only (+ contract update).
- **Inputs:** contract; v1.2 §3.3 (new field list with yfinance sources).
- **Task:** Add interest_expense, D&A, EBITDA, beta, dividend_yield, payout_ratio, 5yr revenue/margin history, short_percent_of_float, held_percent_institutions, country, exchange. Append as **new columns**; reuse the already-fetched ticker object; keep incremental-save and atomic-swap logic intact.
- **Guardrails:** ADD columns only — never rename/remove/reorder existing ones; do not change the 100-bagger screening logic or its outputs; no new data source; preserve pause/pid/resume behavior.
- **Done:** a scan produces the new columns; existing columns and 100-bagger results unchanged.
- **Gates:** SCOPE, REGRESSION (**critical** — existing `score`/`status`/`fail_codes` and all prior columns byte-identical on the same tickers), SMOKE (small ticker subset), SCHEMA (new columns named per contract).

> Run this on a **small ticker subset first** (e.g. 20 tickers), verify, then full scan. Do not full-scan an unverified change to the 8K pipeline.

## Phase 7 — Stage 5 + Stage 6 (survivability + CAGR/DD)
- **Objective:** Real survivability and drawdown/CAGR proxies using the new fields.
- **Allowlist:** `score_reverse.py`, `reverse_config.json`.
- **Inputs:** contract (now with Phase-6 fields); v1.2 §9 (Stages 5–6 mapping), v1.0 §9–10.
- **Task:** Implement 5-component survivability (leverage stress, funding gap, concentration, dilution, drawdown history), permanent-impairment probability, CAGR proxy, drawdown proxy, efficiency. Write `rev_survivability`, `rev_impairment_prob`, `rev_cagr_proxy`, `rev_drawdown_proxy`, `rev_efficiency`.
- **Guardrails:** survivability ≠ historical volatility; respect base-rate ceiling on CAGR (flag Base Rate Red).
- **Done:** all five new `rev_` columns populated; efficiency = CAGR/|drawdown|.
- **Gates:** SCOPE, SMOKE, DETERMINISM, DEGRADATION, SPOT-CHECK (verify a high-leverage name gets low survivability + high impairment prob).

## Phase 8 — Stage 8 + Stage 9 + full haircuts  **→ MILESTONE M2**
- **Objective:** Behavioral flags, diversification caps, nomination, and the complete 6-haircut composite.
- **Allowlist:** `score_reverse.py`, `reverse_config.json`.
- **Inputs:** v1.2 §9 (Stages 8–9), v1.0 §11.2 (all six haircuts), §12 (flags), §13 (diversification + selection algorithm).
- **Task:** Implement behavioral flags (`rev_flags`), apply all six composite haircuts now that their inputs exist, run the diversification-capped top-N selection, write `rev_nominated`. Recompute `rev_composite`/`rev_band`/`rev_rank` with full haircuts.
- **Guardrails:** flags never reject (Stage 8 is flags-not-rejects); diversification caps mandatory; watchlist preserved.
- **Done:** `rev_nominated` marks the diversified top 20–30; composite is now the full formula.
- **Gates:** SCOPE, SMOKE, DETERMINISM, SPOT-CHECK, **+ operator acceptance of the nominated set's diversification (no single sector/archetype over cap).**

> **M2 reached: the full backend funnel runs end to end, automatically.**

## Phase 9 — Frontend: read-only display
- **Objective:** Show `rev_` data in the dashboard without changing behavior.
- **Allowlist:** `lib/data-service.ts` (parse new columns), `components/ScreenerDashboard.tsx` and/or card component (display badges) — confirm exact files in Phase 0.
- **Inputs:** contract; v1.2 §10.2.
- **Task:** Parse the new `rev_` columns; render `rev_archetype`/`rev_composite`/`rev_band`/`rev_efficiency`/`rev_flags` as a badge row, visible but not yet filterable. Existing 100-bagger view unchanged.
- **Guardrails:** display only — no filtering, no sorting changes, no new screen mode yet; existing modes untouched.
- **Done:** new badges render; existing dashboard identical otherwise.
- **Gates:** SCOPE, BUILD, REGRESSION (existing modes/badges unchanged), UI-MANUAL.

## Phase 10 — Frontend: Reverse Engine filter mode
- **Objective:** A new screen mode beside the 100-bagger modes.
- **Allowlist:** `components/FilterSidebar.tsx`, the dashboard, relevant types — confirm in Phase 0.
- **Inputs:** v1.2 §10.1.
- **Task:** Add a "Reverse Engine" mode that sorts by `rev_composite` and exposes archetype multi-select, min-composite/MoS/survivability sliders, band filter, nominated-only toggle. Reuse existing filter primitives.
- **Guardrails:** mutually-exclusive mode switch; 100-bagger modes must keep working exactly as before.
- **Done:** switching to Reverse Engine mode filters/sorts on `rev_` fields; switching back restores 100-bagger behavior.
- **Gates:** SCOPE, BUILD, REGRESSION, UI-MANUAL (exercise every new control + confirm mode switch is clean).

## Phase 11 — Deep-dive top N + prompt priming  **→ MILESTONE M3**  *(HIGH RISK — touches AI flow)*
- **Objective:** One-click hand-off of nominated survivors into the existing v3.2 AI flow, primed.
- **Allowlist:** `lib/prompt-builder.ts`, `StockDetailModal.tsx`, dashboard header, `/api/analysis` route — confirm in Phase 0.
- **Inputs:** v1.2 §10.3–10.4; v1.0 §14 (hand-off schema).
- **Task:** Add "Deep-dive top N" (batch-enqueue `rev_nominated` into the existing `/api/analysis` flow) and per-stock "Run v3.2"; extend `prompt-builder.ts` to inject the hand-off schema (archetype, composite, pro/con, flags) so v3.2 starts primed.
- **Guardrails:** reuse the existing analysis pipeline and password gate; do NOT alter `ai_worker.py`'s core logic or the v3.2 prompt itself — only prepend the priming block; respect existing rate/queue behavior; batch must not flood (cap + confirm).
- **Done:** clicking deep-dive enqueues nominated stocks; the AI prompt contains the priming block; existing single-stock "Ask AI" still works.
- **Gates:** SCOPE, BUILD, REGRESSION (existing Ask-AI path unchanged), UI-MANUAL (enqueue a small N, confirm jobs land in Supabase and the prompt is primed).

> **M3 reached: full loop — scan → score → rank → filter → one-click deep-dive.**

## Phase 12 — Supabase calibration fields
- **Objective:** Capture nomination scores vs v3.2 outcomes for the calibration loop.
- **Allowlist:** Supabase migration/schema, `ai_worker.py` (write the captured fields) — confirm in Phase 0.
- **Inputs:** v1.2 §13.
- **Task:** Add `rev_composite_at_nomination`, `rev_rank_at_nomination`, `v32_execution_opinion`, `forward_return_12m`, `drawdown_realized`; populate the first three at analysis time.
- **Guardrails:** additive schema only; do not break existing `ai_reports` reads/writes.
- **Done:** new fields written on each analysis.
- **Gates:** SCOPE, REGRESSION (existing reports flow intact), SMOKE.

## Phase 13 — Calibration loop tooling
- **Objective:** Quarterly review + threshold tuning → engine v1.3.
- **Allowlist:** new `scripts/calibrate_reverse.py`.
- **Inputs:** v1.2 §13 (calibration questions).
- **Task:** Read Supabase outcomes, report whether high-composite names clustered in High-Conviction Accumulate, whether survivability predicted drawdowns, which rubrics are miscalibrated; suggest threshold edits to `reverse_config.json`.
- **Guardrails:** read-only analysis; proposes config edits, does not auto-apply.
- **Done:** a report; proposed config diffs for human approval.
- **Gates:** SCOPE, SMOKE.

---

# Part F — Ready-to-paste packets for Phase 0 and Phase 1

These two are written now because they don't depend on recon (Phase 0 *is* the recon; Phase 1 builds only scaffold). Phases 2+ are written by Claude after each gate passes, against the verified contract.

---

## CODEX PACKET — Phase 0: Recon & Schema Contract

### Context (read-only — change no code in this phase)
- Repo: `riperdy-tech/stock-screener`.
- We are about to implement a new "Reverse Screening Engine" as a second, parallel screen (independent of the existing 100-bagger screen). Before any code is written, we must verify the real data shapes, because the design spec was written from a summary and may have wrong field names.
- Your job in this phase is **investigation and documentation only.**

### Your task
1. Open `scripts/fetch_data.py`. Identify and list **every column** it writes to `public/data/stocks.csv` (exact names, in order), with the type and unit of each, and a one-line note on how it's computed.
2. Open a real `public/data/stocks.csv` (or generate the header by reading the writer code). Record the **exact header row**.
3. Open one real `public/data/financials/{TICKER}.json`. Record its **full key structure** (nested keys, array shapes, date formats).
4. For each of the following fields the reverse engine wants, mark **EXISTS** (give the real column/key name), **DERIVABLE** (from which existing fields), or **MISSING**:
   `market_cap, price, sector, industry, revenue_growth_ttm, gross_margin, gross_margin_3yr_trend, ROIC, altman_z, share_dilution, float_shares, insider_ownership, peg_ratio, price_to_sales, ev, ev_to_sales, ev_to_ebit, core_anchor_multiple, fcf, fcf_margin, total_cash, total_debt, eps_ttm, forward_eps, price_to_book, pe_5y_avg, monthly_closes, net_debt_to_ebitda, fcf_yield, interest_expense, depreciation_amortization, ebitda, beta, dividend_yield, payout_ratio, revenue_5yr_history, operating_margin_5yr, short_percent_of_float, held_percent_institutions, country, exchange, auditor_opinion, going_concern, recurring_revenue_pct`
5. List the **exact filenames and paths** of: the dashboard component, the filter sidebar component, the stock detail modal, the data-service/CSV parser, the prompt-builder, the AI worker, and the `/api/analysis` route. (We'll need these names for later frontend phases.)
6. Write all of the above into a new file `docs/reverse_engine/data_contract.md`.

### Files you MAY create
- `docs/reverse_engine/data_contract.md`

### Files you MUST NOT touch
- `scripts/fetch_data.py`, `scripts/ai_worker.py`, anything under `components/`, `lib/`, `app/`, `public/data/`. Read them; do not edit them.

### Hard constraints
- Read-only. The only write is the new contract doc.
- Report **exact** names as they appear in code — do not normalize, guess, or "correct" them.
- Where the spec's assumed name differs from reality, note **both** (assumed → actual).
- If a field's computation is unclear, mark it "UNCLEAR" rather than guessing.

### Definition of done
- `docs/reverse_engine/data_contract.md` exists and contains: (a) the exact `stocks.csv` header, (b) the financials JSON structure, (c) the EXISTS/DERIVABLE/MISSING table for all listed fields, (d) the exact paths of the seven frontend/backend files in step 5.

### Self-check before you return
- Did you change any file other than the new contract doc? (Must be NO.)
- Is every column name copied verbatim from code, not from memory?
- Is every one of the ~45 listed fields classified?

---

## CODEX PACKET — Phase 1: Config + module scaffold

### Context (read-only, do not modify)
- Repo: `riperdy-tech/stock-screener`. Implementing Reverse Screening Engine v1.2.
- Ground truth for all field names is `docs/reverse_engine/data_contract.md` (from Phase 0). Use those names exactly. If a name you need is marked MISSING there, leave its logic as a TODO and a null output — do not invent a source.
- This phase builds **scaffolding only**: read CSV, load config, write CSV back with empty new columns. **No scoring logic.**

### Your task
1. Create `scripts/reverse_config.json` containing, as data (not hardcoded in Python):
   - a sector→WACC table (use these defaults: Technology 11, Healthcare 10, Consumer Discretionary 10, Consumer Staples 8, Industrials 9, Financials 10, Energy 11, Materials 10, Utilities 7, Real Estate 8, Communication Services 10);
   - a `thresholds` object (leave empty `{}` for now — later phases fill it);
   - an `archetype_map` object (leave empty `{}` for now).
2. Create `scripts/score_reverse.py` that:
   - reads `public/data/stocks.csv` into memory (use the same CSV library the repo already uses; check `data-service`/existing scripts);
   - loads `reverse_config.json`;
   - for each row, adds these **17 new columns**, all initialized to null/empty:
     `rev_archetype, rev_archetype_secondary, rev_quality, rev_mos, rev_survivability, rev_impairment_prob, rev_cagr_proxy, rev_drawdown_proxy, rev_efficiency, rev_composite, rev_band, rev_rank, rev_flags, rev_data_quality, rev_pro, rev_con, rev_nominated`;
   - writes the result back to `public/data/stocks.csv` (and `stocks.json` if the repo keeps them in sync — match existing behavior), preserving **all existing columns unchanged and in their original order**, with the new columns appended at the end;
   - prints a one-line summary: rows read, columns before, columns after.
3. (Optional) Create `run_reverse.bat` that invokes `python scripts/score_reverse.py`, mirroring the style of the existing `run_scanner.bat`.

### Files you MAY create/edit
- `scripts/score_reverse.py` (create)
- `scripts/reverse_config.json` (create)
- `run_reverse.bat` (create, optional)

### Files you MUST NOT touch
- `scripts/fetch_data.py`, `scripts/ai_worker.py`, `scripts/get_prices.py`, everything under `components/`, `lib/`, `app/`.

### Hard constraints
- **No network calls of any kind.** No `yfinance`, `requests`, `urllib`, `httpx`. This script only reads/writes local files.
- **No new pip dependencies.** Use only what the repo already imports.
- **Do not modify, rename, reorder, or remove any existing column.** New columns are appended only.
- **No scoring math yet.** Every `rev_*` value is null/empty after this phase.
- If reality contradicts this packet (e.g. the CSV writer is structured differently than expected), STOP and report — do not improvise.

### Definition of done
- `python scripts/score_reverse.py` runs with no error, reads the real `stocks.csv`, and writes it back with exactly the 17 new columns appended, all empty, and every pre-existing column byte-identical.
- The printed summary shows `columns after = columns before + 17`.

### Self-check before you return
- SCOPE: `git diff --stat` shows only the 2–3 new files. (Yes/No)
- NO-NET: grep the new script for network libraries — none present. (Yes/No)
- REGRESSION: existing columns in the output are identical to input (only additions at the end). (Yes/No)
- SCHEMA: all 17 `rev_*` columns present and spelled exactly as listed. (Yes/No)
- SMOKE: script ran end-to-end on real data. (Yes/No)

---

# Part G — How we proceed from here

1. You paste the **Phase 0 packet** into Codex. Codex returns `data_contract.md`.
2. You (or Claude) run the Phase 0 **gate**: confirm read-only + spot-check 5 column names. If it fails, fix and re-run before anything else.
3. You paste the **Phase 1 packet**. Codex returns the scaffold. Run the Phase 1 gate.
4. **Then you come back to Claude** with the contract (or any surprises Codex reported), and Claude writes the **Phase 2 packet against the verified contract** — not against the spec's assumptions. Repeat: clear gate → Claude writes next packet → paste → clear gate.

This is the loop that minimizes Codex error: small atomic task → self-contained packet → gate → only then the next packet, each written against verified reality. Claude holds the spec and the dependency order; you hold the gates; Codex holds the keyboard.

**When a gate fails:** send Claude (a) the failing packet, (b) what Codex did, (c) the gate that failed. Claude diagnoses and issues a corrective packet — it does not move forward until the gate is green.

---

*Governs: implementation of Reverse Screening Engine v1.2 into `riperdy-tech/stock-screener`*
*Companion to: `reverse_screening_engine_v1.2.md`, `integrated_stock_analysis_engine_v3_2.md`*
*Role split: Claude = spec + packets + diagnosis · Operator = gates + merges · Codex = code*

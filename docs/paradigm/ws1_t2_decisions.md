# WS1-T2 Decisions — Resolved Open Questions

> Operator decisions on the 8 open questions in `ws1_t2_membership_design.md` §6.
> For items 1, 3, and 7 the operator delegated design to Opus 4.7 (this doc).
> Companion file: `ws1_t2_proposed_config.json` (review and merge into `paradigm_config.json`).

---

## Q1 — Keyword list curation: **Opus designs the approach**

**Approach:** Offline batch generation by Opus (this model), followed by operator review.
This keeps scoring deterministic (the generated list becomes static config) and avoids violating
the "no network calls in scoring" rule.

**Pipeline:**
1. For each theme in `paradigm_config.json`, Opus generates two lists:
   - **`keywords`** — 15–30 terms that, if present in a stock's `name` or `description`,
     strongly indicate theme membership. Bias toward specific/unambiguous terms (e.g., "GLP-1",
     "semaglutide") over generic ones (e.g., "AI", "smart").
   - **`negative_keywords`** — 5–15 terms that LOOK thematic but indicate the company is NOT
     in that theme (e.g., "AI" alone is a negative for `ai_compute` because every modern
     company markets "AI features"; only co-occurrence with specific compute terms counts).
2. Output saved to `ws1_t2_proposed_config.json` as theme-keyed entries.
3. Operator reviews, edits, copies into `scripts/paradigm_config.json`.
4. **Maintenance:** when a new theme is added or a theme's scope shifts, re-run this step
   for just that theme. No need to regenerate stable themes.

**Implementation in `score_paradigm.py` (later task — WS1-T2a):**
- Match logic: case-insensitive substring; word-boundary regex for short terms (3 chars or
  fewer) to avoid false matches.
- Negative keyword logic: if a negative keyword appears AND no positive keyword appears,
  the keyword method votes "no" with high confidence. If both appear, the method votes "yes"
  but with reduced confidence.
- Determinism: no randomness, no ordering dependence.

**Initial keywords:** see `ws1_t2_proposed_config.json` for all 6 themes.

---

## Q2 — GICS whitelist granularity: **Industry-level only** (per recommendation)

Sector-level matches are too broad. Industry-level provides defensible precision.
Whitelist per theme defined in `ws1_t2_proposed_config.json` under each theme's
`member_rules.gics_industries` array. Operator can demote to sector-level for specific
themes later if recall is too low.

---

## Q3 — Seed list maintenance: **Opus designs the approach + seeds itself**

**Maintenance process:**
1. **Initial seeds:** Opus generates 10–20 high-confidence seed tickers per theme from training
   knowledge of US-listed equities (limited to widely-recognized theme leaders, not speculative names).
2. **Operator review:** before merging into `paradigm_config.json`, operator removes any
   tickers they disagree with and adds any obvious omissions.
3. **Quarterly refresh:** every 3 months, operator reviews seed lists. Adds new entrants
   that have clearly become category leaders; removes any whose theme exposure has lapsed
   (acquisitions, divestitures, strategy pivots).
4. **New themes:** when adding a new theme to the registry, generating seeds is the first
   curation step before any tagging runs.

**Propagation rule** (for `score_paradigm.py`):
- A seed ticker is auto-tagged with that theme. The seed method contributes a full vote
  (1 of 3 in the composite) plus a `seed=true` flag in `pdm_flags`.
- Adjacent tickers (same `industry` as ≥2 seeds in the same theme) get a partial seed vote
  (counts as 0.5 toward the composite's ≥2 threshold). This means seed-only stocks need at
  least one other method (keyword or GICS) to confirm; pure adjacency gives a weaker signal.
- "Same industry as a seed" is the only propagation rule. No cross-sector propagation.

**Stored at:** `paradigm_config.json` → `themes[*].member_rules.seed_tickers: [...]`

**Initial seeds:** see `ws1_t2_proposed_config.json`.

---

## Q4 — Composite threshold tuning: **≥2 for all themes initially** (per recommendation)

Per-theme tuning deferred until we have observed behavior on the full 6602-stock universe.
After WS1-T2a lands and produces tagged output, the operator may lower the threshold for
narrow themes (e.g., `glp1_metabolic` to ≥1) if the data shows it's too restrictive.

---

## Q5 — SEC business-description enhancement: **Build the fetcher. Mid priority.**

A separate task (WS1-T2d, post-T2a) will:
- Build `scripts/fetch_sec_descriptions.py` that pulls SIC codes and business descriptions
  from SEC EDGAR (`company_concept` / `company_facts` JSON endpoints) for each CIK in
  `sec_facts/`.
- Output to a new file `public/data/sec_descriptions.json` (additive, separate from
  `stocks.json` and existing `sec_facts/`).
- This unblocks the SEC method (§2.3 of the design doc) as a third candidate for the
  composite. Once available, the SEC method can replace one of the existing methods OR
  augment the composite (operator's call after seeing the data).

**Priority: mid.** Sequence: WS1-T2a (composite engine) → WS1-T2b (keyword pipeline) →
WS1-T2c (seed merge) → WS1-T2d (SEC fetcher) → WS1-T2e (sector enrichment, see Q7).

---

## Q6 — Multi-theme primary tiebreaker: **Theme priority order + operator override** (per recommendation)

`paradigm_config.json` `themes[]` array order = priority order. If two themes tie in
membership score, the earlier-listed theme wins for `pdm_theme_primary`.

A stock-level override mechanism (operator can pin `pdm_theme_primary` for specific tickers)
will be added in WS1-T2a as a simple `paradigm_overrides.json` lookup. Empty by default.

---

## Q7 — Missing sector/industry: **DeepSeek API enrichment (pre-compute, NOT scoring)**

**Critical framing:** This violates "no network calls in **scoring**" if done inline. It
does NOT violate the rule if done as a separate enrichment pre-compute pipeline whose
output is a static file consumed by scoring.

**Pipeline design (WS1-T2e):**

```
[stocks.json] ──► extract Unknown rows ──► DeepSeek batch ──► [sectors_enriched.json]
                                              ▲
                                              │
[stocks.json] ──► extract canonical (sector, industry) list ──┘
```

**`scripts/enrich_missing_sectors.py`:**

1. Reads `stocks.json`.
2. Builds the **canonical taxonomy**: the set of all unique `(sector, industry)` pairs across
   stocks where both are non-Unknown/non-null. This becomes the closed list DeepSeek must
   choose from — preventing fabrication of new categories.
3. Selects stocks where `sector == "Unknown"`, `industry == "Unknown"`, `sector is None`,
   or `industry is None`.
4. For each, calls DeepSeek (`deepseek-chat`) with a structured prompt:
   - Inputs: stock `name`, `description`, and the full canonical taxonomy list.
   - Required output (JSON): `{"sector": <one of canonical>, "industry": <one of canonical>, "confidence": <0.0-1.0>, "reasoning": <short>}`.
   - If genuinely uncertain (confidence < 0.6), the prompt instructs DeepSeek to return
     `sector: "Unknown"` rather than guess.
5. Writes results to **a separate file**: `public/data/sectors_enriched.json` keyed by ticker:
   ```json
   {
     "TICKER": {
       "sector": "Health Care",
       "industry": "Biotechnology",
       "enrichment_confidence": 0.85,
       "enrichment_source": "deepseek-chat",
       "enriched_at": "2026-05-25T12:00:00Z",
       "description_hash": "abc123..."
     }
   }
   ```
6. **Caching:** before calling DeepSeek for a ticker, check if an enriched entry exists AND
   the stored `description_hash` matches the current `stocks.json` description hash. If yes,
   skip (already enriched).
7. **Rate limiting:** 0.5s delay between API calls.
8. **Dry-run default:** like `backfill_fred_1980.py`, defaults to dry-run (lists which
   tickers would be enriched, makes no API calls). `--apply` flag required to actually call
   DeepSeek.
9. **Cost cap:** `--max-calls N` flag (default 100) to avoid runaway batches.

**`score_paradigm.py` consumption (in WS1-T2a):**
- After loading `stocks.json`, also load `sectors_enriched.json` if it exists.
- For each stock with Unknown/null sector or industry, merge in the enrichment values.
- Apply a `pdm_confidence` penalty of 20% for stocks whose sector/industry came from
  enrichment (not original data).
- Add `enriched_sector` to `pdm_flags` so operator can audit.

**Honest framing:** scoring remains deterministic and network-free. Enrichment is a separate
batch step. The dependency is: enrichment file → static config input → deterministic scoring.

---

## Q8 — Confidence score normalization: **Discrete scale first** (per recommendation)

`pdm_membership_score` = `(agreeing_methods / 3) * 100` → values 0, 33, 67, 100.
Continuous scale considered later only if discrete produces too many ties.

---

# Resulting build sequence

Each task below = one branch = one PR = one gate.

| ID | Task | Depends on | Status |
|---|---|---|---|
| **WS1-T2a** | Composite tagger engine (`score_paradigm.py` upgrade): reads config, keyword/GICS/seed methods, composite ≥2 rule, primary tiebreaker, override file. Empty inputs → 0 tags, mechanically correct. | WS1-T1 ✅ | ready to spec |
| **WS1-T2b** | Operator merges proposed keywords from `ws1_t2_proposed_config.json` into `paradigm_config.json` | this doc | **manual op** |
| **WS1-T2c** | Operator merges proposed seeds from `ws1_t2_proposed_config.json` into `paradigm_config.json` | this doc | **manual op** |
| **WS1-T2d** | SEC business-description fetcher (`fetch_sec_descriptions.py` → `sec_descriptions.json`) | WS1-T2a | ready to spec |
| **WS1-T2e** | DeepSeek sector/industry enrichment (`enrich_missing_sectors.py` → `sectors_enriched.json`); score_paradigm.py joins the enrichment file | WS1-T2a | ready to spec |
| WS1-T3 | Theme-momentum signal (relative strength, price + breadth) | WS1-T2a | brief lists; not specced |
| WS1-T4 | Economics-gate wiring (reads `rev_*` as the Nikola filter) | WS1-T3 | brief lists; not specced |
| WS1-T5 | Paradigm composite + parallel `pdm_*` surfacing | WS1-T4 | brief lists; not specced |

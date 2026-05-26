# WS1-T2: Theme-Membership Tagging — Design Recommendation

> **Task:** Evaluate membership-tagging methods for mapping ~6602 stocks in `stocks.json` to the 6 secular themes registered in `scripts/paradigm_config.json`.
> **Status:** Design only. No implementation.
> **Working directory:** `Stock Screener/`

---

## 1. Recommendation

### Recommended method: **Composite (≥2 methods agreeing)**

The composite method — requiring at least two independent membership signals to agree before tagging a stock with a theme — is the recommended approach for WS1-T2. It is the only method that directly addresses the brief's core concern: **"the thing that separated the winners was not being in a paradigm (the losers were too); it was converting the narrative into real economics"** (see `tasks/briefs/paradigm_orchestration_brief.md`, §0, lines 10-13).

While the composite method reduces recall (some genuine theme members tagged by only one method will be missed), this is the correct trade-off for a system whose primary risk is **false positives from narrative-only stocks**. The economics gate (WS1-T4) is the ultimate Nikola filter, but the membership layer should not be the source of noise that the gate has to clean up.

**The composite uses three sub-methods:**
1. **Keyword matching** against `name` + `description` (fast, broad coverage)
2. **GICS sector/industry whitelist** (coarse but defensible)
3. **Manual seed list + propagation** (highest precision, operator-curated)

A stock is tagged with a theme if ≥2 of these three agree. The `pdm_membership_score` is the count of agreeing methods (1, 2, or 3), normalized to a 0–100 scale. A score of 0 means no method fired; 33 means exactly one method fired (not tagged); 67 means two methods agreed (tagged); 100 means all three agreed (high-confidence tag).

### Runners-up and rejection reasons

| Method | Reason rejected as primary |
|---|---|
| **Keyword matching alone** | Highest false-positive risk. "AI" appears in marketing copy of non-tech companies (e.g., NNOX's description mentions "artificial intelligence" for medical imaging — see `stocks.json` line ~18). Would tag NNOX as `ai_compute`, which is clearly wrong. |
| **GICS sector/industry whitelist alone** | Too coarse. Cannot distinguish NVIDIA (Semiconductors → `ai_compute`) from Intel (Semiconductors → not primarily `ai_compute`). Misses theme members in unexpected sectors (e.g., a clean-energy software company in `Technology` that belongs to `energy_transition`). |
| **SEC business-description tagging** | **Not viable in current repo state.** The `sec_facts/` files contain XBRL-tagged financial data (balance sheet, income statement line items), not business descriptions or SIC codes. Files like `CIK0000002230.json` and `CIK0000005094.json` have empty `facts: {}` (see `Stock Screener/public/data/sec_facts/`). There is no SIC code or business-description field in these files. This method would require a separate data source (e.g., SEC EDGAR CIK-to-SIC mapping) that violates the "no network calls in scoring" constraint. **Rejected as infeasible without a new fetch pipeline.** |
| **Manual seed list alone** | Highest precision but does not scale. Every new theme requires operator curation. Cannot handle the full 6602-stock universe without an expansion mechanism. Used as a sub-component of the composite. |
| **LLM classification** | Violates "no network calls in scoring" constraint (`paradigm_orchestration_brief.md` §3, line 8). Also risks "fabricated data" if the LLM hallucinates a theme connection. Could be a separate pre-compute pipeline (offline batch), but that introduces a non-deterministic step that breaks the hashable-determinism requirement. |

---

## 2. Methods Compared

### 2.1 Keyword matching against `name` + `description`

**How it works:** For each theme, the `keywords` list in `paradigm_config.json` (currently empty — see `scripts/paradigm_config.json`, each theme has `"keywords": []`) is populated with theme-relevant terms. For each stock, the `name` and `description` fields are scanned (case-insensitive regex or substring match). If any keyword matches, the stock is tagged with that theme.

**Data needed:** `name` and `description` fields from each stock in `stocks.json`. Both are present for all stocks sampled (see `stocks.json` lines ~3-4 for NNOX, which has a long description).

**Data source:** Local — `stocks.json` only.

**False-positive risk:** **High.** The NNOX example is instructive: its description mentions "artificial intelligence" and "AI" multiple times (line ~18: "develops artificial intelligence applications"; line ~22: "AI-Based Aortic Valve Calcification Measurement"). NNOX is a medical imaging company (sector: Healthcare, industry: Medical Devices), not an AI compute infrastructure company. Keyword matching alone would tag it as `ai_compute`.

**False-negative risk:** **Medium.** A company that is genuinely in a theme but uses different terminology (e.g., a company doing "neural network inference at the edge" without saying "AI") would be missed.

**Determinism:** **Yes.** Same keywords + same text → same result.

**Confidence emission:** Boolean per keyword match. Could be scored as `match_count / total_keywords` or a simple 0/1 per theme. The `pdm_membership_score` (scaffolded as null in `score_paradigm.py` line 33) could be a real number 0.0–1.0 based on keyword hit density.

**Anti-Nikola posture:** **Weak.** A narrative-only stock with AI buzzwords in its description gets tagged. This is the economics gate's job, not membership's (see §0 of the brief: "the economics gate zeroes it out").

**Failure mode if data missing:** If `description` is null or empty, degrade to name-only matching. `pdm_membership_score` = null with a confidence penalty flagged in `pdm_flags`. Never invent a tag.

**Worked example — NVDA for `ai_compute`:**
- NVDA name: "NVIDIA Corporation"
- NVDA description (from `stocks.json` line ~621090): would contain "GPU", "artificial intelligence", "deep learning", "data center", "accelerated computing"
- Keywords for `ai_compute`: `["GPU", "artificial intelligence", "deep learning", "CUDA", "data center", "accelerated computing", "AI training", "inference"]`
- Match: multiple hits (GPU, AI, deep learning, data center, accelerated computing)
- Result: tagged `ai_compute` with high keyword density → `pdm_membership_score` ~0.9
- Verdict: correct tag, but the method would also tag NNOX similarly, which is wrong — demonstrating the false-positive risk.

---

### 2.2 GICS sector/industry whitelist per theme

**How it works:** Each theme has a whitelist of `sector` and/or `industry` values in `member_rules` (currently `{}` in `paradigm_config.json`). A stock is tagged if its `sector` or `industry` field matches the whitelist.

**Data needed:** `sector` and `industry` fields from `stocks.json`. Both are present for all sampled stocks (e.g., NNOX: sector "Healthcare", industry "Medical Devices").

**Data source:** Local — `stocks.json` only.

**False-positive risk:** **Medium.** Coarse by design. Example: "Semiconductors" industry would include both NVIDIA (genuine `ai_compute`) and Intel (primarily CPU, not AI compute). The whitelist would need to be narrow (e.g., industry = "Semiconductors" AND sector = "Technology" for `ai_compute`), but this still catches companies that are only tangentially related.

**False-negative risk:** **Medium-High.** A company that is genuinely in a theme but classified under an unexpected sector/industry would be missed. Example: a renewable-energy software company classified under "Technology" sector / "Software—Infrastructure" industry would be missed by an `energy_transition` whitelist that only includes "Solar" or "Wind" industries.

**Determinism:** **Yes.** Same sector/industry → same result.

**Confidence emission:** Boolean per whitelist match. Could be scored as 1.0 for exact industry match, 0.7 for sector-only match. The `pdm_membership_score` would be the match score.

**Anti-Nikola posture:** **Moderate.** A narrative-only stock in a hot sector (e.g., a pre-revenue EV SPAC in "Auto Manufacturers") would be tagged by sector alone. But the whitelist can be tuned to exclude broad sectors and only include specific industries where the theme is genuinely operational.

**Failure mode if data missing:** If `sector` or `industry` is null/"Unknown", degrade to null. `score_reverse.py` line ~170 shows the existing pattern: `if stock.get("sector") == "Unknown" or stock.get("industry") == "Unknown": score -= 1`. Mirror this: if sector/industry missing, `pdm_membership_score` = null, add flag.

**Worked example — NVDA for `ai_compute`:**
- NVDA sector: "Technology", industry: "Semiconductors"
- `ai_compute` whitelist: sectors = ["Technology"], industries = ["Semiconductors", "Data Center Infrastructure"]
- Match: sector "Technology" + industry "Semiconductors" both match
- Result: tagged `ai_compute` with score 1.0 (exact industry match)
- Verdict: correct, but Intel (same sector/industry) would also be tagged, which is a false positive for `ai_compute` since Intel's primary business is not AI compute infrastructure.

---

### 2.3 SEC business-description tagging

**How it works:** Parse SIC codes or business descriptions from SEC filing data to classify companies by standardized industry codes, then map those codes to themes.

**Data needed:** SIC code or business description from SEC filings.

**Data source:** Currently `sec_facts/` directory in `public/data/`. However, inspection reveals these files contain XBRL-tagged financial data (balance sheet, income statement items like `AccountsPayableCurrent`, `AccountsReceivableNetCurrent`, etc.) — see `CIK0000001750.json` for the full structure. There are **no SIC codes or business descriptions** in these files. Files like `CIK0000002230.json` and `CIK0000005094.json` have `"entityName": ""` and `"facts": {}` — completely empty.

**False-positive risk:** **Low** (if SIC codes were available). SIC codes are standardized and narrow. But the mapping from SIC → theme would still have ambiguity (e.g., SIC 3571 "Electronic Computers" could map to `ai_compute` or `cloud_software`).

**False-negative risk:** **Low** (if SIC codes were available). Standardized codes cover all public companies.

**Determinism:** **Yes** (if using static SIC mapping).

**Confidence emission:** Boolean per SIC-to-theme mapping. Could be scored as 1.0 for exact SIC match.

**Anti-Nikola posture:** **Good.** SIC codes are based on what the company actually reports as its primary business, not marketing copy. A narrative-only stock would still have a legitimate SIC code, but the code would reflect its actual business (e.g., "Blank Check" for a SPAC), not the hot theme it claims.

**Failure mode if data missing:** **This is the critical issue.** The current `sec_facts/` data does not contain SIC codes or business descriptions. To use this method, a new data source would need to be fetched (violating "no network calls in scoring"). If the SEC file is missing or empty (as with `CIK0000002230.json`), degrade to null.

**Verdict:** **Not viable in current repo state.** This method requires a separate data-fetch pipeline (e.g., SEC EDGAR CIK-to-SIC mapping) that does not exist. It is mentioned here for completeness and as a future enhancement path, but cannot be part of the initial implementation.

**Worked example — NVDA for `ai_compute` (hypothetical):**
- NVDA CIK: 0001045810 (not in the current `sec_facts/` directory)
- Hypothetical SIC: 3674 (Semiconductors and Related Devices)
- `ai_compute` SIC mapping: [3674, 3571, 7373, ...]
- Match: SIC 3674 matches
- Result: tagged `ai_compute`
- Verdict: would be correct, but the data is not available.

---

### 2.4 Manual seed list per theme + propagation by similarity

**How it works:** The operator curates a seed list of tickers per theme (e.g., NVDA, AMD, MRVL → `ai_compute`). Then, for each seed ticker, the system looks at its `sector` and `industry` and propagates the theme to all other stocks sharing that sector/industry. This is the approach used implicitly by `score_reverse.py`'s `match_industry_keyword` function (lines ~280-290 in `score_reverse.py`), which routes archetypes based on industry keyword matching.

**Data needed:** Seed ticker list (operator-curated), plus `sector` and `industry` from `stocks.json`.

**Data source:** Local — `stocks.json` + operator-provided seed list (stored in `paradigm_config.json`'s `member_rules`).

**False-positive risk:** **Low-Medium.** High precision on the seed tickers themselves. Propagation by sector/industry introduces the same coarseness as method 2.2.

**False-negative risk:** **Medium.** New themes without seed lists get no tags. Also, a genuine theme member in an unexpected sector/industry is missed by propagation.

**Determinism:** **Yes.** Same seed list + same sector/industry → same result.

**Confidence emission:** Scored as 1.0 for seed tickers, 0.7 for propagated (same industry), 0.5 for propagated (same sector only). The `pdm_membership_score` reflects this tiered confidence.

**Anti-Nikola posture:** **Best of all methods.** The operator explicitly curates which tickers are genuine theme members. A narrative-only stock would not be on the seed list, and if it shares a sector/industry with a seed ticker, the lower confidence score (0.5–0.7) flags it as a propagation, not a direct curation.

**Failure mode if data missing:** If a seed ticker is missing from `stocks.json`, skip it. If sector/industry is missing, propagation cannot happen — degrade to seed-only tagging.

**Worked example — NVDA for `ai_compute`:**
- Seed list for `ai_compute`: [NVDA, AMD, INTC, MRVL]
- NVDA is a direct seed match → tagged `ai_compute` with score 1.0
- Propagation: NVDA's industry is "Semiconductors" → all stocks in "Semiconductors" industry get tagged with score 0.7
- Result: NVDA tagged (seed), plus all other semiconductor stocks tagged (propagation)
- Verdict: correct for NVDA; propagation catches genuine peers but also catches tangential semiconductor companies.

---

### 2.5 Composite (≥2 methods agreeing) — RECOMMENDED

**How it works:** Run methods 2.1 (keyword), 2.2 (GICS whitelist), and 2.4 (seed+propagation) independently. A stock is tagged with a theme only if ≥2 of the three methods agree. The `pdm_membership_score` is the count of agreeing methods (1, 2, or 3), normalized to 0–100.

**Data needed:** All data from methods 2.1, 2.2, and 2.4.

**Data source:** Local — `stocks.json` + operator-curated seed lists + keyword lists.

**False-positive risk:** **Lowest of all methods.** Requiring ≥2 agreements eliminates the single-method false positives:
- NNOX would be tagged by keyword (mentions "AI") but NOT by GICS (Healthcare/Medical Devices is not in `ai_compute` whitelist) and NOT by seed list (not a seed, not in Semiconductors). Result: 1/3 methods → not tagged. Correct.
- A semiconductor company with no AI keywords in its description would be tagged by GICS (Semiconductors) and possibly by seed propagation, but NOT by keyword. Result: 2/3 methods → tagged. Borderline — the economics gate will filter.

**False-negative risk:** **Medium-Higher.** A genuine theme member that only matches one method (e.g., a company in an unexpected industry that uses theme keywords) would be missed. This is the deliberate trade-off.

**Determinism:** **Yes.** All sub-methods are deterministic.

**Confidence emission:** `pdm_membership_score` = (agreeing_methods / 3) * 100. So:
- 0 methods: score 0 (not tagged)
- 1 method: score 33 (not tagged — below threshold)
- 2 methods: score 67 (tagged)
- 3 methods: score 100 (tagged, high confidence)

**Anti-Nikola posture:** **Best available.** A narrative-only stock needs to pass two independent tests to get tagged. The keyword test is the easiest to pass (marketing copy), but the GICS test requires being in the right sector, and the seed test requires operator curation. A Nikola-like stock (pre-revenue, narrative-heavy, wrong sector) would likely only pass the keyword test.

**Failure mode if data missing:** If any sub-method cannot produce a result (e.g., missing description for keyword matching), that method votes "no" and the composite uses the remaining methods. If only 1 method is available and it votes yes, the stock is not tagged (below threshold). If all methods are unavailable, `pdm_membership_score` = null.

**Worked example — NVDA for `ai_compute`:**
- Keyword method: matches (AI, GPU, deep learning keywords) → YES
- GICS method: matches (Technology/Semiconductors) → YES
- Seed method: matches (NVDA is a seed ticker) → YES
- Agreement: 3/3 methods → tagged `ai_compute` with score 100
- Verdict: correct, high confidence.

---

### 2.6 LLM classification (brief mention)

**How it works:** Use an LLM to read the stock's description and classify it into one or more themes.

**Why not deeply evaluated:** Violates "no network calls in scoring" constraint (`paradigm_orchestration_brief.md` §3, line 8). Also introduces non-determinism (same input → different output across runs) and risks fabricated data (LLM hallucinating a theme connection). Could be a separate pre-compute pipeline (offline batch, results cached), but that adds complexity and a non-deterministic step that breaks the hashable-determinism requirement. If proposed as a pre-compute step, it must be flagged as a separate data-fetch pipeline, not part of the scoring code.

---

## 3. Comparison Table

| Method | Determinism | Data needed | False-positive risk | False-negative risk | Suitable for confidence emission? |
|---|---|---|---|---|---|
| **Keyword matching** | Yes | `name`, `description` | High (NNOX→AI) | Medium (unusual terminology) | Yes — keyword density score |
| **GICS sector/industry whitelist** | Yes | `sector`, `industry` | Medium (Intel→AI) | Medium-High (cross-sector theme members) | Yes — tiered (industry=1.0, sector=0.7) |
| **SEC business-description tagging** | Yes (if data existed) | SIC codes (not in current `sec_facts/`) | Low | Low | Yes — exact SIC match |
| **Manual seed + propagation** | Yes | Seed list + `sector`, `industry` | Low-Medium (propagation noise) | Medium (new themes need seeds) | Yes — tiered (seed=1.0, industry=0.7, sector=0.5) |
| **Composite (≥2 agree)** | Yes | All of the above | **Lowest** | Medium-Higher (deliberate trade-off) | Yes — count of agreeing methods |
| **LLM classification** | No | `description` + network call | Medium (hallucination) | Low | No — non-deterministic |

---

## 4. Multi-theme handling

A stock may fit 2+ themes (e.g., MSFT fits both `ai_compute` and `cloud_software`). The `pdm_themes` field (a list, currently `[]` in `score_paradigm.py` line 28) should contain all themes for which the stock passes the composite threshold (≥2 methods agreeing).

The `pdm_theme_primary` field (currently `null` in `score_paradigm.py` line 29) should be determined by **membership score rank**:
1. Rank all tagged themes by `pdm_membership_score` (higher = more methods agreed).
2. If tied, rank by the number of keyword matches (finer granularity).
3. If still tied, rank by theme priority order defined in `paradigm_config.json` (themes listed first have higher priority).
4. The top-ranked theme becomes `pdm_theme_primary`.

**Defer to operator:** If the operator disagrees with the automatic primary, they can override it by setting `pdm_theme_primary` directly in `paradigm_scores.json`. The automatic ranking is a default, not a mandate.

**Edge case — no themes tagged:** If a stock passes no theme thresholds, `pdm_themes` remains `[]` and `pdm_theme_primary` remains `null`. The stock is still scored on momentum and economics gate (if applicable), but with a `pdm_flags` entry like `"no_theme_membership"`.

---

## 5. Worked end-to-end example

Using the recommended **Composite (≥2 methods agreeing)** method on 5 hand-picked tickers across ≥3 themes.

### Setup
- **Themes:** `ai_compute`, `cloud_software`, `glp1_metabolic`, `energy_transition`, `cybersecurity`
- **Keywords per theme** (illustrative — would be defined in `paradigm_config.json`):
  - `ai_compute`: GPU, CUDA, artificial intelligence, deep learning, AI training, inference, data center, accelerated computing
  - `cloud_software`: SaaS, cloud, software-as-a-service, PaaS, IaaS, subscription, recurring revenue
  - `glp1_metabolic`: GLP-1, metabolic, obesity, diabetes, incretin, semaglutide, tirzepatide
  - `energy_transition`: renewable, solar, wind, battery, energy storage, electrification, grid, clean energy
  - `cybersecurity`: cybersecurity, security, threat detection, endpoint, firewall, identity, zero trust
- **GICS whitelists** (illustrative):
  - `ai_compute`: sector "Technology", industries ["Semiconductors", "Data Center Infrastructure"]
  - `cloud_software`: sector "Technology", industries ["Software—Infrastructure", "Software—Application"]
  - `glp1_metabolic`: sector "Healthcare", industries ["Biotechnology", "Drug Manufacturers—General"]
  - `energy_transition`: industries ["Solar", "Wind", "Electrical Equipment & Parts", "Utilities—Renewable"]
  - `cybersecurity`: sector "Technology", industries ["Software—Infrastructure"] (with keyword refinement)
- **Seed lists** (illustrative):
  - `ai_compute`: [NVDA, AMD, INTC]
  - `cloud_software`: [MSFT, CRM, NOW]
  - `glp1_metabolic`: [NVO, LLY]
  - `energy_transition`: [ENPH, SEDG, PLUG]
  - `cybersecurity`: [CRWD, PANW, ZS]

### Results

| Ticker | Name | Sector | Industry | Keyword matches | GICS match | Seed match | Agree count | Tagged themes | Primary | Score |
|---|---|---|---|---|---|---|---|---|---|---|
| **NVDA** | NVIDIA Corporation | Technology | Semiconductors | ai_compute (GPU, AI, deep learning, CUDA, data center) | ai_compute | ai_compute (seed) | 3/3 | [ai_compute] | ai_compute | 100 |
| **MSFT** | Microsoft Corporation | Technology | Software—Infrastructure | ai_compute (AI, data center), cloud_software (cloud, SaaS, Azure, subscription) | cloud_software | cloud_software (seed) | ai_compute: 2/3 (keyword+GICS), cloud_software: 3/3 | [ai_compute, cloud_software] | cloud_software (score 100 > 67) | ai: 67, cloud: 100 |
| **NVO** | Novo Nordisk A/S | Healthcare | Drug Manufacturers—General | glp1_metabolic (GLP-1, obesity, diabetes, semaglutide) | glp1_metabolic | glp1_metabolic (seed) | 3/3 | [glp1_metabolic] | glp1_metabolic | 100 |
| **XOM** | Exxon Mobil Corporation | Energy | Oil & Gas Integrated | energy_transition (carbon capture mentions? — likely none or weak) | None (not in whitelist) | None (not a seed) | 0/3 | [] | null | 0 |
| **JPM** | JPMorgan Chase & Co. | Financial Services | Banks—Diversified | None (no theme keywords in description) | None (Financial Services not in any whitelist) | None (not a seed) | 0/3 | [] | null | 0 |

### Commentary

- **NVDA:** Uncontroversial. All three methods agree. Score 100.
- **MSFT:** Multi-theme. Keyword method catches both `ai_compute` (Azure AI, Copilot) and `cloud_software` (Azure, Office 365). GICS method catches `cloud_software` (Software—Infrastructure). Seed method catches `cloud_software`. Result: 2 themes tagged, `cloud_software` wins primary (score 100 vs 67).
- **NVO:** Uncontroversial for `glp1_metabolic`. All three methods agree. Score 100.
- **XOM:** No theme matches. XOM is in "Energy" sector / "Oil & Gas Integrated" industry — not in any whitelist. Its description would mention "oil", "gas", "petroleum", "refining" — none of which are keywords for the seeded themes. Correctly untagged. Note: if `energy_transition` were broadened to include "carbon capture" or "low-carbon", XOM might get a keyword match, but the GICS and seed methods would still not fire, so the composite would not tag it (1/3 < threshold).
- **JPM:** No theme matches. Financial Services sector is not in any whitelist. Description mentions "banking", "financial services", "investment" — no theme keywords. Correctly untagged.

---

## 6. Open questions for the operator

1. **Keyword list curation:** Who populates the `keywords` arrays in `paradigm_config.json`? Should this be done by the operator (domain expertise) or via an automated keyword-extraction step from theme descriptions? If automated, what tool? (The brief says "no network calls in scoring" — extraction could be a separate offline step.)

2. **GICS whitelist granularity:** Should the whitelist match at the `industry` level only, or also at the `sector` level? Sector-level matching increases recall but also false positives. For example, `energy_transition` could match sector "Energy" (high recall, many false positives) or only specific industries like "Solar" and "Wind" (lower recall, higher precision). **Recommendation:** Start with industry-level only, add sector-level as a lower-confidence tier.

3. **Seed list maintenance:** Who maintains the seed lists? How often are they updated? New themes (e.g., a future "quantum_computing" theme) would need seed curation before they can tag any stocks. Is there a process for proposing seed tickers?

4. **Composite threshold tuning:** The ≥2 agreement threshold is a starting point. Should it be adjustable per theme? For example, a broad theme like `cloud_software` might use ≥2, while a narrow theme like `glp1_metabolic` might use ≥1 (since false positives are less likely in a narrow therapeutic area). **Recommendation:** Start with ≥2 for all themes, tune after observing results on the full 6602-stock universe.

5. **SEC data enhancement:** The `sec_facts/` directory does not contain SIC codes or business descriptions (see §2.3). Should a separate data-fetch pipeline be built to enrich this data? This would be a pre-compute step (not scoring), so it does not violate the "no network calls in scoring" constraint. If yes, what is the priority relative to other tasks?

6. **Multi-theme primary tiebreaker:** If two themes have the same membership score (e.g., both 67 from 2/3 methods), should the tiebreaker be (a) theme priority order in `paradigm_config.json`, (b) keyword match count, (c) momentum score (WS1-T3), or (d) operator override? **Recommendation:** Use (a) theme priority order as the default, with (d) operator override always available.

7. **Non-US stocks and GICS:** Some non-US stocks may have different sector/industry classifications or missing data. How should the system handle stocks where `sector` or `industry` is "Unknown" or null? `score_reverse.py` line ~170 already penalizes this: `if stock.get("sector") == "Unknown" or stock.get("industry") == "Unknown": score -= 1`. Mirror this pattern — if sector/industry is missing, the GICS method votes "no" and the composite uses the remaining methods.

8. **Confidence score normalization:** The proposed `pdm_membership_score` = (agreeing_methods / 3) * 100 produces values 0, 33, 67, 100. Should this be a continuous range instead? For example, keyword match density could produce a 0.0–1.0 score per method, and the composite could average them. **Recommendation:** Start with the discrete scale (simpler, easier to debug), move to continuous if the discrete scale produces too many ties.

---

## Appendix: Data sources referenced

| File | Path | Key observations |
|---|---|---|
| `paradigm_config.json` | `Stock Screener/scripts/paradigm_config.json` | 6 themes, all with `member_rules: {}` and `keywords: []` |
| `stocks.json` | `Stock Screener/public/data/stocks.json` | ~6602 stocks; each has `symbol`, `name`, `description`, `sector`, `industry`, `country`, `metrics`, `reverse`, `paradigm` |
| `score_paradigm.py` | `Stock Screener/scripts/score_paradigm.py` | Scaffold with 12 `pdm_*` fields (not 13 as brief states — see line ~33 note); additive-only pattern |
| `score_reverse.py` | `Stock Screener/scripts/score_reverse.py` | IO pattern: `load_json`, `write_json`, `build_joined_record`; handles missing data with `is_missing_required` (line ~175); uses `match_industry_keyword` (line ~280) for archetype routing |
| `paradigm_orchestration_brief.md` | `tasks/briefs/paradigm_orchestration_brief.md` | §3 standing constraints: additive only, no network calls, deterministic, no fabricated data, economics gate mandatory |
| `sec_facts/` | `Stock Screener/public/data/sec_facts/` | XBRL financial data only; no SIC codes or business descriptions; some files empty (`CIK0000002230.json`, `CIK0000005094.json`) |

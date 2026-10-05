# 04 — Data contracts: what the site can read and what every field means

The site reads static JSON from `public/data/` (and a few Supabase tables for user features). Real,
trimmed examples of every contract below are in `fixtures/` — **build the design against those
files**, not against invented data. Examples carry a `_fixture_note` saying what is real.

Rules that apply to *every* field (they are system-wide non-negotiables, so the UI must respect them):

1. **`0` / `0.0` is a value, not an absence.** `null` / missing = unknown. Render unknown as an
   explicit "—" or "not available" with a reason where one is given; never as `0`, never as blank
   space that looks like a bug.
2. **Never invent a number.** If a field is absent, show absence. No default margin of safety, no
   default "3 runs", no interpolated price.
3. **A field the contract does not list is silently dropped by its owner.** If the design needs a new
   field, it must be requested from the pipeline owner as a contract change (see
   `08_CONSTRAINTS_AND_ENGINEERING.md`, "Asking for data that does not exist").
4. **Everything is dated.** Most files carry `generated_at` or `asof`. Show freshness.

---

## 4.1 File inventory — current vs legacy

### CURRENT (the design is built on these)

| File | Producer | Refresh | What it is |
| --- | --- | --- | --- |
| `factor_scores.json` | screener chain (SCR-03b, cloud) | several times each weekday | **The book.** One row per scored company (~7,000 incl. vetoed): band, rank, door nominations, z-scores, flags, veto reasons. Header carries counts, engine, regime, data-source stamps. |
| `depth_overlay.json` | analyst publish (DEP-10, via the publish clone) | whenever the PC publishes (hours–days) | **The verdicts.** Newest verdict per company (`tickers` map) plus header (`generated_at`, `scheme`, `count`, `actionable_count`, `gate_version`). |
| `depth_reports/{TICKER}.json` | analyst publish | with the overlay | Full write-up bundle behind each verdict: `verdict`, per-run `samples[]` (each with `report` = the raw memo text, `iv`, `plausible`, `reasons`, `secs`) and the `scorecard`. |
| `depth_outcomes.json` | grader (TRK-06) | after each sweep (offline) + weekly (network) | Forward-return grades of verdicts at 30/91/182/365 d vs IWM/SPY/QQQ: `graded[]`, `per_horizon{h:{all,cuts[],spearman_vs_excess_iwm}}`, `caveats[]`, counts. |
| `paper_ledgers.json` | paper tracker (TRK-03, cloud daily) | daily | Books marked to market: `config`, `inception`, `health`, `alerts[]`, `ledgers{equal, rn_depth, …}`. Each ledger: `nav_series`, `trades`, `closed`, `state{cash,holdings}`, `summary`, `exit_pending`, `last_marks`. |
| `valuation_models.json` | SCR-05 | with the chain | Per-name reverse-DCF **expectations model** (the workbench): assumptions, `implied_growth`, `expectations_gap_pts`, historical CAGRs, verdict sentence. *Not a price target.* |
| `stocks.json` / `stocks.csv` | DAT-01/02 | daily + intraday price overlay | Universe: symbol, name, sector, industry, price, marketCap, metrics. (Legacy fields inside it — `score`, `status`, `reasons`, `reverse`, `paradigm` — are retired; ignore them.) |
| `financials/{TICKER}.json` | DAT-01 | daily | Per-company statements + price (used by the analyst; the site uses little of it). |
| `momentum_state.json`, `daily_closes.json` | SCR-10 | daily | Price-action facts per name (52-week-high distance, 200-day trend, relative strength, `mom_break`) and 400 days of closes for book names — usable for sparklines/price charts. |
| `mri/current_regime.json` etc. | macro engine (copied in) | daily when healthy | Regime read, cost-of-capital anchor, growth anchor, multiple bands, sector ranking. Each has `asof`/`date` and `degraded`. |
| `analyst_coverage.json`, `eps_trajectory.json`, `fundamentals_*.json`, `overlay_signals.json`, `dividends.json`, `fundamentals_battery.json` | DAT-04..09 | weekly/daily | Supporting evidence for a stock page (analyst targets, forward EPS path, TTM/quarterly statements, insider/short signals, F-score / accruals / Beneish). Optional detail. |
| `ondemand_index.json`, `ondemand_reports/{T}.json` | DEP-11 | on request | Verdicts the operator requested for **any** ticker (even outside the book). Deliberately separate from the book — never mix them into rankings or books. |
| `chain_manifest.json` | SCR-00 | each chain run | Run id, finished_at, step list, **invariants list with pass/fail**, `ok`. The source for a system-health indicator. |
| *(Phase C — not yet live)* follow-up fields on each overlay row | DEP-14 / DEP-13 | daily | `watch_items`, `followup_*`, `buy_paused*`, `holding_state`, `thesis_*`, `entry_timing_now`, `carry` — shape in `fixtures/watch_items_example.json`. |

### LEGACY — do not build on these (still in the repo; some are still fetched by old components)

`factor_scores` *engine string* `factor_lab_v2_equal` / `weights_used` / `fct_haircuts` / `fct_context`
(the deleted equal-weight Factor Lab — if you ever see them, they came from a stale file);
`unified_scores.json`; `rs2/` (163 MB of old full-text reports) + `rs2_verdict_log.jsonl` +
`rs2_verdict_outcomes*.json` + `llm_overlay.json` (the retired five-stage pipeline, frozen);
`depth_overlay_legacy.json` + `depth_reports_legacy/` (the pre-charter depth book, 207 names);
`portfolio_plan*.json`, `portfolio_report*.md` (Kelly plan books); `paradigm_*`, `theme_assignments_llm.json`
(theme engine); `reverse_scores.json`; `backtest_*`; `factor_ic*`; `current_sector_ranking.json` at the
data root (the mri/ copy is the live one); `stress_scenario.md`; `*.bak*`, `*.SUBSET.json`, `scan.log`.
See `06_LEGACY_VS_CURRENT.md`.

---

## 4.2 `factor_scores.json` — the book

Header (real example in `fixtures/factor_scores_examples.json`):

| Field | Meaning / UI use |
| --- | --- |
| `engine` | Should read `dual_door_dynamic_macro_v2_cluster_guarded`. If it reads `factor_lab_v2_equal`, the file is stale — show a health warning, do not render it as current. |
| `generated_at` | The "book scored" timestamp. |
| `scored_count` | Companies that received a score (≈ 3,047 on 2026-10-04). |
| `band_counts` | `{research_now, watchlist, pass, vetoed}` → funnel numbers (60 / 101 / 2,886 / 3,925). |
| `reported_macro_regime`, `macro_confidence`, `sector_quota_source` (`neutral_no_validated_edge` = flat 8 slots per sector), `sector_ranking_date`, `sector_ranking_age_days` | Macro context actually used by this run. |
| `discount_rate_source` (`anchor` or `constant_fallback`), `discount_rate_reason`, `discount_rate_asof`, `discount_rate_age_days` | Whether the screen used the macro engine's cost of capital or fell back to a flat 10 %. **A fallback should be visible** (it lowers trust in every expectations gap). |
| `momentum_source`, `momentum_coverage`, `z_method`, `door2_momentum_floor` | Method stamps — footnote material. |
| `hysteresis`, `hysteresis_retained[]`, `band_transitions{entered_rn, left_rn, entered_book, left_book, retained_by_hysteresis}` | **"What changed since last run"** — ideal for a "Changes" feed. |

Per-ticker row (`tickers[SYMBOL]`):

| Field | Meaning / UI use |
| --- | --- |
| `fct_band` | `research_now` (priority queue; the top slice) · `watchlist` · `pass` (scored, not nominated) · `vetoed` (disqualified before analysis). |
| `fct_rank` | Position in the priority queue (1 = first to be analysed). **`null` rank rows must be skipped from ranked lists.** |
| `fct_composite` / `fct_percentile` | Best-door percentile (0–100) — "how far up its own door's league table". Use as a rank-strength bar, not as a verdict. |
| `fct_nominated_doors` | Subset of `DOOR_1_COMPOUNDER`, `DOOR_2_VALUE_GAP`, `DOOR_3_TREND_LEADER`, `DOUBLE_DOOR_CHAMPION`, `HYSTERESIS_RETAINED`, `also_trend_leader`, wildcard markers. Drives the plain-English **"Why it's listed"**: Quality / Value / Trend (see `lib/desk/tone.ts` `whyListed`). |
| `fct_z` | `{quality, momentum, revisions, value, exp_gap}` sector-relative z-scores (±3). `null` = pillar unavailable (shown as missing). Use for the "how it got here" bars. |
| `fct_contributions` | How the winning door's score decomposes. |
| `fct_momentum_state` | `mom_12_1`, `mom_6m`, `mom_1m`, `high_52w_proxy`, `mom_accel`, `regime_shift_up/down`, `jump_share`, `up_months`… |
| `fct_flags[]` + `fct_flag_detail{}` | **Annotations that never gate**: `falling_knife`, `forensic_red_flag`, `insolvency_distress_altman_z`, `momentum_missing`, `revisions_missing`, `adv_missing`, `stale_annual_data`, `beneish_unverifiable`, … Show as small warning chips with their plain-English gloss (`FORENSIC_WARNINGS` in `tone.ts`). |
| `fct_veto` / `fct_veto_detail` | Present when `fct_band == vetoed`: the reason code (`NOT_TRADABLE`, `MARKET_CAP_BELOW_300M`, `PRICE_BELOW_3`, `ILLIQUID_ADV_BELOW_300K`, `NON_OPERATING_SHELL_SPAC`, `FORENSIC_MANIPULATION_RISK`, `NO_FUNDAMENTAL_HISTORY`, `CHRONIC_OPERATING_LOSS_LEVERAGE`, `FAILED_TIER1_HYGIENE`) and detail. **A veto is shown with its reason, never as a blank.** A vetoed name can never be promoted by the analyst. |
| `sector`, `cluster`, `archetype` | GICS sector; strategic cluster (e.g. `semiconductors`, `banks`); valuation archetype (`commercial_bank`, `insurance_lending`, `real_estate_reit`, `commodity_cyclical`, `rd_biotech`, `compounder_general`). |
| `gap_basis` (`owner_cf` / `revenue_fallback`), `discount_rate_pct` | Provenance of the expectations gap for that name. |
| `fct_band_llm`, `fct_llm` (`promoted` / `promoted_partial` / `demoted` / absent), `fct_llm_veto` (`llm_reject`), `fct_llm_note` | Divergence markers written back after the analyst's verdict (the **screen-vs-analyst split**). Only present for names with an actionable-or-considered verdict. |

---

## 4.3 `depth_overlay.json` — the verdicts

Header: `generated_at` (the "latest verdict published" stamp), `scheme` (`band_direction_v1`), `count`,
`actionable_count`, `gate_version`. Rows are keyed by ticker. Two real rows are in `fixtures/`:
`depth_overlay_row_legacy_ADT.json` (what is published today — old analyst) and
`depth_overlay_row_new_analyst_DDI.json` (what the rebuilt analyst writes).

### Core verdict fields (both analyst generations)

| Field | Meaning / UI use |
| --- | --- |
| `ticker`, `price`, `date` | Price **at verdict time** and the verdict date. (`price_asof`, `price_source` on new rows give the quote's own date.) The site separately has a live/latest price; show both when they differ and say which is which. |
| `direction` | `undervalued` · `hold` · `overvalued` · `null` (with `status: "not_usable"`). Shown as UNDERVALUED / FAIR / OVERVALUED / NOT USABLE. |
| `iv_band_low`, `iv_band_high`, `median_iv` | The plausible intrinsic-value band and its median. The **hero visual** is price against this band. A degenerate band (low == high, one sample) is a point, not a range — show it as such and say "one run". |
| `spread_pct` | Disagreement between runs (band width as % of median). `null` for a single run. |
| `samples_run`, `n_basis`, `converged`, `early_stop`, `mode` | How many runs were made / count as the basis / whether they agreed / whether the early-stop rule ended it / the run mode (`adaptive`, `fixed_1`, …). **Show real numbers; never assume "3 runs".** |
| `size_hint` | `quarter` / `half` / `full` — the position-size hint. A single plausible run caps at quarter. |
| `size_components` *(new)* | `{dispersion, mos, conviction, risk}` each with its `bucket` and source value. The hint is the most conservative of the four — a great **"why this size"** mini-table. `risk` is the macro turbulence flag; `null` bucket + `risk_flag_unavailable` flag means "unknown, deliberately not sized up". |
| `mos_vs_median_pct`, `mos_vs_base_pct` *(new)* | Margin of safety vs the cross-run median / vs the chosen "base" case. `base_iv` (inside the scorecard) is the coherent contract's own base; `median_iv` is the dispersion statistic — they are different numbers; do not swap them. |
| `bull_iv`, `bear_iv`, `asymmetric_payoff_skew`, `kelly_fraction_pct` | Scenario values, upside/downside ratio, and the (quarter-)Kelly position cap. **Kelly is capped (≈ 24.75 %) and was at the cap in most outputs — show it as an upper bound with the cap noted, never as "the recommended weight".** |
| `conviction_score` (/15), `business_quality_moat` (/5) | The analyst's self-reports. **Supporting detail only** — not a headline, and not a rank. (The old UI led with "conviction ≥ 12/15 = High Conviction Core"; that framing is retired.) |
| `reentry_tranches` | `{tranche_1_starter, tranche_2_core}` — buy-limit prices for staged entry. |
| `thesis_invalidation_triggers[]` | Plain-language "what would prove this wrong", written before any position exists. A flagship element of the stock page. |
| `flags[]` | Annotations such as `MODE_INSTABILITY`, `above_52w_high_2.80x`, `above_analyst_high_1.72x_cap_1.5x`, `mos_+182pct_beyond_150pct`, `no_valid_crux:<reason>`, `compounder_near_fair_value`, `risk_flag_unavailable`. Machine-ish strings: map known ones to plain English, show unknown ones verbatim in a small mono chip. |
| `reason` | A one-sentence human explanation the pipeline wrote for this verdict (e.g. why size is capped). Show it. |
| `consensus_dir` | Run id (`TICKER_YYYYMMDD_HHMMSS`) — joins to `depth_reports/{T}.json` and is the stable reference id for a verdict. |
| `pack_revision`, `gate_version`, `model` | Analyst-version stamps. **`pack_revision` ≥ 19–21 + `gate_version` 8 = the rebuilt analyst.** Old rows: `pack_revision` 3/4, `gate_version` null, model `rs2-analyst-deep-mtp5`. |
| `run_source`, `arm`, `pack_source`, `screener_data_commit`, `research_brief_asof`, `price_asof`… *(new)* | Provenance. `arm: cloud_api` = degraded cloud stand-in (no local research brief) — mark visibly. |

### Rebuilt-analyst fields (new in `band_direction_v1` rows from pack revision ≥ 19)

| Field | Meaning / UI use |
| --- | --- |
| `crux[]`, `crux_valid`, `price_implied{}` | **The stated disagreement with the price.** Each `crux` entry: `input` (e.g. `growth_years_3_5`, `coe`, `fade_years`, `terminal_ronic`), `own` (analyst's value), `implied` (the value the *current price* requires), `at_default`, `reason` (the argument with quoted evidence). `price_implied` is the full map of reverse-solved inputs, each with `value`, `reachable` (false = the price cannot be explained by changing this input alone), `own`, `side`, `bound`. This is the single most important new thing to visualise: *"the price implies X; the analyst believes Y; here is the evidence."* `crux_valid: false` on a directional row means the call was downgraded/blocked. |
| `coe_used`, `coe_source` (`anchor` / `anchor_adjusted` / `own`), `coe_minus_anchor`, `terminal_method`, `terminal_multiple_or_g`, `fade_years`, `valuation_frame` (`equity`/`firm`) | Declared valuation inputs and how far the analyst's cost of equity sits from the macro anchor. |
| `consensus_implied_value`, `street_fence{low, high, n_targets, asof, source}` | Where the sell-side analyst consensus range sits; a verdict value far outside it (>1.5× the high) is blocked as `outside_street_fence`. A natural overlay on the band chart: *the Street's range*. |
| `entry_timing` (`buy_now`/`wait_for_momentum`/`avoid`), `momentum_view` (`confirming`/`neutral`/`contradicting`), `momentum_flip_condition`, `momentum_break_rule` | The timing call, distinct from the value call. A cheap name that is "wait for momentum" is the **Waiting** group. Conditions are `{metric, comparator, threshold, window_days}`. |
| `invalidation_rules[]` | Machine-checkable thesis-break rules `{metric, comparator, threshold, window, source}`. The daily monitor evaluates them. |
| `desk_calls`, `desk_iv_match`, `fiduciary_verdict` (`PASS`/`FAIL`), `fiduciary_violations[]` | Integrity stamps: did the analyst use the calculator, does its answer match the calculator's, does the contract pass the audit. Footnote-level trust signals. |
| `instability{prior_iv, current_iv, delta_pct, unstable}` | Base value moved a lot since the previous verdict (>25 %) → `mode_instability`. Worth a "value changed a lot since last time" note. |
| `catalysts[]`, `cash_flow_life`, `long_run_facts`, `cycle_evidence`, `scorecard{…}` | Deep detail; use in an "Evidence" accordion, not the primary view. |

### Gate fields (added when the overlay is rebuilt — present on every current row)

| Field | Meaning / UI use |
| --- | --- |
| `actionable` | `true` = may be bought / may enter the AI book. `false` = **blocked: still published, still shown, never bought.** Missing (legacy overlay) is treated as *not blocked* by the old code (fail-open); the new design should treat a verdict with `actionable == null` as "legacy / unchecked". |
| `actionable_reasons[]` | Closed vocabulary. Plain-English gloss (use these exact meanings; `lib/desk/tone.ts` has the shipping labels): |
| | `not_usable` no usable run · `pre_v3.1_gates` / `pre_valid_analyst` made by the old analyst · `single_sample` only one usable run · `high_dispersion` runs disagree too much (>25 %) · `fiduciary_fail` failed the contract audit · `kelly_on_overvalued` sizing contradicts the verdict · `mode_instability` value jumped since last verdict · `non_production_row` test run · `outside_street_fence` outside the analysts' price-target range · `mos_beyond_150pct` implausibly far above price · `desk_not_used` calculator not used · `low_effort_rescue` rushed valuation · `sample_failed` a run failed · `discovery_failed` research step failed · `depleting_producer_unsupported` / `depleting_producer_class_unavailable` mine / oil-and-gas producer (not yet supported) · `consensus_data_unavailable` analyst data could not be fetched · `no_street_fence` no analyst price-target range · `directional_without_valid_crux` buy/sell call without a verified stated disagreement · `nci_share_unmeasured` minority-interest share could not be measured (reference is an upper bound) · `per_share_basis_unverified` per-share basis failed the EPS identity check · `input_scope_stamps_missing` input-scope proofs absent. |
| `status` | `ok` or `not_usable` (then `direction` is `null`). |

### Follow-up fields (Phase C — not live yet; shape in `fixtures/watch_items_example.json`)

`watch_items[]`, `followup_status`, `followup_asof`, `buy_paused` (true/false/**null = unknown, treat as
paused**), `buy_paused_reasons[]`, `holding_state` (`own`/`do_not_own`/`unusable`), `hold_carry_ok`,
`carry`, `governing_consensus_dir`, `thesis_status`, `thesis_checks[]`, `thesis_asof`,
`entry_timing_now`, `momentum_exit`, `momentum_exit_reason`.

**Fail-closed freshness:** if `followup_asof` is older than 36 hours or missing, `buy_paused` is `null`
and `followup_status` is `unknown`. The UI must display this as "follow-up data stale" and must not show a
name as freely buyable.

---

## 4.4 `depth_reports/{TICKER}.json` — the write-up

`{ticker, run, verdict{…same as overlay row…}, samples[], scorecard{…}}`. Each `samples[i]` has
`sample`, `iv`, `scorecard`, `plausible` (bool), `reasons[]`, `truncated`, `secs`, and `report` — the
analyst's **full raw memo text** (13 sections: classification, history/base rates, adjusted financials,
scenarios, valuation, timing & momentum reconciliation, monitoring rules, red-team/pre-mortem, decision
journal, and a machine-readable contract). It is long (tens of KB), plain text with markdown-ish
headings. The existing design shows it in a "run transcripts" viewer that wraps long lines and never
scrolls horizontally; keep that property. Consider surfacing the memo's own section headings as an
outline/anchor list.

---

## 4.5 `paper_ledgers.json` — the books

(Real excerpt: `fixtures/paper_ledgers_excerpt.json`.)

- `config`: `benchmark`/`primary_benchmark` (IWM), `benchmarks[]`, `cost_bps` (per side), `start_nav` (100).
- `inception`: `2026-06-12`. `last_updated`. `health{factor_checked_at, factor_scored_count}`.
- `alerts[]`: `{date, kind, scope, severity: warn|error, detail}` — pipeline self-reports (e.g.
  `snapshot_ahead`, `underfunded`). Show errors; they are the system confessing a data problem.
- `ledgers.<book>`:
  - `summary`: `cumulative_return_pct`, `cagr_pct`, `max_drawdown_pct`, `sharpe`, `win_rate_pct`,
    `closed_trades`, `open_positions`, `avg_hold_days`, `total_traded_value`, `observations`,
    `excess_vs{IWM,SPY,QQQ,SOXX,DRAM}`, `excess_vs_bench_pct`. **With ~36 observations, annualised
    CAGR and Sharpe are meaningless — de-emphasise them and show `observations` next to every ratio.**
  - `nav_series[]`: `{date, nav, bench, benches{IWM,SPY,QQQ,SOXX,DRAM}, stale_marks[]}` — book NAV starts at 100;
    `bench`/`benches` are the benchmarks' **raw price levels** on that date (e.g. IWM ≈ 281, QQQ ≈ 750), not
    rebased — the chart must normalise each series to the window start itself.
  - `trades[]`: `{date, ticker, side: buy|sell, price, value, reason}` with reasons like
    `entered_rank`, `left_rank` (screen-driven) or verdict-driven reasons.
  - `closed[]`: round trips `{ticker, entry_date, entry_price, exit_date, exit_price, hold_days,
    return_pct, post_exit_days, post_exit_return_pct}` — `post_exit_*` powers the "sold too early"
    postmortem.
  - `state{cash, holdings{ticker:{…}}, units}`, `last_marks`, `exit_pending{}` (two-run exit
    confirmation), `dividends[]`.
- Books you may present: **`rn_depth`** (AI book), **`equal`** (control), **`mine`** (private, merged
  client-side for the signed-in user from Supabase — never in the static file). Everything else
  (`plan`, `plan2`, `plan3`, `*_llm`) is retired.

## 4.6 `depth_outcomes.json` — the scoreboard

(Real excerpt: `fixtures/depth_outcomes_excerpt.json`.) `caveats[]` is **user-facing and mandatory
to display** (ledger window, sample correlation warning, de-duplication notes, "old analyst" notice).
`graded[]` rows: `ticker, date, direction, horizon_days, entry_date, exit_date, return_pct,
excess_iwm_pct, excess_spy_pct, excess_qqq_pct, entry_timing, m, momentum_view, mos_vs_base_pct,
size_hint, ledger_source (production|archive|ondemand|test), analyst_valid, actionable,
actionable_reasons, fct_band, fct_rank, nomination_*…`. `per_horizon.<h>` has `all` (n_names,
n_verdicts, mean/median excess vs IWM, `pct_beat_iwm`, name-weighted versions, `t_stat…ignoring_overlap`,
`inconclusive`), `cuts[]` (by direction, entry_timing, size_hint, m-tercile…, each with `buckets`),
and `spearman_vs_excess_iwm`. `gradeable_counts_per_horizon`, `pending_verdict_horizons` give the
"graded vs pending" counts.

**Current truth:** all 329 graded verdict-horizons are 30-day, all from the old analyst
(`ledger_source: archive`), flagged non-valid. The file's own caveats forbid conclusions. The headline
for the track record must not be this table until valid verdicts accumulate; show it as "legacy,
inconclusive" and show the pending counts.

## 4.7 MRI files — see `fixtures/mri_excerpt.json`

`current_regime.json`: `date`, `reported_regime`, `regime_probabilities{5}`, `confidence`,
`dimension_scores[]`, `top_supporting_dimensions[]`, `top_opposing_dimensions[]`, `explanation[]`
(plain-language bullet sentences — good copy), `active_shocks_on_date[]`, `data_health_warnings[]`,
`disclaimer`. `cost_of_capital_anchor.json`: `asof`, `degraded`, `implied_erp`,
`implied_cost_of_equity`, `erp_percentile_vs_history`. Freshness gate used by the pipeline: **45 days**.

## 4.8 `valuation_models.json` — the expectations workbench

(Real row: `fixtures/valuation_model_example.json`.) `assumptions{base_cf, base_cf_kind (owner_cf |
fcf_fallback), wacc (percent), terminal_growth, stage1_years, fade_years, market_cap,
discount_rate_source…}`, `implied_growth` (what price requires), `expectations_gap_pts` (implied minus
demonstrated; `null` when no growth evidence), `hist_*_cagr_5y`, `trajectory_slope`, `verdict`
(one plain sentence), `gap_basis`. `modeled_count` < `eligible_count`: names with negative base cash
flow or no market cap are `skipped_counts` with reasons — show "no model: reason", never a blank.
The site's workbench lets a user override assumptions and recompute client-side.

## 4.9 What the site derives itself (keep derivations trivial and visible)

- Verdict colour/label/subline: `lib/desk/tone.ts` `verdictTone` (`hold` displays as **FAIR**).
- Median gap = (median_iv − price) / price; band strip x-range per row = min(price, band_low) … max(price,
  band_high) with ~8 % padding (from the previous design's rule; reuse).
- Funnel counts and "Waiting"/"Blocked"/"Vetoed" groupings: `lib/desk/rankings.ts` (`aiSections`).
- `mine` ledger merge and the My-Portfolio table: client-side + Supabase, never static.

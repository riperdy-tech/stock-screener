# Field map — every on-screen value → its source

Field names are exact, from `reference_brief_v2/04_DATA_CONTRACTS.md`. Files: `fs` = `factor_scores.json`,
`ov` = `depth_overlay.json` (row = `tickers[T]`), `rep` = `depth_reports/{T}.json`, `pl` = `paper_ledgers.json`,
`out` = `depth_outcomes.json`, `vm` = `valuation_models.json`, `mri` = `mri/*.json`, `cm` = `chain_manifest.json`,
`st` = `stocks.json` / live quote. **If a value is not in this table, it does not exist; ask.**

Formatting rules: `null` → `—`. Percent fields that are fractions (e.g. `coe_used` 0.0941) × 100. Percent fields
already in percent (`mos_vs_median_pct`, `*_pct` in ledgers) as-is. Signed numbers use `+` / `−` (U+2212).
Money: `$` + 2 decimals under $1,000, else 0 decimals in labels; band labels round to whole dollars when ≥ $10.

## Shell
| UI | Source |
| --- | --- |
| prices as of | `st` quote timestamp |
| book scored | `fs.generated_at` |
| latest verdict | `ov.generated_at` |
| health dot | worst of: `cm.ok`, `pl.alerts[].severity`, `fs.discount_rate_source != "anchor"`, MRI `degraded`, follow-up staleness |
| macro chip | `mri.current_regime.reported_regime`, `reported_regime_probability`, `confidence`; CoE = `cost_of_capital_anchor.implied_cost_of_equity` |
| notice banner | new typed source `lib/desk/notice.ts` (replaces `DESK_NOTICE`) |

## Desk funnel and step panels
| UI | Source |
| --- | --- |
| 1 US stocks | universe count: number of rows in `fs.tickers` (incl. vetoed). **Confirm** this equals the 6,972 the brief cites; if not, use whichever header field the pipeline owner names |
| 2 pass safety | `fs.scored_count`; drop-off `fs.band_counts.vetoed` |
| 3 make the list | `fs.band_counts.research_now + watchlist`; drop-off `fs.band_counts.pass` |
| 4 AI verdicts | count of `ov` rows for list tickers with `gate_version != null` (rebuilt analyst) |
| 5 pass the gate | count of those with `actionable === true`; held = `pl.ledgers.rn_depth.summary.open_positions` |
| step 2 reason bars | group `fs` rows with `fct_band == "vetoed"` by `fct_veto` |
| step 3 door bars | group list rows by `fct_nominated_doors` (precedence: README 5.1c) |
| step 3 "who came which way" | list rows: ticker, door, sentence template, `fct_band` + `fct_rank` |
| step 4 progress | rebuilt verdicts ÷ list size (or `depth_progress.json` if published) |
| step 5 reasons | count `actionable_reasons[]` over rebuilt rows; gloss from `tone.ts` / contracts §4.3 |

## Desk row
| Column | Source |
| --- | --- |
| company | `st.name`, `st.industry` |
| price | live `st.price` |
| verdict | `ov.direction` → word; `actionable === false` → BLOCKED; no rebuilt row → AWAITING; `status == not_usable` → NOT USABLE |
| IV band | `iv_band_low`, `iv_band_high`, `median_iv`; one run when `n_basis == 1` or low == high |
| MoS | `mos_vs_median_pct` |
| size | `size_hint` |
| timing | `entry_timing_now ?? entry_timing`; paused when `buy_paused !== false` (Phase C) with `buy_paused_reasons[0]` |
| door | `fs.fct_nominated_doors` |
| pct | `fs.fct_percentile` → `top {100−p} %` |
| Q M R V G | `fs.fct_z.{quality, momentum, revisions, value, exp_gap}` |

Row expand: size buckets = `size_components.{dispersion,mos,conviction,risk}.bucket`; runs = `n_basis`, `samples_run`,
`spread_pct`; thesis = `thesis_status` (else `unknown`); verdict age = today − `ov.date`; crux = `crux[0].implied` /
`crux[0].own` / `crux[0].input`; expectations gap = `vm.expectations_gap_pts` (+ `vm.implied_growth`); market cap =
`st.marketCap`; flags = `fs.fct_flags[]` plain English.

## Stock page
| UI | Source |
| --- | --- |
| price as of | `ov.price_asof`, `ov.price_source` (verdict quote); live price from `st` |
| blocked banner | `actionable_reasons[]` glossed; `instability.prior_iv`, `current_iv`, `delta_pct` |
| kicker | `date`, `n_basis`, `samples_run`, `pack_revision`, `gate_version` |
| band hero | band fields above; runs = `rep.samples[].iv` where `plausible`; `street_fence.low/high`; `bear_iv`, `bull_iv` |
| crux | `crux[]` (`input`, `own`, `implied`, `at_default`, `reason`), `crux_valid`, `price_implied{}` (`reachable`) |
| stat row | `median_iv`, `spread_pct`, `size_hint`, `n_basis`/`samples_run`, `converged` |
| upper bound | `kelly_fraction_pct` (label it a cap) |
| skew, re-entry | `asymmetric_payoff_skew`, `reentry_tranches.tranche_1_starter / tranche_2_core` |
| timing | `entry_timing`, `momentum_view`, `momentum_flip_condition`, `momentum_break_rule` |
| prove wrong | `thesis_invalidation_triggers[]`, `invalidation_rules[]`, `thesis_checks[].current_value / breached` |
| watching | `watch_items[]`, `followup_status`, `followup_asof`, `buy_paused`, `buy_paused_reasons[]` |
| evidence | `coe_used`, `coe_source`, `coe_minus_anchor`, `terminal_method`, `terminal_multiple_or_g`, `fade_years`, `terminal_ronic`, `desk_calls`, `desk_iv_match`, `fiduciary_verdict`, `research_brief_asof`, `research_brief_age_days`, `flags[]` |
| how it got here | `fs.fct_band`, `fct_rank`, `fct_nominated_doors`, `fct_percentile`, `fct_z`, `fct_flags`, `fct_veto` |
| expectations | `vm.implied_growth`, `vm.assumptions.stage1_years`, `vm.hist_*_cagr_5y`, `vm.verdict`, skip reasons |
| price chart | `daily_closes.json` |
| book membership | `pl.ledgers.*.state.holdings`, `trades`, `closed` |

Rule objects in words: `{metric:"mom_6m", comparator:"<", threshold:0, window_days:180}` → `6-month momentum
below 0 (180-day window)`. Map known metrics: `mom_6m` 6-month momentum, `high_52w_distance` distance from
52-week high (fraction → %), `revenue_yoy_pct` revenue y/y, `operating_margin_pct` operating margin. Unknown
metric → show the raw key in mono.

## Track record
| UI | Source |
| --- | --- |
| scoreboard counts | valid graded = `out.graded[]` with `analyst_valid == true` (count); `out.graded_verdict_horizons`; `out.pending_verdict_horizons` |
| horizon tiles | `out.gradeable_counts_per_horizon` |
| caveats | `out.caveats[]` verbatim |
| book cards | `pl.ledgers.{rn_depth,equal}.summary.*` (cumulative_return_pct, excess_vs.IWM, max_drawdown_pct, win_rate_pct, closed_trades, open_positions, avg_hold_days, observations) |
| cost | `pl.config.cost_bps` |
| chart | `nav_series[]` (`nav`, `benches{}`; normalise) |
| ledger | `trades[]`; reasons glossed |

## Macro
`current_regime.{date, built_at, reported_regime, regime_probabilities, confidence, explanation[],
active_shocks_on_date[], data_health_warnings[], disclaimer, transition_filter_reason}`;
`cost_of_capital_anchor.{asof, implied_erp, implied_cost_of_equity, erp_percentile_vs_history, degraded}`;
`fs.sector_quota_source`.

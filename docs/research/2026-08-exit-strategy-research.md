# Exit-Logic Systems for the Deployed Strategies — Deep Research Report

**Date:** 2026-08-16
**Scope:** exit-strategy design for the live-money `equal_llm` book (primary) and the `plan3` momentum sleeve (secondary)
**Method:** multi-agent deep-research harness — 5 parallel search angles → 17 sources fetched → 45 falsifiable claims extracted → 3-vote adversarial verification per claim (a claim dies on ≥2/3 refutes) → synthesis. 22 claims confirmed, 3 refuted, merged into 9 findings below. Every book-specific implication was then cross-checked against the repo's own experiments (KIS pipeline audit §3/§6/§6a/§6b, `rs2_verdicts_report.md`).

---

## 1. Executive summary

The literature gives a clear and *process-conditional* answer, and it largely validates the system's current architecture:

1. **Do not add per-position stop losses or take-profit rules to `equal_llm`.** Stops only add expected return when position returns exhibit positive serial correlation (momentum). On a value/mean-reversion book they forfeit the bounce; at the individual-stock level they don't improve returns at all; and their one defensible role — bear-market downside reduction — is already performed by the portfolio-level NAV drawdown governor (`scripts/kis/dd_engine.py`).
2. **The momentum sleeve's existing exit stack is the textbook-correct one.** A *wide* (15%) trailing stop on a momentum book is exactly the configuration the evidence supports: the stopping premium is positive and proportional to return persistence, and only wide-threshold stops survive transaction costs.
3. **The highest-value exit machinery for `equal_llm` is the one it already has — asymmetric band-plus-hysteresis — and the evidence says to strengthen it, not replace it.** The short-term-signals literature shows banding (enter top decile, exit only when falling out of a much wider zone) is *the* decisive lever for converting gross alpha to net alpha at 25 bps costs — and it dominates simply trading less often. This is the same conclusion the in-repo churn replay reached independently.
4. **The best-supported *additions* are informational, not mechanical:** (a) a max-staleness guardrail (forced re-underwriting of any position held far past its last verdict, since fundamental-signal alpha decays to ~zero within 12 months and 60% of verdict flips occur on |ΔFV| < 5% noise); (b) verdict-layer stabilization (the in-repo V1 two-in-a-row rule already tested +0.93% vs −0.20%); and (c) an *autocorrelation measurement* of the book's own position returns — the single decisive test from Kaminski & Lo that would settle the stop-loss question empirically for this specific book.
5. **A fair-value convergence exit ("sell when MoS closes to X%") is plausible but unproven** — search angle 2 (value-practitioner exit discipline) produced *no* claims that survived verification, and the disposition-effect literature warns any trim that fires right after good news forgoes predictable drift. If tested, it must be drift-aware (delay sells after positive news) and validated in replay first.

---

## 2. Current exit architecture (inventory)

What exists today, for reference against the findings:

| Layer | Mechanism | Where |
|---|---|---|
| Signal exit (hard) | RS2 bearish verdict (AVOID/SELL/REDUCE/TRIM/EXIT/SHORT) or `overvalued` stance → demotion; hard bearish also sets `llm_reject` veto | `scripts/score_factors.py:248-253` |
| Signal exit (soft) | Falls out of `research_now` → 2-consecutive-evaluated-miss grace (`exit_pending`) | `scripts/track_paper_portfolios.py:403-421` |
| Retention hysteresis (F-04) | Held name kept while live MoS ≥ 10, deep MoS ≥ 25, or conviction ≥ 9.0 with MoS ≥ 10 / `entry_timing == "buy"`; bearish verdict bypasses | `track_paper_portfolios.py:135-183` |
| Staleness decay | Verdict > 14d old → conviction shrinks 50% toward neutral 9.0 → conviction-gated names drop out | `score_factors.py:212-217` |
| Portfolio risk governor (live) | NAV drawdown tiers −8% → 50% gross, −11% → 25%, −13% → halt + liquidate; 2-pt recovery hysteresis; peak kept on resume | `scripts/kis/dd_engine.py`, `dd_gate.py` |
| Momentum sleeve (`plan3`, paper) | 15% trailing stop off position high-water mark, 14-day re-entry cooldown, −15/−20/−25% ledger drawdown tiers + kill switch | `track_paper_portfolios.py:71-91, 523-660` |
| Explicitly absent | Per-position stop loss, take profit, trailing stop, time stop on `equal_llm` — deliberate, evidence-gated decision | `docs/superpowers/specs/2026-07-20-kis-pipeline-audit-design.md` ("No per-position trailing stops by default on the conviction book") |

---

## 3. Verified findings from the literature

Confidence reflects both the adversarial vote and source quality/transfer distance. All votes shown are refute-attempt outcomes (3-0 = all three independent skeptics failed to refute).

### F1. Stop-loss value is conditional on the return-generating process — HIGH (3-0 × 3 merged claims)

Kaminski & Lo, *"When Do Stop-Loss Rules Stop Losses?"* (Journal of Financial Markets, 2014): under a random walk, simple 0/1 stop-loss rules **always** decrease expected return; under positive serial correlation (momentum) the "stopping premium" can be positive and is **directly proportional to return persistence**; under mean reversion, stopping out forfeits the subsequent bounce. Corroborated by Han, Zhou & Zhu (SSRN 2407199): a 10% stop on momentum portfolios (1926–2013) cut max monthly loss from −49.79% to −11.36% and roughly doubled Sharpe.
*Caveat:* K&L model a portfolio-level stop-out into bonds, not per-position trailing stops — the momentum-sleeve inference is directional.
Source: [SSRN 968338](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=968338)

**Implication here:** the split treatment already in place — stops on `plan3` (momentum), none on `equal_llm` (value/conviction) — is exactly what the theory prescribes. Whether `equal_llm` positions actually mean-revert at short horizons is measurable from its own trade history (see §7, Experiment 1) and is the decisive test.

### F2. K&L's empirical upside case is index-level and monthly — HIGH (3-0)

Their stop rules added 50–100 bps/month *during stop-out periods* (US equities vs long-term Treasuries, monthly, 1950–2004) — but at the aggregate index level, at monthly sampling, in a market with index-level momentum. A poor structural match to a daily-reconciled book with a median 8-day hold.

### F3. At the individual-stock level, stops don't improve returns; their role is bear-market risk reduction — HIGH (3-0 × 3)

- Lei & Li (Financial Services Review 2009; NYSE/AMEX 1970–2005): stop-loss strategies "neither reduce nor increase investors' losses relative to buy-and-hold" once evaluated over possible future price paths. [PDF](https://www.smallake.kr/wp-content/uploads/2017/02/SSRN-id1214737.pdf)
- Dai, Marshall, Nguyen & Visaltanachoti (International Review of Finance 2021): trailing stops have *inferior mean returns* vs a mean-variance benchmark but reduce total and downside risk, "especially during declining market states." [DOI](https://onlinelibrary.wiley.com/doi/abs/10.1111/irfi.12328)

**Implication:** any trailing stop on `equal_llm` would have to be justified purely as bear-market risk control — the exact function `dd_engine.py` already provides at the portfolio level, where it belongs (see F9/open question 4 on double-counting).

### F4. Only wide stops survive transaction costs — HIGH (3-0)

Dai et al.: "Transaction costs reduce the benefits of tighter stop-loss rules, but the rules with larger stop-loss thresholds remain useful after accounting for transaction costs." At 25 bps/side and an 8-day median hold, tight per-position stops would likely be cost-negative; `plan3`'s wide 15% threshold is the cost-viable configuration.

### F5. Stops are redundant on top of a working exit signal — MEDIUM (3-0, single source)

Clare, Seaton, Smith & Thomas (Journal of Asset Management 2013): layering popular stop-loss rules on top of a 200-day MA trend rule on the S&P 500 added no value — when an information-based exit already limits losses, a mechanical stop on top contributes nothing. [PDF](https://openaccess.city.ac.uk/id/eprint/17842/8/BLACKBOX%20%20%20SSRN-id2126476.pdf)

**Implication:** RS2's bearish verdict *is* such an information-based loss limiter — and a strong one: in-repo grading shows BEAR verdicts run **−6.96% vs IWM over the next 30 days** (n=60, `rs2_verdicts_report.md`). The case for a mechanical stop on top of it is correspondingly weak.
*Note:* a companion claim from this same paper ("monthly decisions beat frequent trading") was **refuted 0-3** in verification — only the stops-add-nothing result carries forward.

### F6. Fundamental-signal alpha has a finite life; managers systematically hold past it — HIGH (3-0 × 2)

Di Mascio, Lines & Naik, *"Alpha Decay"* (Journal of Financial Economics 2017): alpha on institutional managers' new purchases is ~37 bps in month 1, decaying to effectively zero by month 12 — while average holding period is 2.2 years. A documented horizon mismatch: fundamental managers hold past signal exhaustion. [PDF](https://www.top1000funds.com/wp-content/uploads/2021/05/SSRN-id2580551.pdf)
*Caveats:* partly rational Kyle-style gradual unwinding (irrelevant to a 30-name book); Cremers & Pareek (JFE 2016) show patient high-active-share capital can outperform, so long holds aren't automatically mistakes.

**Implication:** `equal_llm`'s ~8-day median hold sits far *inside* the alpha window — no tight time stop is needed. The finding argues instead for a **max-staleness guardrail** on the tail: no position should ride months past its last underwriting. RS2's 7/14-day re-analysis cadence plus the 14-day conviction shrink already covers most of this; the residual gap is an explicit audit of the *oldest-verdict tail* of the live book (§7, Experiment 3).

### F7. No take-profit rules; don't sell winners into good news — HIGH (3-0 × 5)

- Odean (Journal of Finance 1998; 10,000 accounts, 1987–93, ~163k trades): investors realize gains ~1.5× as readily as losses (PGR 0.148 vs PLR 0.098); sold winners beat held losers by **3.4 pp excess return over the following year**; the mean-reversion belief driving it is "on average, mistaken." [PDF](https://faculty.haas.berkeley.edu/odean/papers%20current%20versions/areinvestorsreluctant.pdf)
- Frazzini (Journal of Finance 2006): disposition-driven underreaction makes post-news drift *largest when unrealized capital gains and news have the same sign* — selling winners right after good news forgoes predictable continuation; his event strategy earned >200 bps/month. [DOI](https://onlinelibrary.wiley.com/doi/10.1111/j.1540-6261.2006.00896.x)

*Caveats:* 1980s–90s retail data; winner continuation is substantially a momentum effect at ~1-year horizon; post-2006 PEAD magnitudes are debated — though drift remains strongest in exactly the small/mid-cap universe this book trades.

**Implication:** no take-profit rule on `equal_llm`, and no fair-value "trim at target" that fires immediately after positive news. Let the bearish-signal and band exits do the selling. Any future convergence-exit experiment must be drift-aware (§7, Experiment 4).

### F8. Value/quality information decays in months, not days — MEDIUM (3-0 × 3, secondary source verified against primary)

Flint & Vermaak, *"Factor Information Decay: A Global Study"* (Journal of Portfolio Management 2023; 5 factors, 12 markets, ~20 years): value has the *longest* factor half-life, momentum and investment the shortest; information-optimal rebalance periods ≈ value 3–4 months, quality 4–5, momentum 3, investment 1, low-vol 5–6. [Alpha Architect summary](https://alphaarchitect.com/information-decay/), [SSRN 3986499](https://papers.ssrn.com/sol3/abstract_id=3986499)
*Caveats:* measures decay of factor *exposure*, not per-stock alpha; extrapolation to an LLM conviction book requires care.

**Implication:** the underlying value/quality information the book trades on does not require 8-day churn — the churn comes from the LLM/band signal layer. That is not automatically bad (the in-repo replay proved this book's trading beats buy-and-hold), but it means the *fee-paying* component of churn is noise in the verdict layer, not information decay — pointing again at verdict stabilization as the lever.

### F9. Asymmetric band-plus-hysteresis is the decisive net-alpha lever for fast signals — HIGH (3-0 × 3)

Blitz, Hanauer, Honarvar, Huisman & van Vliet, *"Beyond Fama-French Factors: Alpha from Short-Term Signals"* (Financial Analysts Journal 79(4), 2023): individual short-term signals earn 6–8% gross six-factor alpha but need 1,300–2,000% annual turnover with break-even costs **below 25 bps** (unprofitable traded naively at this book's exact cost level). A composite with a **"buy 10 / hold 50"** rule — enter the top decile, hold until falling out of the top *half* — cuts turnover enough to lift *net* alpha above 6% with break-even above 30 bps. Banding **dominates merely trading less often**. Corroborated via Novy-Marx & Velikov (RFS 2016) buy/hold-spread methodology. [Alpha Architect summary](https://alphaarchitect.com/alpha-from-short-term-signals/), [SSRN 4115411](https://papers.ssrn.com/sol3/abstract_id=4115411)

**Implication:** this is the published, out-of-sample analogue of what the in-repo churn replay found independently: band-hysteresis (E_hyst) beat every naive churn-reduction rule on the quant book (−0.26% vs −2.00%, ⅓ the trades), while blunt slowdowns (2-day entry confirm, 3-in/5-out) made the LLM book *worse*. The entry threshold should stay tight and the exit threshold wide — asymmetry is the point.

---

## 4. Claims refuted in verification (do not rely on these)

The adversarial pass killed three appealing claims; they are recorded so they don't get re-adopted later from a shallower search:

1. **"Monthly decision rules beat frequent trading"** (Clare et al. companion claim) — refuted 0-3. Consistent with the in-repo finding that weekly cadence was a phase lottery (mean +0.27% but ±0.7 pt across offsets) and that D_weekly was not adoptable.
2. **"Trailing stop was the one mechanism that added value (via risk reduction)"** as a general result from Lei & Li — refuted 1-2 as stated; the surviving, correctly-scoped version is F3.
3. **"Mechanical signals decay via crowding; judgment signals don't"** (arXiv 2512.11913) — refuted 0-3. The premise that value and momentum need different exit regimes stands on K&L + Flint & Vermaak instead, not on this paper.

**Coverage gap disclosed:** search angle 2 (value-practitioner exit discipline — Graham's 50%-gain-or-2-year rule, Klarman, fair-value convergence exits) produced **zero claims that survived verification**. Practitioner selling rules are folklore-dense and evidence-sparse; the convergence-exit question therefore has to be answered by internal experiment (§7), not by citation.

---

## 5. Reconciliation with in-repo evidence

No finding above contradicts the repo's own experiments; several converge on them from independent data:

| In-repo result | Literature counterpart |
|---|---|
| Trading beats never-selling on the LLM book (+0.03% vs −2.27%); RS2 demotions carry information | F5 (information-based exits do the loss-limiting); BEAR verdicts −6.96%/30d confirms the exit signal is real |
| Band-hysteresis decisively beat naive churn reduction; blunt slowdowns hurt the LLM book | F9 (buy-10/hold-50 banding dominates trading less often) — same asymmetric-band conclusion, peer-reviewed, out-of-sample |
| 30-day post-exit returns ≈ neutral (mean +0.41%, 36% bounce, n=11): exits not premature; damage is on entries | F7's warning (selling winners early) is *not* currently being triggered — the system's exits are signal-driven, not gain-driven, which is exactly why they escape the disposition-effect penalty |
| 60% of verdict flips occur with \|ΔFV\| < 5%; stabilizer V1 (two-in-a-row w/ FV-move exception) replayed +0.93% vs −0.20% | F8 (underlying value info decays in months → flip churn is noise, not information) |
| Cost sensitivity: each +15 bps/side ≈ −0.6 pt per 3 weeks | F9's break-even arithmetic (short-term signals unprofitable below-25-bps break-even traded naively) |
| Stops test deferred for lack of daily per-ticker price panel | F1's decisive test (position-return autocorrelation) needs the same panel — one data build unlocks both |
| `wait_for_pullback` entries −5.22% vs IWM/30d while `buy` entries +8.59% | F7/Frazzini drift logic operating on the entry side — corroborates "damage is on entries," outside this report's scope but worth its own follow-up |

---

## 6. Recommendations

### Keep (evidence-affirmed, no change)

1. **No per-position stop loss or take profit on `equal_llm`.** (F1, F3, F4, F5, F7 — plus the design spec's original instinct, now with citations.)
2. **RS2 bearish verdict → hard exit, bypassing hysteresis.** The −6.96%/30d grade says this is the book's true loss limiter.
3. **F-04 band-hysteresis retention** (tight entry, wide exit). This is the published best practice for fast signals at real costs.
4. **`plan3`'s 15% trailing stop + cooldown + kill switch.** Textbook-correct for a momentum sleeve; wide threshold is the cost-viable kind. If `plan3` ever goes live, keep the stop wide — do not tighten it.
5. **Portfolio-level drawdown governor as the sole crash-risk mechanism on the live book.** (F3 — stops' only defensible role is already served here.)

### Add / test (in replay first, never directly on the live path)

6. **Verdict-layer stabilization (highest expected value).** Promote the already-replayed V1 rule — require two consecutive same-direction verdicts to act, with a fair-value-move exception — from experiment to candidate. It attacks exactly the noise component (60% of flips at |ΔFV| < 5%) that both F8 and F9 identify as the fee-paying waste, while preserving the informative exits. Replayed: +0.93% vs −0.20% @ 25 bps.
7. **Max-staleness guardrail (cheap, mostly monitoring).** Audit the oldest-verdict tail of the live book; enforce that no held position's last full underwriting exceeds ~30–45 days (RS2's cadence should make this a no-op — the guardrail catches cadence failures, e.g. the orchestrator PC being off). The existing 14-day conviction shrink already implements soft decay; this adds a hard ceiling. (F6.)
8. **Autocorrelation measurement (the decisive stop-loss test).** Compute short-horizon (1–10 day) autocorrelation of `equal_llm` position-level returns from the trade history + a daily price panel. If returns mean-revert (expected for MoS-gated value entries), the stop question is closed permanently with the book's own data. If they trend, F1 licenses revisiting a *wide* trailing stop. (§7, Experiment 1.)
9. **Fair-value convergence exit — test only, expectations low.** "Exit when live MoS ≤ 0 (price ≥ fair value)" is the natural value-discipline exit, but no academic evidence survived verification, and F7 warns it behaves like a take-profit if it fires into good news. If replayed: add a drift-aware delay (e.g., suppress the convergence sell for N days after a positive verdict/FV revision) and compare against the current band exit.

### Do not adopt (evidence-rejected for this book)

- **Fixed-percentage or tight trailing stops on `equal_llm`** — F1 (mean reversion forfeits the bounce), F3 (no return improvement at stock level), F4 (cost-negative when tight at 25 bps/side).
- **Take-profit / trim-at-gain rules** — F7 (3.4 pp penalty for selling winners; drift forgone when selling into good news).
- **Time stops tighter than the signal cadence** — F6/F8 (8-day median hold is far inside both the 12-month institutional alpha window and the 3–5-month value/quality half-life).
- **Blanket churn reduction (slower cadence, entry confirmation, symmetric slowdowns)** — refuted claim #1, in-repo B/C/D results, F9 (banding dominates trading less).
- **A second drawdown mechanism at position level** — F3 + open question 4: it would de-risk in the same declining-market states the NAV governor already covers, double-paying costs for one protection.

---

## 7. Proposed validation experiments (mapped to existing tools)

All replayable from committed history; none touches the live order path. Numbered in priority order.

| # | Experiment | Method | Tooling |
|---|---|---|---|
| 1 | **Position-return autocorrelation** (decisive for stops) | Build daily per-ticker price panel for held names; compute AC(1..10) of position returns, MFE/MAE paths per closed trade | The Phase 2 replay-harness panel the audit already planned; `paper_ledgers.json` trade log has every entry/exit |
| 2 | **Verdict stabilizer V1 → candidate** | Extend `stabilizer_replay.py` over the full verdict history (now 1,793 verdicts vs the original ~3-week window); confirm sign and size hold | `docs/superpowers/audit/tools/stabilizer_replay.py`, `rs2_verdict_log.jsonl` |
| 3 | **Staleness tail audit** | Distribution of verdict age for open positions over time; forward returns of positions held with verdicts older than 30/45/60 days | git history of `llm_overlay.json` + `build_replay_panel.py` |
| 4 | **Convergence exit (drift-aware)** | Add a policy variant to the churn replay: exit on live MoS ≤ 0 with/without an N-day post-positive-news delay; compare vs A_current and E_hyst | `churn_policy_replay.py` + `llm_overlay.json` history (MoS is recomputed daily) |
| 5 | **Stop double-counting check** | Simulate 15% per-position trailing stop on `equal_llm` history *with* the dd governor active; measure incremental DD reduction vs incremental cost | `dd_replay.py` + the Experiment-1 price panel |

Sequencing note: Experiment 1's daily price panel is the shared prerequisite for 1 and 5, and was already the audit's declared blocker — it is the single highest-leverage data build in this program.

---

## 8. Open questions carried forward

1. Do `equal_llm` position returns exhibit positive or negative short-horizon autocorrelation? (Settles the stop question with the book's own data.)
2. What is the empirical half-life of the LLM conviction signal itself — both the bearish verdict's −7%/30d information and stale bullish verdicts?
3. Would a drift-aware fair-value convergence exit beat the current band exit, or behave like a take-profit? (No surviving academic evidence either way.)
4. Does any per-position rule double-count the NAV governor's bear-market protection?
5. (Adjacent, entry-side) Why do `wait_for_pullback` entries grade −5.22% vs IWM while `buy` entries grade +8.59%? The audit's "damage is on entries" and Frazzini's drift logic both point here; a separate entry-timing review is warranted.

---

## 9. Sources

**Primary (peer-reviewed / working papers), claims confirmed:**
- Kaminski & Lo, *When Do Stop-Loss Rules Stop Losses?*, Journal of Financial Markets (2014) — [SSRN 968338](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=968338)
- Lei & Li, *In Search of Superior Performance of Stop-Loss Strategies*, Financial Services Review (2009) — [PDF mirror](https://www.smallake.kr/wp-content/uploads/2017/02/SSRN-id1214737.pdf)
- Dai, Marshall, Nguyen & Visaltanachoti, *Stop-Loss Rules*, International Review of Finance (2021) — [DOI 10.1111/irfi.12328](https://onlinelibrary.wiley.com/doi/abs/10.1111/irfi.12328)
- Clare, Seaton, Smith & Thomas, *Breaking into the Blackbox*, Journal of Asset Management (2013) — [PDF](https://openaccess.city.ac.uk/id/eprint/17842/8/BLACKBOX%20%20%20SSRN-id2126476.pdf)
- Di Mascio, Lines & Naik, *Alpha Decay*, Journal of Financial Economics (2017) — [PDF mirror](https://www.top1000funds.com/wp-content/uploads/2021/05/SSRN-id2580551.pdf)
- Odean, *Are Investors Reluctant to Realize Their Losses?*, Journal of Finance (1998) — [PDF](https://faculty.haas.berkeley.edu/odean/papers%20current%20versions/areinvestorsreluctant.pdf)
- Frazzini, *The Disposition Effect and Underreaction to News*, Journal of Finance (2006) — [DOI 10.1111/j.1540-6261.2006.00896.x](https://onlinelibrary.wiley.com/doi/10.1111/j.1540-6261.2006.00896.x)

**Secondary (verified against primaries):**
- Flint & Vermaak, *Factor Information Decay: A Global Study*, JPM (2023) — via [Alpha Architect](https://alphaarchitect.com/information-decay/), [SSRN 3986499](https://papers.ssrn.com/sol3/abstract_id=3986499)
- Blitz et al., *Beyond Fama-French Factors: Alpha from Short-Term Signals*, FAJ 79(4) (2023) — via [Alpha Architect](https://alphaarchitect.com/alpha-from-short-term-signals/), [SSRN 4115411](https://papers.ssrn.com/sol3/abstract_id=4115411)

**Verification caveats:** several source pages (SSRN, Alpha Architect, Berkeley Haas PDFs) were egress-blocked during fetching; quotes for F6–F8 were verified via multiple independent search excerpts and mirrors rather than direct full-text reads. No study directly tests a 30-name small/mid-cap LLM-conviction book with an 8-day median hold — all book-specific implications are directional inferences, which is why §7 routes every adoption decision through internal replay.

**Internal evidence referenced:** `docs/superpowers/audit/2026-07-kis-pipeline-audit.md` (§3 post-exit returns, §6 attribution, §6a churn replay, §6b stabilizer replay), `public/data/rs2_verdicts_report.md` (2026-08-11 grading), `docs/superpowers/specs/2026-07-20-kis-pipeline-audit-design.md`.

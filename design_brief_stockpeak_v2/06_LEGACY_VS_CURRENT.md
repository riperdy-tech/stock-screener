# 06 — Legacy vs current: what the revamp keeps, replaces, adds and removes

The live site on `main` (app version **0.3.0**, 2026-10-01, "The site now describes the current
system") is already a first-pass revision: the funnel, blocked-verdict handling, gate reasons, "how it
got here" and a rewritten Handbook are live. It still carries a lot of **old-analyst presentation**
(conviction-out-of-15 cells, Kelly columns, "2-run consensus / 3-run escalated" labels) and it is
**missing** the new system's most important surfaces (the crux, follow-up, scoreboard, macro, reverse-DCF
workbench). The redesign is the second, deeper pass.

## 6.1 Concept map — old → new

| Retired concept (do not design around it) | What replaced it | Why it was retired |
| --- | --- | --- |
| **Equal-weight "Factor Lab"** — five pillars (value, quality, momentum, low-vol, revisions) averaged 20 % each into one composite; `engine: factor_lab_v2_equal` | **Dual-door sifter** (Compounder / Value-gap / Trend-leader doors) → percentile + band | Measured effective weights were nothing like declared (value 4.4 % vs 20 %, revisions 35.4 %); one sector took 28.9 % of slots. Deleted 2026-09-22. |
| **Composite score as the product** | **The AI verdict is the product**; the screen only decides what the analyst reads | Screening skill ≠ valuation skill. |
| **Conviction /15 as headline; "High Conviction Core ≥ 12"** | The **crux** (the stated disagreement with the price) + verdict + band + size | Conviction was a self-report; measured to discriminate a little but is not a rank. It remains in the data as small detail. |
| **Point-estimate "margin of safety" from one number** | **Band direction**: price vs the whole plausible-value band; MoS is secondary and floor-gated (≥ 10 %) | One run scatters 24–36 %; direction survived where level did not. |
| **3 seeded LLM runs, always** | **Real run counts** (`samples_run`, `n_basis`); frozen design = two independent runs that must agree within 30 % (earlier: 2, escalate to 3 if > 15 % apart) | Cost; consensus design changed. Never hard-code a run count. |
| **Kelly "suggested plan" (Value core / Hybrid), sector & theme caps, plan/plan2/plan3 books** | AI book `rn_depth` (equal-weight, actionable undervalued only) + control `equal` + user's `mine` | Kelly sat at its cap in 53 of 85 outputs; plan books retired 2026-08-27; code deleted 2026-10-04. |
| **Theme / paradigm engine** (9 themes, theme scores, theme filter, theme allocation) | None — retired 2026-10-04. (MRI still tags *news* by theme internally; not a site feature.) | Nothing in the decision path read it. |
| **Legacy RS2 five-stage pipeline** and its **full-text reports** (`public/data/rs2/`, `rs2_verdict_log.jsonl`, "S5 · Conviction", don't-chase brake, "Ask AI — run a fresh analysis") | The depth analyst (`depth_overlay.json`, `depth_reports/`); on-demand is operator-only | Retired 2026-08-21; frozen, kept as a failure record. |
| **Divergence lens** (old name) | **Compare lens** concept: screen vs analyst, *why they split* | Already removed from main; the idea returns as a first-class lens. |
| **Sector tilt of slots from the macro regime** | Flat 8 slots/sector (`neutral_no_validated_edge`) | Pre-registered test failed (rank IC 0.026, t 0.81 vs bar 2.0). |
| **Hard-coded shared password "poe"**, `/overview` marketing page, Gemini "askGemini" | Removed (password now `APP_PASSWORD` env; `/overview` gone) | Cleanup. |

## 6.2 What exists on `main` today, and the verdict on each piece

| Surface (file) | Keep / change / replace / drop |
| --- | --- |
| Shell: masthead, nav (Rankings / Track Record / Portfolio / Handbook), mono links (Lenses / AI archive / On-Demand), version→changelog modal, language toggle, login, refresh, status strip, mobile bottom bar (`components/desk/Shell.tsx`) | **Keep the structure, redesign the visuals.** Replace the single status strip with the 3-stamp freshness strip + health dot. Make the notice banner data-driven. |
| `DESK_NOTICE` constant (`lib/desk/notice.ts`) | **Replace** with a severity-aware system-message source. Copy to preserve: "The AI analyst is being rebuilt…" until go-live. |
| Rankings intro band + 5-step clickable funnel + lens chips + filters (`RankingsView.tsx`) | **Keep the funnel-as-filter idea** (it works well). Redesign; add Compare lens, Waiting section, what-changed feed, macro strip. |
| AI lens table columns `# · Company · Stance · Price · Valuation triad · Deliberation audit · Moat/Conv · Kelly % · Mcap` (`AiLens.tsx`, `cells.tsx`) | **Replace the columns.** Drop Moat/Conviction, Kelly % and "Deliberation audit (2-run / 3-run)" as headline cells; add band strip, median gap, size-with-reason, timing, thesis status, verdict age. Keep the stacked-card mobile layout and the "Blocked · reason" treatment. |
| `BandStrip` component (`cells.tsx`) | Built but unused by current tables — **bring it back as the hero cell of every row.** |
| Quant lens (`QuantLens.tsx`): rank · stock · score · factor mix · band · AI verdict · price · mcap, paged 100 | **Keep**, restyle; "Score mix" = Quality/Value/Trend families (colours below), not five-pillar equal weights. |
| Stock page (`StockDetail.tsx`): blocked banner, triad hero, deliberation matrix, contract card, thesis blockquote, evidence chips, key financials, HOW IT GOT HERE, transcripts, old-pipeline panel | **Restructure around the crux** (see `03_` §C). Keep: blocked banner, band hero, How it got here, transcripts (wrapping), key financials. Replace: "Deliberation audit matrix of N seeds", "Conviction/15 quadrant", Kelly cards. Add: crux, what we're watching, thesis checks, evidence table, reverse-DCF, price chart, verdict history. Move "Old pipeline records" into Archive. |
| `ValuationTriadHero` (bear/base/bull/price bar, skew) | **Keep the idea** (scenario triad) but subordinate to the crux; band hero first. |
| Track Record (`TrackView.tsx`): warning box, book cards, NAV chart with toggles/windows/what-if cost, ledger, closed trades, trade history, "sold too early" | **Keep nearly all — it is good.** Add: record-reset marker/archived view, observations beside ratios, **graded verdict scoreboard** (`depth_outcomes.json`, currently unread), method note. Remove the splice of retired `equal_llm` into the AI line. |
| My Portfolio (`MyPortfolio.tsx`) | **Keep**, update verdict language and add thesis/watch status; no suggested plan. |
| `/lenses`, `/reports`, `/youtube-strategy`, `Rs2AnalysisPanel` ("Old pipeline records") | **Archive**, clearly retired. |
| `/ondemand` | **Keep**; reuse stock-page components. |
| `/overview` | already removed — do not recreate (the Handbook covers it). |
| `/admin` | **Untouched.** |
| Handbook (`app/help/*`, `lib/glossary*.ts`) | **Keep and update** (see `03_` §G). |

## 6.3 The two earlier design handoffs in this repo are STALE — use with care

`design_handoff_stockpeak_redesign/` and `design_handoff_stockpeak_redesign_rev1/` (August 2026,
HTML prototypes + README) were designed for the **old data model** ("3 independent seeded LLM runs",
conviction/15, assumed size-tier cutoffs 5 % / 12 %, plan/plan2 books, "Ask AI" button, DRAM/SOXL
series). Do **not** build to their data fields.

**Still valuable from them (take):**
- The visual language: dark editorial "research desk", rules + whitespace, radius 0, Hanken Grotesk +
  Spline Sans Mono, 11 px minimum, micro-label style, legibility-pass colour tokens.
- The **band strip** and **band chart hero** specs (track, shaded band, median tick, price tick,
  per-run dots, `$low/$high` labels, per-row x-range normalisation with ~8 % padding).
- The Track Record interaction model (series toggles, window presets + range sliders, crosshair tooltip,
  fee what-if, ledger columns, "sold too early" strip).
- Transcript viewer rules (pre-wrap, wrap anywhere, no horizontal scroll, themed scrollbar).
- Mobile rules (cards, no horizontal scroll, drop columns in priority order).

**Superseded (ignore):** all fields/labels about 3 runs, conviction, point-estimate MoS, 5–12 % spread
tiers, plan books, Ask-AI.

The live token values (which differ slightly from those READMEs after the later legibility/colour
passes) are in `tailwind.config.js` and `lib/desk/tone.ts` — see `07_` for the summary.

## 6.4 Repo hygiene notes the designer may trip over

- `DEPLOYMENT.md` describes GitHub Pages hosting and a manual weekly update — **stale**. The site is on
  Vercel (see `08_`). Likewise `README.md`/`SYSTEM_SUMMARY.md` partly predate the revamp; treat this
  brief as the authority.
- `public/data/` contains ~250 MB, mostly legacy (`rs2/` is 163 MB, `depth_reports_legacy/`, backups,
  logs). Only the files listed as CURRENT in `04_` matter.
- `ScreenerDashboard.tsx` (≈2,500 lines), `StockDetailModal.tsx` and `StockCard.tsx` are legacy-lens
  code; do not copy patterns from them.

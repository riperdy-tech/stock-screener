# Handoff: Stockpeak UI Redesign ("AI Research Desk")

Target repo: `riperdy-tech/stock-screener` (branch `main`, Next.js + Tailwind).
Primary files to modify: `components/ScreenerDashboard.tsx`, `components/CockpitDashboard.tsx`, `app/globals.css`, `tailwind.config.js`.

## Overview
A full redesign of the Stockpeak screener around one editorial decision: **RS2 AI verdicts are the product; the quant composite is the filtration step that feeds the AI's desk.** The default view leads with the AI's verdicts, the quant table is a secondary lens, and a Compare lens surfaces the biggest quant-vs-AI disagreements. Track Record is the public paper-trade record (chart + append-only ledger). Portfolio checks user holdings against the model.

**Data model v2 (band-direction scheme) — build to THIS.** The user is refilling the pipeline with real data (~2 weeks). The old AI outputs (conviction/15, point-estimate margin of safety, intrinsic value) are replaced by:
- 3 independent seeded LLM runs per stock → **IV band** (low–high), **median IV**, **run spread %**, **size hint**, **N plausible runs**, and full **run transcripts** (raw model output text)
- **Verdict = where today's price sits vs the whole band**: below → UNDERVALUED, inside → FAIR, above → OVERVALUED
- **Spread sets position size, not pass/fail.** Assumed tiers (CONFIRM with owner): spread <5% → FULL, 5–12% → HALF, >12% → QUARTER
- Reverse DCF and the quant filter (composite, rank, 5 factor scores) survive unchanged as supporting context

## About the Design Files
Design references created in HTML — prototypes showing intended look and behavior, not production code to copy. Recreate in the existing Next.js/React/Tailwind codebase using its established patterns (data from `public/data` outputs, existing routing).
- `Factor Lab Redesign.dc.html` — exploration board. **Section 4 (top) is the source of truth for Rankings and Stock detail**: 4a main page, 4b ticker page with band chart + transcripts, 4c mobile ticker. Section 3 shows the older conviction/MoS layout — superseded for those fields.
- `Stockpeak Prototype.dc.html` — clickable app. **Source of truth for interactions, Track Record, and Portfolio.** Its Rankings/detail still show the old data fields; take layouts and behavior from it, fields from section 4.
- `support.js` — prototype runtime; keep beside the HTML files, not part of the design.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and interactions are final. Recreate pixel-perfectly using Tailwind (extend the config with the tokens below). All sample data is illustrative — wire the real pipeline.

## Design Tokens

Colors (extend `tailwind.config.js`; replace the current palette in `globals.css`):
- Page background: `#0e0f11` (body) / `#131416` (app surface)
- Text primary: `#e7e5e0` · secondary: `#8b887f` · tertiary/faint: `#66635b` · body-quote: `#c9c6be`
- Accent (AI/brand): `oklch(0.78 0.08 250)` — desaturated blue. Active nav underline, "Research Now" counts, size-hint FULL, promoted chips, Ask-AI button, plan bars.
- Positive: `oklch(0.75 0.11 155)` (green) — undervalued verdict + band viz, returns, BUY tags, negative DCF gap (good)
- Caution: `#cfa14e` (amber) — fair verdict + band viz, demotions, overweight, macro flags, size-hint HALF/QUARTER
- Negative: `#c2695a` (red) — overvalued verdict + band viz, vetoes, SELL tags
- Factor-mix bars: value `#5a9b6d`, quality `#6b93c4`, momentum `#cfa14e`, low-vol `#9a83c2`, revisions `#c2798f`
- Chart series: EQUAL accent 2.5px · PLAN `#c9c6be` · PLAN2 `#c2798f` · MINE `#cfa14e` (solid, 1.8px) · benchmarks dashed `4 4`: IWM `#6e6b64`, SPY `#6b93c4`, QQQ `#4f9e8f`, DRAM `#8f7fc0`, SOXL `#b56a4f`
- Borders/rules: `rgba(255,255,255,.16)` (header rule), `.12` (table header rule + inactive chip border), `.09` (section rules), `.06` (row dividers)
- Hover row: `background: rgba(255,255,255,.03)` · Links: `#a8b4d8`, hover `#c3cce6`
- Scrollbars on dark scroll areas: `scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.22) #0e0f11`

Typography:
- UI/body: **Hanken Grotesk** (400/500/600/700/800), Google Fonts
- Data/labels: **Spline Sans Mono** (400/500/600) — all numbers, micro-labels, table headers, transcripts
- Micro-label style (used everywhere): mono, 8.5–10px, `letter-spacing: .1–.14em`, uppercase, color `#8b887f`
- Page headline: 22px/700, `letter-spacing: -.01em`; section headers: 14px/800, `letter-spacing: .08em`, uppercase
- Ticker: 15px/800 (19–20px/800 in detail); big stats: 24–28px mono

Shape & spacing:
- **Border radius: 0 everywhere.** No cards, no shadows — rules + whitespace (editorial/desk aesthetic).
- Content column: `max-width: 1280px`, `padding: 0 40px`
- Table rows: 12–13px vertical padding, `border-bottom: 1px solid rgba(255,255,255,.06)`
- Section starts: `border-top: 2px solid #e7e5e0` + uppercase 800 header
- Bars/band strips: 4–16px tall, track `rgba(255,255,255,.05–.1)`, square

## Screens / Views

### 1. App shell (all screens)
Header: baseline flex row — "STOCKPEAK" 21px/800 `.06em` + "AI RESEARCH DESK" mono 9.5px muted; nav links 13px/600, 26px gap (Rankings / Track Record / Portfolio / Handbook), active = `#e7e5e0` + 2px accent bottom border. Status strip below: mono 10px muted, run timestamp left, standing record right ("AI PICKS +14.1% VS IWM +8.3% · APPEND-ONLY", return in green 600).

### 2. Rankings — RS2 AI lens (default) — build from 4a
- Intro band: headline "RS2 valued each candidate three times overnight. The verdict is where the price sits against the whole band." + subtext "Spread between runs sets position size — never pass/fail" with dotted "How it works" link. Right: funnel stats (mono 28px, 1px rules): QUANT-FILTERED (muted) → DEPTH-ANALYZED ×3 → RESEARCH NOW (accent).
- Lens switcher: mono LENS label + chips (RS2 AI / Quant filter / Compare); active chip `background:#e7e5e0;color:#131416;700`. Right: stance/sector filters + search.
- **RESEARCH NOW** table, grid `26 180 190 170 90 120 150 70 56px` gap 12: # (AI rank) · STOCK · DEPTH VERDICT (verdict 13/800 in verdict color + subline "every run above the price · buy") · IV BAND VS PRICE (**mini band strip**: 16px track `rgba(255,255,255,.05)`; band segment = verdict-color at .28 alpha with 1px verdict-color side borders; 1px median tick; 2px `#e7e5e0` price tick; subline mono "$158–166 · MED 162") · MEDIAN GAP (mono 13/600, green/muted/red) · SPREAD → SIZE (mono "4.9% → FULL"; FULL accent, HALF/QUARTER amber, watchlist "—" muted) · QUANT FILTER (muted "92.8 · #2 · rsrch") · PRICE · MCAP. Row click → detail.
- **WATCHLIST**: same grid, subheader "PRICE INSIDE OR ABOVE THE BAND — NO EDGE TODAY"; FAIR amber band viz, OVERVALUED red.
- Veto row: opacity .65, "■ VETOED — HARD AVOID · disqualified before the depth run — no band computed."
- Band strip scaling: per row normalize the x-range to min(price, bandLow) and max(price, bandHigh) with ~8% padding each side.

### 3. Rankings — Quant filter lens
Same shell as prototype: quant rank · stock · COMPOSITE · FACTOR MIX (104×6px stacked bar) · BAND chip · DCF GAP · RS2 VERDICT compact (now: verdict + median gap + size, e.g. "UNDERVALUED · +37% · FULL") · price · mcap.

### 4. Rankings — Compare lens
Grid `180 1fr 120 1fr 220px`, rank-delta desc: stock · QUANT SAYS · Δ (mono 20px; accent promoted / amber demoted / muted small) · THE AI SAYS (verdict + action + AI rank; subline now "median gap · spread → size") · WHY THEY SPLIT.

### 5. Stock detail (ticker page) — build from 4b
- Title bar: "← Rankings" · ticker 20/800 + name · sector + mcap mono · price mono 16/600 + "Ask AI — run a fresh analysis" outlined accent button (hover accent 12% fill). Add the existing TradingView link chip top-right.
- Two-column grid `1.35fr 1fr` split by 1px rule.
- Left: mono kicker "RS2 LOCAL-LLM ANALYSIS · DEPTH RUN {date} · 3 SEEDED RUNS"; verdict 26px/800 in verdict color + "— every run values it above the price" 13.5px `#c9c6be`; **band chart hero** (58px track: shaded band verdict-color .16 alpha with side borders, median 1px line, 7px square dots per run IV, 2px price tick full height; $low/$high labels above band ends; below-row labels "$251.29 TODAY" / "MED $256" / "RUN 3"); stat row of four (MEDIAN IV + gap vs price · RUN SPREAD + "runs agree tightly" · SIZE HINT in accent + tier rule · PLAUSIBLE RUNS n/3); band-direction explainer paragraph 11px `#66635b`; thesis blockquote (2px accent left border, `rgba(255,255,255,.03)` bg, 13.5/1.6 `#c9c6be`); evidence chip row (FACT PACK version, GPR, forensic flags, entry date).
- Right: REVERSE DCF (two labeled bars + gap line) then QUANT FILTER (composite + rank, five factor bars, footnote "The quant filter decides what the AI reads — it no longer scores the verdict.").
- **DEPTH RUN TRANSCRIPTS** — full-width section under the grid, `1px .16` top rule: header "DEPTH RUN TRANSCRIPTS — 3 SAMPLE REPORTS ({TICKER}_{run id})" + HIDE/SHOW toggle; tab chips "Sample 1 · $256" (active: green border + 8% green bg) etc.; viewer: `#0e0f11`, 1px `.09` border, max-height 340px, overflow-y auto (themed scrollbar), mono 11.5px/1.7 `#c9c6be`, **`white-space: pre-wrap; overflow-wrap: anywhere`** — raw output wraps, the viewer NEVER scrolls horizontally. Footnote: "RAW MODEL OUTPUT · SCROLLS · LONG LINES WRAP".

### 6. Track Record — build from the prototype (current)
- Header: headline "If the machine is wrong, this page says so — publicly and permanently." + append-only subtext. Right: WHAT-IF COSTS — bordered `<input type="number" min=0 max=1 step=0.05>` 52px, mono 12/600, default **0.10**, suffix "% / TRADE"; recomputes fee line and net curves live; persist to localStorage.
- Four-up stat band: AI PICKS · EQUAL-WEIGHT / PLAN · VALUE CORE / PLAN2 · HYBRID / BENCHMARKS.
- **Chart (full width)**: GROWTH OF $10,000 + **9 toggle chips** (EQUAL/PLAN/PLAN2/MINE/IWM/SPY/QQQ/DRAM/SOXL — ●/○ mark; on: brighter border+text, EQUAL accent; off `#66635b`). SVG polylines from real daily NAV series; y gridlines at 4 levels with $ labels (HTML overlay, mono 8.5px `#66635b`), 5 date labels along the bottom (`white-space: nowrap`).
- **Hover**: crosshair (1px `rgba(255,255,255,.25)`) + tooltip (bg `#0e0f11`, 1px `.16` border, date header + per-visible-series label/color/$ value rows, flips near edges) tracking daily values under the cursor.
- **Window controls**: preset chips ALL/6M/3M/1M + FROM/TO range sliders (accent-color) + "{start} — {end}" label. Both axes rescale to the selected window: y min/max computed over visible series within the window (+7% pad); legend end-values and window returns recompute.
- Legend: visible series with ending value + window return. Fee line: "FEES AT {c}%/TRADE: EQUAL −$105 · …" (trades × notional × c).
- **THE LEDGER** (2px section rule): two columns `1fr 1.15fr`. Left: CURRENT HOLDINGS table (TICKER / ENTERED / ENTRY / NOW / P&L, P&L green/red/muted) + "+ N more" footer. Right: DAILY ACTIVITY — one row per day (mono date + stacked action lines: BUY tag green / SELL tag red / "—" muted "no changes · N positions held", each with price and reason). Append-only footer. Wire from the real run outputs.
- SOLD TOO EARLY postmortem strip at the very bottom (amber mono tag + one line). The old "HOW TO READ IT" panel is REMOVED.

### 7. Portfolio
Unchanged from prototype: My Portfolio table (HOLDING/WEIGHT/MODEL SIZE/VERDICT/NOTE; ALIGNED green, OVERWEIGHT amber, ■ VETOED red; local-only storage; + ADD HOLDING). Suggested plan: Value core / Hybrid toggle, macro-flag notice bar, plan table with weight bars + Kelly sizing logic; cash row muted; hybrid sleeve rows tinted `rgba(194,121,143,.05)` with `#c2798f` bars. Update verdict/note copy to band terms (e.g. "AI says overvalued — every run below the price").

### 8. Mobile — build from 4c (+ Factor Lab 3e for rankings)
Rankings collapse to stacked cards (ticker + verdict line, band strip, median gap). Ticker page: verdict block, band strip with labels below, 2×2 stat grid, transcripts accordion (tab chips wrap; viewer max-height 240px, mono 10px, same pre-wrap/anywhere rules — **long transcript lines must never force horizontal scroll on any mobile section**). Tables never scroll horizontally — drop columns in priority order (mcap, quant filter, price-assumes first).

## Interactions & Behavior
- Nav tabs switch views; entering a tab clears open detail. Lens chips swap the rankings table body only. Any row opens detail; "← Rankings" returns to the previous lens.
- Row hover `rgba(255,255,255,.03)`; back-link hover brightens; Ask-AI hover accent 12% fill.
- Transcript tabs swap run text in place; HIDE collapses the section (persist collapsed state).
- Chart per §6; commission input onChange reparse (float, fallback 0).
- No animations beyond default hover transitions; instant and dense.

## State Management
- `tab: 'rankings' | 'track' | 'port'` · `lens: 'ai' | 'quant' | 'compare'` (default 'ai') · `detail: ticker | null`
- `seriesOn: Record<'equal'|'plan'|'plan2'|'mine'|'iwm'|'spy'|'qqq'|'dram'|'soxl', boolean>` (equal/plan/iwm default on)
- `range: [startIdx, endIdx]` into the trading-day array (default full history); `hoverIdx: number | null`
- `commission: string` (default '0.10', localStorage) · `planMode: 'core' | 'hyb'` · `transcriptTab: 0|1|2` · `transcriptsOpen: boolean`
- Per-stock data needed: ticker, name, sector, mcap, price; quant composite + rank + band + 5 factor scores; verdict (band direction), action, IV band low/high, median IV, run spread %, size hint, plausible-run count, per-run IVs, run transcripts (array of strings), reverse-DCF implied vs delivered growth, thesis, evidence chips, promotion/demotion vs quant rank, TradingView URL.
- Track record data: daily NAV per series (dates + values), per-series trade counts, holdings (ticker, entry date, entry px, current px), daily activity log (date, actions: type/ticker/price/reason).

## Open items (confirm with the owner before hard-coding)
1. Size-tier cutoffs (assumed <5% / 5–12% / >12%).
2. Whether conviction/15 disappears entirely (assumed yes — nothing in the new UI shows it).
3. DRAM series source/ticker naming as used in their data.

## Assets
Google Fonts only: Hanken Grotesk + Spline Sans Mono (`fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&family=Spline+Sans+Mono:wght@400;500;600`). No images or icon fonts — ▲▼■●○✓✗Δ━ are plain text characters.

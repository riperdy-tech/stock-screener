# 07 — Visual language to keep, and the vocabulary the UI speaks

This is not a mandate to freeze the look — the redesign may improve layout, hierarchy and polish. It
records what the live site already gets right (and the system-level reasons), so the revamp evolves it
instead of discarding hard-won decisions. Token source of truth: `tailwind.config.js`,
`app/globals.css`, `lib/desk/tone.ts`.

## 7.1 Character of the product

An **editorial research desk**: dense, calm, text-forward, rules and whitespace instead of cards and
shadows. Think financial-times data page, not trading app. **Radius 0, no shadows, no gradients, no
animations beyond hover.** Numbers are monospaced and tabular. Instant, scannable, trustworthy.
Dark canvas, lifted off near-black for legibility (a legibility pass made secondary greys brighter
because dim greys were unreadable on real screens — **hierarchy comes from size, weight and tracking,
not from fading text into the background**).

## 7.2 Type

- UI/body: **Hanken Grotesk** (400–800). Data, labels, numbers, transcripts: **Spline Sans Mono**
  (400–600). Google Fonts only; no icon font, no image assets — ▲ ▼ ■ ● ○ ✓ ✗ Δ ━ are plain text glyphs.
- **11 px is the floor for every piece of text**, including axis ticks, footnotes and mobile.
- Micro-label: mono, 11 px, 600, tracking ≈ .05em, uppercase. Section header: 14 px/800, .08em,
  uppercase, on a 2 px top rule. Page headline ≈ 22 px/700, −.01em. Ticker 15–20 px/800. Big stats 24–28
  px mono.
- Korean and Chinese strings are longer/wider: design for ~30–40 % expansion.

## 7.3 Colour — **one meaning per colour** (validated for normal and colour-blind vision)

| Token | Value | Means — and only this |
| --- | --- | --- |
| page / surface / inset | `#15171a` / `#1c1e21` / `#202225` | canvas / app surface / inset panels, tooltips, transcript viewer |
| ink / ink-2 / ink-3 / ink-q | `#f2f0eb` / `#d3cfc5` / `#c3bfb5` / `#e0ddd6` | primary / secondary / tertiary / quoted body |
| **accent (blue)** | `oklch(.77 .13 240)` | the list and funnel progress; selection; interactive controls |
| list2 (soft blue) | `#709fbf` | the watchlist band (second step of the list) |
| **pos (green)** | `oklch(.82 .14 162)` | undervalued; gains; "passes the gate"; good |
| **fair (off-white)** | `#e8e4da` | FAIR / hold: the neutral midpoint |
| **warn (amber)** | `#e2b850` | warnings, caution, notices, pauses, half/quarter size |
| **neg (coral)** | `#db6750` | overvalued; losses; bad |
| **off (dim grey)** | `#8a877f` | does not count: blocked, vetoed, no data, legacy |
| link | `#a8b4d8` (hover `#c3cce6`) | text links |
| Why-listed families | Quality `#a774d6` · Revisions `#c0a2de` · Value `#149c82` · Expectations gap `#72bca8` · Momentum/Trend `#fb9dbb` | which door/score put a stock on the list (violet = quality, teal = value, pink = trend) |
| rules | white @ .24 / .22 / .18 / .14 / .10 | inactive-chip border / header rule / table-head rule / section rule / row divider |
| hover / track | white @ .05 / .12 | row hover / every bar and band track |

Series colours for the track-record chart currently: AI book `#8a877f`, equal = accent blue, mine
`#e8e4da`, benchmarks (IWM `#b9b5ab`, SPY `#9a968d`, QQQ `#76736c`, DRAM `#625f59`, SOXX `#55524d`) as
different greys with different dash patterns. **A designer may revisit chart series colours** (greys
for five benchmarks are hard to tell apart) as long as no series reuses a semantic colour above
(green/coral/amber must not appear as arbitrary series colours).

**Verdict mapping (do not change meaning):** UNDERVALUED = green · FAIR (internal `hold`) = off-white ·
OVERVALUED = coral · NOT USABLE = grey · BLOCKED = grey + reason · size FULL = green, HALF/QUARTER =
amber · gap > 0 green, < 0 coral, FAIR muted.

## 7.4 Signature components (reuse or reinvent, but keep the idea)

- **Band strip (row)**: 16 px track; band segment shaded in the verdict colour with 1 px side borders;
  1 px median tick; 2 px off-white price tick; mono label `$158–166 · MED 162`. Per-row x-range =
  min(price, band_low) … max(price, band_high) padded ~8 %. Min band width ~0.6 % so a point is visible.
- **Band chart hero (stock page)**: 58 px track; one square dot per run; `$low`/`$high` above the band
  ends; "TODAY" / "AT VERDICT" / "MED" / "RUN n" labels below; optional Street range and bear/base/bull
  markers.
- **Funnel**: five count steps with a 3 px left border in the accent at increasing alpha (last step green);
  each is a filter.
- **Chips**: mono 11 px; active = filled off-white on dark ink, inactive = 1 px `.24` border.
- **Section start**: 2 px off-white top rule + uppercase 800 header.
- **Transcript viewer**: inset panel, mono, `white-space: pre-wrap; overflow-wrap: anywhere`, max-height
  scroll, themed thin scrollbar. Never horizontal scroll.
- **Tables** become stacked cards on mobile; columns drop in priority order; never horizontal scroll.

## 7.5 Vocabulary — the words the UI uses (EN source strings; i18n all of them)

Existing, keep: **Underwriting Desk / Quant Pre-Screen · Research now · Watchlist · Pass · Vetoed ·
Awaiting underwriting · Blocked by the gate · UNDERVALUED / FAIR / OVERVALUED / NOT USABLE ·
every run above the price / price sits inside the band / every run below the price · Margin of safety ·
Run spread · Size hint (FULL / HALF / QUARTER) · AI promoted / AI demoted · Quality / Value / Trend
(why it's listed) · How it got here · Thesis invalidation triggers · Paper record.**

**Add (new system):**

| Term | One-line definition for the UI |
| --- | --- |
| **The crux** | The one input the market price gets wrong, according to the analyst — with the price's number, the analyst's number and the filing evidence. |
| **What the price implies** | The value of an input (e.g. growth in years 3–5) that would be needed to justify today's price on its own. |
| **The gate** | The automatic check that decides whether a verdict may count (actionable). Blocked verdicts are kept for the record. |
| **Actionable / Blocked** | Passed / failed the gate. Blocked is *never* a recommendation. |
| **Waiting** | Cheap on value but held back — by timing (waiting for the trend), by a pending re-analysis, or by stale follow-up data. |
| **Buy paused** | New buying is on hold while something is pending against the verdict. Never means "sell". |
| **Follow-up / What we're watching** | The daily check of each held or candidate name against its own watch-list and the day's news and filings. It decides only: re-analyse now, or nothing new. |
| **Re-analysis queued** | An event (earnings release, filing, price leaving the value band, a thesis rule tripping) has pushed this name to the front of the analyst's queue. |
| **Thesis intact / breached / unknown** | Whether the written "what would prove me wrong" conditions currently hold. |
| **Held — verdict being re-checked** | A held name whose newest verdict failed to process; it is kept on its last good verdict for at most two failures or 21 days. |
| **Value band / plausible-value range** | The low–high range of intrinsic values from the analyst's independent runs. |
| **Street range** | The sell-side analysts' price-target range (a sanity fence, not an input). |
| **Entry timing: buy now / wait for momentum / avoid** | The analyst's *timing* call, separate from the *value* call. |
| **Old analyst / Rebuilt analyst** | Provenance label for verdicts produced before / after the rebuild. |
| **Record reset** | The moment the AI paper record restarts from zero because the analyst was replaced; the previous record is archived. |
| **Graded / Pending** | Verdict-horizons whose follow-up window has / has not yet elapsed. |
| **Control book** | `equal` — every research-now name with no AI involved; the benchmark for whether the AI adds value. |
| **Not yet proven** | The system's own status line about performance. |

The Handbook glossary (`lib/glossary.ts`, 100 terms, 13 categories, with `ko`/`zh` variants) already
powers `Term` popups; **the new terms above must be added in all three languages** and several existing
entries (conviction, Kelly, deliberation, 3-run) re-worded or retired — flag which.

## 7.6 Tone for micro-copy

Sentence case, plain verbs, specific numbers, always dated. Prefer "every run values it above the
price" to "bullish". Prefer "no verdict passes the gate right now" to "no opportunities". Never
exclamation marks. Unknowns say what is unknown and why.

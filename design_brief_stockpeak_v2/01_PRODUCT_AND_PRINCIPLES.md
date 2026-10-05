# 01 — What Stockpeak is, who it is for, and the principles the design must carry

## The one-paragraph version

Stockpeak (stockpeak.net) is a **public research desk and honest scoreboard** for one investing system.
The system scans every US-listed company (about 7,000), narrows them with deterministic maths to a
shortlist of roughly 160, has a local AI analyst underwrite each shortlisted company in depth
(valuation range, margin of safety, a stated disagreement with the market price, falsifiable
conditions under which it would be wrong), keeps watching every name it holds or might buy every
day, and grades every call against what the market actually did. The website is the **window into that
machine**: it shows what the machine currently believes, why, how sure it is, and — most
importantly — whether it has been right.

The site does not compute anything itself. Every number on it is an artifact that a pipeline wrote
into `public/data/`. The design's job is to make those artifacts legible, trustworthy and quick to scan.

## Who uses it

| Audience | What they want | Consequence for design |
| --- | --- | --- |
| **The operator** (one person, runs the system, puts real money behind it) | Open the site every morning: what changed, what is the AI telling me to buy / hold / avoid, is anything broken or stale, how is the scoreboard? | Density over decoration. Fast scanning. Loud, unmissable freshness and health signals. |
| **Interested readers / followers** (public) | Understand what this is, judge whether to trust it, browse names, read the reasoning | A first-time visitor must understand in 30 seconds what the page is and what the machine has and has not proven. A "Handbook" / "How it works" path is part of the product. |
| **The operator reading a single stock** | The full case: price vs the AI's value range, the disagreement, the evidence, what would break the thesis, what the daily watcher found | The stock page is the deepest page and the most important one. |

Languages: English, Korean, Chinese (the site already ships `en` / `ko` / `zh`; every user-facing
string must go through the existing i18n layer). Korean is the operator's working language.

## The thesis of the product (what the redesign must make obvious)

1. **The AI analyst's verdict is the product. The quant screen is the funnel that decides what the
   analyst reads.** The screen no longer "scores the verdict". Lead with verdicts; the screen is a
   supporting lens and the explanation of how a name got in front of the analyst.
2. **A verdict is a direction against a value range, not a price target.** The analyst produces a
   range of plausible intrinsic values (low–high, with a median); the verdict is where today's price
   sits against the whole range: below → *undervalued*, inside → *hold* (no edge), above →
   *overvalued*. Disagreement between the analyst's independent runs widens the range and shrinks the
   position size; it never turns into a hidden pass/fail.
3. **The machine must say why it disagrees with the market.** A buy or sell call must name the one
   input the price gets wrong (the "crux"), the price's implied number against the analyst's number,
   and quote the company's own filings. A call without a valid crux is downgraded to *hold*. This is
   the central piece of reasoning the stock page should foreground.
4. **Honesty is a feature, not a footnote.** The system's own documentation says plainly that nothing
   has yet been proven to make money; the sample is short and both live paper books were losing when
   last measured. The site must carry that humility structurally (track-record framing, "not
   investment advice", sample-size warnings, "this is a paper portfolio") rather than bury it.
5. **Annotate, never silently gate.** Wherever the system holds something back — a verdict blocked from
   action, a stale input, a vetoed company — the UI shows it *and shows the reason*. A missing value is
   shown as missing, never as `0`, never as an invented placeholder, never quietly omitted.
6. **Monitoring never sells.** After the analysis, a daily watcher checks each held name and each buy
   candidate against its own watch-list plus the day's news and filings. It can only decide one thing:
   *re-analyse now* or *nothing new*. It can pause new buying. Only a fresh full verdict can change a
   holding. The UI must not imply that a news item "triggered a sell".

## Voice and tone

- Plain, specific, unhyped. No "AI-powered alpha", no rocket emoji, no urgency.
- Every claim is dated ("as of 2026-10-04"). Numbers carry their unit and basis.
- Say "the analyst" / "the machine" / "RS2" (the system's internal name for the analyst, used as a brand
  for the AI tier), not "our proprietary algorithm".
- Never give personalised advice. The site presents a research system's output and a paper track
  record. A standing disclaimer is required (see `05_STATES_AND_HONESTY_RULES.md`).

## What the site is NOT

- Not a brokerage, not an order ticket, not a recommendation service.
- Not a place that computes valuations in the browser from the user's guesses as the primary
  experience (a reverse-DCF "workbench" exists as a supporting tool; see `03_`).
- Not a stock-picker's feed of "hot" tickers. The default sort is the machine's priority queue, not
  recency or price moves.
- It does not show the old equal-weight "Factor Lab" composite as a scored product, 5-pillar "factor
  mix" bars as the headline, "conviction out of 15" as the headline, theme/paradigm scores, or the
  Kelly "suggested plan". These belong to retired systems — see `06_LEGACY_VS_CURRENT.md`.

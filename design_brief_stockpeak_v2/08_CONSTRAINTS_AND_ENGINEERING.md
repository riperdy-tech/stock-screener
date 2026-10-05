# 08 — Constraints, engineering reality and what to deliver

## 8.1 Hard constraints (from the workspace rules — not negotiable)

1. **The site is a pure reader.** It renders artifacts from `public/data/`; it computes almost nothing
   itself (display-only derivations such as median gap and band scaling are fine). Do not design features
   that require new computation in the browser beyond the explicitly interactive reverse-DCF workbench.
2. **Do not write into `public/data/depth_*`, `factor_scores*`, `paper_ledgers.json`, etc.** Those are
   produced by pipelines. The depth overlay in particular is published only through a dedicated clone
   (corrupting it from the development tree is a documented past incident). A design task never edits
   data files; use `fixtures/` for prototype data.
3. **Never deploy automatically; never touch secrets, `.env*`, CI or deployment config** unless the
   operator asks. The design delivers a handoff; engineering merges it with the operator's OK.
4. **Nothing imports across repositories.** The site cannot call into the analyst or macro code; it can
   only read the published files (and Supabase tables for user features).
5. **A field not in the contract does not exist.** If the design needs a field, list it under "data
   requests" (§8.4) — do not assume it.
6. **Annotate, never silently gate** (system-wide): any UI filter that hides rows must say so and show a
   count; "blocked", "vetoed", "unknown" are visible states, not deletions.
7. **`/admin` is out of scope** (operator ruling). Do not redesign or relink it beyond the existing
   masthead entry.

## 8.2 Stack and platform

- **Next.js 14.2 (App Router), React 18, TypeScript strict, Tailwind 3 + `tailwind-merge` + `clsx`,
  `lucide-react` (available, but the current look uses text glyphs), `react-markdown`, Recharts available
  (charts today are hand-written inline SVG).** Path alias `@/` = repo root. No `any` without
  justification. Functional components + hooks.
- **Hosting:** Vercel, deployed from the repository root (stockpeak.net). API routes exist, so it is not a
  static export. `/data/*` is served with `Cache-Control: max-age=0, must-revalidate` — files are always
  fresh; the desk additionally re-polls `depth_overlay.json` every 25 s and on window focus.
- **Data volume** (affects design): `factor_scores.json` ≈ 11 MB, `stocks.csv` ≈ 12 MB (the desk parses
  the CSV), `daily_closes.json` ≈ 4.7 MB, `momentum_state.json` ≈ 1.7 MB, `paper_ledgers.json` ≈ 0.8 MB,
  `depth_outcomes.json` ≈ 0.5 MB, `depth_overlay.json` ≈ 0.3 MB, `valuation_models.json` ≈ 0.1 MB,
  `depth_reports/*` ≈ 2 MB total (fetched per ticker). **Design for progressive loading** (skeletons;
  render the verdict list before the 7,000-row quant list; lazy-load per-ticker bundles; page the quant
  table at ~100 rows). Avoid UI that needs every file before first paint.
- **Auth/user features:** Supabase (email + password) — optional; the app degrades to local data when
  unconfigured. Tables behind user features: `my_portfolio`, `user_mine_ledgers`; on-demand queue and
  admin tables are not user-facing. The private `mine` book is merged client-side for the signed-in user
  from `/api/paper-ledgers`; **never place user data in URLs or the static files.**
- **i18n:** `Language = 'en' | 'ko' | 'zh'`, `LanguageContext` with `t()`, strings in `lib/i18n.ts`,
  glossary in `lib/glossary*.ts`, Handbook content for ko/zh in separate content files. Every string in
  the design must be i18n-able.
- **Version & changelog:** `lib/changelog.ts` is the single source of the app version + changelog modal;
  a redesign ships as a new version entry (suggest 0.4.0) in the same plain-English style.
- **Routing/state in use:** `/?tab=rankings|track|portfolio&lens=ai|quant`; `/t/[ticker]?from=` for back.
  Persisted per-viewer conveniences use localStorage (`desk.commission`, `desk.transcriptsOpen`,
  `myPortfolio_v1`) — keep that pattern; never use storage for anything that must be shared or reliable.
- **Accessibility:** colour is never the only carrier of meaning (labels + glyphs accompany every
  verdict/state colour); the palette is already checked for colour-blind separation — re-check any new
  colour. Keyboard focus visible (1 px accent outline today). Tables need real headers; the band strip
  needs a text equivalent (`$158–166 · MED 162, price $140 — below the band`).
- **Testing bar for any eventual implementation (not for the design):** `npm run build` must pass;
  `npm run lint` currently cannot run (config imports uninstalled packages — pre-existing, do not "fix" in
  passing); TypeScript strict must pass.

## 8.3 Things the designer might assume that are false

- *"There is a live verdict feed."* The overlay updates when the operator's PC publishes (hours–days).
  There is no websocket and no per-second data except live price quotes.
- *"Verdicts update with price."* Direction is frozen at verdict time.
- *"There are 3 runs per name."* Run counts vary (1 for acceptance rows; 2 in the frozen design).
- *"Every list name has a verdict."* Today 24 of 161 do; in the baseline phase most will not.
- *"History exists."* The new analyst has produced no published verdicts yet; the AI record restarts at
  go-live; there is no regime history, no per-name verdict history, and no "what changed" feed in
  `public/data` today.
- *"Conviction/Kelly/moat are the strength signals."* They are self-reports/caps; the signals are the
  crux, the band, the gate and the follow-up.
- *"The macro regime drives the screen."* Sector tilt is off; the regime is context and a discount-rate
  anchor.

## 8.4 Data requests the design may legitimately make (need pipeline work; design with a fallback)

List the ones you actually need in your handoff README; these are the likely candidates and how each
would be sourced, so the owner can scope them:

| Wanted | Why | Possible source | Fallback if absent |
| --- | --- | --- | --- |
| **What-changed feed** | Daily operator scan | A small `changes.json` built by diffing consecutive `factor_scores` / `depth_overlay` / ledger snapshots in the chain | Show only `band_transitions` + overlay dates |
| **Per-name verdict history** | Stock-page timeline | `depth_ledger.jsonl` (append-only) is the source; publish a trimmed per-ticker history | Show newest verdict only |
| **Analyst queue / baseline progress** | "N of 161 underwritten"; queue position | `depth_progress.json` / `live_book()` count (rs2-local) | Derive `verdicts on file ÷ book size` from existing files |
| **System health summary** | Health dot / status panel | `chain_manifest.json` + `paper_ledgers.alerts` + overlay/MRI stamps (all already published) | Same — no new data needed |
| **Regime history** | `/macro` timeline | MRI `regime_timeline` | Show current read only |
| **Record-reset marker** | Archived vs fresh AI record | An explicit field in `paper_ledgers.rn_depth` (e.g. `record_epoch`) written at go-live | Hard-code the go-live date in the changelog |

## 8.5 What to deliver (mirrors the earlier handoff format so engineering can pick it up)

Create a new folder `design_handoff_stockpeak_v3/` (siblings of the old handoffs; do not edit the old
ones) containing:

1. **`README.md`** — handoff for engineering: overview, what is new vs the live site, screens (with
   data field names exactly as in `04_`), design tokens (full), interactions, state management, empty/
   blocked/stale states, mobile behaviour, i18n notes, open questions/data requests, and an explicit
   "differences from the live site" list.
2. **A clickable HTML prototype** (desktop + mobile) driven by the **real fixtures** in
   `design_brief_stockpeak_v2/fixtures/` (and a scripted "phase A / B / C" switch so the empty,
   baseline-fill and steady-state versions can all be reviewed).
3. **A states board**: the same row/page in each state — undervalued/actionable, hold, overvalued,
   blocked (each of the top five reasons), legacy-analyst, not usable, awaiting underwriting, vetoed,
   waiting, held-being-rechecked, single-run, stale follow-up.
4. **A component inventory** (band strip, band hero, crux panel, freshness strip, funnel, watch-item
   row, gate-reason chip, size-components table, scoreboard cuts, book card) with props named after
   contract fields.

Acceptance checklist (the designer's own bar before handing off):
- [ ] Every MUST in `03_` is present on some screen.
- [ ] Every honesty rule in `05_` is visibly satisfied (blocked reasons, stale stamps, observation
      counts, no hard-coded run count, caveats displayed).
- [ ] Phase A (today) looks intentional, not broken: an empty "Research now" explains itself.
- [ ] The crux is the first thing you read after the verdict on the stock page.
- [ ] No retired concept from `06_` appears as a headline.
- [ ] Works at 375 px with no horizontal scroll; Korean string expansion tested.
- [ ] Semantic colours keep one meaning; verdicts survive greyscale.
- [ ] Every number traces to a named contract field (or is flagged as a data request).

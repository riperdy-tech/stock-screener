# NAV Track-Record Chart — Visual Clarity (Plans A + B)

**Date:** 2026-07-16
**Scope:** `components/CockpitDashboard.tsx` only — the NAV chart block (~lines 1478–1552) plus small state additions. No data/calc changes.

## Problem

The NAV chart draws up to 11 lines (5 quant strategies, 3 LLM variants, 3 benchmarks) inside a ±2% band. Colors collide across groups (emerald `plan` vs teal `equal·LLM`; rose `plan3` vs pink `plan2`; amber `plan·LLM` vs yellow QQQ), quant/LLM pairs share no hue, benchmarks carry the same visual weight as strategies, and the legend is passive. Result: unreadable spaghetti.

## Design

### A — Interaction

New state:

- `hiddenKeys: Set<string>` — chip click toggles a series via the Recharts `Line hide` prop.
- `hoverKey: string | null` — chip hover highlights one series: hovered line gets `strokeWidth + 1`, every other line drops to `strokeOpacity 0.15`. Null restores all.

The passive `<Legend>` is removed and replaced with a single chip row (same styling pattern as the existing benchmark chips / `toggleBench`) covering all strategy series **and** benchmarks. Click = show/hide, hover = highlight. The old separate benchmark chip row folds into this row; `benchSel` behavior is preserved by mapping benchmark chips onto the same hidden/visible mechanic.

### B — Visual hierarchy

Color families — quant solid, LLM dashed, same hue (lighter):

| Family | Quant (solid) | LLM (dashed) |
|--------|---------------|--------------|
| plan   | `#34d399`     | `#6ee7b7`    |
| plan2  | `#f472b6`     | `#f9a8d4`    |
| equal  | `#38bdf8`     | `#7dd3fc`    |
| plan3  | `#f43f5e`     | —            |
| mine   | `#a78bfa`     | —            |

Benchmarks recede: grey scale only (`#64748b`, `#94a3b8`, `#cbd5e1`), 1px width, dotted dash. No colored benchmarks.

Line-end labels: at the right edge of the chart, each visible series shows its name + last value in the series color, small font, rendered as a custom SVG label on the last data point. Chart right margin grows ~70px to make room. Hidden series get no label.

### Untouched

`navCurve` calculation, commission overlay (`commDrag` / `dragAsOf`), `<Brush>`, range buttons (1M/3M/YTD/ALL), tooltip, header caption ("quant solid · RS2 LLM dashed" remains accurate).

## Error handling

- Empty/short series (day-1 ledgers): end labels skip series with no non-null last point.
- Overlapping end labels: accept minor overlap for v1; labels are small and colored, and hover-highlight disambiguates.

## Testing

- `npm run build` / typecheck passes.
- Visual verification in dev server: hover dims others, click hides, colors match table, benchmarks grey/thin, end labels render.
- Existing Python ledger tests unaffected (no data changes).

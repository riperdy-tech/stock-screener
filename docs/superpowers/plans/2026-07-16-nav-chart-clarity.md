# NAV Chart Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Track Record NAV chart readable: hover-to-highlight, click-to-hide chips, hue-paired quant/LLM colors, receded grey benchmarks, and line-end labels.

**Architecture:** All changes live in `components/CockpitDashboard.tsx`. A `NAV_SERIES` metadata table becomes the single source of truth for strategy line styling; two new state values (`hiddenNav`, `navHover`) drive Recharts `hide`/`strokeOpacity`/`strokeWidth` props; the passive `<Legend>` is replaced by an interactive chip row; a precomputed last-index map powers per-series end labels.

**Tech Stack:** Next.js / React / TypeScript / Recharts / Tailwind (existing — no new deps).

**Testing note:** This repo has no JS component test harness (Python tests cover the ledger pipeline; UI is verified by `npx tsc --noEmit` + `npm run build` + browser check). Tasks therefore use typecheck/build as the red/green gate plus a final visual verification task. Do not add a test framework for this change.

**Spec:** `docs/superpowers/specs/2026-07-16-nav-chart-clarity-design.md`

---

### Task 1: Series metadata + interaction state

**Files:**
- Modify: `components/CockpitDashboard.tsx:787-796` (BENCH_META block) and `:815-822` (state block)

- [ ] **Step 1: Add `NAV_SERIES` table and recolor `BENCH_META`**

Replace the existing `BENCH_META` block (lines 787–796) with:

```tsx
// Benchmark line styling (data key = lowercased symbol). Benchmarks are context,
// not contenders: grey ramp only, thin, dotted. Unknown symbols fall back to grey.
const BENCH_META: Record<string, { color: string; dash: string }> = {
    IWM: { color: '#475569', dash: '4 3' },
    SPY: { color: '#94a3b8', dash: '2 2' },
    QQQ: { color: '#cbd5e1', dash: '1 3' },
    SOXX: { color: '#64748b', dash: '3 2' },
    DRAM: { color: '#7c8ba1', dash: '2 3' },
};
const benchColor = (b: string) => BENCH_META[b]?.color ?? '#9ca3af';
const benchDash = (b: string) => BENCH_META[b]?.dash ?? '3 3';
const DEFAULT_BENCHES = ['IWM', 'SPY', 'QQQ'];  // SOXX/DRAM off by default (toggle on)

// NAV chart strategy series — one hue per family: quant solid, RS2 LLM variant
// same hue lighter + dashed, so pairs read together at a glance.
const NAV_SERIES: { key: string; name: string; color: string; dash?: string }[] = [
    { key: 'plan', name: 'plan (core)', color: '#34d399' },
    { key: 'plan_llm', name: 'plan · LLM', color: '#6ee7b7', dash: '7 3' },
    { key: 'plan2', name: 'plan2 (hybrid)', color: '#f472b6' },
    { key: 'plan2_llm', name: 'plan2 · LLM', color: '#f9a8d4', dash: '7 3' },
    { key: 'equal', name: 'equal', color: '#38bdf8' },
    { key: 'equal_llm', name: 'equal · LLM', color: '#7dd3fc', dash: '7 3' },
    { key: 'plan3', name: 'plan3 (bold)', color: '#f43f5e' },
    { key: 'mine', name: 'mine', color: '#a78bfa' },
];
```

- [ ] **Step 2: Add interaction state next to `benchSel` (after line 822)**

```tsx
    const [hiddenNav, setHiddenNav] = useState<Set<string>>(new Set());
    const [navHover, setNavHover] = useState<string | null>(null);  // series key OR lowercased bench symbol
    const toggleNav = (k: string) => setHiddenNav(prev => {
        const next = new Set(prev);
        next.has(k) ? next.delete(k) : next.add(k);
        return next;
    });
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (unused-var warnings for `NAV_SERIES`/`hiddenNav` acceptable at this stage only if tsc config doesn't error on unused locals; if it errors, proceed to Task 2 before typechecking).

- [ ] **Step 4: Commit**

```bash
git add components/CockpitDashboard.tsx
git commit -m "feat(cockpit): NAV series metadata + chip interaction state"
```

---

### Task 2: Drive the chart lines from metadata + state

**Files:**
- Modify: `components/CockpitDashboard.tsx` — NAV `<LineChart>` block (currently lines 1524–1548) and the `navCurve` memo area (~line 1051) for the last-index map.

- [ ] **Step 1: Precompute last non-null index per series (after the `navCurve` memo, ~line 1051)**

```tsx
    // Last non-null row index per series — anchors the line-end labels.
    const navLastIdx = useMemo(() => {
        const out: Record<string, number> = {};
        const keys = [...NAV_SERIES.map(s => s.key), ...allBenches.map(b => b.toLowerCase())];
        for (const k of keys) {
            for (let i = navCurve.length - 1; i >= 0; i--) {
                if (navCurve[i][k] != null) { out[k] = i; break; }
            }
        }
        return out;
    }, [navCurve, allBenches]);
```

- [ ] **Step 2: Add end-label renderer (module scope, below `NAV_SERIES`)**

```tsx
// Line-end label: series name + last value, colored to match, drawn just past
// the final non-null point. Returned per-point by Recharts `label`; renders
// only at the anchor index.
const navEndLabel = (name: string, color: string, lastIdx: number) =>
    function EndLabel(props: any) {
        const { x, y, index, value } = props;
        if (index !== lastIdx || value == null || x == null || y == null) return null;
        return (
            <text x={x + 5} y={y + 3} fill={color} fontSize={10} fontWeight={700}>
                {name} {Number(value).toFixed(1)}
            </text>
        );
    };
```

- [ ] **Step 3: Replace the `<LineChart>` contents**

Replace lines 1524–1548 (`<ResponsiveContainer …>` through `</ResponsiveContainer>`) with:

```tsx
                            <ResponsiveContainer width="100%" height={280}>
                                <LineChart data={navCurve} margin={{ top: 4, right: 92, bottom: 0, left: 0 }}>
                                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                                    <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="#64748b" minTickGap={28} interval="preserveStartEnd" />
                                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} stroke="#64748b" />
                                    <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 11 }} />
                                    {NAV_SERIES.map(s => (
                                        <Line key={s.key} type="monotone" dataKey={s.key} name={s.name}
                                            stroke={s.color} dot={false} connectNulls
                                            hide={hiddenNav.has(s.key)}
                                            strokeWidth={navHover === s.key ? 3 : 2}
                                            strokeOpacity={navHover && navHover !== s.key ? 0.15 : 1}
                                            strokeDasharray={s.dash}
                                            label={navEndLabel(s.name, s.color, navLastIdx[s.key] ?? -1)} />
                                    ))}
                                    {allBenches.filter(b => benchSel.has(b)).map(b => {
                                        const k = b.toLowerCase();
                                        return (
                                            <Line key={b} type="monotone" dataKey={k} name={b}
                                                stroke={benchColor(b)} dot={false} strokeDasharray={benchDash(b)}
                                                strokeWidth={navHover === k ? 2 : 1}
                                                strokeOpacity={navHover && navHover !== k ? 0.15 : 1}
                                                label={navEndLabel(b, benchColor(b), navLastIdx[k] ?? -1)} />
                                        );
                                    })}
                                    <Brush dataKey="date" height={24} stroke="#475569" fill="#0b1220"
                                        travellerWidth={8} gap={1}
                                        tickFormatter={(d: string) => (typeof d === 'string' ? d.slice(5) : d)} />
                                </LineChart>
                            </ResponsiveContainer>
```

Note: `<Legend>` is intentionally gone from this chart. Before removing `Legend` from the recharts import (line 19), grep for other uses in the file — Factor Lab / other tabs may still use it:

```bash
grep -n "<Legend" "components/CockpitDashboard.tsx"
```

If this chart was the only use, remove `Legend` from the import list; otherwise leave the import.

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS, no errors.

- [ ] **Step 5: Commit**

```bash
git add components/CockpitDashboard.tsx
git commit -m "feat(cockpit): hue-paired NAV lines, grey benchmarks, end labels"
```

---

### Task 3: Interactive chip row (replaces Legend + old bench row)

**Files:**
- Modify: `components/CockpitDashboard.tsx` — benchmark chip row block (currently lines 1494–1504).

- [ ] **Step 1: Replace the benchmark chip row with a unified series chip row**

Replace lines 1494–1504 (`<div className="mb-2 flex flex-wrap items-center gap-1.5">` … closing `</div>` of that row) with:

```tsx
                            <div className="mb-2 flex flex-wrap items-center gap-1.5">
                                {NAV_SERIES.map(s => {
                                    const on = !hiddenNav.has(s.key);
                                    return (
                                        <button key={s.key} onClick={() => toggleNav(s.key)}
                                            onMouseEnter={() => setNavHover(s.key)} onMouseLeave={() => setNavHover(null)}
                                            className={clsx('rounded border px-2 py-0.5 text-[11px] font-black transition',
                                                on ? 'border-current' : 'border-border text-muted-foreground opacity-50 hover:opacity-80')}
                                            style={on ? { color: s.color, borderColor: s.color } : undefined}>
                                            {s.dash ? '╌ ' : '— '}{s.name}
                                        </button>
                                    );
                                })}
                                <span className="mx-1 h-4 w-px bg-border" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Bench:</span>
                                {allBenches.map(b => (
                                    <button key={b} onClick={() => toggleBench(b)}
                                        onMouseEnter={() => setNavHover(b.toLowerCase())} onMouseLeave={() => setNavHover(null)}
                                        className={clsx('rounded border px-2 py-0.5 text-[11px] font-black uppercase transition',
                                            benchSel.has(b) ? 'border-current' : 'border-border text-muted-foreground opacity-50 hover:opacity-80')}
                                        style={benchSel.has(b) ? { color: benchColor(b), borderColor: benchColor(b) } : undefined}>
                                        {b}
                                    </button>
                                ))}
                            </div>
```

This drops the old `Benchmarks:` label (replaced by the `Bench:` divider) and keeps `toggleBench`/`benchSel` untouched — the stats table at line ~1419 still reads `benchSel`.

- [ ] **Step 2: Update the header hint (line 1482)**

Replace:

```tsx
                                    <span className="ml-2 normal-case tracking-normal"><span className="text-emerald-300">quant solid</span> · <span className="text-sky-300">RS2 LLM dashed</span></span>
```

with:

```tsx
                                    <span className="ml-2 normal-case tracking-normal text-muted-foreground">quant solid · LLM dashed (same hue) · hover chip to isolate · click to hide</span>
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/CockpitDashboard.tsx
git commit -m "feat(cockpit): interactive NAV chip row — hover isolates, click hides"
```

---

### Task 4: Visual verification (browser)

**Files:** none (verification only)

- [ ] **Step 1: Start dev server and open Track Record tab**

Use the browser preview tooling (`preview_start` with the project dev server, typically `npm run dev` on port 3000), navigate to the cockpit page, open the Track Record tab.

- [ ] **Step 2: Verify against spec checklist**

- Quant/LLM pairs share a hue (plan greens, plan2 pinks, equal blues).
- Benchmarks are thin, grey, dotted — visually behind strategies.
- Hovering a chip fattens that line and dims all others to ~15% opacity; leaving restores.
- Clicking a strategy chip hides its line and greys the chip; clicking again restores.
- Benchmark chips still toggle lines AND the vs-benchmark stats table still updates.
- Line-end labels show name + last value at the right edge in the series color; hidden series show no label.
- Tooltip, Brush, 1M/3M/YTD/ALL range buttons, commission re-cost flow all still work.
- Screenshot for the user.

- [ ] **Step 3: Run existing tests + review diff (CLAUDE.md ground rule)**

```bash
python -m pytest scripts/ -x -q 2>&1 | tail -5   # or the repo's usual test entry
git diff main --stat
```

Expected: Python tests unaffected/pass; diff touches only `CockpitDashboard.tsx` + docs.

- [ ] **Step 4: Final commit if any fixups, report to user**

'use client';

// Small hand-drawn charts for the /macro tabs: the growth and inflation quadrant, the regime probability
// area, the indicator lines, signed bars, the macro-only to combined rank slope and the regime ribbon. Same house rules as the rest of the desk:
// square corners, rules and whitespace, colours from the CSS tokens. Each time chart reads out the month
// under the pointer in a line beneath it, which also works by touch.

import React, { useState } from 'react';
import clsx from 'clsx';
import { useLanguage } from '@/components/LanguageContext';
import {
    DASH, place, quadrantOf, REGIME_STACK, regimeColor, regimeRuns, signed, monthYear, hasReading, titleCase,
} from '@/lib/desk/macroPanels';
import type { MriTimelinePoint } from '@/lib/data-service';
import { fill } from '@/lib/desk/text';

const pctOf = (index: number, n: number): number => (n <= 1 ? 0 : (index / (n - 1)) * 100);

/** Month under the pointer: the index into `n` evenly spaced points. */
function useHoverIndex(n: number) {
    const [index, setIndex] = useState<number | null>(null);
    const bind = {
        onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
            const box = e.currentTarget.getBoundingClientRect();
            if (box.width <= 0 || n < 1) return;
            setIndex(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - box.left) / box.width) * (n - 1)))));
        },
        onPointerLeave: () => setIndex(null),
    };
    return { index, bind };
}

/** Evenly spread tick positions, always including the first and last point. */
function tickIndices(n: number, count: number): number[] {
    if (n <= 1) return [0];
    const steps = Math.min(count, n) - 1;
    return Array.from(new Set(Array.from({ length: steps + 1 }, (_, i) => Math.round((i / steps) * (n - 1)))));
}

function XAxis({ dates, count }: { dates: (string | null | undefined)[]; count: number }) {
    const n = dates.length;
    return (
        <div className="relative mt-1 h-4 font-mono text-[10px] text-ink-3" aria-hidden>
            {tickIndices(n, count).map((i) => (
                <span
                    key={i}
                    className="absolute whitespace-nowrap"
                    style={{ left: `${pctOf(i, n)}%`, transform: i === 0 ? 'none' : i === n - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}
                >
                    {monthYear(dates[i])}
                </span>
            ))}
        </div>
    );
}

/** The line under a chart that says what the pointer is on. Kept at a fixed height so the page does not jump. */
function Readout({ children }: { children?: React.ReactNode }) {
    return <p className="mt-1 min-h-[16px] break-words font-mono text-[11px] text-ink-2">{children}</p>;
}

// ── Growth by inflation quadrant ──────────────────────────────────────────────────────────────────

const QUADRANT_CELLS: { id: 'tl' | 'tr' | 'bl' | 'br'; regime: string }[] = [
    { id: 'tl', regime: 'goldilocks' }, { id: 'tr', regime: 'reflation' },
    { id: 'bl', regime: 'recession' }, { id: 'br', regime: 'stagflation' },
];

export function QuadrantMap({ growth, inflation, trail, regime }: {
    growth: number | null;
    inflation: number | null;
    trail: { date?: string; growth: number; inflation: number }[];
    regime: string | null;
}) {
    const { t } = useLanguage();
    const hasDot = growth !== null && inflation !== null;
    const past = trail.slice(0, -1);
    const placed = hasDot ? quadrantOf(growth, inflation) : null;
    return (
        <div
            role="img"
            aria-label={t('mcqAria')}
            className="relative mx-auto aspect-square w-full max-w-[320px] border border-rule-24"
        >
            {QUADRANT_CELLS.map((q) => (
                <div
                    key={q.id}
                    className={clsx(
                        'absolute flex h-1/2 w-1/2 p-1.5 font-mono text-[10px] uppercase tracking-[.05em]',
                        q.id.startsWith('t') ? 'top-0 items-start' : 'bottom-0 items-end',
                        q.id.endsWith('l') ? 'left-0 justify-start' : 'right-0 justify-end',
                        q.regime === regime ? 'font-bold text-ink' : 'text-ink-3',
                    )}
                    style={q.regime === regime ? { background: 'color-mix(in srgb, var(--accent) 12%, transparent)' } : undefined}
                >
                    {titleCase(q.regime)}
                </div>
            ))}
            <span aria-hidden className="absolute left-1/2 top-0 h-full w-px bg-rule-24" />
            <span aria-hidden className="absolute left-0 top-1/2 h-px w-full bg-rule-24" />
            {past.map((p, i) => (
                <span
                    key={p.date ?? i}
                    aria-hidden
                    className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 bg-ink-2"
                    style={{ left: `${place(p.inflation)}%`, top: `${100 - place(p.growth)}%`, opacity: 0.15 + (0.45 * (i + 1)) / past.length }}
                />
            ))}
            {hasDot && (
                <span
                    className={clsx(
                        'absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2',
                        regime === 'tightening' ? 'border-2 border-accent bg-transparent' : 'bg-accent',
                    )}
                    style={{ left: `${place(inflation)}%`, top: `${100 - place(growth)}%` }}
                    title={fill(t('mcqNow'), { g: signed(growth), i: signed(inflation), q: titleCase(placed ?? '') })}
                />
            )}
        </div>
    );
}

// ── Regime probability history: stacked area, with the reported regime as a strip underneath ──────

export function ProbabilityHistory({ points }: { points: MriTimelinePoint[] }) {
    const { t } = useLanguage();
    const n = points.length;
    const { index, bind } = useHoverIndex(n);
    const W = 600;
    const H = 130;
    const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
    const y = (p: number) => (1 - p) * H;
    const ok = points.map(hasReading);
    // A month with no reading is a gap, not zero: each unbroken run of readings is drawn on its own.
    const segments: number[][] = [];
    ok.forEach((good, i) => {
        if (!good) return;
        const last = segments[segments.length - 1];
        if (last && last[last.length - 1] === i - 1) last.push(i);
        else segments.push([i]);
    });
    const bands = segments.flatMap((segment) => {
        const cum = segment.map(() => 0);
        return REGIME_STACK.map((regime) => {
            const top: string[] = [];
            const bottom: string[] = [];
            segment.forEach((i, k) => {
                const lower = cum[k];
                const upper = lower + (points[i].probabilities?.[regime] ?? 0);
                bottom.push(`${x(i).toFixed(1)},${y(lower).toFixed(1)}`);
                top.push(`${x(i).toFixed(1)},${y(upper).toFixed(1)}`);
                cum[k] = upper;
            });
            return { key: `${segment[0]}-${regime}`, regime, d: `M ${top.join(' L ')} L ${bottom.reverse().join(' L ')} Z` };
        });
    });
    const runs = regimeRuns(points);
    const cell = n <= 1 ? W : W / (n - 1);
    const hovered = index === null ? null : points[index];
    const readout = hovered && index !== null
        ? ok[index]
            ? `${monthYear(hovered.date)} · ${Object.entries(hovered.probabilities ?? {}).sort(([, a], [, b]) => b - a)
                .map(([r, v]) => `${titleCase(r)} ${(v * 100).toFixed(0)} %`).join(' · ')}`
            : `${monthYear(hovered.date)} · ${t('mcpNoReading')}`
        : null;
    return (
        <div>
            <div className="relative" {...bind} style={{ touchAction: 'pan-y' }}>
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={t('mcpAria')} className="block h-[130px] w-full">
                    {bands.map((b) => <path key={b.key} d={b.d} style={{ fill: regimeColor(b.regime) }} opacity={0.85} />)}
                    {[0.25, 0.5, 0.75].map((v) => (
                        <line key={v} x1={0} x2={W} y1={y(v)} y2={y(v)} stroke="var(--surface)" strokeOpacity={0.5} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                    ))}
                </svg>
                <svg viewBox={`0 0 ${W} 8`} preserveAspectRatio="none" role="img" aria-label={t('mcpStripAria')} className="mt-1 block h-2 w-full">
                    {runs.map((run, i) => (
                        <rect key={i} x={Math.max(x(run.start) - cell / 2, 0)} y={0} width={Math.min(run.len * cell, W)} height={8} style={{ fill: regimeColor(run.regime) }} />
                    ))}
                </svg>
                {index !== null && (
                    <span aria-hidden className="pointer-events-none absolute top-0 h-[130px] w-px bg-ink" style={{ left: `${pctOf(index, n)}%` }} />
                )}
            </div>
            <XAxis dates={points.map((p) => p.date)} count={5} />
            <Readout>{readout}</Readout>
            <RegimeLegend />
        </div>
    );
}

export function RegimeLegend() {
    return (
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-ink-2">
            {[...REGIME_STACK].reverse().map((r) => (
                <li key={r} className="flex items-center gap-1.5">
                    <span aria-hidden className="h-2.5 w-2.5" style={{ background: regimeColor(r) }} />
                    {titleCase(r)}
                </li>
            ))}
        </ul>
    );
}

// ── One indicator line, as a z-score ──────────────────────────────────────────────────────────────

const MINI_Z_MAX = 3.5;

export function MiniLine({ points }: { points: { date?: string | null; value?: number | null }[] }) {
    const { t } = useLanguage();
    const values = points.filter((p): p is { date?: string | null; value: number } => typeof p.value === 'number');
    const n = values.length;
    const { index, bind } = useHoverIndex(n);
    if (n < 2) return <p className="font-mono text-[11px] text-off">{t('mcNotAvailable')}</p>;
    const W = 200;
    const H = 70;
    const mid = H / 2;
    const x = (i: number) => (i / (n - 1)) * W;
    const y = (v: number) => mid - (Math.max(-MINI_Z_MAX, Math.min(MINI_Z_MAX, v)) / MINI_Z_MAX) * (mid - 3);
    const hovered = index === null ? null : values[index];
    return (
        <div>
            <div className="relative" {...bind} style={{ touchAction: 'pan-y' }}>
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={t('mcmAria')} className="block h-[70px] w-full">
                    {[3, -3].map((v) => (
                        <line key={v} x1={0} x2={W} y1={y(v)} y2={y(v)} stroke="var(--rule-14)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                    ))}
                    <line x1={0} x2={W} y1={mid} y2={mid} stroke="var(--rule-24)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                    <polyline
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth={1.4}
                        vectorEffect="non-scaling-stroke"
                        points={values.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')}
                    />
                </svg>
                {index !== null && hovered && (
                    <span aria-hidden className="pointer-events-none absolute top-0 h-[70px] w-px bg-ink" style={{ left: `${pctOf(index, n)}%` }} />
                )}
            </div>
            <XAxis dates={values.map((p) => p.date)} count={3} />
            <Readout>{hovered ? `${monthYear(hovered.date)} · z ${signed(hovered.value)}` : null}</Readout>
        </div>
    );
}

// ── Signed bars ───────────────────────────────────────────────────────────────────────────────────

export function DivergingBars({ rows }: { rows: { key: string; label: string; value: number; note?: string }[] }) {
    const { t } = useLanguage();
    if (rows.length === 0) return <p className="font-mono text-[11px] text-off">{t('mcNotAvailable')}</p>;
    const max = rows.reduce((m, r) => Math.max(m, Math.abs(r.value)), 0) || 1;
    return (
        <ul className="space-y-1.5">
            {rows.map((r) => (
                <li key={r.key} className="grid grid-cols-[minmax(0,110px)_minmax(0,1fr)_52px] items-center gap-x-3 text-[13px] sm:grid-cols-[minmax(0,170px)_minmax(0,1fr)_56px]">
                    <span className="min-w-0 break-words text-ink-2">
                        {r.label}
                        {r.note && <span className="block font-mono text-[10.5px] text-off">{r.note}</span>}
                    </span>
                    <span aria-hidden className="relative h-3.5 bg-track-12">
                        <span className="absolute left-1/2 top-0 h-full w-px bg-rule-24" />
                        <span
                            className="absolute top-0 h-full"
                            style={{
                                width: `${(Math.abs(r.value) / max) * 50}%`,
                                [r.value >= 0 ? 'left' : 'right']: '50%',
                                background: r.value >= 0 ? 'var(--pos)' : 'var(--neg)',
                            }}
                        />
                    </span>
                    <span className="text-right font-mono text-[11px] text-ink">{signed(r.value)}</span>
                </li>
            ))}
        </ul>
    );
}

// ── Macro-only rank to combined rank ──────────────────────────────────────────────────────────────

export interface SlopeRow { id: string; label: string; from: number; to: number; thin: boolean }

/**
 * One line per sector from its macro-only rank (left) to its combined rank (right). A sector whose news carries no weight
 * is drawn faint; the largest mover is drawn in the accent colour. The drawing keeps a minimum width and scrolls inside
 * its own box on a narrow screen, so the labels stay readable.
 */
export function SlopeChart({ rows }: { rows: SlopeRow[] }) {
    const { t } = useLanguage();
    if (rows.length === 0) return <p className="font-mono text-[11px] text-off">{t('mcNotAvailable')}</p>;
    const step = 24;
    const top = 16;
    const width = 560;
    const left = 190;
    const right = width - 190;
    const height = top * 2 + step * (rows.length - 1);
    const maxMove = rows.reduce((m, r) => Math.max(m, Math.abs(r.from - r.to)), 0);
    const yOf = (rank: number) => top + (rank - 1) * step;
    return (
        <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t('mcslAria')} className="block h-auto w-full min-w-[540px]">
                {rows.map((r) => {
                    const move = Math.abs(r.from - r.to);
                    const colour = r.thin ? 'var(--off)' : move > 0 && move === maxMove ? 'var(--accent)' : 'var(--ink-2)';
                    return (
                        <g key={r.id} style={{ color: colour }}>
                            <line x1={left} y1={yOf(r.from)} x2={right} y2={yOf(r.to)} stroke="currentColor" strokeWidth={move > 0 && move === maxMove ? 2 : 1.2} strokeOpacity={r.thin ? 0.55 : 1} />
                            <circle cx={left} cy={yOf(r.from)} r={3} fill="currentColor" />
                            <circle cx={right} cy={yOf(r.to)} r={3} fill="currentColor" />
                            <text x={left - 9} y={yOf(r.from) + 4} textAnchor="end" fontSize={11} fill="currentColor">{r.from} {r.label}</text>
                            <text x={right + 9} y={yOf(r.to) + 4} fontSize={11} fill="currentColor">{r.to} {r.label}</text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

// ── Reported regime by month ──────────────────────────────────────────────────────────────────────

export function RegimeRibbon({ points, recessions = [] }: { points: MriTimelinePoint[]; recessions?: { start: string; end: string }[] }) {
    const { t } = useLanguage();
    const n = points.length;
    const { index, bind } = useHoverIndex(n);
    const W = 1000;
    const runs = regimeRuns(points);
    const cell = n <= 1 ? W : W / (n - 1);
    const hovered = index === null ? null : points[index];
    // NBER recession months sit on a thin strip under the ribbon, placed by date; the first and last point set the scale.
    const startT = Date.parse(points[0]?.date ?? '');
    const span = Date.parse(points[n - 1]?.date ?? '') - startT;
    const px = (month: string) => (span > 0 ? Math.max(0, Math.min(W, ((Date.parse(`${month}-01`) - startT) / span) * W)) : 0);
    const H = recessions.length > 0 ? 36 : 26;
    const hoveredMonth = hovered?.date?.slice(0, 7) ?? '';
    const inRecession = recessions.some((r) => hoveredMonth >= r.start && hoveredMonth <= r.end);
    return (
        <div>
            <div className="relative" {...bind} style={{ touchAction: 'pan-y' }}>
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={t('mcrAria')} className="block w-full" style={{ height: H }}>
                    {runs.map((run, i) => (
                        <rect key={i} x={Math.max((run.start / Math.max(n - 1, 1)) * W - cell / 2, 0)} y={0} width={Math.min(run.len * cell, W)} height={26} style={{ fill: regimeColor(run.regime) }} />
                    ))}
                    {recessions.map((r, i) => (
                        <rect key={`n${i}`} x={px(r.start)} y={30} width={Math.max(px(r.end) - px(r.start), 2)} height={6} style={{ fill: 'var(--ink)' }} />
                    ))}
                </svg>
                {index !== null && (
                    <span aria-hidden className="pointer-events-none absolute top-0 w-px bg-ink" style={{ left: `${pctOf(index, n)}%`, height: H }} />
                )}
            </div>
            <XAxis dates={points.map((p) => p.date)} count={6} />
            <Readout>
                {hovered
                    ? `${monthYear(hovered.date)} · ${hovered.reported_regime ? titleCase(hovered.reported_regime) : DASH}${typeof hovered.confidence === 'number' ? ` · ${t('mcrConfidence')} ${hovered.confidence.toFixed(2)}` : ''}${inRecession ? ` · ${t('mcrNber')}` : ''}`
                    : null}
            </Readout>
            <RegimeLegend />
            {recessions.length > 0 && (
                <p className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-ink-2">
                    <span aria-hidden className="h-1.5 w-4 bg-ink" />
                    {t('mcrNber')}
                </p>
            )}
        </div>
    );
}

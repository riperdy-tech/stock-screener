'use client';

// NAV index, base 100 at the start of the visible window — hand-drawn SVG rather
// than a chart library, because the
// spec needs an editorial crosshair, an HTML gridline overlay, square everything
// and a range-slider window control, none of which a generic chart gives cheaply.

import React, { useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Micro } from '../primitives';
import {
    BENCHMARKS, BENCH_STYLE, BOOKS, growthAt, windowReturn,
    type Curve,
} from '@/lib/desk/nav';
import { fmtDateShort, fmtIndex, fmtSignedPct } from '@/lib/desk/format';

const W = 640;
const H = 210;
const PLOT_H = 170;
const BASE_Y = 186;   // leaves 24 units under the plot for the date labels
const MIN_WINDOW = 5; // trading days

export interface SeriesToggle { key: string; label: string; color: string; width: number; dashed?: boolean }

export function NavChart({ curve, visible, onToggle, commission, commissionLabel }: {
    curve: Curve;
    visible: Record<string, boolean>;
    onToggle: (key: string) => void;
    commission: number;
    /** The rate exactly as the reader typed it, so "0.10" does not render as "0.1". */
    commissionLabel: string;
}) {
    const maxIdx = Math.max(0, curve.dates.length - 1);
    const [range, setRange] = useState<[number, number]>([0, maxIdx]);
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const wrapRef = useRef<HTMLDivElement>(null);

    // Keep the window valid when the payload grows underneath us.
    const r0 = Math.min(range[0], Math.max(0, maxIdx - MIN_WINDOW));
    const r1 = Math.min(Math.max(range[1], r0 + MIN_WINDOW), maxIdx);

    const all: SeriesToggle[] = useMemo(() => ([
        ...BOOKS.filter((b) => curve.series[b.key]).map((b) => ({ ...b })),
        ...BENCHMARKS.filter((b) => curve.series[b]).map((b) => ({
            key: b, label: b, color: BENCH_STYLE[b], width: 1.2, dashed: true,
        })),
    ]), [curve.series]);

    const shown = all.filter((s) => visible[s.key]);

    // y-domain over the visible series inside the window only, +7% padding.
    const [lo, hi] = useMemo(() => {
        let min = Infinity, max = -Infinity;
        for (const s of shown) {
            for (let i = r0; i <= r1; i++) {
                const v = growthAt(curve.series[s.key], r0, i);
                if (v == null) continue;
                if (v < min) min = v;
                if (v > max) max = v;
            }
        }
        if (!Number.isFinite(min) || !Number.isFinite(max)) return [90, 120];
        const pad = Math.max((max - min) * 0.07, 1.2);
        return [min - pad, max + pad];
    }, [shown, curve.series, r0, r1]);

    const CX = (i: number) => (r1 === r0 ? 0 : ((i - r0) / (r1 - r0)) * W);
    const CY = (v: number) => BASE_Y - ((v - lo) / (hi - lo)) * PLOT_H;

    const paths = shown.map((s) => {
        const arr = curve.series[s.key];
        const pts: string[] = [];
        for (let i = r0; i <= r1; i++) {
            const v = growthAt(arr, r0, i);
            if (v == null) continue;
            pts.push(`${CX(i).toFixed(1)},${CY(v).toFixed(1)}`);
        }
        return { ...s, points: pts.join(' ') };
    });

    const yTicks = [0, 1, 2, 3].map((k) => lo + ((hi - lo) * (k + 0.5)) / 4);
    const xTicks = [0, 1, 2, 3, 4].map((k) => r0 + Math.round(((r1 - r0) * k) / 4));

    const onMove = (e: React.MouseEvent) => {
        const rect = wrapRef.current?.getBoundingClientRect();
        if (!rect || rect.width === 0) return;
        const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        setHoverIdx(Math.round(r0 + frac * (r1 - r0)));
    };

    const hoverFrac = hoverIdx === null || r1 === r0 ? 0 : (hoverIdx - r0) / (r1 - r0);
    const tipShift = hoverFrac < 0.15 ? '0%' : hoverFrac > 0.8 ? '-100%' : '-50%';

    const preset = (days: number) => setRange([Math.max(0, maxIdx - days), maxIdx]);

    return (
        <div className="mt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-3">
                <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                    {all.map((s) => (
                        <button
                            key={s.key}
                            onClick={() => onToggle(s.key)}
                            className={clsx('border px-2.5 py-1 font-mono font-semibold text-[11px] uppercase tracking-[.06em]',
                                visible[s.key] ? 'border-rule-24' : 'border-rule-24 text-ink-3')}
                            style={visible[s.key] ? { color: s.color, borderColor: 'rgba(255,255,255,.35)' } : undefined}
                        >
                            {visible[s.key] ? '●' : '○'} {s.label}
                        </button>
                    ))}
                </div>
            </div>

            <div
                ref={wrapRef}
                className="relative mt-4"
                onMouseMove={onMove}
                onMouseLeave={() => setHoverIdx(null)}
            >
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[240px] w-full">
                    {yTicks.map((v, i) => (
                        <line key={i} x1={0} x2={W} y1={CY(v)} y2={CY(v)} stroke="rgba(255,255,255,.12)" strokeWidth={1} />
                    ))}
                    {paths.map((p) => (
                        <polyline
                            key={p.key}
                            points={p.points}
                            fill="none"
                            stroke={p.color}
                            strokeWidth={p.width}
                            strokeDasharray={p.dashed ? '4 4' : undefined}
                            vectorEffect="non-scaling-stroke"
                        />
                    ))}
                </svg>

                {/* y labels sit in HTML so they keep their type size under the stretched viewBox;
                    each gets a surface-coloured chip so it stays readable where a series line runs behind it */}
                {yTicks.map((v, i) => (
                    <span
                        key={i}
                        className="pointer-events-none absolute left-0.5 font-mono font-semibold text-[11px] text-ink-3"
                        style={{ top: `${(CY(v) / H) * 100}%`, transform: 'translateY(-100%)', background: 'var(--surface)', paddingRight: 4 }}
                    >
                        {fmtIndex(v)}
                    </span>
                ))}

                {/* x labels */}
                {xTicks.map((i, k) => (
                    <span
                        key={i}
                        className="pointer-events-none absolute bottom-0 whitespace-nowrap font-mono font-semibold text-[11px] text-ink-3"
                        style={{
                            left: `${(CX(i) / W) * 100}%`,
                            transform: `translateX(${k === 0 ? '0%' : k === 4 ? '-100%' : '-50%'})`,
                        }}
                    >
                        {fmtDateShort(curve.dates[i])}
                    </span>
                ))}

                {hoverIdx !== null && (
                    <>
                        <span
                            className="pointer-events-none absolute bottom-6 top-0 w-px bg-white/25"
                            style={{ left: `${hoverFrac * 100}%` }}
                        />
                        <div
                            className="pointer-events-none absolute top-2 z-10 min-w-[148px] border border-rule-22 bg-page px-3 py-2"
                            style={{ left: `${hoverFrac * 100}%`, transform: `translateX(${tipShift})` }}
                        >
                            <Micro className="block">{curve.dates[hoverIdx]}</Micro>
                            {shown.map((s) => {
                                const v = growthAt(curve.series[s.key], r0, hoverIdx);
                                if (v == null) return null;
                                return (
                                    <div key={s.key} className="mt-1 flex items-baseline justify-between gap-4 text-[11px]">
                                        <span style={{ color: s.color }}>{s.label}</span>
                                        <span className="font-mono font-semibold text-ink">{fmtIndex(v)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* window controls */}
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
                <Micro>Window</Micro>
                <div className="flex gap-2">
                    {([['ALL', maxIdx], ['6M', 126], ['3M', 63], ['1M', 21]] as [string, number][]).map(([label, d]) => (
                        <button
                            key={label}
                            onClick={() => preset(d)}
                            className="border border-rule-24 px-2.5 py-1 font-mono text-[11px] text-ink-2 hover:text-ink"
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <label className="flex items-center gap-2">
                    <Micro>From</Micro>
                    <input
                        type="range" min={0} max={maxIdx} value={r0}
                        onChange={(e) => {
                            const v = Number(e.target.value);
                            setRange([Math.min(v, r1 - MIN_WINDOW), r1]);
                        }}
                        className="h-3.5 w-28"
                        aria-label="Window start"
                    />
                </label>
                <label className="flex items-center gap-2">
                    <Micro>To</Micro>
                    <input
                        type="range" min={0} max={maxIdx} value={r1}
                        onChange={(e) => {
                            const v = Number(e.target.value);
                            setRange([r0, Math.max(v, r0 + MIN_WINDOW)]);
                        }}
                        className="h-3.5 w-28"
                        aria-label="Window end"
                    />
                </label>
                <Micro className="font-mono">
                    {fmtDateShort(curve.dates[r0])} — {fmtDateShort(curve.dates[r1])}
                </Micro>
            </div>

            {/* legend + fee line */}
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5">
                {shown.map((s) => {
                    const end = growthAt(curve.series[s.key], r0, r1);
                    const ret = windowReturn(curve.series[s.key], r0, r1);
                    return (
                        <span key={s.key} className="font-mono text-[11px] text-ink-2">
                            <span style={{ color: s.color }}>{s.dashed ? '╌' : '━'} {s.label}</span>{' '}
                            <span className="text-ink">{end != null ? fmtIndex(end) : '—'}</span>{' '}
                            <span className={ret != null && ret >= 0 ? 'text-pos' : 'text-neg'}>({fmtSignedPct(ret)})</span>
                        </span>
                    );
                })}
            </div>

            <Micro className="mt-2 block text-ink-3">
                {(() => {
                    // Ledger trade values are NAV index points, same unit as the
                    // chart, so the cost of a commission rate is points too.
                    const traded = shown
                        .filter((s) => curve.tradedValue[s.key] > 0)
                        .map((s) => `${s.label} −${(curve.tradedValue[s.key] * commission / 100).toFixed(2)}`);
                    return traded.length
                        ? `Fees at ${commissionLabel}%/trade, in index points: ${traded.join(' · ')}`
                        : 'Benchmarks only — no trading costs';
                })()}
            </Micro>
        </div>
    );
}

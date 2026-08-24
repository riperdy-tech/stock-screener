'use client';

// Compare lens — where the engines disagree. Pure math on the left, the AI's
// reading of the filings on the right, the size of the split in the middle.

import React from 'react';
import clsx from 'clsx';
import { Chip, Micro, SectionHead } from '../primitives';
import { FactorMix } from './cells';
import { sizeTone, verdictTone } from '@/lib/desk/tone';
import { fmtSignedPct } from '@/lib/desk/format';
import { rankDelta, whySplit, type CompareSort, type DeskRow } from '@/lib/desk/rankings';

// Written out in full (not composed at runtime) so Tailwind's scanner emits both
// the base and the lg: variant of the arbitrary grid template.
const GRID_HEAD = 'hidden lg:grid lg:grid-cols-[180px_1fr_120px_1fr_220px] items-start gap-x-5';
const GRID_ROW = 'grid grid-cols-1 gap-y-2 lg:grid-cols-[180px_1fr_120px_1fr_220px] lg:gap-y-0 lg:gap-x-5 items-start';

function deltaColor(d: number | null): string {
    if (d === null) return '#c3bfb5';
    const a = Math.abs(d);
    if (a >= 30) return d > 0 ? 'oklch(0.78 0.08 250)' : '#cfa14e';
    if (a >= 8) return '#d3cfc5';
    return '#c3bfb5';
}

export function CompareLens({ rows, sort, onSort, onOpen }: {
    rows: DeskRow[];
    sort: CompareSort;
    onSort: (s: CompareSort) => void;
    onOpen: (t: string) => void;
}) {
    return (
        <section className="mt-7">
            <SectionHead
                title="Where the engines disagree"
                note="pure math vs the AI's reading of the filings — biggest gaps first. One of them is wrong."
                right={
                    <span className="flex items-center gap-2">
                        <Micro>Sort</Micro>
                        <Chip active={sort === 'delta'} onClick={() => onSort('delta')} className="px-2.5 py-1 text-[11px]">Δ split</Chip>
                        <Chip active={sort === 'quant'} onClick={() => onSort('quant')} className="px-2.5 py-1 text-[11px]">Quant #</Chip>
                        <Chip active={sort === 'ai'} onClick={() => onSort('ai')} className="px-2.5 py-1 text-[11px]">AI #</Chip>
                    </span>
                }
            />

            <div className={clsx(GRID_HEAD, 'border-b border-rule-18 pb-2 pt-3')}>
                <Micro>Stock</Micro>
                <Micro className="text-right">Quant says</Micro>
                <Micro className="text-center">Δ</Micro>
                <Micro>The AI says</Micro>
                <Micro>Why they split</Micro>
            </div>

            {rows.length === 0 && (
                <p className="border-b border-rule-10 py-5 text-[12px] text-ink-3">
                    No name has been read by both engines yet.
                </p>
            )}

            {rows.map((r) => {
                const d = rankDelta(r);
                const tone = verdictTone(r.depth?.direction);
                const size = sizeTone(r.depth?.size_hint, r.depth?.n_basis);
                const agree = d !== null && Math.abs(d) < 8;
                return (
                    <div
                        key={r.ticker}
                        role="button"
                        tabIndex={0}
                        onClick={() => onOpen(r.ticker)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(r.ticker); } }}
                        className={clsx('cursor-pointer border-b border-rule-10 py-4 hover:bg-hover', GRID_ROW, agree && 'opacity-70')}
                    >
                        <span className="block min-w-0">
                            <span className="text-[15px] font-extrabold text-ink">{r.ticker}</span>
                            <span className="mt-0.5 block truncate text-[11px] text-ink-2">{r.info?.name ?? ''}</span>
                        </span>

                        <span className="block min-w-0 lg:text-right">
                            <span className="font-mono text-[12.5px] text-ink">
                                #{r.fct.fct_rank ?? '—'} · {r.fct.fct_composite != null ? r.fct.fct_composite.toFixed(1) : '—'}
                            </span>
                            <span className="mt-1 flex justify-start lg:justify-end">
                                <FactorMix contributions={r.fct.fct_contributions} width={104} />
                            </span>
                        </span>

                        <span className="block lg:text-center">
                            <span className="font-mono text-[20px] font-semibold" style={{ color: deltaColor(d) }}>
                                {d === null ? '—' : `${d > 0 ? '▲' : d < 0 ? '▼' : ''}${Math.abs(d)}`}
                            </span>
                            <Micro className="mt-0.5 block">rank pts</Micro>
                        </span>

                        <span className="block min-w-0">
                            <span className="text-[13px] font-extrabold" style={{ color: tone.color }}>{tone.label}</span>
                            <span className="ml-1.5 text-[11.5px] text-ink-2">· {tone.action}</span>
                            {r.aiRank && <span className="ml-1.5 font-mono text-[11px] text-ink-3">AI #{r.aiRank}</span>}
                            <span className="mt-1 block font-mono text-[11px] text-ink-3">
                                {fmtSignedPct(r.depth?.mos_vs_median_pct)} median gap
                                {r.depth?.spread_pct != null && ` · ${r.depth.spread_pct.toFixed(1)}% spread`}
                                {r.depth?.size_hint && ` → ${size.label}`}
                            </span>
                        </span>

                        <span className="block text-[11.5px] leading-relaxed text-ink-2">{whySplit(r)}</span>
                    </div>
                );
            })}
        </section>
    );
}

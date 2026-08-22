'use client';

// Quant filter lens — the deterministic factor engine that decides what the AI
// reads. Same shell, different columns: composite, factor mix, band, DCF gap,
// and a compact restatement of the depth verdict.

import React from 'react';
import clsx from 'clsx';
import { Micro, SectionHead } from '../primitives';
import { DcfGapCell, FactorMix, McapCell, PriceCell, StockCell } from './cells';
import { sizeTone, verdictTone } from '@/lib/desk/tone';
import { fmtMcap, fmtMoney, fmtSignedPct } from '@/lib/desk/format';
import type { DeskRow } from '@/lib/desk/rankings';

const GRID = 'grid grid-cols-[26px_180px_80px_112px_112px_170px_180px_70px_56px] items-center gap-x-3';

const BAND_LABEL: Record<string, string> = {
    research_now: '■ RSRCH NOW', watchlist: '■ WATCHLIST',
    monitor: '■ MONITOR', pass: '■ PASS',
};

function BandChip({ row }: { row: DeskRow }) {
    if (row.vetoed) {
        return <span className="font-mono text-[9.5px] uppercase tracking-[.08em] text-neg">■ VETOED</span>;
    }
    const band = row.fct.fct_band ?? 'pass';
    return (
        <span className={clsx('font-mono text-[9.5px] uppercase tracking-[.08em]',
            band === 'research_now' ? 'text-accent' : 'text-ink-3')}>
            {BAND_LABEL[band] ?? band}
        </span>
    );
}

/** "UNDERVALUED · +37% · FULL" — the depth verdict compressed into one cell. */
function CompactVerdict({ row }: { row: DeskRow }) {
    const d = row.depth;
    if (!d) return <span className="block font-mono text-[10.5px] text-ink-3">not depth-analyzed</span>;
    const tone = verdictTone(d.direction);
    const size = sizeTone(d.size_hint, d.n_basis);
    return (
        <span className="block truncate text-[11px]">
            <span className="font-bold" style={{ color: tone.color }}>{tone.label}</span>
            {d.mos_vs_median_pct != null && <span className="ml-1.5 font-mono text-ink-2">{fmtSignedPct(d.mos_vs_median_pct)}</span>}
            {d.size_hint && <span className="ml-1.5 font-mono text-[10px]" style={{ color: size.color }}>{size.label}</span>}
        </span>
    );
}

export function QuantLens({ rows, onOpen, limit, onMore }: {
    rows: DeskRow[];
    onOpen: (t: string) => void;
    limit: number;
    onMore: () => void;
}) {
    const shown = rows.slice(0, limit);
    return (
        <section className="mt-7">
            <SectionHead
                title="Quant filter"
                note="five factors, sector-neutral, equal-weighted — this is what feeds the AI's desk"
            />

            <div className={clsx(GRID, 'hidden border-b border-rule-12 pb-2 pt-3 lg:grid')}>
                <Micro>#</Micro>
                <Micro>Stock</Micro>
                <Micro className="text-right">Composite</Micro>
                <Micro>Factor mix</Micro>
                <Micro>Band</Micro>
                <Micro>DCF gap</Micro>
                <Micro>RS2 verdict</Micro>
                <Micro className="text-right">Price</Micro>
                <Micro className="text-right">Mcap</Micro>
            </div>

            {shown.map((r) => (
                <React.Fragment key={r.ticker}>
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => onOpen(r.ticker)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(r.ticker); } }}
                        className={clsx(GRID, 'hidden cursor-pointer border-b border-rule-6 py-3 hover:bg-hover lg:grid',
                            r.vetoed && 'opacity-65')}
                    >
                        <span className="font-mono text-[12px] text-ink-3">{r.fct.fct_rank ?? '—'}</span>
                        <StockCell row={r} />
                        <span className="block text-right font-mono text-[14px] font-semibold text-ink">
                            {r.fct.fct_composite != null ? r.fct.fct_composite.toFixed(1) : '—'}
                        </span>
                        <FactorMix contributions={r.fct.fct_contributions} />
                        <BandChip row={r} />
                        <DcfGapCell row={r} />
                        <CompactVerdict row={r} />
                        <PriceCell row={r} />
                        <McapCell row={r} />
                    </div>

                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => onOpen(r.ticker)}
                        onKeyDown={(e) => { if (e.key === 'Enter') onOpen(r.ticker); }}
                        className={clsx('block cursor-pointer border-b border-rule-6 py-3.5 lg:hidden', r.vetoed && 'opacity-65')}
                    >
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0 truncate">
                                <span className="font-mono text-[11px] text-ink-3">{r.fct.fct_rank ?? '—'}</span>
                                <span className="ml-2 text-[16px] font-extrabold text-ink">{r.ticker}</span>
                                <span className="ml-1.5 text-[11px] text-ink-2">{r.info?.name ?? ''}</span>
                            </span>
                            <span className="shrink-0 font-mono text-[14px] font-semibold text-ink">
                                {r.fct.fct_composite != null ? r.fct.fct_composite.toFixed(1) : '—'}
                            </span>
                        </div>
                        <div className="mt-2"><FactorMix contributions={r.fct.fct_contributions} width={160} /></div>
                        <div className="mt-2 flex items-baseline justify-between gap-3">
                            <BandChip row={r} />
                            <span className="font-mono text-[11px] text-ink-2">{fmtMoney(r.info?.price)} · {fmtMcap(r.info?.marketCap)}</span>
                        </div>
                        <div className="mt-1.5"><CompactVerdict row={r} /></div>
                    </div>
                </React.Fragment>
            ))}

            {rows.length > limit && (
                <button onClick={onMore} className="mt-4 font-mono text-[10px] uppercase tracking-[.1em] text-ink-2 hover:text-ink">
                    Show more — {rows.length - limit} remaining
                </button>
            )}
        </section>
    );
}

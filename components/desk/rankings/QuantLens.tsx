'use client';

// Quant filter lens — the deterministic factor engine that decides what the AI
// reads. Same shell, different columns: composite, factor mix, band, DCF gap,
// and a compact restatement of the depth verdict.

import React from 'react';
import clsx from 'clsx';
import { Micro, SectionHead } from '../primitives';
import { McapCell, PriceCell, StockCell, WhyListed } from './cells';
import { isBlocked, sizeTone, TONE_COLORS, verdictTone } from '@/lib/desk/tone';
import { fmtMcap, fmtMoney, fmtSignedPct } from '@/lib/desk/format';
import type { DeskRow } from '@/lib/desk/rankings';

// Removing the DCF-gap column freed 170px. Cap STOCK and let the RS2 verdict
// column take the slack — a 470px name column is not what the space is for.
const GRID = 'grid grid-cols-[26px_minmax(200px,320px)_64px_140px_minmax(180px,1fr)_70px_56px] items-center gap-x-3';

// Bands in plain words. Only "Vetoed" carries colour (red = removed); the rest are ranked by weight.
const BAND_LABEL: Record<string, [string, string, string]> = {
    research_now: ['Research now', 'font-bold text-ink', 'Top of the list: the strongest names today'],
    watchlist: ['Watchlist', 'text-ink-2', 'The rest of the list'],
    pass: ['Pass', 'text-ink-3', 'Scored, but not on the list'],
    vetoed: ['Vetoed', 'text-neg', 'Removed by the safety filters'],
};

function BandChip({ row }: { row: DeskRow }) {
    const band = row.vetoed ? 'vetoed' : (row.fct.fct_band ?? 'pass');
    const [label, cls, help] = BAND_LABEL[band] ?? [band, 'text-ink-3', ''];
    return <span className={clsx('text-[12px]', cls)} title={help}>{label}</span>;
}

/** "UNDERVALUED · +37% · FULL" — the depth verdict compressed into one cell. */
function CompactVerdict({ row }: { row: DeskRow }) {
    const d = row.depth;
    if (!d) return <span className="block font-mono text-[11px] text-ink-3">not depth-analyzed</span>;
    const tone = verdictTone(d.direction);
    const size = sizeTone(d.size_hint, d.n_basis);
    const blocked = isBlocked(d);
    return (
        <span className="block truncate text-[11px]">
            <span className="font-bold" style={{ color: blocked ? TONE_COLORS.MUTED : tone.color }}>{tone.label}{blocked ? ' · BLOCKED' : ''}</span>
            {d.mos_vs_median_pct != null && <span className="ml-1.5 font-mono text-ink-2">{fmtSignedPct(d.mos_vs_median_pct)}</span>}
            {!blocked && d.size_hint && <span className="ml-1.5 font-mono text-[11px]" style={{ color: size.color }}>{size.label}</span>}
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
                title={`Quant filter · ${rows.length.toLocaleString('en-US')} stocks`}
                note="A stock gets on the list as a quality business, a value opportunity, or a steady trend. Every sector gets the same number of places for now."
            />

            <div className={clsx(GRID, 'hidden border-b border-rule-18 pb-2 pt-3 lg:grid')}>
                <Micro>#</Micro>
                <Micro>Stock</Micro>
                <Micro className="text-right" title="How strongly the screen rates it, 0 to 100">Score</Micro>
                <Micro>On the list?</Micro>
                <Micro>AI verdict</Micro>
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
                        className={clsx(GRID, 'hidden cursor-pointer border-b border-rule-10 py-3 hover:bg-hover lg:grid',
                            r.vetoed && 'opacity-65')}
                    >
                        <span className="font-mono text-[12px] text-ink-3">{r.fct.fct_rank ?? '—'}</span>
                        <StockCell row={r} />
                        <span className="block text-right font-mono text-[14px] font-semibold text-ink">
                            {r.fct.fct_composite != null ? r.fct.fct_composite.toFixed(1) : '—'}
                        </span>
                        <span className="block min-w-0"><BandChip row={r} /><WhyListed row={r} className="mt-0.5" /></span>
                        <CompactVerdict row={r} />
                        <PriceCell row={r} />
                        <McapCell row={r} />
                    </div>

                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => onOpen(r.ticker)}
                        onKeyDown={(e) => { if (e.key === 'Enter') onOpen(r.ticker); }}
                        className={clsx('block cursor-pointer border-b border-rule-10 py-3.5 lg:hidden', r.vetoed && 'opacity-65')}
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
                        <div className="mt-2 flex items-baseline justify-between gap-3">
                            <span className="flex items-baseline gap-2"><BandChip row={r} /><WhyListed row={r} /></span>
                            <span className="font-mono text-[11px] text-ink-2">{fmtMoney(r.info?.price)} · {fmtMcap(r.info?.marketCap)}</span>
                        </div>
                        <div className="mt-1.5"><CompactVerdict row={r} /></div>
                    </div>
                </React.Fragment>
            ))}

            {rows.length === 0 && (
                <p className="border-b border-rule-10 py-5 text-[12px] text-ink-3">No stocks at this step with these filters.</p>
            )}

            {rows.length > limit && (
                <button onClick={onMore} className="mt-4 font-mono font-semibold text-[11px] uppercase tracking-[.05em] text-ink-2 hover:text-ink">
                    Show more — {rows.length - limit} remaining
                </button>
            )}
        </section>
    );
}

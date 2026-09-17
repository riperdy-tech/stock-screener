'use client';

// RS2 AI lens — the default view. The verdict is where today's price sits
// against the whole band of the three runs; the quant composite is
// demoted to a context column.

import React from 'react';
import clsx from 'clsx';
import { Micro, SectionHead } from '../primitives';
import {
    BandStrip, McapCell, MedianGapCell, PriceCell, PromoLine,
    QuantFilterCell, SpreadSizeCell, StockCell, VerdictCell,
    MoatCell, ConvictionCell, HalfKellyCell, SkewCell, TriadCell,
} from './cells';
import { verdictTone } from '@/lib/desk/tone';
import { bandLabel } from '@/lib/desk/band';
import { fmtMcap, fmtMoney, fmtSignedPct } from '@/lib/desk/format';
import { rankDelta, type AiSections, type DeskRow } from '@/lib/desk/rankings';
import { useLanguage } from '@/components/LanguageContext';

const GRID = 'grid grid-cols-[24px_minmax(160px,1.2fr)_170px_130px_70px_70px_65px_60px_65px_60px] items-center gap-x-2.5';

function HeaderRow() {
    return (
        <div className={clsx(GRID, 'hidden border-b border-rule-18 pb-2 pt-3 lg:grid')}>
            <Micro>#</Micro>
            <Micro>COMPANY</Micro>
            <Micro>UNDERWRITING STANCE</Micro>
            <Micro>VALUATION TRIAD</Micro>
            <Micro>MOAT</Micro>
            <Micro>CONVICTION</Micro>
            <Micro>KELLY CAP</Micro>
            <Micro>SKEW</Micro>
            <Micro className="text-right">PRICE</Micro>
            <Micro className="text-right">MCAP</Micro>
        </div>
    );
}

function DeskRowView({ row, rank, onOpen }: { row: DeskRow; rank: React.ReactNode; onOpen: (t: string) => void }) {
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => onOpen(row.ticker)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(row.ticker); } }}
            className={clsx(GRID, 'hidden cursor-pointer border-b border-rule-10 py-3 hover:bg-hover lg:grid',
                row.promo === 'promoted' && 'bg-accent/[0.05]')}
        >
            <span className="font-mono text-[12px] text-ink-3">{rank}</span>
            <StockCell row={row} />
            <span className="min-w-0">
                <VerdictCell row={row} />
                <PromoLine row={row} delta={rankDelta(row)} />
            </span>
            <TriadCell row={row} />
            <MoatCell row={row} />
            <ConvictionCell row={row} />
            <HalfKellyCell row={row} />
            <SkewCell row={row} />
            <PriceCell row={row} />
            <McapCell row={row} />
        </div>
    );
}

/** Mobile: stacked card with institutional contract summary */
function RowCard({ row, rank, onOpen }: { row: DeskRow; rank: React.ReactNode; onOpen: (t: string) => void }) {
    const { t } = useLanguage();
    const d = row.depth;
    const tone = verdictTone(d?.direction);
    const label = tone.keys.label ? t(tone.keys.label) : tone.label;
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => onOpen(row.ticker)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(row.ticker); } }}
            className={clsx('block cursor-pointer border-b border-rule-10 py-3.5 lg:hidden',
                row.promo === 'promoted' && 'bg-accent/[0.05]')}
        >
            <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">
                    <span className="font-mono text-[11px] text-ink-3">{rank}</span>
                    <span className="ml-2 text-[16px] font-extrabold text-ink">{row.ticker}</span>
                    <span className="ml-1.5 text-[11px] text-ink-2">{row.info?.name ?? ''}</span>
                </span>
                <span className="shrink-0 font-mono text-[13px] text-ink">{fmtMoney(d?.price ?? row.info?.price)}</span>
            </div>

            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[12px] font-extrabold" style={{ color: tone.color }}>
                    {label}
                    {d?.mos_vs_median_pct != null && (
                        <span className="ml-1.5 font-mono text-[11px]">({fmtSignedPct(d.mos_vs_median_pct)} MoS)</span>
                    )}
                </span>
                <span className="flex items-center gap-2.5 font-mono text-[11px]">
                    {row.moat != null && <span className="text-accent font-semibold">★ {row.moat.toFixed(1)}/5</span>}
                    {row.conviction != null && <span className="text-ink">C:{row.conviction}/15</span>}
                    {row.kelly != null && row.kelly > 0 && <span className="text-pos font-semibold">{row.kelly.toFixed(1)}% Cap</span>}
                </span>
            </div>

            {d && (
                <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-ink-3">
                    <span>Base IV: {fmtMoney(d.median_iv)}</span>
                    {row.skew != null && <span>Skew: {row.skew.toFixed(2)}x</span>}
                </div>
            )}
        </div>
    );
}

function Section({ title, note, rows, rankOf, onOpen, empty }: {
    title: string;
    note: string;
    rows: DeskRow[];
    rankOf: (r: DeskRow, i: number) => React.ReactNode;
    onOpen: (t: string) => void;
    empty: string;
}) {
    return (
        <section className="mt-7 first:mt-0">
            <SectionHead title={title} note={note} />
            <HeaderRow />
            {rows.length === 0
                ? <p className="border-b border-rule-10 py-5 text-[12px] text-ink-3">{empty}</p>
                : rows.map((r, i) => (
                    <React.Fragment key={r.ticker}>
                        <DeskRowView row={r} rank={rankOf(r, i)} onOpen={onOpen} />
                        <RowCard row={r} rank={rankOf(r, i)} onOpen={onOpen} />
                    </React.Fragment>
                ))}
        </section>
    );
}

export function AiLens({ sections, onOpen }: { sections: AiSections; onOpen: (t: string) => void }) {
    const { t } = useLanguage();
    const { researchNow, watchlist, awaiting, vetoed } = sections;
    return (
        <div>
            <Section
                title={t('secResearchNow')}
                note={t('secResearchNote')}
                rows={researchNow}
                rankOf={(r) => r.aiRank ?? '—'}
                onOpen={onOpen}
                empty="No name currently sits below its whole valuation band."
            />

            <Section
                title={t('secWatchlist')}
                note={t('secWatchlistNote')}
                rows={watchlist}
                rankOf={(r) => (r.fct.fct_rank ? `q${r.fct.fct_rank}` : '—')}
                onOpen={onOpen}
                empty="Nothing on the watchlist."
            />

            {awaiting.length > 0 && (
                <Section
                    title={t('secAwaiting')}
                    note={`${awaiting.length} · ${t('secAwaitingNote')}`}
                    rows={awaiting}
                    rankOf={(r) => (r.fct.fct_rank ? `q${r.fct.fct_rank}` : '—')}
                    onOpen={onOpen}
                    empty=""
                />
            )}

            {vetoed.length > 0 && (
                <section className="mt-7">
                    <SectionHead title={t('secVetoed')} note={t('secVetoedNote')} />
                    {vetoed.map((r) => (
                        <div
                            key={r.ticker}
                            role="button"
                            tabIndex={0}
                            onClick={() => onOpen(r.ticker)}
                            onKeyDown={(e) => { if (e.key === 'Enter') onOpen(r.ticker); }}
                            className="grid cursor-pointer grid-cols-[26px_minmax(180px,240px)_1fr] items-baseline gap-x-3 py-3 opacity-65 hover:opacity-90"
                        >
                            <span className="font-mono text-[12px] text-ink-3">—</span>
                            <span className="text-[15px] font-extrabold text-ink">{r.ticker}
                                <span className="ml-1.5 text-[11px] font-normal text-ink-2">{r.info?.name ?? ''}</span>
                            </span>
                            <span className="text-[11.5px] text-ink-2">
                                <span className="font-bold text-neg">■ VETOED</span>
                                {' · '}{r.vetoReason ?? 'hard avoid'}
                            </span>
                        </div>
                    ))}
                </section>
            )}
        </div>
    );
}

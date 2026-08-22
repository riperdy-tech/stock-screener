'use client';

// RS2 AI lens — the default view. The verdict is where today's price sits
// against the whole band of the three seeded runs; the quant composite is
// demoted to a context column.

import React from 'react';
import clsx from 'clsx';
import { Micro, SectionHead } from '../primitives';
import {
    BandStrip, McapCell, MedianGapCell, PriceCell, PromoLine,
    QuantFilterCell, SpreadSizeCell, StockCell, VerdictCell,
} from './cells';
import { verdictTone } from '@/lib/desk/tone';
import { bandLabel } from '@/lib/desk/band';
import { fmtMcap, fmtMoney, fmtSignedPct } from '@/lib/desk/format';
import { rankDelta, type AiSections, type DeskRow } from '@/lib/desk/rankings';
import { useLanguage } from '@/components/LanguageContext';

const GRID = 'grid grid-cols-[26px_180px_190px_170px_90px_120px_150px_70px_56px] items-center gap-x-3';

function HeaderRow() {
    const { t } = useLanguage();
    return (
        <div className={clsx(GRID, 'hidden border-b border-rule-12 pb-2 pt-3 lg:grid')}>
            <Micro>#</Micro>
            <Micro>{t('colStockDesk')}</Micro>
            <Micro>{t('colVerdict')}</Micro>
            <Micro>{t('colBandVsPrice')}</Micro>
            <Micro className="text-right">{t('colMedianGap')}</Micro>
            <Micro>{t('colSpreadSize')}</Micro>
            <Micro>{t('colQuantFilter')}</Micro>
            <Micro className="text-right">{t('colPriceDesk')}</Micro>
            <Micro className="text-right">{t('colMcapDesk')}</Micro>
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
            className={clsx(GRID, 'hidden cursor-pointer border-b border-rule-6 py-3 hover:bg-hover lg:grid',
                row.promo === 'promoted' && 'bg-accent/[0.05]')}
        >
            <span className="font-mono text-[12px] text-ink-3">{rank}</span>
            <StockCell row={row} />
            <span className="min-w-0">
                <VerdictCell row={row} />
                <PromoLine row={row} delta={rankDelta(row)} />
            </span>
            <BandStrip row={row} />
            <MedianGapCell row={row} />
            <SpreadSizeCell row={row} />
            <QuantFilterCell row={row} />
            <PriceCell row={row} />
            <McapCell row={row} />
        </div>
    );
}

/** Mobile: one stacked card per name — ticker + verdict line, band strip, gap. */
function RowCard({ row, rank, onOpen }: { row: DeskRow; rank: React.ReactNode; onOpen: (t: string) => void }) {
    const { t } = useLanguage();
    const d = row.depth;
    const tone = verdictTone(d?.direction);
    const label = tone.keys.label ? t(tone.keys.label) : tone.label;
    const action = tone.keys.action ? t(tone.keys.action) : null;
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => onOpen(row.ticker)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(row.ticker); } }}
            className={clsx('block cursor-pointer border-b border-rule-6 py-3.5 lg:hidden',
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

            <div className="mt-2 flex items-baseline justify-between gap-3">
                <span className="text-[12px] font-extrabold" style={{ color: tone.color }}>
                    {label}
                    {action && <span className="ml-1.5 font-medium text-ink-2">· {action}</span>}
                </span>
                <span className="font-mono text-[11px] text-ink-2">
                    {d?.mos_vs_median_pct != null && <span style={{ color: tone.color }}>{fmtSignedPct(d.mos_vs_median_pct)}</span>}
                    {/* A size hint only means something where there is something to buy. */}
                    {d?.direction === 'undervalued' && d.size_hint && (
                        <span className="ml-2 uppercase">{d.size_hint}</span>
                    )}
                </span>
            </div>

            {d && <div className="mt-2"><BandStrip row={row} height={12} showSubline={false} /></div>}

            <div className="mt-2 font-mono text-[10px] text-ink-3">
                {d ? bandLabel(d.iv_band_low, d.iv_band_high, d.median_iv) : 'awaiting depth run'}
                {' · '}quant #{row.fct.fct_rank ?? '—'}
                {' · '}{fmtMcap(row.info?.marketCap)}
            </div>
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
                ? <p className="border-b border-rule-6 py-5 text-[12px] text-ink-3">{empty}</p>
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
                            className="grid cursor-pointer grid-cols-[26px_180px_1fr] items-baseline gap-x-3 py-3 opacity-65 hover:opacity-90"
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

'use client';

// Rankings — the default surface. Intro band + funnel, then the lens switcher,
// then whichever lens table is active.

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Chip, Micro } from '../primitives';
import { useLanguage } from '@/components/LanguageContext';
import { AiLens } from './AiLens';
import { QuantLens } from './QuantLens';
import { CompareLens } from './CompareLens';
import {
    aiSections, applyFilters, buildRows, compareRows, sectorsOf,
    type CompareSort, type RankingFilters,
} from '@/lib/desk/rankings';
import type { DepthVerdict, FactorScoresPayload, ValuationModel } from '@/lib/data-service';
import type { StockInfo } from '@/lib/desk/useDeskData';

export type Lens = 'ai' | 'quant' | 'compare';

const VERDICT_OPTIONS: [string, string][] = [
    ['all', 'All verdicts'],
    ['analyzed', 'Depth-analyzed'],
    ['undervalued', 'Undervalued'],
    ['fair', 'Fair'],
    ['overvalued', 'Overvalued'],
    ['not_usable', 'No plausible run'],
    ['promoted', 'AI promoted'],
    ['demoted', 'AI demoted'],
    ['vetoed', 'Vetoed'],
];

const BAND_OPTIONS: [string, string][] = [
    ['all', 'All bands'],
    ['research_now', 'Research now'],
    ['watchlist', 'Watchlist'],
    ['monitor', 'Monitor'],
    ['pass', 'Pass'],
];

function Select({ value, onChange, options, label }: {
    value: string;
    onChange: (v: string) => void;
    options: [string, string][];
    label: string;
}) {
    return (
        <select
            aria-label={label}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="border border-rule-14 bg-transparent px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[.06em] text-ink-2 hover:text-ink focus:text-ink"
        >
            {options.map(([v, l]) => <option key={v} value={v} className="bg-page text-ink">{l}</option>)}
        </select>
    );
}

function Funnel({ scored, analyzed, researchNow, labels }: {
    scored: number; analyzed: number; researchNow: number; labels: [string, string, string];
}) {
    const cells = [
        { n: scored, label: labels[0], cls: 'text-ink-3' },
        { n: analyzed, label: labels[1], cls: 'text-ink-2' },
        { n: researchNow, label: labels[2], cls: 'text-accent font-semibold' },
    ];
    return (
        <div className="flex gap-x-6 text-right">
            {cells.map((c, i) => (
                <div key={c.label} className={i > 0 ? 'border-l border-rule-12 pl-6' : ''}>
                    <div className={`font-mono text-[28px] leading-none ${c.cls}`}>{c.n.toLocaleString('en-US')}</div>
                    <Micro className={`mt-1 block ${i === 2 ? 'text-accent' : ''}`}>{c.label}</Micro>
                </div>
            ))}
        </div>
    );
}

export function RankingsView({ factor, depth, valuations, overlay, stockInfo, lens, onLens, onOpen }: {
    factor: FactorScoresPayload | null;
    depth: Record<string, DepthVerdict>;
    valuations: Record<string, ValuationModel>;
    overlay: Record<string, any>;
    stockInfo: Record<string, StockInfo>;
    lens: Lens;
    onLens: (l: Lens) => void;
    onOpen: (ticker: string) => void;
}) {
    const { t } = useLanguage();
    const [filters, setFilters] = useState<RankingFilters>({ search: '', band: 'all', verdict: 'all', sector: 'all' });
    const [cmpSort, setCmpSort] = useState<CompareSort>('delta');
    const [limit, setLimit] = useState(100);

    const rows = useMemo(
        () => buildRows({ factor, depth, valuations, overlay, stockInfo }),
        [factor, depth, valuations, overlay, stockInfo],
    );
    const sectors = useMemo(() => sectorsOf(rows), [rows]);
    const filtered = useMemo(() => applyFilters(rows, filters), [rows, filters]);
    const sections = useMemo(() => aiSections(filtered), [filtered]);
    const compare = useMemo(() => compareRows(filtered, cmpSort), [filtered, cmpSort]);

    const set = (patch: Partial<RankingFilters>) => setFilters((f) => ({ ...f, ...patch }));

    const analyzed = Object.keys(depth).length;
    const researchNowCount = factor?.band_counts?.research_now ?? 0;

    return (
        <div>
            {/* Intro band — what the reader is looking at, and the funnel that produced it. */}
            <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-5 py-7">
                <div className="max-w-[620px]">
                    <h1 className="text-[22px] font-bold leading-snug tracking-head text-ink">
                        {t('rankHeadline')}
                    </h1>
                    <p className="mt-2 text-[12.5px] text-ink-2">
                        {t('rankSub')}{' '}
                        <Link href="/help#rs2" className="border-b border-dotted border-accent/50 text-accent">
                            {t('rankHowItWorks')}
                        </Link>
                    </p>
                </div>
                <Funnel
                    scored={factor?.scored_count ?? 0}
                    analyzed={analyzed}
                    researchNow={researchNowCount}
                    labels={[t('funnelQuant'), t('funnelDepth'), t('funnelResearch')]}
                />
            </div>

            {/* Lens switcher + filters */}
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-rule-9 py-4">
                <div className="flex items-center gap-2">
                    <Micro className="mr-1">{t('lensLabelDesk')}</Micro>
                    <Chip active={lens === 'ai'} onClick={() => onLens('ai')}>{t('lensAi')}</Chip>
                    <Chip active={lens === 'quant'} onClick={() => onLens('quant')}>{t('lensQuantDesk')}</Chip>
                    <Chip active={lens === 'compare'} onClick={() => onLens('compare')}>{t('lensCompareDesk')}</Chip>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Select label="Verdict" value={filters.verdict} onChange={(v) => set({ verdict: v })} options={VERDICT_OPTIONS} />
                    <Select label="Quant band" value={filters.band} onChange={(v) => set({ band: v })} options={BAND_OPTIONS} />
                    <Select
                        label="Sector"
                        value={filters.sector}
                        onChange={(v) => set({ sector: v })}
                        options={[['all', 'All sectors'], ...sectors.map((s) => [s, s] as [string, string])]}
                    />
                    <input
                        value={filters.search}
                        onChange={(e) => set({ search: e.target.value })}
                        placeholder="SEARCH TICKER OR NAME"
                        aria-label="Search ticker or name"
                        className="w-[190px] border border-rule-14 bg-transparent px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[.06em] text-ink placeholder:text-ink-3"
                    />
                </div>
            </div>

            {lens === 'ai' && <AiLens sections={sections} onOpen={onOpen} />}
            {lens === 'quant' && (
                <QuantLens rows={filtered} onOpen={onOpen} limit={limit} onMore={() => setLimit((l) => l + 100)} />
            )}
            {lens === 'compare' && (
                <CompareLens rows={compare} sort={cmpSort} onSort={setCmpSort} onOpen={onOpen} />
            )}
        </div>
    );
}

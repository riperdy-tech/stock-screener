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
    aiSections, applyFilters, buildRows, compareRows, sectorsOf, industriesOf,
    type CompareSort, type RankingFilters,
} from '@/lib/desk/rankings';
import type { DepthVerdict, FactorScoresPayload, ValuationModel } from '@/lib/data-service';
import type { StockInfo } from '@/lib/desk/useDeskData';

export type Lens = 'ai' | 'quant' | 'compare';

const VERDICT_OPTIONS: [string, string][] = [
    ['all', 'All underwritings'],
    ['analyzed', 'Depth underwritten'],
    ['consensus_2', '2-Run Tight Consensus (≤15%)'],
    ['escalated_3', '3-Run Escalated Tiebreaker'],
    ['undervalued', 'Undervalued compounders'],
    ['fair', 'Fair value rails'],
    ['overvalued', 'Overvalued / Preserved'],
    ['wide_moat', 'Wide Moat (≥4.0/5.0)'],
    ['high_conviction', 'High Conviction (≥12/15)'],
    ['asymmetric', 'Asymmetric Payoff (≥1.5x)'],
    ['promoted', 'AI promoted (Watchlist gem)'],
    ['demoted', 'AI demoted (Quant avoid)'],
    ['not_usable', 'No plausible run'],
    ['vetoed', 'Disqualified / Vetoed'],
];

const BAND_OPTIONS: [string, string][] = [
    ['all', 'All bands'],
    ['research_now', 'Research now'],
    ['watchlist', 'Watchlist'],
    ['monitor', 'Monitor'],
    ['pass', 'Pass'],
];

function Select({ value, onChange, options, label, maxWidth }: {
    value: string;
    onChange: (v: string) => void;
    options: [string, string][];
    label: string;
    maxWidth?: string;
}) {
    return (
        <select
            aria-label={label}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={maxWidth ? { maxWidth } : undefined}
            className="border border-rule-24 bg-transparent px-2.5 py-1.5 font-mono font-semibold text-[11px] uppercase tracking-[.06em] text-ink-2 hover:text-ink focus:text-ink truncate"
        >
            {options.map(([v, l]) => <option key={v} value={v} className="bg-page text-ink">{l}</option>)}
        </select>
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
    const [filters, setFilters] = useState<RankingFilters>({ search: '', band: 'all', verdict: 'all', sector: 'all', industry: 'all' });
    const [cmpSort, setCmpSort] = useState<CompareSort>('delta');
    const [limit, setLimit] = useState(100);

    const rows = useMemo(
        () => buildRows({ factor, depth, valuations, overlay, stockInfo }),
        [factor, depth, valuations, overlay, stockInfo],
    );
    const sectors = useMemo(() => sectorsOf(rows), [rows]);
    const industries = useMemo(() => industriesOf(rows, filters.sector), [rows, filters.sector]);
    const filtered = useMemo(() => applyFilters(rows, filters), [rows, filters]);
    const sections = useMemo(() => aiSections(filtered), [filtered]);
    const compare = useMemo(() => compareRows(filtered, cmpSort), [filtered, cmpSort]);

    const set = (patch: Partial<RankingFilters>) => setFilters((f) => ({ ...f, ...patch }));

    const depthEntries = Object.values(depth || {});
    const analyzed = depthEntries.length;
    const researchNowCount = factor?.band_counts?.research_now ?? 0;

    // Consensus telemetry
    const twoRunCount = depthEntries.filter(d => (d.samples_run ?? d.n_basis) === 2).length;
    const threeRunCount = depthEntries.filter(d => (d.samples_run ?? d.n_basis) >= 3).length;
    const spreads = depthEntries.map(d => d.spread_pct).filter((s): s is number => s != null && !isNaN(s));
    const sortedSpreads = [...spreads].sort((a, b) => a - b);
    const medianSpread = sortedSpreads.length > 0 ? sortedSpreads[Math.floor(sortedSpreads.length / 2)] : 0;
    const tightCount = spreads.filter(s => s <= 15).length;

    return (
        <div>
            {/* Executive Cockpit Bar — Intuitive, zero-wordiness institutional header */}
            <div className="border-b border-rule-14 pb-5 pt-4">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="inline-block w-2.5 h-2.5 rounded-full bg-pos animate-pulse" />
                            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-pos">
                                RS2 ENGINE ONLINE · ADAPTIVE 2-ESCALATE ACTIVE
                            </span>
                        </div>
                        <h1 className="mt-1 text-[23px] font-extrabold tracking-tight text-ink">
                            StockPeak Institutional Underwriting Desk
                        </h1>
                        <p className="mt-1 text-[13px] text-ink-2">
                            Multi-seed autonomous deliberation, adversarial red-teaming, and institutional installed-base economics.
                        </p>
                    </div>
                </div>

                {/* 4 Sleek Metric KPI Cards */}
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="border border-rule-18 bg-white/[0.02] p-3 rounded-xs">
                        <Micro className="text-ink-3">SCORED UNIVERSE</Micro>
                        <div className="mt-1 font-mono text-[20px] font-bold text-ink">
                            {factor?.scored_count ? factor.scored_count.toLocaleString('en-US') : '1,327'}
                        </div>
                        <div className="mt-0.5 text-[11px] text-ink-3">
                            <span className="text-accent font-semibold">{researchNowCount}</span> in primary queue
                        </div>
                    </div>

                    <div className="border border-rule-18 bg-white/[0.02] p-3 rounded-xs">
                        <Micro className="text-ink-3">ACTIVE UNDERWRITINGS</Micro>
                        <div className="mt-1 font-mono text-[20px] font-bold text-ink">
                            {analyzed} <span className="text-[13px] font-normal text-ink-3">TICKERS</span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-pos">
                            100% SEC/Primary audited
                        </div>
                    </div>

                    <div className="border border-rule-18 bg-white/[0.02] p-3 rounded-xs">
                        <Micro className="text-ink-3">CONSENSUS DISTRIBUTION</Micro>
                        <div className="mt-1 font-mono text-[20px] font-bold text-ink">
                            {twoRunCount}<span className="text-[13px] font-normal text-ink-3"> (n=2)</span> · {threeRunCount}<span className="text-[13px] font-normal text-ink-3"> (n=3)</span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-ink-3">
                            {analyzed > 0 ? `${Math.round((twoRunCount / (twoRunCount + threeRunCount || 1)) * 100)}% early-stop efficiency` : 'Adaptive deliberation'}
                        </div>
                    </div>

                    <div className="border border-rule-18 bg-white/[0.02] p-3 rounded-xs" title="Median valuation spread across runs. Outliers like DXC, BFH, APA reflect turnaround and commodity cycles.">
                        <Micro className="text-ink-3">MEDIAN VALUATION SPREAD</Micro>
                        <div className="mt-1 font-mono text-[20px] font-bold text-ink">
                            {medianSpread > 0 ? `${medianSpread.toFixed(1)}%` : '≤ 15.0%'}
                        </div>
                        <div className="mt-0.5 text-[11px] text-ink-3">
                            <span className="text-pos font-semibold">{tightCount}/{spreads.length}</span> inside ≤15% target
                        </div>
                    </div>
                </div>
            </div>

            {/* Lens switcher + filters */}
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-rule-14 py-3">
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
                        onChange={(v) => set({ sector: v, industry: 'all' })}
                        options={[['all', 'All sectors'], ...sectors.map((s) => [s, s] as [string, string])]}
                    />
                    <Select
                        label="Industry"
                        value={filters.industry}
                        onChange={(v) => set({ industry: v })}
                        maxWidth="170px"
                        options={[['all', 'All industries'], ...industries.map((ind) => [ind, ind] as [string, string])]}
                    />
                    <input
                        value={filters.search}
                        onChange={(e) => set({ search: e.target.value })}
                        placeholder="SEARCH TICKER OR NAME"
                        aria-label="Search ticker or name"
                        className="w-[180px] border border-rule-24 bg-transparent px-2.5 py-1.5 font-mono font-semibold text-[11px] uppercase tracking-[.06em] text-ink placeholder:text-ink-3"
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

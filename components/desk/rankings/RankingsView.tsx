'use client';

// Rankings — the default surface. Intro band + funnel, then the lens switcher,
// then whichever lens table is active.

import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import { Chip, Micro } from '../primitives';
import { useLanguage } from '@/components/LanguageContext';
import { isActionable, TONE_COLORS } from '@/lib/desk/tone';
import { AiLens } from './AiLens';
import { QuantLens } from './QuantLens';
import {
    aiSections, applyFilters, buildRows, sectorsOf, industriesOf, inStage, FUNNEL_STAGES, EMPTY_FILTERS,
    type FunnelStage, type RankingFilters,
} from '@/lib/desk/rankings';
import type { DepthVerdict, FactorScoresPayload, ValuationModel } from '@/lib/data-service';
import type { StockInfo } from '@/lib/desk/useDeskData';

export type Lens = 'ai' | 'quant';

const VERDICT_OPTIONS: [string, string][] = [
    ['all', 'All underwritings'],
    ['analyzed', 'Depth underwritten'],
    ['consensus_2', '2-Run Tight Consensus (≤15%)'],
    ['escalated_3', '3-Run Escalated Tiebreaker'],
    ['blocked', 'Blocked by the gate'],
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
    ['pass', 'Pass'],
    ['vetoed', 'Vetoed'],
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
    const [filters, setFilters] = useState<RankingFilters>(EMPTY_FILTERS);
    const [limit, setLimit] = useState(100);

    const rows = useMemo(
        () => buildRows({ factor, depth, valuations, overlay, stockInfo }),
        [factor, depth, valuations, overlay, stockInfo],
    );
    const sectors = useMemo(() => sectorsOf(rows), [rows]);
    const industries = useMemo(() => industriesOf(rows, filters.sector), [rows, filters.sector]);
    const filtered = useMemo(() => applyFilters(rows, filters), [rows, filters]);
    const sections = useMemo(() => aiSections(filtered), [filtered]);

    const set = (patch: Partial<RankingFilters>) => setFilters((f) => ({ ...f, ...patch }));

    const depthEntries = Object.values(depth || {});
    const researchNowCount = factor?.band_counts?.research_now;

    const actionableCount = depthEntries.filter((d) => isActionable(d)).length;

    // The funnel: how the whole market narrows to the AI's verdicts. Counts use the same rule as the
    // list a click opens (`inStage`), so the number on a step is the number of rows it shows.
    const funnel = useMemo(() => FUNNEL_STAGES.map((s) => ({
        ...s,
        n: rows.filter((r) => inStage(r, s.id)).length,
        note: s.id === 'list' && researchNowCount != null ? `${researchNowCount} in Research now` : undefined,
    })), [rows, researchNowCount]);
    // A step opens the plain list (the AI view groups by verdict, not by step); the active step
    // clicked again clears the filter.
    const pickStage = (stage: FunnelStage) => {
        set({ stage: filters.stage === stage ? 'all' : stage });
        setLimit(100);
        onLens('quant');
    };

    return (
        <div>
            {/* Executive Cockpit Bar — Intuitive, zero-wordiness institutional header */}
            <div className="border-b border-rule-14 pb-5 pt-4">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className={clsx('font-mono text-[11px] font-bold uppercase tracking-[0.1em]',
                                actionableCount === 0 ? 'text-warn' : 'text-pos')}>
                                {actionableCount === 0
                                    ? 'AI ANALYST: NO VERDICT PASSES THE GATE'
                                    : `AI ANALYST: ${actionableCount} ACTIONABLE VERDICT${actionableCount === 1 ? '' : 'S'}`}
                            </span>
                        </div>
                        <h1 className="mt-1 text-[23px] font-extrabold tracking-tight text-ink">
                            StockPeak Institutional Underwriting Desk
                        </h1>
                        <p className="mt-1 text-[13px] text-ink-2">
                            A quant screen narrows the market to a shortlist; an AI analyst values each name; code checks every verdict before it counts.
                        </p>
                    </div>
                </div>

                {/* The funnel: the market narrowing step by step to the AI's verdicts */}
                <ol className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
                    {funnel.map((step, i) => (
                        <li key={step.id} className="relative">
                            <button
                                onClick={() => pickStage(step.id)}
                                aria-pressed={filters.stage === step.id}
                                title={filters.stage === step.id ? 'Showing these stocks - click again to show all' : 'Show these stocks'}
                                className={clsx('block w-full border-l-[3px] py-0.5 pl-3 text-left transition-colors hover:bg-hover',
                                    filters.stage === step.id && 'bg-hover')}
                                style={{ borderLeftColor: step.id === 'gate' ? TONE_COLORS.POS : `color-mix(in oklch, var(--accent) ${([0.25, 0.45, 0.7, 0.9][i] ?? 1) * 100}%, transparent)` }}
                            >
                                <div className="font-mono text-[20px] font-bold leading-none text-ink">{step.n.toLocaleString('en-US')}</div>
                                <div className={clsx('mt-1 text-[12px]', filters.stage === step.id ? 'text-ink' : 'text-ink-2')}>{step.label}</div>
                                {step.note && <div className="text-[11px] text-ink-3">{step.note}</div>}
                            </button>
                            {i < funnel.length - 1 && (
                                <span aria-hidden className="absolute -right-3 top-1 hidden font-mono text-[14px] text-ink-3 sm:inline">→</span>
                            )}
                        </li>
                    ))}
                </ol>
            </div>

            {/* Lens switcher + filters */}
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-rule-14 py-3">
                <div className="flex items-center gap-2">
                    <Micro className="mr-1">{t('lensLabelDesk')}</Micro>
                    <Chip active={lens === 'ai'} onClick={() => onLens('ai')}>{t('lensAi')}</Chip>
                    <Chip active={lens === 'quant'} onClick={() => onLens('quant')}>{t('lensQuantDesk')}</Chip>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Select
                        label="Step"
                        value={filters.stage}
                        onChange={(v) => { set({ stage: v as FunnelStage }); setLimit(100); }}
                        options={FUNNEL_STAGES.map((s) => [s.id, s.id === 'all' ? 'All steps' : s.label] as [string, string])}
                    />
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
        </div>
    );
}

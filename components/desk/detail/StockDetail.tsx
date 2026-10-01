'use client';

// Stock detail and AI underwriting record page (/t/[ticker])
// Valuation Triad (Bear / Market / Base / Bull), multi-run audit, and the gate status.

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Bar, Micro, Tag } from '../primitives';
import { ValuationTriadHero } from './ValuationTriadHero';
import { TranscriptViewer } from './TranscriptViewer';
import { Rs2AnalysisPanel } from '@/components/Rs2AnalysisPanel';
import { fetchDepthReport, type DepthReportBundle, type DepthVerdict } from '@/lib/data-service';
import { headlineFromSamples } from '@/lib/desk/thesis';
import {
    DATA_NOTES, FAMILY, FORENSIC_WARNINGS, TONE_COLORS, gapColor, gateReasonsText, isBlocked, sizeTone, verdictTone, whyListed,
} from '@/lib/desk/tone';
import { fmtMcap, fmtMoney, fmtSignedPct } from '@/lib/desk/format';
import { buildRows, type DeskRow } from '@/lib/desk/rankings';
import { useDeskData } from '@/lib/desk/useDeskData';
import { Shell } from '../Shell';
import { useLanguage } from '@/components/LanguageContext';

// The keys the dual-door screen writes into `fct_z`.
const FACTORS: [string, string, string][] = [
    ['quality', 'Quality', FAMILY.quality],
    ['momentum', 'Momentum', FAMILY.momentum],
    ['revisions', 'Revisions', FAMILY.revisions],
    ['value', 'Value', FAMILY.value],
    ['exp_gap', 'Expectations gap', FAMILY.exp_gap],
];

function DepthStatRow({ row }: { row: DeskRow }) {
    const { t } = useLanguage();
    const d = row.depth!;
    const size = sizeTone(d.size_hint, d.n_basis);
    const sizable = d.direction === 'undervalued' && !!d.size_hint;
    const blocked = isBlocked(d);
    const totalRuns = d.samples_run ?? d.n_basis;

    return (
        <div className={clsx('mt-6 grid grid-cols-2 gap-4 border border-rule-14 bg-white/[0.02] p-4 rounded-sm',
            blocked ? 'sm:grid-cols-3' : 'sm:grid-cols-4')}>
            <div>
                <Micro className="text-ink-3">Consensus Base IV</Micro>
                <div className="mt-1 font-mono text-[19px] font-bold text-ink">
                    {d.median_iv != null ? fmtMoney(d.median_iv, 0) : '—'}
                </div>
                <div className="mt-0.5 text-[11px]" style={{ color: gapColor(d.mos_vs_median_pct, d.direction) }}>
                    {fmtSignedPct(d.mos_vs_median_pct)} Margin of Safety
                </div>
            </div>

            <div>
                <Micro className="text-ink-3">Consensus Spread</Micro>
                <div className="mt-1 font-mono text-[19px] font-bold text-ink">
                    {d.spread_pct != null ? `${d.spread_pct.toFixed(1)}%` : '—'}
                </div>
                <div className="mt-0.5 text-[11px] text-ink-3">
                    {d.spread_pct == null ? 'not available'
                        : d.spread_pct <= 15 ? 'Tight consensus agreement'
                            : 'Escalated deliberation'}
                </div>
            </div>

            {!blocked && (
                <div>
                    <Micro className="text-ink-3">Half-Kelly Position Cap</Micro>
                    <div className="mt-1 text-[17px] font-extrabold" style={{ color: sizable ? size.color : TONE_COLORS.MUTED }}>
                        {d.kelly_fraction_pct != null ? `${d.kelly_fraction_pct.toFixed(1)}%` : sizable ? size.label : '—'}
                    </div>
                    <div className="mt-0.5 text-[11px] text-ink-3">
                        {sizable ? 'Disciplined allocation' : 'Preserve capital (Price > IV)'}
                    </div>
                </div>
            )}

            <div>
                <Micro className="text-ink-3">Guarded Samples</Micro>
                <div className="mt-1 font-mono text-[19px] font-bold text-ink">
                    {d.n_basis ?? '—'}<span className="text-[13px] text-ink-3">/{totalRuns ?? '—'}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-ink-3">
                    {totalRuns == null || d.n_basis == null ? '—'
                        : totalRuns - d.n_basis === 0 ? '100% passed plausibility'
                            : `${totalRuns - d.n_basis} guarded/filtered`}
                </div>
            </div>
        </div>
    );
}

function MultiRunAuditMatrix({ d, bundle, onSelectSample }: {
    d: DepthVerdict;
    bundle: DepthReportBundle | null;
    onSelectSample?: (idx: number) => void;
}) {
    const runs = (bundle?.samples && bundle.samples.length > 0)
        ? bundle.samples.map((s) => ({
            sample: s.sample,
            iv: s.iv,
            bull_iv: s.scorecard?.bull_iv,
            bear_iv: s.scorecard?.bear_iv,
            conviction: s.scorecard?.conviction_score,
            moat: s.scorecard?.business_quality_moat,
            kelly: s.scorecard?.kelly_fraction_pct,
            secs: s.secs,
            plausible: s.plausible,
            hasReport: !!(s.report && s.report.length > 0),
            trigger: s.scorecard?.thesis_invalidation_trigger,
            reasons: s.reasons,
        }))
        : (d.runs || []);

    const n = d.samples_run ?? d.n_basis ?? (runs.length > 0 ? runs.length : 1);
    const spread = d.spread_pct;
    const isTight = spread != null && spread <= 15;
    const isEscalated = n >= 3;
    const blocked = isBlocked(d);

    return (
        <div className="mt-6 border border-rule-18 bg-[#111317] rounded-sm overflow-hidden">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule-14 bg-white/[0.03] px-5 py-3">
                <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-ink-3" />
                    <Micro className="font-extrabold uppercase tracking-wider text-ink">
                        Multi-Seed Deliberation Audit · {runs.length > 0 ? `${runs.length} Independent Runs Recorded` : `${n} Runs Executed`}
                    </Micro>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px]">
                    <span className="text-ink-3">Consensus Spread:</span>
                    <span className="font-bold text-ink">
                        {spread != null ? `${spread.toFixed(1)}%` : '—'}
                    </span>
                    <span className="text-ink-3">
                        {isTight ? '(Early Stop ≤15%)' : isEscalated ? '(Escalated Deliberation n=3)' : '(Single Baseline)'}
                    </span>
                </div>
            </div>

            {/* Side-by-side run cards */}
            <div className={clsx(
                'grid divide-y sm:divide-y-0 sm:divide-x divide-rule-14 border-b border-rule-14',
                runs.length === 1 ? 'grid-cols-1' : runs.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3',
            )}>
                {runs.map((r, i) => {
                    const price = d.price;
                    const mos = (r.iv != null && price != null && price > 0)
                        ? ((r.iv - price) / price) * 100
                        : null;
                    const isFailed = !r.plausible || r.iv == null;

                    return (
                        <div key={r.sample} className="p-4 flex flex-col justify-between hover:bg-white/[0.01] transition-colors">
                            <div>
                                <div className="flex items-baseline justify-between">
                                    <span className="font-mono text-[12px] font-bold text-ink uppercase tracking-wider">
                                        RUN #{r.sample}
                                    </span>
                                    {r.secs != null && (
                                        <span className="font-mono text-[10px] text-ink-3">
                                            {Math.round(r.secs / 60)}m compute
                                        </span>
                                    )}
                                </div>

                                {r.iv != null ? (
                                    <div className="mt-2.5">
                                        <div className="font-mono text-[22px] font-extrabold text-ink">
                                            {fmtMoney(r.iv)}
                                        </div>
                                        <div className="mt-0.5 font-mono text-[11.5px]" style={{ color: blocked ? TONE_COLORS.MUTED : gapColor(mos, d.direction) }}>
                                            {mos != null ? fmtSignedPct(mos) : '—'} MoS vs Market
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mt-2.5 border border-warn/30 bg-warn/[0.04] p-2.5 rounded-xs">
                                        <div className="font-mono text-[12px] font-bold text-warn uppercase tracking-wider">
                                            GUARD INTERCEPT
                                        </div>
                                        <div className="mt-1 text-[10.5px] text-ink-3 leading-tight">
                                            {r.reasons && r.reasons.length > 0
                                                ? `Run rejected: ${r.reasons.join('; ')}.`
                                                : 'Run rejected by the guards.'} Excluded from consensus median.
                                        </div>
                                    </div>
                                )}

                                {/* Triad mini */}
                                {(r.bear_iv != null || r.bull_iv != null) && (
                                    <div className="mt-2.5 font-mono text-[11px] text-ink-3 flex items-center justify-between border-t border-rule-10 pt-2">
                                        <span>Bear: <b className="text-ink-2">{r.bear_iv != null ? fmtMoney(r.bear_iv, 0) : '—'}</b></span>
                                        <span>Bull: <b className="text-ink-2">{r.bull_iv != null ? fmtMoney(r.bull_iv, 0) : '—'}</b></span>
                                    </div>
                                )}

                                {/* Scorecard items */}
                                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-rule-10 pt-2.5 text-center font-mono text-[11px]">
                                    <div>
                                        <Micro className="text-[9.5px] text-ink-3">MOAT</Micro>
                                        <div className="mt-0.5 text-ink font-semibold">
                                            {r.moat != null ? `★ ${r.moat.toFixed(1)}` : '—'}
                                        </div>
                                    </div>
                                    <div>
                                        <Micro className="text-[9.5px] text-ink-3">CONVICTION</Micro>
                                        <div className="mt-0.5 text-ink font-semibold">
                                            {r.conviction != null ? `${r.conviction}/15` : '—'}
                                        </div>
                                    </div>
                                    <div>
                                        <Micro className="text-[9.5px] text-ink-3">KELLY</Micro>
                                        <div className={clsx('mt-0.5 font-semibold', blocked ? 'text-ink-3' : 'text-pos')}>
                                            {!blocked && r.kelly != null ? `${r.kelly.toFixed(1)}%` : '—'}
                                        </div>
                                    </div>
                                </div>

                                {r.trigger && (
                                    <p className="mt-3 text-[11px] leading-relaxed text-ink-3 line-clamp-3 italic">
                                        &ldquo;{r.trigger}&rdquo;
                                    </p>
                                )}
                            </div>

                            {onSelectSample && (
                                <div className="mt-4 pt-3 border-t border-rule-10">
                                    <button
                                        onClick={() => onSelectSample(i)}
                                        className="w-full border border-rule-24 bg-white/[0.02] hover:bg-accent/10 hover:border-accent/40 px-2 py-1.5 font-mono text-[10.5px] font-bold text-ink-2 hover:text-accent tracking-wide uppercase transition-colors"
                                    >
                                        {isFailed ? `View Run #${r.sample} Guard Log ▸` : `Read Run #${r.sample} Memo ▸`}
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Bottom consensus synthesis strip */}
            <div className="bg-white/[0.015] px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 font-mono text-[11.5px] text-ink-2">
                <div className="flex items-center gap-4">
                    <span>Synthesized Median: <b className="text-ink">{fmtMoney(d.median_iv)}</b></span>
                    {!isBlocked(d) && (
                        <span>Allocation Tier: <b className="text-pos">{d.size_hint?.toUpperCase() ?? '—'}</b></span>
                    )}
                </div>
            </div>
        </div>
    );
}

function InstitutionalContractCard({ d, bundle }: { d: DepthVerdict; bundle: DepthReportBundle | null }) {
    const sc = d.scorecard ?? bundle?.scorecard;
    const conviction = d.conviction_score ?? sc?.median_conviction_score;
    const quality = d.business_quality_moat ?? sc?.median_quality_moat;
    const kelly = d.kelly_fraction_pct ?? sc?.median_kelly_fraction_pct;
    const skew = d.asymmetric_payoff_skew ?? sc?.asymmetric_payoff_skew;
    const bullIv = d.bull_iv ?? sc?.median_bull_iv ?? bundle?.samples?.find(s => s.scorecard?.bull_iv != null)?.scorecard?.bull_iv;
    const bearIv = d.bear_iv ?? sc?.median_bear_iv ?? bundle?.samples?.find(s => s.scorecard?.bear_iv != null)?.scorecard?.bear_iv;
    const tranches = d.reentry_tranches ?? sc?.reentry_tranches;
    const triggers = d.thesis_invalidation_triggers ?? sc?.thesis_invalidation_triggers ?? [];

    if (conviction == null && quality == null && !triggers.length) {
        return null;
    }
    const blocked = isBlocked(d);

    return (
        <div className="mt-6 border border-rule-18 bg-[#14171d] rounded-sm overflow-hidden">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-rule-14 bg-white/[0.02] px-5 py-3">
                <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-ink-3" />
                    <Micro className="font-bold text-ink uppercase tracking-wider">
                        AI UNDERWRITING RECORD
                    </Micro>
                </div>
                <div className="font-mono text-[11px] text-ink-3">
                    Fiduciary Capital Underwriting Standard
                </div>
            </div>

            {/* 4 Quadrants Grid */}
            <div className={clsx('grid grid-cols-1 divide-y md:divide-y-0 md:divide-x divide-rule-14 border-b border-rule-14',
                !blocked && 'md:grid-cols-2')}>
                {/* Quadrant 1: Conviction & Moat Quality */}
                <div className="p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-rule-10 pb-2">
                        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-ink-2">
                            Quadrant 1: Conviction &amp; Moat Quality
                        </span>
                        <span className="font-mono text-[13px] font-extrabold text-ink">
                            {conviction != null ? `${conviction} / 15` : '—'}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <span className="block text-[11px] text-ink-3">Conviction Score</span>
                            <div className="mt-1 font-mono text-[18px] font-bold text-ink">
                                {conviction != null ? `${conviction} / 15` : '—'}
                            </div>
                            <div className="mt-0.5 text-[11px] font-medium text-ink-3">
                                {conviction != null && conviction >= 12 ? 'High Conviction Core' : conviction != null && conviction >= 9 ? 'Core Underwriting' : 'Underwriting Watch'}
                            </div>
                        </div>

                        <div>
                            <span className="block text-[11px] text-ink-3">Economic Moat</span>
                            <div className="mt-1 font-mono text-[18px] font-bold text-ink">
                                {quality != null ? `★ ${quality} / 5.0` : '—'}
                            </div>
                            <div className="mt-0.5 text-[11px] text-ink-2">
                                {quality != null && quality >= 4 ? 'Wide Moat / Installed Base' : quality != null && quality >= 3 ? 'Narrow Moat Advantage' : 'Low Barrier / Commodity'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Quadrant 2: Portfolio Limit & Risk Sizing — not shown for a blocked verdict */}
                {!blocked && (
                <div className="p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-rule-10 pb-2">
                        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-ink-2">
                            Quadrant 2: Portfolio Risk &amp; Sizing
                        </span>
                        <span className="font-mono text-[13px] font-extrabold text-pos">
                            {kelly != null ? `${kelly.toFixed(1)}% Cap` : '—'}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <span className="block text-[11px] text-ink-3">Half-Kelly Limit</span>
                            <div className="mt-1 font-mono text-[18px] font-bold text-ink">
                                {kelly != null ? `${kelly.toFixed(1)}%` : '—'}
                            </div>
                            <div className="mt-0.5 text-[11px] text-ink-3">
                                Max Portfolio Allocation Cap
                            </div>
                        </div>

                        <div>
                            <span className="block text-[11px] text-ink-3">Payoff Skew</span>
                            <div className="mt-1 font-mono text-[18px] font-bold text-ink">
                                {skew != null ? `${skew.toFixed(2)}x` : '—'}
                            </div>
                            <div className="mt-0.5 text-[11px] text-ink-3">
                                Bull Upside vs Bear Downside
                            </div>
                        </div>
                    </div>

                    <div className="text-[11.5px] leading-relaxed text-ink-3 border-t border-rule-10 pt-2.5">
                        Downside Hurdle: {bearIv != null ? `Bounded at ${fmtMoney(bearIv)} floor` : 'Passed'}. Sized using fractional Kelly criterion to prevent capital impairment.
                    </div>
                </div>
                )}
            </div>

            {/* Bottom Row: Quadrants 3 & 4 */}
            <div className={clsx('grid grid-cols-1 divide-y md:divide-y-0 md:divide-x divide-rule-14', !blocked && 'md:grid-cols-2')}>
                {/* Quadrant 3: Capital Deployment Tranches — not shown for a blocked verdict */}
                {!blocked && (
                <div className="p-5 space-y-3">
                    <div className="flex items-center justify-between border-b border-rule-10 pb-2">
                        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-ink-2">
                            Quadrant 3: Capital Deployment Tranches
                        </span>
                        <span className="font-mono text-[11px] text-ink-3">Execution Limits</span>
                    </div>

                    <div className="space-y-2 font-mono text-[12px]">
                        <div className="flex items-center justify-between p-2 border border-rule-10 bg-black/20 rounded">
                            <span className="text-ink-2">Tranche 1 (Starter Limit):</span>
                            <span className="font-bold text-ink">
                                {tranches?.tranche_1_starter != null ? fmtMoney(tranches.tranche_1_starter) : '—'}
                            </span>
                        </div>
                        <div className="flex items-center justify-between p-2 border border-rule-10 bg-black/20 rounded">
                            <span className="text-ink-2">Tranche 2 (Core Accumulation):</span>
                            <span className="font-bold text-ink">
                                {tranches?.tranche_2_core != null ? fmtMoney(tranches.tranche_2_core) : '—'}
                            </span>
                        </div>
                        {bullIv != null && (
                            <div className="flex items-center justify-between p-2 border border-rule-10 bg-black/20 rounded">
                                <span className="text-ink-3">Exit Review Target:</span>
                                <span className="font-bold text-ink">{fmtMoney(bullIv)}</span>
                            </div>
                        )}
                    </div>
                </div>
                )}

                {/* Quadrant 4: Thesis Invalidation Triggers */}
                <div className="p-5 space-y-3">
                    <div className="flex items-center justify-between border-b border-rule-10 pb-2">
                        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-warn">
                            Thesis invalidation triggers
                        </span>
                    </div>

                    {triggers.length > 0 ? (
                        <ul className="space-y-2 text-[12px] leading-relaxed text-ink-q">
                            {triggers.map((trig, idx) => (
                                <li key={idx} className="flex items-start gap-2 p-2 border border-warn/20 bg-warn/[0.04] rounded">
                                    <span className="shrink-0 font-bold text-warn">[!]</span>
                                    <span>{trig}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="p-2.5 border border-rule-10 bg-black/20 text-[12px] text-ink-3">
                            No thesis invalidation triggers on record.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function KeyFinancials({ row }: { row: DeskRow }) {
    const { t } = useLanguage();
    const m = row.info?.metrics;
    const price = row.depth?.price ?? row.info?.price;
    const pe = m?.epsTtm != null && m.epsTtm > 0 && price ? price / m.epsTtm : null;
    const fwdPe = m?.forwardEpsEstimate != null && m.forwardEpsEstimate > 0 && price
        ? price / m.forwardEpsEstimate : null;
    const fcf = m?.ocf != null && m?.capex != null ? m.ocf + m.capex : null;
    const fcfYield = fcf != null && row.info?.marketCap && row.info.marketCap > 0
        ? (fcf / row.info.marketCap) * 100 : null;
    const netIncomeEst = m?.epsTtm != null && price && row.info?.marketCap
        ? (m.epsTtm / price) * row.info.marketCap : null;
    const cashConv = m?.ocf != null && netIncomeEst != null && netIncomeEst > 0
        ? (m.ocf / netIncomeEst) * 100 : null;
    const forensicWarnings = (row.fct.fct_flags ?? []).filter((f) => f in FORENSIC_WARNINGS);
    const dataNotes = (row.fct.fct_flags ?? []).filter((f) => f in DATA_NOTES);

    const pts = (v: number | null | undefined, digits = 1) =>
        v == null ? null : `${v.toFixed(digits)}%`;
    const mult = (v: number | null | undefined) => (v == null ? null : `${v.toFixed(2)}x`);

    const cells: [string, string | null, string?][] = [
        [t('kfPe'), pe != null ? pe.toFixed(1) : null],
        [t('kfFwdPe'), fwdPe != null ? fwdPe.toFixed(1) : null],
        [t('kfPs'), mult(m?.priceToSales)],
        [t('kfPb'), mult(m?.priceToBook)],
        [t('kfPeg'), mult(m?.pegRatio)],
        [t('kfRevGrowth'), pts(m?.revenueGrowth), m?.revenueGrowth != null && m.revenueGrowth > 0 ? 'growth' : undefined],
        [t('kfGrossMargin'), pts(m?.grossMargin)],
        [t('kfRoic'), pts(m?.roic), m?.roic != null && m.roic >= 15 ? 'growth' : undefined],
        [t('kfFcf'), fcf != null ? fmtMcap(fcf) : null, fcf != null && fcf < 0 ? 'bad' : undefined],
        ['FCF Yield', pts(fcfYield), fcfYield != null && fcfYield >= 4 ? 'growth' : undefined],
        ['Cash Conversion', pts(cashConv, 0), cashConv != null && cashConv >= 100 ? 'growth' : undefined],
        [t('kfAltman'), m?.zScore != null ? m.zScore.toFixed(2) : null,
            m?.zScore == null ? undefined : m.zScore >= 3 ? 'growth' : m.zScore < 1.81 ? 'bad' : 'warn'],
        [t('kfInsider'), pts(m?.insiderOwnership, 0)],
    ];
    const shown = cells.filter(([, v]) => v !== null);

    const toneClass = (tone?: string) =>
        tone === 'growth' ? 'text-pos' : tone === 'bad' ? 'text-neg' : tone === 'warn' ? 'text-warn' : 'text-ink';

    return (
        <div>
            <Micro className="block">Business Machinery &amp; Key Financials</Micro>

            <div className="mt-3.5 flex flex-wrap items-baseline gap-x-8 gap-y-3">
                <div>
                    <Micro className="block text-ink-3">{t('kfPrice')}</Micro>
                    <div className="mt-1 font-mono text-[22px] font-semibold leading-none text-ink">
                        {fmtMoney(price)}
                    </div>
                </div>
                <div>
                    <Micro className="block text-ink-3">{t('kfMcap')}</Micro>
                    <div className="mt-1 font-mono text-[22px] font-semibold leading-none text-ink">
                        {fmtMcap(row.info?.marketCap)}
                    </div>
                </div>
            </div>

            {shown.length === 0 ? (
                <p className="mt-3.5 text-[11.5px] text-ink-3">{t('kfNone')}</p>
            ) : (
                <div className="mt-4 grid grid-cols-2 gap-x-6">
                    {shown.map(([label, value, tone]) => (
                        <div key={label} className="flex items-baseline justify-between border-b border-rule-10 py-1.5">
                            <span className="text-[11.5px] text-ink-2">{label}</span>
                            <span className={clsx('font-mono text-[12px] font-semibold', toneClass(tone))}>{value}</span>
                        </div>
                    ))}
                </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[11.5px] text-ink-2">Forensic</span>
                {forensicWarnings.length > 0
                    ? forensicWarnings.map((f) => <Tag key={f} className="border-warn/50 text-warn">{FORENSIC_WARNINGS[f]}</Tag>)
                    : <span className="font-mono text-[12px] font-semibold text-pos">No forensic warnings</span>}
            </div>
            {dataNotes.length > 0 && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
                    Data notes: {dataNotes.map((f) => DATA_NOTES[f]).join(' · ')}
                </p>
            )}

            <Micro className="mt-2.5 block normal-case tracking-normal text-ink-3">
                Economic reality &amp; cash conversion metrics.
            </Micro>
        </div>
    );
}

function zToPercentile(z: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989422804014327 * Math.exp(-z * z / 2);
    const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    const cdf = z >= 0 ? 1 - p : p;
    return Math.round(cdf * 100);
}

const BAND_NAME: Record<string, string> = {
    research_now: 'Research now', watchlist: 'Watchlist', pass: 'Pass', vetoed: 'Vetoed',
};

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The price trend in one plain sentence; each piece is skipped when the data does not carry it. */
function priceTrend(m: NonNullable<DeskRow['fct']['fct_momentum_state']>): string | null {
    const bits: string[] = [];
    if (isNum(m.mom_6m)) bits.push(`${m.mom_6m >= 0 ? 'up' : 'down'} ${Math.abs(m.mom_6m * 100).toFixed(0)}% over 6 months`);
    if (isNum(m.pct_from_52w_high)) {
        bits.push(m.pct_from_52w_high === 0
            ? 'at its 52-week high'
            : `${Math.abs(m.pct_from_52w_high * 100).toFixed(0)}% below its 52-week high`);
    }
    if (typeof m.above_200dma === 'boolean') bits.push(`${m.above_200dma ? 'above' : 'below'} its 200-day average`);
    if (m.regime_shift_down === true) bits.push('and its uptrend has broken');
    if (!bits.length) return null;
    return `Price ${bits.join(', ')}${m.price_asof ? ` (as of ${m.price_asof})` : ''}.`;
}

const MOVED_TEXT: Record<string, string> = {
    entered_rn: 'It joined Research now in the latest run.',
    entered_book: 'It joined the list in the latest run.',
    left_rn: 'It dropped out of Research now in the latest run.',
    left_book: 'It left the list in the latest run.',
};

function QuantFilterPanel({ row }: { row: DeskRow }) {
    const { t } = useLanguage();
    const f = row.fct;
    const z = f.fct_z ?? {};
    // A depth-only row carries a placeholder band (no rank, no composite): it is not in today's screen.
    const inScreen = f.fct_rank != null || f.fct_composite != null;
    const bandName = !inScreen ? 'Not in the current screen'
        : f.fct_band ? (BAND_NAME[f.fct_band] ?? f.fct_band.replace(/_/g, ' ')) : null;
    const doors = f.fct_nominated_doors ?? [];
    const why = whyListed(doors);
    const trend = f.fct_momentum_state ? priceTrend(f.fct_momentum_state) : null;
    const sentences: string[] = [];
    if (why) sentences.push(why.label === 'Held over'
        ? `It is held over: ${why.help}.`
        : `On the list for ${why.label.toLowerCase()}: ${why.help}.`);
    if (why && why.label !== 'Held over' && doors.includes('HYSTERESIS_RETAINED')) sentences.push('Its rank has slipped, but not far enough to drop it.');
    if (doors.includes('GLOBAL_WILDCARD')) sentences.push("It won one of the places open to any sector, beyond its own sector's share.");
    if (row.moved && MOVED_TEXT[row.moved]) sentences.push(MOVED_TEXT[row.moved]);
    if (trend) sentences.push(trend);
    if (isNum(f.mid_cycle_window_years)) sentences.push(`As a cyclical business, its cash flow is averaged over the last ${f.mid_cycle_window_years} years.`);

    // The path this stock took, step by step: safety filters → door → list → AI. Stops at the
    // first step it did not pass.
    const path: string[] = [];
    if (!inScreen) {
        path.push('Not in the current screen');
    } else if (row.vetoed) {
        path.push(`Removed by the safety filters${row.vetoReason ? ` (${row.vetoReason.replace(/_/g, ' ').toLowerCase()})` : ''}`);
    } else {
        path.push('Passed the safety filters');
        const pct = f.fct_percentile;
        const top = isNum(pct) ? ` — top ${Math.max(1, Math.ceil(100 - pct))}%` : '';
        path.push(why ? `${why.label}${top}` : 'Not picked by any door');
        if (bandName) path.push(`${bandName}${f.fct_rank != null ? `, rank #${f.fct_rank}` : ''}`);
    }
    const onList = f.fct_band === 'research_now' || f.fct_band === 'watchlist';
    const d = row.depth;
    if (d) {
        path.push(`AI verdict ${d.date ?? ''}: ${isBlocked(d) ? 'blocked by the gate' : verdictTone(d.direction).label.toLowerCase()}`.replace('  ', ' '));
    } else if (inScreen && !row.vetoed) {
        path.push(onList ? 'Waiting for the AI analyst' : 'Not queued for the AI');
    }
    
    // Only show factors that have active calculations
    const activeFactors = FACTORS.filter(([key]) => z[key] != null);

    return (
        <div className="border-t border-rule-14 pt-5">
            <div className="flex items-baseline justify-between gap-4">
                <Micro>HOW IT GOT HERE</Micro>
            </div>

            <ol className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px] text-ink">
                {path.map((step, i) => (
                    <li key={i} className="flex items-baseline gap-x-2">
                        {i > 0 && <span aria-hidden className="text-ink-3">→</span>}
                        <span>{step}</span>
                    </li>
                ))}
            </ol>

            {sentences.length > 0 && (
                <p className="mt-3 text-[12.5px] leading-relaxed text-ink-2">{sentences.join(' ')}</p>
            )}

            <div className="mt-3.5 space-y-2.5">
                {activeFactors.length > 0 ? (
                    activeFactors.map(([key, label, color]) => {
                        const raw = z[key] as number;
                        const pct = Math.max(0, Math.min(100, (raw + 3) / 6 * 100));
                        const cdfPct = zToPercentile(raw);
                        const topPct = Math.max(1, 100 - cdfPct);
                        const displayBadge = raw >= 0 ? `Top ${topPct}% (+${raw.toFixed(2)}σ)` : `Bottom ${cdfPct}% (${raw.toFixed(2)}σ)`;

                        return (
                            <div key={key} className="space-y-1">
                                <div className="flex items-center justify-between text-[11px]">
                                    <span className="font-medium text-ink-2">{label}</span>
                                    <span className="font-mono text-[10.5px] text-ink font-semibold">
                                        {displayBadge}
                                    </span>
                                </div>
                                <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{ width: `${pct}%`, backgroundColor: color }}
                                    />
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="text-[11.5px] text-ink-3">
                        Statistical factor scores pending pre-screen cache generation.
                    </div>
                )}
            </div>

            <div className="mt-3.5 border-t border-rule-10 pt-2.5">
                <p className="text-[11px] leading-relaxed text-ink-3">
                    The dual-door screen scores about 3,000 stocks that pass basic hygiene. A stock reaches the list as a quality business, a value opportunity, or a steady trend.
                </p>
            </div>
        </div>
    );
}

function EvidenceChips({ row, entryDate }: { row: DeskRow; entryDate: string | null }) {
    const gpr = row.overlay?.gpr;
    const forensicWarnings = (row.fct.fct_flags ?? []).filter((f) => f in FORENSIC_WARNINGS);
    const demand = row.overlay?.informed_demand;
    const chips: React.ReactNode[] = [];

    if (row.depth?.gate_version != null) {
        chips.push(<Tag key="engine" className="border-rule-24 text-ink-2">GATE v{row.depth.gate_version}</Tag>);
    }

    if (gpr?.gpr_level !== undefined) {
        const label = gpr.gpr_level === 0 ? 'GPR 0 — NONE' : `GPR ${gpr.gpr_level} — ${(gpr.channels ?? []).join(', ') || 'FLAGGED'}`;
        chips.push(<Tag key="gpr">{label}</Tag>);
    }
    if (forensicWarnings.length > 0) {
        for (const f of forensicWarnings) {
            chips.push(<Tag key={`forensic-${f}`} className="border-warn/50 text-warn">{FORENSIC_WARNINGS[f]}</Tag>);
        }
    } else {
        chips.push(<Tag key="forensic">No forensic warnings</Tag>);
    }
    if (demand === 1) chips.push(<Tag key="dem" className="border-pos/40 text-pos">▲ INSIDERS NET-BUYING</Tag>);
    if (demand === -1) chips.push(<Tag key="dem" className="border-neg/40 text-neg">▼ INSIDERS SELLING</Tag>);
    if (row.depth?.date) chips.push(<Tag key="run">UNDERWRITTEN {row.depth.date}</Tag>);
    if (entryDate) chips.push(<Tag key="entry">PORTFOLIO ENTRY {entryDate}</Tag>);

    return <div className="mt-4 flex flex-wrap gap-2">{chips}</div>;
}

export function StockDetail({ ticker, from }: { ticker: string; from?: string }) {
    const { t } = useLanguage();
    const router = useRouter();
    const data = useDeskData();
    const [bundle, setBundle] = useState<DepthReportBundle | null>(null);

    useEffect(() => {
        let alive = true;
        fetchDepthReport(ticker).then((b) => { if (alive) setBundle(b); });
        return () => { alive = false; };
    }, [ticker]);

    const rows = useMemo(
        () => buildRows({
            factor: data.factor, depth: data.depth, valuations: data.valuations,
            overlay: data.overlay, stockInfo: data.stockInfo,
        }),
        [data.factor, data.depth, data.valuations, data.overlay, data.stockInfo],
    );
    const row = useMemo(() => {
        const found = rows.find((r) => r.ticker === ticker);
        if (found) return found;
        if (data.depth && data.depth[ticker]) {
            const d = data.depth[ticker];
            const sc = d.scorecard;
            return {
                ticker,
                info: data.stockInfo[ticker],
                fct: {
                    fct_composite: null,
                    fct_percentile: null,
                    fct_band: 'watchlist',
                    fct_rank: null,
                    fct_veto: null,
                    fct_z: null,
                    fct_contributions: null,
                    fct_haircuts: null,
                },
                depth: d,
                val: data.valuations[ticker],
                overlay: data.overlay[ticker],
                delta: null,
                promo: 'promoted',
                vetoed: false,
                vetoReason: null,
                moved: null,
                conviction: d.conviction_score ?? sc?.median_conviction_score ?? null,
                moat: d.business_quality_moat ?? sc?.median_quality_moat ?? null,
                kelly: d.kelly_fraction_pct ?? sc?.median_kelly_fraction_pct ?? null,
                skew: d.asymmetric_payoff_skew ?? sc?.asymmetric_payoff_skew ?? null,
                bearIv: d.bear_iv ?? sc?.median_bear_iv ?? null,
                bullIv: d.bull_iv ?? sc?.median_bull_iv ?? null,
            } as DeskRow;
        }
        return undefined;
    }, [rows, data.depth, data.stockInfo, data.valuations, data.overlay, ticker]);

    const [selectedSample, setSelectedSample] = useState(0);

    const headline = useMemo(() => headlineFromSamples(bundle?.samples), [bundle]);
    const runIvs = useMemo(
        () => (bundle?.samples ?? []).filter((s) => s.plausible && s.iv != null).map((s) => s.iv as number),
        [bundle],
    );

    const entryDate = useMemo(() => {
        const books = data.ledgers?.ledgers ?? {};
        for (const key of ['rn_depth', 'equal_llm', 'equal']) {
            const h = books[key]?.state?.holdings?.[ticker];
            if (h?.entry_date) return h.entry_date as string;
        }
        return null;
    }, [data.ledgers, ticker]);

    const backHref = from === 'track' ? '/?tab=track'
        : from === 'port' ? '/?tab=portfolio'
            : `/?tab=rankings&lens=${from === 'quant' ? from : 'ai'}`;
    const backLabel = from === 'track' ? '← Track Record' : from === 'port' ? '← Portfolio' : `← ${t('detailBack')}`;

    const shell = (children: React.ReactNode) => (
        <Shell tab={null} factor={data.factor} depthMeta={data.depthMeta} loading={data.loading}>
            {children}
        </Shell>
    );

    if (!row) {
        return shell(
            <div className="py-16">
                <Link href={backHref} className="font-mono text-[12px] text-ink-2 hover:text-ink">{backLabel}</Link>
                <p className="mt-6 text-[14px] text-ink-2">
                    {data.loading ? 'Loading…' : `${ticker} is not in the current scored universe.`}
                </p>
            </div>,
        );
    }

    const d = row.depth;
    const tone = verdictTone(d?.direction);
    const blocked = isBlocked(d);

    return shell(
        <div>
            {/* Top Navigation Bar with Highlighted Industry */}
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-rule-14 py-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <button onClick={() => router.push(backHref)} className="text-[12px] text-ink-2 hover:text-ink">
                        {backLabel}
                    </button>
                    <span className="text-[24px] font-extrabold text-ink tracking-tight">{row.ticker}</span>
                    <span className="text-[14px] font-semibold text-ink-2">{row.info?.name ?? ''}</span>

                    {/* Prominent Industry Highlight */}
                    {row.info?.industry && row.info.industry !== 'Unknown' && (
                        <span className="inline-flex items-center gap-1.5 rounded-xs border border-rule-24 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-ink-2 tracking-wide uppercase">
                            <span className="text-ink-3 text-[9.5px]">INDUSTRY:</span>
                            {row.info.industry}
                        </span>
                    )}

                    {/* Sector Badge */}
                    {row.info?.sector && (
                        <span className="inline-flex items-center gap-1 rounded-xs border border-rule-24 bg-white/[0.02] px-2 py-0.5 font-mono text-[10.5px] text-ink-3 uppercase">
                            {row.info.sector}
                        </span>
                    )}
                </div>
                <a
                    href={`https://www.tradingview.com/symbols/${row.ticker}/`}
                    target="_blank" rel="noopener noreferrer"
                    className="border border-rule-24 px-4 py-1.5 font-mono font-semibold text-[11px] uppercase tracking-[.05em] text-ink-2 hover:border-ink hover:text-ink"
                >
                    TradingView ↗
                </a>
            </div>

            {blocked && (
                <div className="mt-4 w-full border border-warn px-4 py-3 text-[13px] font-semibold text-warn">
                    BLOCKED BY THE GATE — {gateReasonsText(d?.actionable_reasons)}. This verdict is kept as a record. It is not a recommendation.
                </div>
            )}

            {/* Two-Column Grid */}
            <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-[1.45fr_1fr]">
                <div className="min-w-0 border-rule-14 py-6 lg:border-r lg:pr-8">
                    {/* Institutional Header Tag */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Micro className="block font-bold uppercase tracking-wider text-ink">
                            AI UNDERWRITING RECORD
                        </Micro>
                        {d && d.spread_pct != null && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 font-mono text-[10px] tracking-wide uppercase border border-rule-24 bg-white/[0.03] text-ink-2">
                                RUN SPREAD {d.spread_pct.toFixed(1)}%
                            </span>
                        )}
                    </div>

                    {/* Stance Hero Headline */}
                    <h1 className="mt-3 flex flex-wrap items-baseline gap-x-3">
                        <span className="text-[26px] font-extrabold tracking-[.02em]" style={{ color: blocked ? TONE_COLORS.MUTED : tone.color }}>
                            {tone.keys.label ? t(tone.keys.label) : tone.label}
                        </span>
                        {d?.mos_vs_median_pct != null && (
                            <span className="font-mono text-[14px] font-bold text-ink">
                                ({fmtSignedPct(d.mos_vs_median_pct)} Margin of Safety)
                            </span>
                        )}
                    </h1>

                    {/* Valuation Triad Hero (Bear / Market / Base / Bull) */}
                    {d ? (
                        <ValuationTriadHero verdict={d} bundle={bundle} runIvs={runIvs} />
                    ) : (
                        <p className="mt-5 text-[12.5px] text-ink-2">
                            This candidate is queued in the baseline backlog. The factor pre-screen ranked it
                            #{row.fct.fct_rank ?? '—'}; waiting for RS2 Local multi-seed underwriting pass.
                        </p>
                    )}

                    {/* Multi-Run Deliberation Audit Matrix (All Runs Recorded & Side-by-Side Compared) */}
                    {d && (
                        <MultiRunAuditMatrix
                            d={d}
                            bundle={bundle}
                            onSelectSample={(idx) => {
                                setSelectedSample(idx);
                                document.getElementById('transcripts-section')?.scrollIntoView({ behavior: 'smooth' });
                            }}
                        />
                    )}

                    {/* Depth Statistics Row */}
                    {d && <DepthStatRow row={row} />}

                    {/* 4-Quadrant Institutional Underwriting Contract */}
                    {d && <InstitutionalContractCard d={d} bundle={bundle} />}

                    {/* Thesis Memorandum Headline */}
                    {headline && (
                        <blockquote className="mt-5 border-l-2 border-rule-24 bg-white/[0.03] px-5 py-4">
                            <Micro className="mb-2 block text-ink-3">
                                Analyst Deliberation Thesis{headline.sample ? ` · Sample ${headline.sample}` : ''}
                            </Micro>
                            <ul className="space-y-1.5 text-[13.5px] leading-relaxed text-ink-q">
                                {headline.bullets.map((b, i) => <li key={i}>{b}</li>)}
                            </ul>
                            {!blocked && headline.action && (
                                <p className="mt-2.5 text-[12.5px] font-semibold text-ink">Action Recommendation: {headline.action}</p>
                            )}
                        </blockquote>
                    )}

                    <EvidenceChips row={row} entryDate={entryDate} />

                    {row.vetoed && (
                        <p className="mt-4 text-[12px] text-off">
                            ✕ VETOED — {row.vetoReason ?? 'hard avoid'}. Disqualified prior to depth underwriting.
                        </p>
                    )}
                </div>

                {/* Right Column: Financial Integrity & Quant Shortlist */}
                <div className="flex min-w-0 flex-col gap-6 border-t border-rule-14 py-6 lg:border-t-0 lg:pl-0">
                    <KeyFinancials row={row} />
                    <QuantFilterPanel row={row} />
                </div>
            </div>

            {/* Verbatim Multi-Seed Transcripts & Deliberation Reader */}
            <TranscriptViewer
                bundle={bundle}
                activeTab={selectedSample}
                onTabChange={setSelectedSample}
            />

            {/* Earlier Run History */}
            <section className="mt-8 min-w-0 border-t border-rule-22 pt-5">
                <Micro className="block font-semibold text-ink">Old pipeline records (retired August 2026)</Micro>
                <p className="mb-3 mt-1 text-[11px] text-ink-3">Produced by an earlier analyst that is no longer used. Kept as a record.</p>
                <Rs2AnalysisPanel symbol={row.ticker} displayTicker={row.ticker} hideDepth />
            </section>
        </div>,
    );
}

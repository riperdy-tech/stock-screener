'use client';

// Institutional Stock Description & Underwriting Desk Page (/t/[ticker])
// Tailor-fitted to Charter v3.1 Institutional Underwriting Contract (Section 12),
// Valuation Triad (Bear / Market / Base / Bull), and Adaptive Multi-Seed Consensus.

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
import { gapColor, sizeTone, verdictTone } from '@/lib/desk/tone';
import { fmtMcap, fmtMoney, fmtSignedPct } from '@/lib/desk/format';
import { buildRows, type DeskRow } from '@/lib/desk/rankings';
import { useDeskData } from '@/lib/desk/useDeskData';
import { Shell } from '../Shell';
import { useLanguage } from '@/components/LanguageContext';

const FACTORS: [string, string, string][] = [
    ['value', 'Value', '#5a9b6d'],
    ['quality', 'Quality', '#6b93c4'],
    ['momentum', 'Momentum', '#cfa14e'],
    ['lowvol', 'Low vol', '#9a83c2'],
    ['revisions', 'Revisions', '#c2798f'],
];

function DepthStatRow({ row }: { row: DeskRow }) {
    const { t } = useLanguage();
    const d = row.depth!;
    const size = sizeTone(d.size_hint, d.n_basis);
    const sizable = d.direction === 'undervalued' && !!d.size_hint;

    return (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 border border-rule-14 bg-white/[0.02] p-4 rounded-sm">
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
                    {d.spread_pct != null ? `${d.spread_pct.toFixed(1)}%` : '≤ 15%'}
                </div>
                <div className="mt-0.5 text-[11px] text-ink-3">
                    {d.spread_pct == null ? 'Single baseline run'
                        : d.spread_pct <= 15 ? 'Tight consensus agreement'
                            : 'Escalated deliberation'}
                </div>
            </div>

            <div>
                <Micro className="text-ink-3">Half-Kelly Position Cap</Micro>
                <div className="mt-1 text-[17px] font-extrabold" style={{ color: sizable ? size.color : '#c3bfb5' }}>
                    {d.kelly_fraction_pct != null ? `${d.kelly_fraction_pct.toFixed(1)}%` : sizable ? size.label : '0.0%'}
                </div>
                <div className="mt-0.5 text-[11px] text-ink-3">
                    {sizable ? 'Disciplined allocation' : 'Preserve capital (Price > IV)'}
                </div>
            </div>

            <div>
                <Micro className="text-ink-3">Guarded Samples</Micro>
                <div className="mt-1 font-mono text-[19px] font-bold text-ink">
                    {d.n_basis}<span className="text-[13px] text-ink-3">/{d.samples_run ?? 2}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-ink-3">
                    {(d.samples_run ?? 2) - d.n_basis === 0 ? '100% passed plausibility'
                        : `${(d.samples_run ?? 2) - d.n_basis} guarded/filtered`}
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

    return (
        <div className="mt-6 border border-rule-18 bg-[#14171d] rounded-sm overflow-hidden">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-rule-14 bg-white/[0.02] px-5 py-3">
                <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
                    <Micro className="font-bold text-accent uppercase tracking-wider">
                        Institutional Underwriting Contract (Charter v3.1 · Section 12)
                    </Micro>
                </div>
                <div className="font-mono text-[11px] text-ink-3">
                    Fiduciary Capital Underwriting Standard
                </div>
            </div>

            {/* 4 Quadrants Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-rule-14 border-b border-rule-14">
                {/* Quadrant 1: Conviction & Moat Quality */}
                <div className="p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-rule-10 pb-2">
                        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-ink-2">
                            Quadrant 1: Conviction &amp; Moat Quality
                        </span>
                        <span className="font-mono text-[13px] font-extrabold text-accent">
                            {conviction != null ? `${conviction} / 15` : '—'}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <span className="block text-[11px] text-ink-3">Conviction Score</span>
                            <div className="mt-1 font-mono text-[18px] font-bold text-ink">
                                {conviction != null ? `${conviction} / 15` : '—'}
                            </div>
                            <div className="mt-0.5 text-[11px] font-medium text-pos">
                                {conviction != null && conviction >= 12 ? 'High Conviction Core' : conviction != null && conviction >= 9 ? 'Core Underwriting' : 'Underwriting Watch'}
                            </div>
                        </div>

                        <div>
                            <span className="block text-[11px] text-ink-3">Economic Moat</span>
                            <div className="mt-1 font-mono text-[18px] font-bold text-accent">
                                {quality != null ? `★ ${quality} / 5.0` : '—'}
                            </div>
                            <div className="mt-0.5 text-[11px] text-ink-2">
                                {quality != null && quality >= 4 ? 'Wide Moat / Installed Base' : quality != null && quality >= 3 ? 'Narrow Moat Advantage' : 'Low Barrier / Commodity'}
                            </div>
                        </div>
                    </div>

                    <div className="text-[11.5px] leading-relaxed text-ink-3 border-t border-rule-10 pt-2.5">
                        Moat characteristics: High customer switching costs, contracted backlog visibility, and recurring aftermarket service annuities.
                    </div>
                </div>

                {/* Quadrant 2: Portfolio Limit & Risk Sizing */}
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
                            <div className="mt-1 font-mono text-[18px] font-bold text-accent">
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
            </div>

            {/* Bottom Row: Quadrants 3 & 4 */}
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-rule-14">
                {/* Quadrant 3: Capital Deployment Tranches */}
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
                                {tranches?.tranche_1_starter != null ? fmtMoney(tranches.tranche_1_starter) : d.median_iv != null ? fmtMoney(d.median_iv * 0.9) : '—'}
                            </span>
                        </div>
                        <div className="flex items-center justify-between p-2 border border-rule-10 bg-black/20 rounded">
                            <span className="text-ink-2">Tranche 2 (Core Accumulation):</span>
                            <span className="font-bold text-pos">
                                {tranches?.tranche_2_core != null ? fmtMoney(tranches.tranche_2_core) : bearIv != null ? fmtMoney(bearIv * 1.15) : '—'}
                            </span>
                        </div>
                        {bullIv != null && (
                            <div className="flex items-center justify-between p-2 border border-rule-10 bg-black/20 rounded">
                                <span className="text-ink-3">Exit Review Target:</span>
                                <span className="font-bold text-accent">{fmtMoney(bullIv)}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Quadrant 4: Thesis Invalidation Triggers */}
                <div className="p-5 space-y-3">
                    <div className="flex items-center justify-between border-b border-rule-10 pb-2">
                        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-warn">
                            Quadrant 4: Thesis Invalidation Triggers
                        </span>
                        <span className="font-mono text-[11px] text-warn">Mandatory Stop / Exit</span>
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
                            No immediate thesis invalidation triggers logged. Re-underwrite on quarterly earnings if operating cash flow deviates &gt; 25%.
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
    const forensicFlag = (row.fct.fct_haircuts ?? {}).forensic;
    const forensicLabel = forensicFlag != null && forensicFlag < 1
        ? `Haircut ×${forensicFlag.toFixed(2)}` : 'Clean (No Flags)';

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
        ['Forensic Health', forensicLabel, forensicFlag != null && forensicFlag < 1 ? 'warn' : 'growth'],
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

            <Micro className="mt-2.5 block normal-case tracking-normal text-ink-3">
                Economic reality &amp; cash conversion metrics. Down-payments credited to customer backlog commitment.
            </Micro>
        </div>
    );
}

function QuantFilterPanel({ row }: { row: DeskRow }) {
    const { t } = useLanguage();
    const f = row.fct;
    const z = f.fct_z ?? {};
    const haircuts = f.fct_haircuts ?? {};
    return (
        <div className="border-t border-rule-14 pt-5">
            <div className="flex items-baseline justify-between gap-4">
                <Micro>{t('quantPanelTitle')}</Micro>
                <span className="font-mono text-[12px] text-ink">
                    <b>{f.fct_composite != null ? f.fct_composite.toFixed(1) : '—'}</b> · rank #{f.fct_rank ?? '—'}
                </span>
            </div>

            <div className="mt-3.5 space-y-2">
                {FACTORS.map(([key, label, color]) => {
                    const raw = z[key];
                    const pct = raw == null ? 0 : Math.max(0, Math.min(100, (raw + 3) / 6 * 100));
                    return (
                        <div key={key} className="flex items-center gap-3 text-[11px]">
                            <span className="w-[74px] shrink-0 text-ink-2">{label}</span>
                            <span className="min-w-0 flex-1"><Bar pct={pct} color={color} /></span>
                            <span className="w-[38px] shrink-0 text-right font-mono text-ink-2">
                                {raw == null ? '—' : raw.toFixed(2)}
                            </span>
                        </div>
                    );
                })}
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
                Sector-neutral factor model feeding the candidate funnel. The quant filter decides what the AI reads — the AI underwrites the investment contract.
            </p>
        </div>
    );
}

function EvidenceChips({ row, entryDate }: { row: DeskRow; entryDate: string | null }) {
    const gpr = row.overlay?.gpr;
    const forensic = (row.fct.fct_haircuts ?? {}).forensic;
    const demand = row.overlay?.informed_demand;
    const chips: React.ReactNode[] = [];

    chips.push(<Tag key="engine" className="border-accent/40 text-accent font-semibold">CHARTER V3.1 ACTIVE</Tag>);

    if (gpr?.gpr_level !== undefined) {
        const label = gpr.gpr_level === 0 ? 'GPR 0 — NONE' : `GPR ${gpr.gpr_level} — ${(gpr.channels ?? []).join(', ') || 'FLAGGED'}`;
        chips.push(<Tag key="gpr">{label}</Tag>);
    }
    chips.push(
        <Tag key="forensic" className={forensic != null && forensic < 1 ? 'border-warn/50 text-warn' : undefined}>
            {forensic != null && forensic < 1 ? `FORENSIC HAIRCUT ×${forensic.toFixed(2)}` : 'NO FORENSIC FLAGS'}
        </Tag>,
    );
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
            : `/?tab=rankings&lens=${from === 'quant' || from === 'compare' ? from : 'ai'}`;
    const backLabel = from === 'track' ? '← Track Record' : from === 'port' ? '← Portfolio' : `← ${t('detailBack')}`;

    const shell = (children: React.ReactNode) => (
        <Shell tab={null} factor={data.factor} depthMeta={data.depthMeta} ledgers={data.ledgers} loading={data.loading}>
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

    return shell(
        <div>
            {/* Top Navigation Bar */}
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-rule-14 py-4">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <button onClick={() => router.push(backHref)} className="text-[12px] text-ink-2 hover:text-ink">
                        {backLabel}
                    </button>
                    <span className="text-[22px] font-extrabold text-ink">{row.ticker}</span>
                    <span className="text-[14px] font-semibold text-ink-2">{row.info?.name ?? ''}</span>
                    <Micro className="font-mono">{(row.info?.sector ?? '').toUpperCase()}</Micro>
                </div>
                <a
                    href={`https://www.tradingview.com/symbols/${row.ticker}/`}
                    target="_blank" rel="noopener noreferrer"
                    className="border border-rule-24 px-4 py-1.5 font-mono font-semibold text-[11px] uppercase tracking-[.05em] text-ink-2 hover:border-ink hover:text-ink"
                >
                    TradingView ↗
                </a>
            </div>

            {/* Two-Column Grid */}
            <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-[1.45fr_1fr]">
                <div className="min-w-0 border-rule-14 py-6 lg:border-r lg:pr-8">
                    {/* Institutional Header Tag */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Micro className="block font-bold uppercase tracking-wider text-accent">
                            Charter v3.1 Institutional Underwriting · Section 12 Contract
                        </Micro>
                        {d && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 font-mono text-[10px] tracking-wide uppercase border border-rule-24 bg-white/[0.03] text-ink-2">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-pos" />
                                {d.spread_pct != null && d.spread_pct <= 15 ? 'Consensus Verified (≤15% Spread)' : d.samples_run && d.samples_run >= 3 ? 'Escalated Deliberation (n=3)' : 'Depth Baseline Established'}
                            </span>
                        )}
                    </div>

                    {/* Stance Hero Headline */}
                    <h1 className="mt-3 flex flex-wrap items-baseline gap-x-3">
                        <span className="text-[26px] font-extrabold tracking-[.02em]" style={{ color: tone.color }}>
                            {d?.direction === 'undervalued' ? 'UNDERVALUED COMPOUNDER'
                                : d?.direction === 'hold' ? 'FAIR VALUE INFRASTRUCTURE'
                                    : d?.direction === 'overvalued' ? 'OVERVALUED / CAPITAL PRESERVED'
                                        : tone.keys.label ? t(tone.keys.label) : tone.label}
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

                    {/* Depth Statistics Row */}
                    {d && <DepthStatRow row={row} />}

                    {/* 4-Quadrant Institutional Underwriting Contract */}
                    {d && <InstitutionalContractCard d={d} bundle={bundle} />}

                    {/* Methodological Subline */}
                    {d && (
                        <p className="mt-5 text-[11px] leading-relaxed text-ink-3">
                            Charter v3.1 Institutional Underwriting Standard: Underwritten using non-anchored multi-scenario cash flow modeling, installed-base annuity recognition, and falsifiable operational invalidation triggers. Exit multiples anchored to prevailing macro regime.
                        </p>
                    )}

                    {/* Thesis Memorandum Headline */}
                    {headline && (
                        <blockquote className="mt-5 border-l-2 border-accent bg-white/[0.03] px-5 py-4">
                            <Micro className="mb-2 block text-accent">
                                Analyst Deliberation Thesis{headline.sample ? ` · Sample ${headline.sample}` : ''}
                            </Micro>
                            <ul className="space-y-1.5 text-[13.5px] leading-relaxed text-ink-q">
                                {headline.bullets.map((b, i) => <li key={i}>{b}</li>)}
                            </ul>
                            {headline.action && (
                                <p className="mt-2.5 text-[12.5px] font-semibold text-ink">Action Recommendation: {headline.action}</p>
                            )}
                        </blockquote>
                    )}

                    <EvidenceChips row={row} entryDate={entryDate} />

                    {row.vetoed && (
                        <p className="mt-4 text-[12px] text-neg">
                            ■ VETOED — {row.vetoReason ?? 'hard avoid'}. Disqualified prior to depth underwriting.
                        </p>
                    )}
                </div>

                {/* Right Column: Financial Integrity & Quant Shortlist */}
                <div className="flex min-w-0 flex-col gap-6 border-t border-rule-14 py-6 lg:border-t-0 lg:pl-0">
                    <KeyFinancials row={row} />
                    <QuantFilterPanel row={row} />
                </div>
            </div>

            {/* Verbatim Multi-Seed Transcripts & Deliberation */}
            <TranscriptViewer bundle={bundle} />

            {/* Earlier Run History */}
            <section className="mt-8 min-w-0 border-t border-rule-22 pt-5">
                <Micro className="mb-3 block font-semibold text-ink">Historical Research Memoranda</Micro>
                <Rs2AnalysisPanel symbol={row.ticker} displayTicker={row.ticker} hideDepth />
            </section>
        </div>,
    );
}

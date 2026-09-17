'use client';

import React from 'react';
import { fmtMoney, fmtSignedPct } from '@/lib/desk/format';
import { verdictTone } from '@/lib/desk/tone';
import { Micro } from '../primitives';
import { BandChartHero } from './BandChartHero';
import type { DepthVerdict, DepthReportBundle } from '@/lib/data-service';

interface ValuationTriadHeroProps {
    verdict: DepthVerdict;
    bundle: DepthReportBundle | null;
    runIvs: number[];
}

export function ValuationTriadHero({ verdict, bundle, runIvs }: ValuationTriadHeroProps) {
    const sc = verdict.scorecard ?? bundle?.scorecard;
    const price = verdict.price;
    const baseIv = verdict.median_iv;
    const bearIv = verdict.bear_iv ?? sc?.median_bear_iv ?? bundle?.samples?.find(s => s.scorecard?.bear_iv != null)?.scorecard?.bear_iv;
    const bullIv = verdict.bull_iv ?? sc?.median_bull_iv ?? bundle?.samples?.find(s => s.scorecard?.bull_iv != null)?.scorecard?.bull_iv;
    const skew = verdict.asymmetric_payoff_skew ?? sc?.asymmetric_payoff_skew;

    // If we do not have multi-scenario triad data, fallback seamlessly to BandChartHero
    if (price == null || baseIv == null || bearIv == null || bullIv == null) {
        return <BandChartHero verdict={verdict} runIvs={runIvs} />;
    }

    const tone = verdictTone(verdict.direction);

    // Dynamic scale bounds with a 10% outer breathing room
    const rawMin = Math.min(bearIv, price, baseIv, bullIv);
    const rawMax = Math.max(bearIv, price, baseIv, bullIv);
    const rangeSpan = Math.max(1, rawMax - rawMin);
    const axisMin = Math.max(0, rawMin - rangeSpan * 0.12);
    const axisMax = rawMax + rangeSpan * 0.12;
    const totalSpan = axisMax - axisMin;

    const toPct = (val: number) => {
        const p = ((val - axisMin) / totalSpan) * 100;
        return Math.min(96, Math.max(4, p));
    };

    const bearPct = toPct(bearIv);
    const pricePct = toPct(price);
    const basePct = toPct(baseIv);
    const bullPct = toPct(bullIv);

    const downsidePct = ((bearIv - price) / price) * 100;
    const mosPct = ((baseIv - price) / price) * 100;
    const bullUpsidePct = ((bullIv - price) / price) * 100;

    // Safety and Expansion zones on the bar
    const leftMarginPct = Math.min(pricePct, basePct);
    const marginWidthPct = Math.abs(basePct - pricePct);
    const expansionLeftPct = Math.min(basePct, bullPct);
    const expansionWidthPct = Math.abs(bullPct - basePct);

    return (
        <div className="mt-5 border border-rule-18 bg-[#14171d]/90 p-5 rounded-sm">
            {/* Header / Subtitle */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule-14 pb-3">
                <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-accent" />
                    <Micro className="font-bold tracking-wider text-ink uppercase">
                        Valuation Triad & Scenario Distribution
                    </Micro>
                </div>
                <div className="font-mono text-[11px] text-ink-3">
                    Axis: {fmtMoney(axisMin, 0)} — {fmtMoney(axisMax, 0)}
                </div>
            </div>

            {/* Visual Graduated Triad Bar */}
            <div className="relative mt-8 h-[60px] bg-[#0d0f12] border border-rule-18 rounded overflow-hidden">
                {/* Margin of Safety Corridor (Between Price & Base IV) */}
                <div
                    className="absolute top-0 bottom-0 pointer-events-none transition-all duration-300"
                    style={{
                        left: `${leftMarginPct}%`,
                        width: `${marginWidthPct}%`,
                        backgroundColor: price <= baseIv ? 'rgba(74, 222, 128, 0.12)' : 'rgba(248, 113, 113, 0.12)',
                        borderLeft: `1px dashed ${price <= baseIv ? '#4ade80' : '#f87171'}`,
                        borderRight: `1px dashed ${price <= baseIv ? '#4ade80' : '#f87171'}`,
                    }}
                />

                {/* Operating Leverage / Expansion Corridor (Between Base IV & Bull IV) */}
                <div
                    className="absolute top-0 bottom-0 pointer-events-none transition-all duration-300"
                    style={{
                        left: `${expansionLeftPct}%`,
                        width: `${expansionWidthPct}%`,
                        backgroundColor: 'rgba(207, 161, 78, 0.08)',
                        borderRight: '1px dotted rgba(207, 161, 78, 0.4)',
                    }}
                />

                {/* Bear Marker */}
                <div
                    className="absolute top-0 bottom-0 w-[2px] bg-neg flex flex-col items-center justify-start z-10"
                    style={{ left: `${bearPct}%` }}
                    title={`Bear Case Intrinsic Value: ${fmtMoney(bearIv)}`}
                >
                    <span className="w-2.5 h-2.5 rounded-full bg-neg border border-[#0d0f12] -mt-1 shadow-sm" />
                </div>

                {/* Bull Marker */}
                <div
                    className="absolute top-0 bottom-0 w-[2px] bg-accent flex flex-col items-center justify-start z-10"
                    style={{ left: `${bullPct}%` }}
                    title={`Bull Case Intrinsic Value: ${fmtMoney(bullIv)}`}
                >
                    <span className="w-2.5 h-2.5 rounded-full bg-accent border border-[#0d0f12] -mt-1 shadow-sm" />
                </div>

                {/* Base Case IV Marker */}
                <div
                    className="absolute top-0 bottom-0 w-[3px] bg-pos flex flex-col items-center justify-start z-20"
                    style={{ left: `${basePct}%` }}
                    title={`Base Intrinsic Value: ${fmtMoney(baseIv)}`}
                >
                    <span className="w-3 h-3 bg-pos border border-[#0d0f12] -mt-1 shadow-md rotate-45" />
                </div>

                {/* Current Market Price Marker */}
                <div
                    className="absolute top-0 bottom-0 w-[3px] bg-[#f2f0eb] flex flex-col items-center justify-end z-20"
                    style={{ left: `${pricePct}%` }}
                    title={`Market Price: ${fmtMoney(price)}`}
                >
                    <span className="w-3 h-3 bg-white border border-[#0d0f12] -mb-1 shadow-[0_0_8px_rgba(255,255,255,0.7)]" />
                </div>
            </div>

            {/* Labels below the track */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-[11px] pt-1">
                {/* Bear Case */}
                <div className="p-2 border border-rule-10 bg-black/20 rounded">
                    <span className="block text-ink-3 text-[10px] uppercase tracking-wider">Bear Case IV</span>
                    <span className="text-[14px] font-bold text-neg">{fmtMoney(bearIv)}</span>
                    <span className="block text-[10px] text-neg/80 mt-0.5">
                        {fmtSignedPct(downsidePct)} vs price
                    </span>
                </div>

                {/* Market Price */}
                <div className="p-2 border border-rule-18 bg-white/[0.04] rounded">
                    <span className="block text-ink-3 text-[10px] uppercase tracking-wider">Market Price</span>
                    <span className="text-[14px] font-bold text-white">{fmtMoney(price)}</span>
                    <span className="block text-[10px] text-ink-2 mt-0.5">Today&apos;s Quote</span>
                </div>

                {/* Base Case IV */}
                <div className="p-2 border border-rule-14 bg-pos/[0.04] rounded">
                    <span className="block text-ink-3 text-[10px] uppercase tracking-wider">Base Case IV</span>
                    <span className="text-[14px] font-bold text-pos">{fmtMoney(baseIv)}</span>
                    <span className="block text-[10px] text-pos/90 mt-0.5">
                        {fmtSignedPct(mosPct)} Margin of Safety
                    </span>
                </div>

                {/* Bull Case */}
                <div className="p-2 border border-rule-10 bg-accent/[0.04] rounded">
                    <span className="block text-ink-3 text-[10px] uppercase tracking-wider">Bull Case IV</span>
                    <span className="text-[14px] font-bold text-accent">{fmtMoney(bullIv)}</span>
                    <span className="block text-[10px] text-accent/90 mt-0.5">
                        {fmtSignedPct(bullUpsidePct)} Expansion
                    </span>
                </div>
            </div>

            {/* Summary Skew Bar */}
            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-rule-10 pt-3 text-[11px]">
                <div className="flex items-center gap-2">
                    <span className="text-ink-3">Asymmetric Payoff Skew:</span>
                    <span className="font-mono font-bold text-accent text-[12px]">
                        {skew != null ? `${skew.toFixed(2)}x` : '—'}
                    </span>
                    <span className="text-ink-3 text-[10px]">
                        ({skew != null && skew >= 2.0 ? 'Highly Asymmetric Reward/Risk' : skew != null && skew >= 1.0 ? 'Favorable Skew' : 'Symmetric / Unfavorable'})
                    </span>
                </div>
                <div className="text-ink-3 text-[10.5px]">
                    Contracted visibility floor: Bear Case bounded &gt; {fmtMoney(bearIv)}
                </div>
            </div>
        </div>
    );
}

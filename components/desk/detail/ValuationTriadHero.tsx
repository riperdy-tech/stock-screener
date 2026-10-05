'use client';

import React from 'react';
import { fmtMoney, fmtSignedPct } from '@/lib/desk/format';
import { TONE_COLORS, isBlocked, verdictTone } from '@/lib/desk/tone';
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
    // A blocked verdict is kept for the record, not recommended: no green on its value or margin.
    const blocked = isBlocked(verdict);
    const MUTED = TONE_COLORS.MUTED;

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
        <div className="mt-5 border border-rule-18 bg-page p-5 rounded-sm">
            {/* Header / Subtitle */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule-14 pb-3">
                <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-ink-3" />
                    <Micro className="font-bold tracking-wider text-ink uppercase">
                        Valuation Triad & Scenario Distribution
                    </Micro>
                </div>
                <div className="font-mono text-[11px] text-ink-3">
                    Axis: {fmtMoney(axisMin, 0)} — {fmtMoney(axisMax, 0)}
                </div>
            </div>

            {/* Visual Graduated Triad Bar */}
            <div className="relative mt-8 h-[60px] bg-page border border-rule-18 rounded overflow-hidden">
                {/* Margin of Safety Corridor (Between Price & Base IV) */}
                <div
                    className="absolute top-0 bottom-0 pointer-events-none transition-all duration-300"
                    style={{
                        left: `${leftMarginPct}%`,
                        width: `${marginWidthPct}%`,
                        backgroundColor: blocked ? 'color-mix(in oklch, var(--ink-2) 10%, transparent)' : price <= baseIv ? 'color-mix(in oklch, var(--pos) 12%, transparent)' : 'color-mix(in oklch, var(--neg) 12%, transparent)',
                        borderLeft: `1px dashed ${blocked ? MUTED : price <= baseIv ? TONE_COLORS.POS : TONE_COLORS.NEG}`,
                        borderRight: `1px dashed ${blocked ? MUTED : price <= baseIv ? TONE_COLORS.POS : TONE_COLORS.NEG}`,
                    }}
                />

                {/* Operating Leverage / Expansion Corridor (Between Base IV & Bull IV) */}
                <div
                    className="absolute top-0 bottom-0 pointer-events-none transition-all duration-300"
                    style={{
                        left: `${expansionLeftPct}%`,
                        width: `${expansionWidthPct}%`,
                        backgroundColor: 'color-mix(in oklch, var(--wash) 4%, transparent)',
                        borderRight: '1px dotted var(--rule-24)',
                    }}
                />

                {/* Bear Marker */}
                <div
                    className={`absolute top-0 bottom-0 w-[2px] ${blocked ? 'bg-off' : 'bg-neg'} flex flex-col items-center justify-start z-10`}
                    style={{ left: `${bearPct}%` }}
                    title={`Bear Case Intrinsic Value: ${fmtMoney(bearIv)}`}
                >
                    <span className={`w-2.5 h-2.5 rounded-full ${blocked ? 'bg-off' : 'bg-neg'} border border-page -mt-1 shadow-sm`} />
                </div>

                {/* Bull Marker */}
                <div
                    className="absolute top-0 bottom-0 w-[2px] bg-ink-2 flex flex-col items-center justify-start z-10"
                    style={{ left: `${bullPct}%` }}
                    title={`Bull Case Intrinsic Value: ${fmtMoney(bullIv)}`}
                >
                    <span className="w-2.5 h-2.5 rounded-full bg-ink-2 border border-page -mt-1 shadow-sm" />
                </div>

                {/* Base Case IV Marker */}
                <div
                    className={`absolute top-0 bottom-0 w-[3px] flex flex-col items-center justify-start z-20 ${blocked ? '' : 'bg-pos'}`}
                    style={{ left: `${basePct}%`, ...(blocked ? { backgroundColor: MUTED } : {}) }}
                    title={`Base Intrinsic Value: ${fmtMoney(baseIv)}`}
                >
                    <span
                        className={`w-3 h-3 border border-page -mt-1 shadow-md rotate-45 ${blocked ? '' : 'bg-pos'}`}
                        style={blocked ? { backgroundColor: MUTED } : undefined}
                    />
                </div>

                {/* Current Market Price Marker */}
                <div
                    className="absolute top-0 bottom-0 w-[3px] bg-ink flex flex-col items-center justify-end z-20"
                    style={{ left: `${pricePct}%` }}
                    title={`Market Price: ${fmtMoney(price)}`}
                >
                    <span className="w-3 h-3 bg-ink border border-page -mb-1 shadow-[0_0_8px_color-mix(in_oklch,var(--ink)_70%,transparent)]" />
                </div>
            </div>

            {/* Labels below the track */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-[11px] pt-1">
                {/* Bear Case */}
                <div className="p-2 border border-rule-10 bg-page rounded">
                    <span className="block text-ink-3 text-[10px] uppercase tracking-wider">Bear Case IV</span>
                    <span className={`text-[14px] font-bold ${blocked ? 'text-off' : 'text-neg'}`}>{fmtMoney(bearIv)}</span>
                    <span className={`block text-[10px] mt-0.5 ${blocked ? 'text-off' : 'text-neg/80'}`}>
                        {fmtSignedPct(downsidePct)} vs price
                    </span>
                </div>

                {/* Market Price */}
                <div className="p-2 border border-rule-18 bg-wash/[0.04] rounded">
                    <span className="block text-ink-3 text-[10px] uppercase tracking-wider">Market Price</span>
                    <span className="text-[14px] font-bold text-ink">{fmtMoney(price)}</span>
                    <span className="block text-[10px] text-ink-2 mt-0.5">Today&apos;s Quote</span>
                    {verdict.verdict_price != null && (
                        <span className="block text-[10px] text-ink-3 mt-0.5">
                            Price at verdict {fmtMoney(verdict.verdict_price)} on {verdict.date ?? '—'}
                        </span>
                    )}
                </div>

                {/* Base Case IV */}
                <div className={`p-2 border border-rule-14 rounded ${blocked ? 'bg-wash/[0.04]' : 'bg-pos/[0.04]'}`}>
                    <span className="block text-ink-3 text-[10px] uppercase tracking-wider">Base Case IV</span>
                    <span className={`text-[14px] font-bold ${blocked ? '' : 'text-pos'}`} style={blocked ? { color: MUTED } : undefined}>{fmtMoney(baseIv)}</span>
                    <span className={`block text-[10px] mt-0.5 ${blocked ? '' : 'text-pos/90'}`} style={blocked ? { color: MUTED } : undefined}>
                        {fmtSignedPct(mosPct)} Margin of Safety
                    </span>
                </div>

                {/* Bull Case */}
                <div className="p-2 border border-rule-10 rounded">
                    <span className="block text-ink-3 text-[10px] uppercase tracking-wider">Bull Case IV</span>
                    <span className={`text-[14px] font-bold ${blocked ? 'text-off' : 'text-pos'}`}>{fmtMoney(bullIv)}</span>
                    <span className={`block text-[10px] mt-0.5 ${blocked ? 'text-off' : 'text-pos/80'}`}>
                        {fmtSignedPct(bullUpsidePct)} Expansion
                    </span>
                </div>
            </div>

            {/* Summary Skew Bar */}
            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-rule-10 pt-3 text-[11px]">
                <div className="flex items-center gap-2">
                    <span className="text-ink-3">Asymmetric Payoff Skew:</span>
                    <span className="font-mono font-bold text-ink text-[12px]">
                        {skew != null ? `${skew.toFixed(2)}x` : '—'}
                    </span>
                    <span className="text-ink-3 text-[10px]">
                        ({skew != null && skew >= 2.0 ? 'Highly Asymmetric Reward/Risk' : skew != null && skew >= 1.0 ? 'Favorable Skew' : 'Symmetric / Unfavorable'})
                    </span>
                </div>
                <div className="text-ink-3 text-[10.5px]">
                    Bear case value: {fmtMoney(bearIv)}
                </div>
            </div>
        </div>
    );
}

'use client';

// The hero: a 58px track showing where today's price sits against the whole
// band, with one square dot per seeded run.

import React from 'react';
import { scaleBand } from '@/lib/desk/band';
import { heroFill, verdictTone } from '@/lib/desk/tone';
import { Micro } from '../primitives';
import { useLanguage } from '@/components/LanguageContext';
import type { DepthVerdict } from '@/lib/data-service';

const money = (v: number) => (Math.abs(v) >= 100 ? `$${Math.round(v)}` : `$${v.toFixed(2)}`);

export function BandChartHero({ verdict, runIvs }: { verdict: DepthVerdict; runIvs: number[] }) {
    const { t } = useLanguage();
    const g = scaleBand({
        price: verdict.price,
        low: verdict.iv_band_low,
        high: verdict.iv_band_high,
        median: verdict.median_iv,
        runs: runIvs,
    });
    if (!g.ok) {
        return (
            <p className="mt-5 text-[12px] text-ink-3">
                No band was computed for this name — every seeded run was rejected by the plausibility guards.
            </p>
        );
    }
    const tone = verdictTone(verdict.direction);
    const fill = heroFill(verdict.direction);

    return (
        <div className="mt-5">
            <div className="flex items-baseline justify-between gap-4">
                <Micro>{t('detailBandTitle')}</Micro>
                <Micro className="font-mono">{money(g.axisLo)} — {money(g.axisHi)}</Micro>
            </div>

            {/* band-end labels sit above the track ends */}
            <div className="relative mt-6 h-[58px] bg-track-4">
                <span
                    className="absolute font-mono text-[9px] text-ink-2"
                    style={{ left: `${g.bandLeft}%`, top: -2, transform: 'translate(-50%,-100%)' }}
                >
                    {verdict.iv_band_low != null ? money(verdict.iv_band_low) : ''}
                </span>
                <span
                    className="absolute font-mono text-[9px] text-ink-2"
                    style={{ left: `${g.bandLeft + g.bandWidth}%`, top: -2, transform: 'translate(-50%,-100%)' }}
                >
                    {verdict.iv_band_high != null ? money(verdict.iv_band_high) : ''}
                </span>

                <span
                    className="absolute"
                    style={{
                        left: `${g.bandLeft}%`, width: `${g.bandWidth}%`, top: 8, bottom: 8,
                        background: fill,
                        borderLeft: `1px solid ${tone.color}`,
                        borderRight: `1px solid ${tone.color}`,
                    }}
                />
                {g.medianAt !== null && (
                    <span className="absolute" style={{ left: `${g.medianAt}%`, top: 8, bottom: 8, width: 1, background: tone.color }} />
                )}
                {g.runsAt.map((x, i) => (
                    <span
                        key={i}
                        className="absolute"
                        style={{ left: `${x}%`, top: 24, width: 7, height: 7, marginLeft: -3.5, background: tone.color }}
                        title={`Run ${i + 1}: ${runIvs[i] != null ? money(runIvs[i]) : '—'}`}
                    />
                ))}
                {g.priceAt !== null && (
                    <span className="absolute" style={{ left: `${g.priceAt}%`, top: 0, bottom: 0, width: 2, background: '#e7e5e0' }} />
                )}
            </div>

            <div className="relative mt-1.5 h-4">
                {g.priceAt !== null && (
                    <span
                        className="absolute whitespace-nowrap font-mono text-[9px] font-semibold text-ink"
                        style={{ left: `${g.priceAt}%`, transform: 'translateX(-50%)' }}
                    >
                        {verdict.price != null ? money(verdict.price) : ''} TODAY
                    </span>
                )}
                {g.medianAt !== null && (
                    <span
                        className="absolute whitespace-nowrap font-mono text-[9px]"
                        style={{ left: `${g.medianAt}%`, transform: 'translateX(-50%)', color: tone.color }}
                    >
                        MED {verdict.median_iv != null ? money(verdict.median_iv) : ''}
                    </span>
                )}
            </div>
        </div>
    );
}

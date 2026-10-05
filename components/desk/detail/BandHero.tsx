'use client';

// The stock page's band hero (handoff 5.2.2), 112 px tall: the Street range above a 40 px track, bear
// and bull as dashed verticals, one 10 px square per usable run, the verdict's band segment, the 2 px
// price tick, and labels below. One axis over everything it draws (lib/desk/band.ts `makeAxis`).
// The drawing is hidden from screen readers; `aria-label` carries the same facts in a sentence.

import React from 'react';
import { useLanguage } from '@/components/LanguageContext';
import { fill } from '@/lib/desk/text';
import { heroFill, TONE_COLORS, verdictTone } from '@/lib/desk/tone';
import { heroMoney, heroView, labelAnchor, priceReading } from '@/lib/desk/stockPage';
import type { DeskVerdict } from '@/lib/desk/verdict';

const H = 112;
const TRACK_TOP = 26;
const TRACK_H = 40;
const LABEL_TOP = 70;
const LINE_H = 14;
/** Median and price labels closer than this (percent of the track) would collide: the median label drops to a third line. */
const COLLIDE = 40;

const TRANSFORM = { left: 'translateX(0)', center: 'translateX(-50%)', right: 'translateX(-100%)' } as const;

export function BandHero({ d, runIvs, live, atVerdict, blocked }: {
    d: DeskVerdict;
    runIvs: number[];
    /** Today's quote (stocks.csv), null when none is stored. */
    live: number | null;
    /** The price the analyst saw when it made the verdict. */
    atVerdict: number | null;
    blocked: boolean;
}) {
    const { t } = useLanguage();
    const g = heroView(d, runIvs, live, atVerdict);
    if (!g) return <p className="mt-4 text-[12px] text-ink-2">{t('pgNoBand')}</p>;

    const tone = verdictTone(d.direction);
    // A blocked verdict is never styled as a recommendation: its band is grey. The scenario markers
    // keep their meaning colours (bear neg, bull pos, median and price ink, runs ink-2).
    const color = blocked ? TONE_COLORS.MUTED : tone.color;
    const fillColor = blocked ? 'var(--track-18)' : heroFill(d.direction);
    const lo = d.iv_band_low!;
    const hi = d.iv_band_high!;
    const at = (v: number | null | undefined) => g.at(v);

    const priceVal = live ?? atVerdict;
    const priceAt = at(priceVal);
    const medAt = at(d.median_iv);
    const lowAt = at(lo) ?? 0;
    const highAt = at(hi) ?? 0;
    const bearAt = at(d.bear_iv);
    const bullAt = at(d.bull_iv);
    const sfLowAt = at(g.streetLow);
    const sfHighAt = at(g.streetHigh);

    // Bear/bull labels face inward (toward each other). When the two lines are too close for both
    // labels to fit between them (a phone-width track), the right-hand label drops to a second row.
    const close = bearAt != null && bullAt != null && Math.abs(bearAt - bullAt) < 46;
    const bearLeft = bearAt != null && bullAt != null ? bearAt <= bullAt : true;
    const bearFacesRight = bearLeft;
    const bullFacesRight = !bearLeft;
    const sideLabel = (pos: number, facesRight: boolean, text: string, c: string, row: number) => (
        <span
            className="absolute whitespace-nowrap font-mono text-[11px]"
            style={{ left: `${pos}%`, top: TRACK_TOP + 2 + row * 16, color: c, transform: facesRight ? 'translateX(4px)' : 'translateX(calc(-100% - 4px))' }}
        >
            {text}
        </span>
    );

    const priceAnchor = priceAt != null && priceAt > 70 ? 'right' : 'left';
    const medLine = priceAt != null && medAt != null && Math.abs(priceAt - medAt) < COLLIDE ? 2 : 0;

    const range = g.single ? `$${(d.median_iv ?? lo).toFixed(2)}` : `${heroMoney(lo)}–${heroMoney(hi).slice(1)}`;
    const reading = priceReading(priceVal, lo, hi);
    const sr = [
        g.single ? fill(t('dkSrOneRun'), { range }) : fill(t('dkSrBand'), { range, median: d.median_iv != null ? Math.round(d.median_iv) : '—' }),
        priceVal != null && reading !== 'unknown'
            ? fill(t('dkSrPrice'), { price: priceVal.toFixed(2), reading: t(reading === 'below' ? 'dkSrBelow' : reading === 'above' ? 'dkSrAbove' : 'dkSrInside') })
            : null,
        g.streetLow != null && g.streetHigh != null ? fill(t('hrStreet'), { range: `$${g.streetLow.toFixed(2)}–${g.streetHigh.toFixed(2)}` }) : null,
        d.bear_iv != null ? fill(t('hrBear'), { v: d.bear_iv.toFixed(2) }) : null,
        d.bull_iv != null ? fill(t('hrBull'), { v: d.bull_iv.toFixed(2) }) : null,
    ].filter(Boolean).join('; ');

    return (
        <div role="img" aria-label={sr} className="relative mt-4 w-full" style={{ height: H }}>
            <div aria-hidden>
                {/* Street range: 4 px bar above the track, labelled */}
                {sfLowAt != null && sfHighAt != null && (
                    <>
                        <span className="absolute" style={{ left: `${sfLowAt}%`, width: `${Math.max(0.6, sfHighAt - sfLowAt)}%`, top: 16, height: 4, background: '#cfd6df' }} />
                        <span
                            className="absolute whitespace-nowrap font-mono text-[11px] text-off"
                            style={{ left: `${sfLowAt}%`, top: 0, transform: TRANSFORM[labelAnchor(sfLowAt) === 'right' ? 'right' : 'left'] }}
                        >
                            {fill(t('hrStreet'), { range: `$${g.streetLow!.toFixed(2)}–${g.streetHigh!.toFixed(2)}` })}
                        </span>
                    </>
                )}

                <span className="absolute inset-x-0 bg-track-12" style={{ top: TRACK_TOP, height: TRACK_H }} />

                {/* Band segment (a range only; a single run is the square) */}
                {!g.single && (
                    <span
                        className="absolute"
                        style={{
                            left: `${lowAt}%`, width: `${Math.max(0.6, highAt - lowAt)}%`, top: TRACK_TOP + 8, height: TRACK_H - 16,
                            background: fillColor, borderLeft: `1px solid ${color}`, borderRight: `1px solid ${color}`,
                        }}
                    />
                )}

                {/* Bear and bull: dashed verticals with labels */}
                {bearAt != null && (
                    <>
                        <span className="absolute" style={{ left: `${bearAt}%`, top: TRACK_TOP, height: TRACK_H, borderLeft: '1px dashed var(--neg)' }} />
                        {sideLabel(bearAt, bearFacesRight, fill(t('hrBear'), { v: d.bear_iv!.toFixed(2) }), 'var(--neg)', close && !bearLeft ? 1 : 0)}
                    </>
                )}
                {bullAt != null && (
                    <>
                        <span className="absolute" style={{ left: `${bullAt}%`, top: TRACK_TOP, height: TRACK_H, borderLeft: '1px dashed var(--pos)' }} />
                        {sideLabel(bullAt, bullFacesRight, fill(t('hrBull'), { v: d.bull_iv!.toFixed(2) }), 'var(--pos)', close && bearLeft ? 1 : 0)}
                    </>
                )}

                {/* One 10 px square per usable run */}
                {g.runs.map((v, i) => {
                    const x = at(v);
                    return x == null ? null : (
                        <span
                            key={i}
                            className="absolute"
                            style={{ left: `${x}%`, top: TRACK_TOP + (TRACK_H - 10) / 2, width: 10, height: 10, marginLeft: -5, background: 'var(--ink-2)' }}
                        />
                    );
                })}

                {/* The price tick */}
                {priceAt != null && (
                    <span className="absolute bg-ink" style={{ left: `${priceAt}%`, top: TRACK_TOP - 3, height: TRACK_H + 6, width: 2, marginLeft: -1 }} />
                )}

                {/* Labels below */}
                {priceAt != null && (
                    <span
                        className="absolute whitespace-nowrap font-mono text-[11px] leading-[14px] text-ink"
                        style={{ left: `${priceAt}%`, top: LABEL_TOP, transform: priceAnchor === 'right' ? 'translateX(calc(-100% + 1px))' : 'translateX(-1px)' }}
                    >
                        {live != null && <span className="block font-semibold">{fill(t('hrToday'), { v: live.toFixed(2) })}</span>}
                        {atVerdict != null && <span className="block text-ink-2">{fill(t('hrAtVerdict'), { v: atVerdict.toFixed(2) })}</span>}
                    </span>
                )}
                {medAt != null && d.median_iv != null && (
                    <span
                        className="absolute whitespace-nowrap font-mono text-[11px] leading-[14px]"
                        style={{ left: `${medAt}%`, top: LABEL_TOP + medLine * LINE_H, color: 'var(--ink)', transform: TRANSFORM[labelAnchor(medAt)] }}
                    >
                        {fill(t(g.single ? 'hrOneRun' : 'hrMed'), { v: d.median_iv.toFixed(2) })}
                    </span>
                )}
            </div>
        </div>
    );
}

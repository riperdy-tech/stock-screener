'use client';

// "Price, 400 days" (handoff 5.2 right column, 3): the ticker's closes from daily_closes.json with the
// verdict's value band shaded across and a marker at the verdict date. The 4.7 MB file is fetched only
// here, after first paint, and shared by every ticker page through one module-level promise. Inline
// SVG, no dependency. A ticker with no series gets a plain sentence instead of a chart.

import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/components/LanguageContext';
import { fill } from '@/lib/desk/text';
import { chartGeometry, seriesFor, type DailyClosesPayload } from '@/lib/desk/priceSeries';
import { heroMoney } from '@/lib/desk/stockPage';
import { heroFill, TONE_COLORS } from '@/lib/desk/tone';
import type { DeskVerdict } from '@/lib/desk/verdict';
import { DASH } from './stockParts';

let pending: Promise<DailyClosesPayload | null> | null = null;

function loadCloses(): Promise<DailyClosesPayload | null> {
    if (!pending) {
        pending = fetch('/data/daily_closes.json')
            .then((r) => (r.ok ? (r.json() as Promise<DailyClosesPayload>) : null))
            .catch(() => null);
        // A failure must not stick: the next stock page may retry.
        pending.then((p) => { if (p === null) pending = null; });
    }
    return pending;
}

const W = 340;
const H = 120;

export function PriceChart({ ticker, d, blocked }: { ticker: string; d: DeskVerdict | undefined; blocked: boolean }) {
    const { t } = useLanguage();
    const [payload, setPayload] = useState<DailyClosesPayload | null | undefined>(undefined);

    useEffect(() => {
        let alive = true;
        // After first paint, so the 4.7 MB file never competes with the page's own content.
        const id = window.setTimeout(() => { loadCloses().then((p) => { if (alive) setPayload(p); }); }, 0);
        return () => { alive = false; window.clearTimeout(id); };
    }, [ticker]);

    const series = useMemo(() => (payload ? seriesFor(payload, ticker) : null), [payload, ticker]);
    const geo = useMemo(
        () => (series ? chartGeometry(series, { low: d?.iv_band_low ?? null, high: d?.iv_band_high ?? null, verdictDate: d?.date ?? null }, W, H) : null),
        [series, d],
    );

    if (payload === undefined) {
        return <div className="mt-3 flex items-center justify-center bg-track-12 font-mono text-[11px] text-off" style={{ height: H }}>{DASH}</div>;
    }
    if (!series || !geo) return <p className="mt-3 text-[13px] text-ink-2">{t('pgNoSeries')}</p>;

    const last = series.closes[series.closes.length - 1];
    const color = blocked ? TONE_COLORS.MUTED : TONE_COLORS.POS;
    const lo = d?.iv_band_low;
    const hi = d?.iv_band_high;
    const label = fill(t('pgChartLabel'), { n: series.dates.length, from: geo.first, to: geo.last, last: last.toFixed(2) });

    return (
        <div className="mt-3 min-w-0">
            <svg viewBox={`0 0 ${W} ${H}`} className="block w-full bg-page" role="img" aria-label={label} preserveAspectRatio="none" style={{ height: H }}>
                {geo.band && (
                    <rect
                        x={0} width={W} y={geo.band.top} height={Math.max(1.5, geo.band.bottom - geo.band.top)}
                        style={{ fill: blocked ? 'var(--track-18)' : heroFill(d?.direction) }}
                    />
                )}
                {geo.verdictX != null && (
                    <line x1={geo.verdictX} x2={geo.verdictX} y1={0} y2={H} stroke="var(--off)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                )}
                <path d={geo.path} fill="none" stroke="var(--ink)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="mt-1 flex justify-between font-mono text-[11px] text-ink-2">
                <span>{geo.first}</span><span>{geo.last}</span>
            </div>
            <p className="mt-1 break-words font-mono text-[11px] text-ink-2">
                {lo != null && hi != null && (
                    <>
                        <span aria-hidden className="mr-1 inline-block align-middle" style={{ width: 10, height: 7, background: blocked ? 'var(--track-18)' : heroFill(d?.direction), border: `1px solid ${color}` }} />
                        {fill(t('pgBandLegend'), { range: lo === hi ? `$${lo.toFixed(2)}` : `${heroMoney(lo)}–${heroMoney(hi).slice(1)}` })}
                    </>
                )}
                {geo.verdictX != null && d?.date && <> {'·'} {fill(t('pgVerdictLegend'), { date: d.date })}</>}
            </p>
        </div>
    );
}

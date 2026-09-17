'use client';

// Cell renderers shared by the three rankings lenses and the mobile cards.

import React from 'react';
import clsx from 'clsx';
import { scaleBand, bandLabel } from '@/lib/desk/band';
import { gapColor, sizeTone, verdictTone } from '@/lib/desk/tone';
import { fmtMcap, fmtMoney, fmtSignedPct } from '@/lib/desk/format';
import type { DeskRow } from '@/lib/desk/rankings';
import { Micro } from '../primitives';
import { useLanguage } from '@/components/LanguageContext';

/** 16px mini band strip: shaded band, median tick, 2px price tick. */
export function BandStrip({ row, height = 16, showSubline = true }: {
    row: DeskRow;
    height?: number;
    showSubline?: boolean;
}) {
    const d = row.depth;
    if (!d || d.iv_band_low == null || d.iv_band_high == null) {
        return <span className="font-mono text-[11px] text-ink-3">—</span>;
    }
    const tone = verdictTone(d.direction);
    const g = scaleBand({ price: d.price, low: d.iv_band_low, high: d.iv_band_high, median: d.median_iv });
    if (!g.ok) return <span className="font-mono text-[11px] text-ink-3">—</span>;

    return (
        <span className="block min-w-0">
            <span className="relative block bg-track-12" style={{ height }}>
                <span
                    className="absolute"
                    style={{
                        left: `${g.bandLeft}%`, width: `${g.bandWidth}%`, top: 2, bottom: 2,
                        background: tone.fill,
                        borderLeft: `1px solid ${tone.color}`,
                        borderRight: `1px solid ${tone.color}`,
                    }}
                />
                {g.medianAt !== null && (
                    <span className="absolute" style={{ left: `${g.medianAt}%`, top: 2, bottom: 2, width: 1, background: tone.color }} />
                )}
                {g.priceAt !== null && (
                    <span className="absolute" style={{ left: `${g.priceAt}%`, top: 0, bottom: 0, width: 2, background: '#f2f0eb' }} />
                )}
            </span>
            {showSubline && (
                <span className="mt-1 block font-mono text-[11px] text-ink-3">
                    {bandLabel(d.iv_band_low, d.iv_band_high, d.median_iv)}
                </span>
            )}
        </span>
    );
}

/** DEPTH VERDICT: the call in its colour, with the plain-English reason beneath. */
export function VerdictCell({ row }: { row: DeskRow }) {
    const { t } = useLanguage();
    const d = row.depth;
    if (!d) {
        return (
            <span className="block">
                <span className="block text-[13px] font-extrabold text-ink-3">—</span>
                <Micro className="mt-0.5 block normal-case tracking-normal text-ink-3">not yet analyzed</Micro>
            </span>
        );
    }
    const tone = verdictTone(d.direction);
    const label = tone.keys.label ? t(tone.keys.label) : tone.label;
    const subline = tone.keys.subline ? t(tone.keys.subline) : tone.subline;
    const action = tone.keys.action ? t(tone.keys.action) : null;
    // A partial size hint is still a buy, just a smaller one.
    const small = d.direction === 'undervalued' && d.size_hint && d.size_hint !== 'full';
    return (
        <span className="block min-w-0">
            <span className="block text-[13px] font-extrabold leading-tight" style={{ color: tone.color }}>{label}</span>
            <span className="mt-0.5 block truncate text-[11px] text-ink-3">
                {subline}{action ? ` · ${action}${small ? ' ▪' : ''}` : ''}
            </span>
        </span>
    );
}

/** MEDIAN GAP: how far the price sits under (or over) the median valuation. */
export function MedianGapCell({ row }: { row: DeskRow }) {
    const d = row.depth;
    const v = d?.mos_vs_median_pct;
    return (
        <span className="block text-right font-mono text-[13px] font-semibold" style={{ color: gapColor(v, d?.direction) }}>
            {fmtSignedPct(v)}
        </span>
    );
}

/**
 * SPREAD → SIZE. The tier comes straight from the pipeline; the desk never
 * derives it from the spread (production cutoffs and the original handoff
 * assumption disagree, and a single plausible run is capped regardless).
 */
export function SpreadSizeCell({ row }: { row: DeskRow }) {
    const d = row.depth;
    if (!d) return <span className="block font-mono text-[12px] text-ink-3">—</span>;
    const size = sizeTone(d.size_hint, d.n_basis);
    const spread = d.spread_pct != null ? `${d.spread_pct.toFixed(1)}%` : 'n/a';
    // A size hint is only meaningful where there is something to buy: a name the
    // price has already caught up with gets no allocation, whatever the spread.
    const sizable = d.direction === 'undervalued' && !!d.size_hint;
    return (
        <span className="block font-mono text-[12px] text-ink-2">
            {spread}{' '}
            <span className="text-[11px] font-semibold" style={{ color: sizable ? size.color : '#c3bfb5' }}>
                → {sizable ? size.label : '—'}
            </span>
        </span>
    );
}

/** QUANT FILTER: composite · rank · band, muted — context, not the verdict. */
export function QuantFilterCell({ row }: { row: DeskRow }) {
    const f = row.fct;
    const band = f.fct_band === 'research_now' ? 'rsrch'
        : f.fct_band === 'watchlist' ? 'watch'
            : f.fct_band === 'monitor' ? 'mon' : 'pass';
    return (
        <span className="block font-mono text-[11px] text-ink-3">
            {f.fct_composite != null ? f.fct_composite.toFixed(1) : '—'} · #{f.fct_rank ?? '—'} · {band}
        </span>
    );
}

export function StockCell({ row }: { row: DeskRow }) {
    return (
        <span className="block min-w-0">
            <span className="text-[15px] font-extrabold text-ink">{row.ticker}</span>
            <span className="ml-1.5 text-[11px] text-ink-2">{row.info?.name ?? ''}</span>
            <span className="mt-0.5 block truncate text-[11px] text-ink-3">{row.info?.sector ?? '—'}</span>
        </span>
    );
}

export function PriceCell({ row }: { row: DeskRow }) {
    return <span className="block text-right font-mono text-[12px] text-ink">{fmtMoney(row.depth?.price ?? row.info?.price)}</span>;
}

export function McapCell({ row }: { row: DeskRow }) {
    return <span className="block text-right font-mono text-[11px] text-ink-2">{fmtMcap(row.info?.marketCap)}</span>;
}

/** 104×6px stacked factor-mix bar — value/quality/momentum/low-vol/revisions. */
const FACTOR_COLORS: [string, string][] = [
    ['value', '#5a9b6d'], ['quality', '#6b93c4'], ['momentum', '#cfa14e'],
    ['lowvol', '#9a83c2'], ['revisions', '#c2798f'],
];

export function FactorMix({ contributions, width = 104 }: { contributions: Record<string, number> | null; width?: number }) {
    if (!contributions) return <span className="block font-mono text-[11px] text-ink-3">—</span>;
    const vals = FACTOR_COLORS.map(([k]) => Math.max(0, contributions[k] ?? 0));
    const total = vals.reduce((a, b) => a + b, 0);
    if (total <= 0) return <span className="block font-mono text-[11px] text-ink-3">—</span>;
    return (
        <span className="flex" style={{ width, height: 6, background: 'rgba(255,255,255,.12)' }}
            title={FACTOR_COLORS.map(([k], i) => `${k} ${(vals[i] / total * 100).toFixed(0)}%`).join(' · ')}>
            {FACTOR_COLORS.map(([k, color], i) => (
                <span key={k} style={{ width: `${(vals[i] / total) * 100}%`, background: color }} />
            ))}
        </span>
    );
}

/** Overlay evidence: geopolitical-risk level and informed-demand direction. */
export function OverlayChips({ overlay }: { overlay: any }) {
    if (!overlay) return null;
    const gpr = overlay.gpr;
    const demand = overlay.informed_demand;
    const gprColor = gpr?.gpr_level >= 3 ? '#e2917f' : gpr?.gpr_level === 2 ? '#cfa14e' : '#d3cfc5';
    return (
        <span className="inline-flex items-center gap-2">
            {gpr && gpr.gpr_level !== undefined && (
                <span className="font-mono font-semibold text-[11px] uppercase tracking-[.06em]" style={{ color: gprColor }}
                    title={`Geopolitical exposure ${gpr.gpr_level}/3${gpr.channels?.length ? ` (${gpr.channels.join(', ')})` : ''}: ${gpr.note || ''}`}>
                    GPR {gpr.gpr_level}
                </span>
            )}
            {demand === 1 && <span className="font-mono text-[11px] text-pos" title="Insider net buying without rising short interest">▲ INSIDERS</span>}
            {demand === -1 && <span className="font-mono text-[11px] text-neg" title="Insider selling with elevated short interest">▼ INSIDERS</span>}
        </span>
    );
}

/** Promotion / demotion vs the quant filter, shown under the verdict. */
export function PromoLine({ row, delta }: { row: DeskRow; delta: number | null }) {
    if (row.promo === 'none' || !row.fct.fct_rank) return null;
    const up = row.promo === 'promoted';
    return (
        <span className={clsx('mt-1 block font-mono font-semibold text-[11px] uppercase tracking-[.06em]', up ? 'text-accent' : 'text-warn')}>
            {up ? '▲ AI PROMOTED' : '▼ AI DEMOTED'} #{row.fct.fct_rank}
            {delta != null && delta !== 0 ? ` · Δ${Math.abs(delta)}` : ''}
        </span>
    );
}

/** Institutional Contract Cells (Charter v3.1 / Section 12) */

export function MoatCell({ row }: { row: DeskRow }) {
    const m = row.moat;
    if (m == null) return <span className="font-mono text-[11px] text-ink-3">—</span>;
    const isWide = m >= 4.0;
    const isNarrow = m >= 3.0;
    return (
        <span className="block font-mono text-[12px] font-semibold" title={isWide ? 'Wide Moat (Installed Base / High Switching Costs)' : isNarrow ? 'Narrow Moat' : 'Low Barrier / Commodity'}>
            <span className={isWide ? 'text-accent' : isNarrow ? 'text-ink' : 'text-warn'}>
                ★ {m.toFixed(1)}
            </span>
            <span className="text-[10px] text-ink-3">/5</span>
        </span>
    );
}

export function ConvictionCell({ row }: { row: DeskRow }) {
    const c = row.conviction;
    if (c == null) return <span className="font-mono text-[11px] text-ink-3">—</span>;
    const isHigh = c >= 12;
    const isCore = c >= 9;
    return (
        <span className="block font-mono text-[12px] font-semibold" title={isHigh ? 'High Conviction Core' : isCore ? 'Standard Underwriting' : 'Speculative / Watch'}>
            <span className={isHigh ? 'text-pos font-bold' : isCore ? 'text-ink' : 'text-ink-3'}>
                {c.toFixed(0)}
            </span>
            <span className="text-[10px] text-ink-3">/15</span>
        </span>
    );
}

export function HalfKellyCell({ row }: { row: DeskRow }) {
    const k = row.kelly;
    if (k == null) return <span className="font-mono text-[11px] text-ink-3">—</span>;
    const active = k > 0 && row.depth?.direction === 'undervalued';
    return (
        <span className={clsx('block font-mono text-[12px] font-semibold', active ? 'text-pos' : 'text-ink-3')} title="Half-Kelly Portfolio Allocation Limit Cap">
            {k > 0 ? `${k.toFixed(1)}%` : '0.0%'}
        </span>
    );
}

export function SkewCell({ row }: { row: DeskRow }) {
    const s = row.skew;
    if (s == null) return <span className="font-mono text-[11px] text-ink-3">—</span>;
    const isAsymm = s >= 1.5;
    return (
        <span className={clsx('block font-mono text-[12px] font-semibold', isAsymm ? 'text-accent font-bold' : 'text-ink-2')} title="Asymmetric Payoff Skew (Bull Upside vs Bear Drawdown Risk)">
            {s.toFixed(2)}x
        </span>
    );
}

export function TriadCell({ row }: { row: DeskRow }) {
    const d = row.depth;
    if (!d) return <span className="font-mono text-[11px] text-ink-3">—</span>;
    const bear = row.bearIv;
    const base = d.median_iv;
    const bull = row.bullIv;
    if (base == null) return <span className="font-mono text-[11px] text-ink-3">—</span>;
    return (
        <span className="block font-mono text-[11px] leading-tight">
            <span className="text-ink font-semibold">{fmtMoney(base, 0)}</span>
            {(bear != null || bull != null) && (
                <span className="block text-[10px] text-ink-3">
                    {bear != null ? fmtMoney(bear, 0) : '—'} · {bull != null ? fmtMoney(bull, 0) : '—'}
                </span>
            )}
        </span>
    );
}


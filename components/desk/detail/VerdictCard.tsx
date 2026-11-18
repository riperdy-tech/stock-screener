'use client';

// The top card of the stock page: the AI verdict (lib/desk/aiVerdict.ts) with its source, date and one-line reason; one
// comparison strip (the price, our value, the analysts' target on a single scale, each with its upside and date); at
// most four points from the verdict's source; the warnings that source already produced. Every number names where it
// comes from and when. Paper only.

import React from 'react';
import { useLanguage } from '@/components/LanguageContext';
import type { GeminiCRow, OpusVerdict } from '@/lib/data-service';
import { aiVerdict, type AiSource } from '@/lib/desk/aiVerdict';
import { fmtMoney } from '@/lib/desk/format';
import { OPUS_VERDICT_COLOR, opusMoney, opusNoCallText } from '@/lib/desk/opusText';
import { plainNoValueReason } from '@/lib/desk/qwenText';
import { signedPct } from '@/lib/desk/rowText';
import { fill } from '@/lib/desk/text';
import { TONE_COLORS } from '@/lib/desk/tone';
import { ourValue, stripPos, stripScale, upside, type AnalystTarget, type OurValue, type StripScale } from '@/lib/desk/yardstick';
import { OpusChip } from '../rankings/DeskParts';
import { DASH } from './stockParts';

type T = ReturnType<typeof useLanguage>['t'];

const MAX_POINTS = 4;
const SRC_KEY = { gemini: 'gcSrcGemini', opus: 'gcSrcOpus', sonnet: 'gcSrcSonnet' } as const;

/** The verdict's source in words: "Claude Sonnet, read of the filings" or "Claude quick valuation". */
const sourceName = (t: T, s: AiSource) => (s === 'claude' ? t('stTabClaude') : fill(t('stSrcRead'), { m: t(SRC_KEY[s]) }));

const upColor = (u: number | null, far = false) => (u == null ? TONE_COLORS.MUTED : far ? 'var(--warn)' : u >= 0 ? 'var(--pos)' : 'var(--neg)');

/** One line of the strip: its label and figures, then its track on the shared scale with the price tick through it. */
function StripRow({ label, children, scale, price, bar, mark, color, thin = false }: {
    label: string;
    children: React.ReactNode;
    scale: StripScale | null;
    price: number | null;
    /** The low and high ends of the bar; null draws no bar. */
    bar?: [number, number] | null;
    /** The mark inside the bar (our base value, the analysts' mean). */
    mark?: number | null;
    color?: string;
    thin?: boolean;
}) {
    const h = thin ? 4 : 12;
    const top = (18 - h) / 2;
    return (
        <div className="mt-2.5 min-w-0">
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-[12px] text-ink-2">
                <span className="font-sans text-[12px] font-semibold text-ink">{label}</span>
                {children}
            </p>
            <span aria-hidden className="relative mt-1 block" style={{ height: 18 }}>
                <span className="absolute inset-x-0 bg-track-12" style={{ top: 3, height: 12 }} />
                {scale && bar && (
                    <span
                        className="absolute"
                        style={{
                            left: `${stripPos(bar[0], scale)}%`, width: `${stripPos(bar[1], scale) - stripPos(bar[0], scale)}%`, minWidth: 2,
                            top, height: h, background: thin ? color : 'var(--track-18)',
                            ...(thin ? {} : { borderLeft: `1px solid ${color}`, borderRight: `1px solid ${color}` }),
                        }}
                    />
                )}
                {scale && mark != null && (
                    <span className="absolute" style={{ left: `${stripPos(mark, scale)}%`, top: 2, height: 14, width: 4, marginLeft: -2, background: color }} />
                )}
                {scale && price != null && (
                    <span className="absolute" style={{ left: `${stripPos(price, scale)}%`, top: 0, bottom: 0, width: 2, marginLeft: -1, background: 'var(--ink)' }} />
                )}
            </span>
        </div>
    );
}

function oursText(t: T, v: OurValue): string {
    const m = (x: number | null) => opusMoney(x, v.currency);
    if (v.low == null || v.high == null) return m(v.base);
    return fill(t(v.kind === 'scenarios' ? 'stOursScen' : v.kind === 'range' ? 'stOursRange' : 'stOursRuns'), { base: m(v.base), low: m(v.low), high: m(v.high) });
}

export function VerdictCard({ geminiC, opus, live, priceDate, target }: {
    geminiC: GeminiCRow | undefined;
    opus: OpusVerdict | undefined;
    live: number | null;
    /** The session the price is for (`YYYY-MM-DD`); null when the price file does not say. */
    priceDate: string | null;
    target: AnalystTarget | null;
}) {
    const { t } = useLanguage();
    const ai = aiVerdict({ geminiC, opus });
    const read = ai != null && ai.source !== 'claude';
    const ours = ourValue({ geminiC, opus });

    // The verdict's date and one-line reason, from the source that gave it.
    const date = !ai ? null : read ? geminiC?.date.slice(0, 10) : (opus?.review?.checked_on ?? opus?.captured_at?.slice(0, 10) ?? opus?.price_date);
    const noCallWhy = !ai ? t('stWhyNoAi')
        : read ? (plainNoValueReason(geminiC?.no_value_reason) ?? plainNoValueReason(geminiC?.verdict_reason))
            : opusNoCallText(t, opus?.no_call_reason);
    // A no call's reason is said once, in the strip ("no value from us: ...").
    const reason = !ai || ai.verdict === 'NO_CALL' ? null
        : read ? plainNoValueReason(geminiC?.verdict_reason) : (opus?.review?.one_line ?? null);

    // Up to four points and the warnings, as the source's own panel shows them.
    const points = (!ai ? [] : read ? (geminiC?.flags ?? []) : (opus?.review?.reasons ?? [])).slice(0, MAX_POINTS);
    const m = ai && ai.source !== 'claude' ? t(SRC_KEY[ai.source]) : '';
    const warnings: string[] = [];
    if (read && geminiC?.valued && geminiC.far_from_price) warnings.push(t('pgQwFar'));
    if (read && geminiC?.valued && geminiC.seeds_agree === false) warnings.push(fill(t('pgGcSeeds'), { m }));
    if (ai?.source === 'claude' && opus?.sensitivity && !opus.sensitivity.holds_across_band) warnings.push(t('opRateShifts'));
    const cyclical = geminiC?.family === 'commodity' && ours != null && ours.kind === 'scenarios';

    const oursUp = ours ? upside(ours.base, live) : null;
    const anUp = target && target.comparable ? upside(target.mean, live) : null;
    const anMoney = (v: number | null) => opusMoney(v, target?.currency ?? 'USD');
    const scale = stripScale([
        live, ours?.base, ours?.low, ours?.high,
        ...(target && target.comparable ? [target.mean, target.low, target.high] : []),
    ]);
    const color = ai ? OPUS_VERDICT_COLOR[ai.verdict] : TONE_COLORS.MUTED;
    const vs = (u: number | null, c: string) => u != null && <span className="font-semibold" style={{ color: c }}>{fill(t('stVsPrice'), { x: signedPct(u * 100, 0) })}</span>;

    return (
        <section className="mt-4 min-w-0 border border-rule-14 px-4 py-3.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-[11px] text-off">{t('stAiVerdict')}</span>
                {ai ? <OpusChip o={ai} large /> : <span className="text-[13px] font-semibold text-ink-2">{t('stNoVerdict')}</span>}
                {ai && <span className="font-mono text-[11px] text-ink-2">{fill(t('stSrcDate'), { src: sourceName(t, ai.source), d: date ?? t('stDateUnknown') })}</span>}
            </div>
            {reason && <p className="mt-1.5 break-words text-[13px] leading-relaxed text-ink">{reason}</p>}

            <div className="mt-3 border-t border-rule-10 pt-1">
                <StripRow label={t('stPrice')} scale={scale} price={live}>
                    <span className="text-ink">{live != null ? fmtMoney(live) : DASH}</span>
                    <span>{priceDate ? fill(t('stPriceDate'), { d: priceDate }) : t('stDateUnknown')}</span>
                </StripRow>
                {ours ? (
                    <StripRow
                        label={t('stOurs')} scale={scale} price={live} color={color}
                        bar={ours.low != null && ours.high != null ? [ours.low, ours.high] : null} mark={ours.base}
                    >
                        <span className="text-ink">{oursText(t, ours)}</span>
                        {vs(oursUp, upColor(oursUp, ours.far))}
                        <span>{fill(t('stSrcDate'), { src: sourceName(t, ours.source), d: ours.date ?? t('stDateUnknown') })}</span>
                    </StripRow>
                ) : (
                    <p className="mt-2.5 break-words text-[12px] text-ink-2">
                        <span className="font-semibold text-ink">{t('stOurs')}</span>{' '}
                        {fill(t('stNoValue'), { reason: noCallWhy ?? t('stWhyNoReason') })}
                    </p>
                )}
                {target ? (
                    <StripRow
                        label={t('stAnalysts')} scale={target.comparable ? scale : null} price={live} color="var(--ink-2)" thin
                        bar={target.low != null && target.high != null ? [target.low, target.high] : null} mark={target.mean}
                    >
                        <span className="text-ink">{fill(t('stAnMean'), { mean: anMoney(target.mean) })}</span>
                        {target.low != null && target.high != null && <span>{fill(t('stAnRange'), { low: anMoney(target.low), high: anMoney(target.high) })}</span>}
                        {target.comparable ? vs(anUp, upColor(anUp)) : <span>{t('stAnOtherCur')}</span>}
                        <span>{fill(t('stAnSrc'), { src: target.source ?? t('stYahoo'), d: target.asOf ?? t('stDateUnknown') })}</span>
                    </StripRow>
                ) : (
                    <p className="mt-2.5 text-[12px] text-ink-2">
                        <span className="font-semibold text-ink">{t('stAnalysts')}</span>{' '}{t('stAnNone')}
                    </p>
                )}
            </div>

            {points.length > 0 && (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-[12px] leading-relaxed text-ink-2">
                    {points.map((p, i) => <li key={i} className="break-words">{p}</li>)}
                </ul>
            )}
            {warnings.map((w) => <p key={w} className="mt-2 break-words font-mono text-[11px] text-warn">{w}</p>)}
            {cyclical && <p className="mt-2 break-words font-mono text-[11px] text-warn">{t('stCyclical')}</p>}
            <p className="mt-3 text-[11px] text-ink-3">{t('stPaper')}</p>
        </section>
    );
}

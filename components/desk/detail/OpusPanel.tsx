'use client';

// The Opus valuation view on the stock page (stocks-workspace/baselines/opus/SPEC.md v1). An outside model read the
// pinned filings three times and gave inputs; code did the arithmetic and the verdict. Paper only, shown beside, never
// inside, this system's verdict. Only numbers the file carries are shown; a null is a dash, never 0.

import React from 'react';
import { useLanguage } from '@/components/LanguageContext';
import type { OpusVerdict } from '@/lib/data-service';
import { OPUS_VERDICT_KEY, opusClaudeRange, opusFlagText, opusGap, opusMarketView, opusMoney, opusNoCallText, opusRangeEnds } from '@/lib/desk/opusText';
import { signedPct } from '@/lib/desk/rowText';
import { fill } from '@/lib/desk/text';
import { TONE_COLORS } from '@/lib/desk/tone';
import { OpusChip } from '../rankings/DeskParts';
import { DASH } from './stockParts';

const METHOD_KEY = {
    fcf_dcf: 'pgOpusMFcf', normalized_earnings: 'pgOpusMEarn', excess_return: 'pgOpusMExcess',
    affo: 'pgOpusMAffo', sum_of_parts: 'pgOpusMParts',
} as const;
const SCENARIO_KEY = { bear: 'pgOpusSBear', base: 'pgOpusSBase', bull: 'pgOpusSBull', tail: 'pgOpusSTail' } as const;
// SPEC 5's checks, each named by its failure. `bad` is the value that fails it.
const CHECK = {
    data_ok: { bad: false, key: 'pgOpusCData' },
    going_concern: { bad: true, key: 'pgOpusCGoing' },
    covenant_or_liquidity_risk: { bad: true, key: 'pgOpusCCovenant' },
    balance_sheet_incomplete: { bad: true, key: 'pgOpusCBalance' },
    reported_since_latest_filing: { bad: true, key: 'pgOpusCReported' },
} as const;

const RV_SOUND = { sound: 'opRvSound', partly_sound: 'opRvPartly', unsound: 'opRvUnsound' } as const;
const RV_VIEW = { about_right: 'opRvAbout', too_low: 'opRvLow', too_high: 'opRvHigh', not_meaningful: 'opRvNoMeaning' } as const;

const has = <T extends object>(m: T, k: string | null | undefined): k is Extract<keyof T, string> =>
    k != null && Object.prototype.hasOwnProperty.call(m, k);

/** A check's boolean: the value itself, or an object's `value`; null when the file says something else. */
function checkBool(v: unknown): boolean | null {
    if (typeof v === 'boolean') return v;
    if (v && typeof v === 'object' && typeof (v as { value?: unknown }).value === 'boolean') return (v as { value: boolean }).value;
    return null;
}

export function OpusPanel({ o }: { o: OpusVerdict }) {
    const { t } = useLanguage();
    // Values are per listed share in the price currency; a dollar sign only when the file says USD.
    const money = (v: number | null | undefined) => opusMoney(v, o.currency);
    const pct = (v: number | null | undefined) => (v == null ? DASH : `${v.toFixed(1)}%`);
    const prob = (v: number | null | undefined) => (v == null ? DASH : `${Math.round(v * 100)}%`);

    const failed: string[] = [];
    const unread: string[] = [];
    for (const [name, raw] of Object.entries(o.checks ?? {})) {
        const b = checkBool(raw);
        if (has(CHECK, name) && b !== null) {
            if (b === CHECK[name].bad) failed.push(t(CHECK[name].key));
        } else {
            unread.push(`${name}=${JSON.stringify(raw)}`);
        }
    }
    const method = o.method == null ? DASH : has(METHOD_KEY, o.method) ? t(METHOD_KEY[o.method]) : o.method;
    const scenarios = o.scenarios ?? [];
    const reason = o.verdict === 'NO_CALL' ? opusNoCallText(t, o.no_call_reason) : null;
    // Claude's range from the review leads when there is one (gap from its midpoint); else the code's value, as before.
    const rng = opusClaudeRange(o);
    const ends = rng ? opusRangeEnds(rng, o.currency) : null;
    const gap = opusGap(rng ? (rng[0] + rng[1]) / 2 : o.value?.median, o.price);
    const view = o.market_view ? opusMarketView(t, o.market_view) : null;
    const rv = o.review ?? null;

    return (
        <section className="mt-4 border-l-2 border-rule-14 px-4 py-3 text-[13px] leading-relaxed text-ink">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <b className="font-semibold">{t('pgOpusTitle')}</b>
                <OpusChip o={o} large title={reason ?? undefined} />
                {o.verdict === 'NO_CALL' && (
                    <span className="text-ink-2">{fill(t('pgOpusNoCallWhy'), { reason: reason ?? DASH })}</span>
                )}
            </div>
            {rv && (
                <div className="mt-1.5 text-[12px] text-ink-2">
                    <p>
                        <b className="font-semibold text-ink">{fill(t('opRvHead'), { date: rv.checked_on })}</b>{' '}
                        {rv.change !== 'same' && (
                            <span className={rv.change === 'raised' || rv.change === 'from_no_call' ? 'text-pos' : 'text-warn'}>
                                {fill(t('opRvMoved'), { before: has(OPUS_VERDICT_KEY, rv.code_verdict) ? t(OPUS_VERDICT_KEY[rv.code_verdict]) : rv.code_verdict })}{' '}
                            </span>
                        )}
                        {rv.one_line}
                    </p>
                    <p className="font-mono text-[11px] text-ink-3">
                        {fill(t('opRvJudged'), {
                            sound: has(RV_SOUND, rv.soundness) ? t(RV_SOUND[rv.soundness]) : rv.soundness,
                            view: has(RV_VIEW, rv.value_view) ? t(RV_VIEW[rv.value_view]) : rv.value_view,
                        })}
                        {rv.fair_value_range && <>{' · '}{fill(t('opRvRange'), { low: money(rv.fair_value_range[0]), high: money(rv.fair_value_range[1]) })}</>}
                    </p>
                    {rv.reasons.length > 0 && (
                        <ul className="mt-1 list-disc pl-4">
                            {rv.reasons.map((r, i) => <li key={i}>{r}</li>)}
                        </ul>
                    )}
                    {rv.events.length > 0 && (
                        <ul className="mt-1 font-mono text-[11px] text-ink-3">
                            {rv.events.map((e, i) => (
                                <li key={i}>
                                    {e.date ?? DASH}{' · '}{e.fact ?? DASH}
                                    {e.source_url && /^https?:\/\//.test(e.source_url) && (
                                        <>{' '}<a href={e.source_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-ink">{t('opDeepSource')}</a></>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                    <p className="mt-1.5 font-mono text-[11px] text-ink-3">{t('opRvCode')}</p>
                </div>
            )}
            <p className="mt-1.5 font-mono text-[13px] text-ink">
                {ends
                    ? fill(t('opPgHeadRange'), { low: ends[0], high: ends[1], price: money(o.price), date: o.price_date ?? DASH })
                    : fill(t('opPgHead'), { value: money(o.value?.median), price: money(o.price), date: o.price_date ?? DASH })}
                {' · '}
                <span style={{ color: gap == null ? TONE_COLORS.MUTED : gap >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                    {fill(t('opPgGap'), { gap: gap == null ? DASH : signedPct(gap * 100, 0) })}
                </span>
            </p>
            <p className="font-mono text-[11px] text-ink-3">
                {rng
                    ? fill(t('opPgCode'), { median: money(o.value?.median), low: money(o.value?.low), high: money(o.value?.high), spread: pct(o.spread_pct) })
                    : fill(t('opPgRange'), { low: money(o.value?.low), high: money(o.value?.high), spread: pct(o.spread_pct) })}
            </p>
            <p className="mt-1 font-mono text-[12px] text-ink-2">{fill(t('pgOpusMethod'), { method })}</p>
            {scenarios.length > 0 && (
                <table className="mt-2 font-mono text-[12px] text-ink-2">
                    <thead>
                        <tr className="text-left text-[11px] text-ink-3">
                            <th className="pr-6 font-normal">{t('pgOpusScenario')}</th>
                            <th className="pr-6 text-right font-normal">{t('pgOpusProb')}</th>
                            <th className="text-right font-normal">{t('pgOpusVal')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {scenarios.map((s, i) => (
                            <tr key={`${s.name}-${i}`}>
                                <td className="pr-6">{has(SCENARIO_KEY, s.name) ? t(SCENARIO_KEY[s.name]) : (s.name ?? DASH)}</td>
                                <td className="pr-6 text-right">{prob(s.probability)}</td>
                                <td className="text-right">{money(s.value)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            {view ? (
                <dl className="mt-2 text-[12px]">
                    {view.map(([label, text]) => (
                        <React.Fragment key={label}>
                            <dt className="font-mono text-[11px] text-ink-3">{label}</dt>
                            <dd className="mb-1 text-ink-2">{text}</dd>
                        </React.Fragment>
                    ))}
                </dl>
            ) : o.market_view && <p className="mt-2 text-[12px] text-ink-2">{fill(t('pgOpusView'), { view: o.market_view })}</p>}
            {/* A no-call with no checks on file says nothing about checks: "none failed" would be a claim the file does not make. */}
            {o.checks != null && (
                <p className={`mt-1 font-mono text-[11px] ${failed.length > 0 ? 'text-warn' : 'text-ink-3'}`}>
                    {failed.length > 0 ? fill(t('pgOpusChecksFailed'), { checks: failed.join(', ') }) : t('pgOpusChecksNone')}
                </p>
            )}
            {unread.length > 0 && (
                <p className="font-mono text-[11px] text-ink-3">{fill(t('pgOpusChecksOther'), { checks: unread.join(', ') })}</p>
            )}
            {(o.data_flags ?? []).length > 0 && (
                <p className="font-mono text-[11px] text-warn">{fill(t('pgOpusFlags'), { flags: o.data_flags.map((f) => opusFlagText(t, f)).join(' · ') })}</p>
            )}
            <p className="mt-1 text-[12px] text-ink-3">{fill(t('opPgNotSeen'), { date: o.price_date ?? DASH })}</p>
            <p className="text-[12px] text-ink-3">{t('pgOpusNote')}</p>
        </section>
    );
}

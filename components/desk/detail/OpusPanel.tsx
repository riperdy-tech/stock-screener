'use client';

// The Opus valuation view on the stock page (stocks-workspace/baselines/opus/SPEC.md v1). An outside model read the
// pinned filings three times and gave inputs; code did the arithmetic and the verdict. Paper only, shown beside, never
// inside, this system's verdict. Only numbers the file carries are shown; a null is a dash, never 0.

import React from 'react';
import { useLanguage } from '@/components/LanguageContext';
import type { OpusVerdict } from '@/lib/data-service';
import { fmtMoney } from '@/lib/desk/format';
import { fill } from '@/lib/desk/text';
import { DASH } from './stockParts';

const VERDICT_KEY = { BUY: 'pgOpusBuy', WATCH: 'pgOpusWatch', AVOID: 'pgOpusAvoid', NO_CALL: 'pgOpusNoCall' } as const;
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
    const cur = o.currency;
    // Values are per listed share in the price currency; a dollar sign only when the file says USD.
    const money = (v: number | null | undefined) => {
        if (v == null) return DASH;
        if (cur === 'USD') return fmtMoney(v);
        const n = v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return cur ? `${n} ${cur}` : n;
    };
    const ratio = (v: number | null | undefined) => (v == null ? DASH : `${v.toFixed(2)}×`);
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

    return (
        <section className="mt-4 border-l-2 border-rule-14 px-4 py-3 text-[13px] leading-relaxed text-ink">
            <div className="flex flex-wrap items-baseline gap-x-3">
                <b className="font-semibold">{t('pgOpusTitle')}</b>
                <span className="font-semibold">{has(VERDICT_KEY, o.verdict) ? t(VERDICT_KEY[o.verdict]) : (o.verdict ?? DASH)}</span>
                {o.verdict === 'NO_CALL' && (
                    <span className="text-ink-2">{fill(t('pgOpusNoCallWhy'), { reason: o.no_call_reason ?? DASH })}</span>
                )}
                <span className="font-mono text-[11px] text-ink-3">
                    {fill(t('pgOpusPrice'), { price: money(o.price), date: o.price_date ?? DASH })}
                </span>
            </div>
            <p className="mt-1 font-mono text-[12px] text-ink-2">
                {fill(t('pgOpusValue'), {
                    median: money(o.value?.median), low: money(o.value?.low), high: money(o.value?.high),
                    vtp: ratio(o.value_to_price), spread: pct(o.spread_pct),
                })}
            </p>
            <p className="font-mono text-[12px] text-ink-2">{fill(t('pgOpusMethod'), { method })}</p>
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
            {o.market_view && <p className="mt-2 text-[12px] text-ink-2">{fill(t('pgOpusView'), { view: o.market_view })}</p>}
            <p className={`mt-1 font-mono text-[11px] ${failed.length > 0 ? 'text-warn' : 'text-ink-3'}`}>
                {failed.length > 0 ? fill(t('pgOpusChecksFailed'), { checks: failed.join(', ') }) : t('pgOpusChecksNone')}
            </p>
            {unread.length > 0 && (
                <p className="font-mono text-[11px] text-ink-3">{fill(t('pgOpusChecksOther'), { checks: unread.join(', ') })}</p>
            )}
            {(o.data_flags ?? []).length > 0 && (
                <p className="font-mono text-[11px] text-warn">{fill(t('pgOpusFlags'), { flags: o.data_flags.join(', ') })}</p>
            )}
            <p className="mt-1 text-[12px] text-ink-3">{t('pgOpusNote')}</p>
        </section>
    );
}

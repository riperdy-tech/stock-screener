'use client';

// The interim Gemini view on the stock page (operator decision 2026-10-13). An outside, unvalidated,
// paper-only analyst shown beside — never inside — this system's verdict. Its data-check flags are
// shown as they are; a flagged row is still shown (annotate, never silently gate).

import React from 'react';
import { useLanguage } from '@/components/LanguageContext';
import type { GeminiVerdict } from '@/lib/data-service';
import { fmtMoney } from '@/lib/desk/format';
import { fill } from '@/lib/desk/text';
import { DASH } from './stockParts';

const DIR_KEY = { undervalued: 'pgGemUnder', hold: 'pgGemHold', overvalued: 'pgGemOver' } as const;

const money = (v: number | null | undefined) => (v == null ? DASH : fmtMoney(v));
const millions = (v: number | null | undefined) => (v == null ? DASH : `${v.toLocaleString('en-US')}M`);

export function GeminiPanel({ g }: { g: GeminiVerdict }) {
    const { t } = useLanguage();
    const fv = g.fair_value;
    const rev = g.forecast?.revenue;
    return (
        <section className="mt-4 border-l-2 border-rule-14 px-4 py-3 text-[13px] leading-relaxed text-ink">
            <div className="flex flex-wrap items-baseline gap-x-3">
                <b className="font-semibold">{t('pgGemTitle')}</b>
                <span>{g.direction ? t(DIR_KEY[g.direction]) : DASH}</span>
                <span className="font-mono text-[11px] text-ink-3">
                    {fill(t('pgGemAsOf'), { date: g.as_of ?? DASH, model: g.model ?? DASH })}
                </span>
            </div>
            <p className="mt-1 font-mono text-[12px] text-ink-2">
                {fill(t('pgGemFv'), { p10: money(fv?.p10), p50: money(fv?.p50), p90: money(fv?.p90), price: money(g.price) })}
            </p>
            {rev && (
                <p className="font-mono text-[12px] text-ink-2">
                    {fill(t('pgGemNext'), { label: g.target_period?.label ?? DASH, p10: millions(rev.p10), p50: millions(rev.p50), p90: millions(rev.p90) })}
                </p>
            )}
            {g.data_flags.length > 0 && (
                <p className="mt-1 font-mono text-[11px] text-warn">{fill(t('pgGemFlags'), { flags: g.data_flags.join(', ') })}</p>
            )}
            <p className="mt-1 text-[12px] text-ink-3">{t('pgGemNote')}</p>
        </section>
    );
}

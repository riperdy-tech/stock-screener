'use client';

// Qwen's analysis on the stock page (operator 2026-11-06): the local model's reading of the company's filings, the value code
// computes from its choices where both runs agree, and what its paper book did with the name. Shown as it is: a value far from the
// price or a disagreement between runs is labelled, never hidden (annotate, never silently gate). Paper only.

import React, { useEffect, useState } from 'react';
import { useLanguage } from '@/components/LanguageContext';
import { fetchQwenReport, type QwenReport } from '@/lib/data-service';
import { fmtMoney } from '@/lib/desk/format';
import { plainNoValueReason } from '@/lib/desk/qwenText';
import { fill } from '@/lib/desk/text';
import { DASH } from './stockParts';

const TASKS = ['business_model', 'financial_health', 'competitive_position', 'growth_thesis', 'risks', 'thesis_change',
    'unresolved_questions', 'material_events'] as const;
const TASK_KEY: Record<(typeof TASKS)[number], string> = {
    business_model: 'pgQwTaskBusiness', financial_health: 'pgQwTaskHealth', competitive_position: 'pgQwTaskCompetition',
    growth_thesis: 'pgQwTaskGrowth', risks: 'pgQwTaskRisks', thesis_change: 'pgQwTaskChange',
    unresolved_questions: 'pgQwTaskOpen', material_events: 'pgQwTaskEvents',
};

const money = (v: number | null | undefined) => (v == null ? DASH : fmtMoney(v));
const pct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(0)}%`;

export function QwenPanel({ ticker, live, listed }: { ticker: string; live: number | null; listed: boolean }) {
    const { t } = useLanguage();
    const [q, setQ] = useState<QwenReport | null | undefined>(undefined);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        let alive = true;
        setQ(undefined);
        fetchQwenReport(ticker).then((r) => { if (alive) setQ(r); });
        return () => { alive = false; };
    }, [ticker]);

    if (q === undefined) return null;
    if (q === null) {
        return (
            <section className="mt-4 border-l-2 border-accent px-4 py-3 text-[13px] leading-relaxed text-ink">
                <b className="font-semibold">{t('pgQwTitle')}</b>
                <p className="mt-1 text-[12px] text-ink-2">{t(listed ? 'pgQwNone' : 'pgQwNoneOff')}</p>
            </section>
        );
    }
    const price = live ?? q.price_at_publish ?? null;
    const upside = q.valued && q.value_base != null && price ? q.value_base / price - 1 : null;
    return (
        <section className="mt-4 border-l-2 border-accent px-4 py-3 text-[13px] leading-relaxed text-ink">
            <div className="flex flex-wrap items-baseline gap-x-3">
                <b className="font-semibold">{t('pgQwTitle')}</b>
                <span className="font-mono text-[11px] text-ink-3">{fill(t('pgQwAsOf'), { date: q.date.slice(0, 10), source: q.source })}</span>
            </div>

            {q.valued ? (
                <p className="mt-1 font-mono text-[12px] text-ink-2">
                    {fill(t('pgQwValue'), { bear: money(q.value_bear), base: money(q.value_base), bull: money(q.value_bull), price: money(price) })}
                    {upside != null && <span className={upside >= 0 ? ' text-pos' : ' text-neg'}> {pct(upside)}</span>}
                </p>
            ) : (
                <p className="mt-1 text-[12px] text-ink-2">
                    {fill(t(q.analysis === 'not run' ? 'pgQwNotRun' : 'pgQwNoValue'), { reason: plainNoValueReason(q.no_value_reason) ?? DASH })}
                </p>
            )}
            {q.valued && q.far_from_price && <p className="font-mono text-[11px] text-warn">{t('pgQwFar')}</p>}
            {q.valued && q.seeds_agree === false && <p className="font-mono text-[11px] text-ink-3">{t('pgQwSeeds')}</p>}
            {q.share_unit_note && <p className="font-mono text-[11px] text-ink-3">{q.share_unit_note}</p>}

            <p className="mt-1 text-[12px] text-ink-2">
                {fill(t('pgQwBook'), { code: q.in_code_book ? t('pgQwYes') : t('pgQwNo'), qwen: q.qwen_book ?? DASH })}
            </p>
            {q.flags.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-[12px] text-warn">
                    {q.flags.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
            )}

            <button type="button" onClick={() => setOpen(!open)} className="mt-2 font-mono text-[11px] text-accent hover:text-ink">
                {open ? t('pgQwHide') : fill(t('pgQwShow'), { n: String(q.claims ?? 0), ok: String(q.claims_supported ?? 0) })}
            </button>
            {open && (
                <div className="mt-2 space-y-3">
                    {TASKS.filter((k) => (q.tasks[k] ?? []).length > 0).map((k) => (
                        <div key={k}>
                            <b className="text-[12px] font-semibold">{t(TASK_KEY[k] as Parameters<typeof t>[0])}</b>
                            <ul className="mt-1 list-disc space-y-1 pl-5 text-[12px] text-ink-2">
                                {q.tasks[k].map((c, i) => (
                                    <li key={i}>
                                        {c.claim}
                                        {c.support !== 'supported' && <span className="font-mono text-[10px] text-ink-3"> ({t('pgQwUnsupported')})</span>}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                    {(q.valuation?.unknowns ?? []).length > 0 && (
                        <div>
                            <b className="text-[12px] font-semibold">{t('pgQwUnknowns')}</b>
                            <ul className="mt-1 list-disc pl-5 text-[12px] text-ink-2">
                                {(q.valuation?.unknowns ?? []).map((u, i) => <li key={i}>{u}</li>)}
                            </ul>
                        </div>
                    )}
                </div>
            )}
            <p className="mt-2 text-[12px] text-ink-3">{t('pgQwNote')}</p>
        </section>
    );
}

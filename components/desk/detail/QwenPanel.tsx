'use client';

// The AI analysis on the stock page (gemini_c_reports): the AI analyst's reading of the company's filings and the value code
// computes from its choices where both runs agree. Shown as it is: a value far from the
// price or a disagreement between runs is labelled, never hidden (annotate, never silently gate). Paper only.

import React, { useEffect, useState } from 'react';
import { useLanguage } from '@/components/LanguageContext';
import { fetchGeminiCReport, type OpusVerdictCode, type QwenReport } from '@/lib/data-service';
import { fmtMoney } from '@/lib/desk/format';
import { plainNoValueReason } from '@/lib/desk/qwenText';
import { fill } from '@/lib/desk/text';
import { OpusChip } from '../rankings/DeskParts';
import { DecidedSection } from './DecidedSection';
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

/** The panel for the AI analyst's report (gemini_c_reports): its title and notes, its verdict and reason on top. */
export function QwenPanel({ ticker, live }: { ticker: string; live: number | null }) {
    const { t } = useLanguage();
    const [q, setQ] = useState<(QwenReport & { verdict?: string; verdict_reason?: string; model?: string }) | null | undefined>(undefined);
    const [open, setOpen] = useState(false);
    const m = (q?.model ?? '').includes('sonnet') ? 'Claude Sonnet' : (q?.model ?? '').includes('claude') ? 'Claude Opus' : 'Gemini';   // the gemini_c files hold both arms; the report says which

    useEffect(() => {
        let alive = true;
        setQ(undefined);
        fetchGeminiCReport(ticker).then((r) => { if (alive) setQ(r); });
        return () => { alive = false; };
    }, [ticker]);

    if (q === undefined) return null;
    if (q === null) return null;   // there is no "none on file" text: the page only mounts it for a name with a row
    const price = live ?? q.price_at_publish ?? null;
    const upside = q.valued && q.value_base != null && price ? q.value_base / price - 1 : null;
    return (
        <section className="mt-4 border-l-2 border-accent px-4 py-3 text-[13px] leading-relaxed text-ink">
            <div className="flex flex-wrap items-baseline gap-x-3">
                <b className="font-semibold">{fill(t('pgGcTitle'), { m })}</b>
                {q.verdict && <OpusChip o={{ verdict: q.verdict as OpusVerdictCode }} />}
                <span className="font-mono text-[11px] text-ink-3">{fill(t('pgQwAsOf'), { date: q.date.slice(0, 10), source: q.source })}</span>
            </div>
            {q.verdict_reason && <p className="mt-1 text-[12px] text-ink-2">{q.verdict_reason}</p>}
            {q.under_review && (
                <p className="mt-1 text-[12px] text-warn">{fill(t('pgNwReview'), { date: q.under_review.since, why: q.under_review.why })}</p>
            )}
            {(q.news_read?.in_value?.inputs ?? []).length > 0 && (
                <p className="mt-1 text-[12px] text-warn">
                    {fill(t('pgNwInValue'), { inputs: (q.news_read?.in_value?.inputs ?? []).join(', ') })}
                </p>
            )}

            {q.valued ? (
                <p className="mt-1 font-mono text-[12px] text-ink-2">
                    {fill(t('pgQwValue'), { bear: money(q.value_bear), base: money(q.value_base), bull: money(q.value_bull), price: money(price) })}
                    {upside != null && <span className={upside >= 0 ? ' text-pos' : ' text-neg'}> {pct(upside)}</span>}
                </p>
            ) : (
                <p className="mt-1 text-[12px] text-ink-2">
                    {fill(t(q.analysis === 'not run' ? 'pgGcNotRun' : 'pgQwNoValue'), { reason: plainNoValueReason(q.no_value_reason) ?? DASH, m })}
                </p>
            )}
            {q.decided && <DecidedSection q={q} d={q.decided} price={price} />}
            {q.valued && q.far_from_price && <p className="font-mono text-[11px] text-warn">{t('pgQwFar')}</p>}
            {q.valued && q.seeds_agree === false && <p className="font-mono text-[11px] text-ink-3">{fill(t('pgGcSeeds'), { m })}</p>}
            {q.share_unit_note && <p className="font-mono text-[11px] text-ink-3">{q.share_unit_note}</p>}

            {q.flags.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-[12px] text-warn">
                    {q.flags.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
            )}

            {(q.news ?? []).length > 0 && (
                <div className="mt-2">
                    <b className="text-[12px] font-semibold">{fill(t('pgNwTitle'), { n: String((q.news ?? []).length) })}</b>
                    <ul className="mt-1 space-y-2 text-[12px] text-ink-2">
                        {(q.news ?? []).map((w) => (
                            <li key={w.id}>
                                <span className="font-mono text-[11px] text-ink-3">{w.day}</span>{' '}
                                <a href={w.url} target="_blank" rel="noopener noreferrer" className="text-ink hover:text-accent">{w.headline}</a>
                                {w.serious && <span className="font-mono text-[10px] text-warn"> ({t('pgNwSerious')})</span>}
                                {w.outlets > 1 && <span className="font-mono text-[10px] text-ink-3"> {fill(t('pgNwOutlets'), { n: String(w.outlets) })}</span>}
                                <div>{w.why}</div>
                                {w.new_matter
                                    ? <div className="text-ink-3">{t('pgNwNew')}</div>
                                    : w.touches.slice(0, 2).map((p) => <div key={p.id} className="text-ink-3">{fill(t('pgNwTouches'), { claim: p.claim })}</div>)}
                            </li>
                        ))}
                    </ul>
                    <p className="mt-1 text-[11px] text-ink-3">{t('pgNwNote')}</p>
                </div>
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
                            <b className="text-[12px] font-semibold">{fill(t('pgGcUnknowns'), { m })}</b>
                            <ul className="mt-1 list-disc pl-5 text-[12px] text-ink-2">
                                {(q.valuation?.unknowns ?? []).map((u, i) => <li key={i}>{u}</li>)}
                            </ul>
                        </div>
                    )}
                </div>
            )}
            <p className="mt-2 text-[12px] text-ink-3">{fill(t('pgGcNote'), { m })}</p>
        </section>
    );
}

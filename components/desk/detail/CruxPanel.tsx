'use client';

// "What the price gets wrong" (handoff 5.2.3): the stated disagreement between the analyst and the
// price. For each crux input a number line with two diamonds (price-implied above, the analyst's own
// below), the analyst's argument as a quote (verbatim), and one line for the inputs no single value
// of which explains the price. The view model is lib/desk/stockPage.ts `cruxView`.

import React from 'react';
import { useLanguage } from '@/components/LanguageContext';
import { fill } from '@/lib/desk/text';
import { cruxView, labelAnchor, type CruxEntryView } from '@/lib/desk/stockPage';
import type { DeskVerdict } from '@/lib/desk/verdict';
import { Sec } from './stockParts';

const TRANSFORM = { left: 'translateX(0)', center: 'translateX(-50%)', right: 'translateX(-100%)' } as const;

function Diamond({ at, color }: { at: number; color: string }) {
    return (
        <span
            aria-hidden
            className="absolute"
            style={{ left: `${at}%`, top: 23, width: 10, height: 10, marginLeft: -5, background: color, transform: 'rotate(45deg)' }}
        />
    );
}

function NumberLine({ e }: { e: CruxEntryView }) {
    const { t } = useLanguage();
    const label = (at: number, text: string, top: number, color: string) => (
        <span
            className="absolute whitespace-nowrap font-mono text-[11px]"
            style={{ left: `${at}%`, top, color, transform: TRANSFORM[labelAnchor(at)] }}
        >
            {text}
        </span>
    );
    return (
        <div className="relative mt-3 h-[62px]" role="img" aria-label={`${fill(t('cxPriceImplies'), { v: e.impliedText ?? t('cxNotReachable') })}; ${fill(t('cxAnalyst'), { v: e.ownText })}`}>
            <span aria-hidden className="absolute inset-x-0 bg-ink" style={{ top: 28, height: 1 }} />
            {e.impliedAt != null && e.impliedText != null && (
                <>
                    <Diamond at={e.impliedAt} color="var(--neg)" />
                    {label(e.impliedAt, fill(t('cxPriceImplies'), { v: e.impliedText }), 4, 'var(--neg)')}
                </>
            )}
            {e.impliedText == null && (
                <span className="absolute left-0 top-1 font-mono text-[11px] text-ink-2">
                    {fill(t('cxPriceImplies'), { v: t('cxNotReachable') })}
                </span>
            )}
            {e.ownAt != null && (
                <>
                    <Diamond at={e.ownAt} color="var(--ink)" />
                    {label(e.ownAt, fill(t('cxAnalyst'), { v: e.ownText }), 40, 'var(--ink)')}
                </>
            )}
        </div>
    );
}

export function CruxPanel({ d }: { d: DeskVerdict }) {
    const { t } = useLanguage();
    const c = cruxView(d);
    const list = c.otherUnreachable.map((o) => (o.labelKey ? t(o.labelKey).toLowerCase() : o.input)).join(', ');

    return (
        <Sec title={t('cxTitle')} sub={t('cxSub')} className="mt-6">
            {c.none ? (
                <p className="mt-3 text-[13px] text-ink-2">{t('cxNone')}</p>
            ) : (
                <div className="mt-3 bg-page px-3.5 py-3.5">
                    {c.entries.map((e, i) => (
                        <div key={e.input} className={i > 0 ? 'mt-4 border-t border-rule-14 pt-4' : undefined}>
                            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                                <h3 className="min-w-0 break-words text-[15px] font-semibold text-ink">
                                    {e.labelKey ? t(e.labelKey) : <span className="font-mono text-[13px]">{e.input}</span>}
                                </h3>
                                {(c.valid || e.atDefault) && (
                                    <span className="font-mono text-[11px] text-ink-2">
                                        {[c.valid ? t('cxValid') : null, e.atDefault ? t('cxAtDefault') : null].filter(Boolean).join(' · ')}
                                    </span>
                                )}
                            </div>
                            <NumberLine e={e} />
                            {e.reason && (
                                <blockquote className="mt-2 break-words border-l-2 border-rule-14 pl-3 text-[13px] leading-relaxed text-ink-q">
                                    {'“'}{e.reason}{'”'}
                                </blockquote>
                            )}
                        </div>
                    ))}
                    {c.otherUnreachable.length > 0 && (
                        <p className="mt-3.5 break-words font-mono text-[11px] leading-relaxed text-ink-2">
                            {fill(t('cxOthers'), { list })}
                        </p>
                    )}
                    {c.invalid && (
                        <p className="mt-3.5 break-words font-mono text-[12px] font-semibold text-warn">{t('cxInvalid')}</p>
                    )}
                </div>
            )}
        </Sec>
    );
}

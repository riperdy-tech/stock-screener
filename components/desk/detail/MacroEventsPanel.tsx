'use client';

// MRI news candidates touching this stock (MRI-15, Stage 1; operator decisions of 2026-10-22). A candidate is a news
// report, not a confirmed event; the market line says what the market did in the two trading days after it, which
// is not evidence that the news caused it. Display only: nothing here changes a score, rank or verdict.

import React from 'react';
import { useLanguage } from '@/components/LanguageContext';
import type { MacroEventsPayload } from '@/lib/data-service';
import { macroEventsFor, macroEventsStale } from '@/lib/desk/macroEvents';
import type { TRANSLATIONS } from '@/lib/i18n';
import { fill } from '@/lib/desk/text';
import { DASH } from './stockParts';

type Key = keyof typeof TRANSLATIONS['en'];

const RESULT_KEY: Record<string, Key> = {
    aligned: 'pgEvResAligned', opposed: 'pgEvResOpposed', mixed: 'pgEvResMixed', no_signal: 'pgEvResNone',
    pending: 'pgEvResPending', data_unavailable: 'pgEvResNoData', recorded: 'pgEvResRecorded',
};
const TIER_KEY: Record<'named' | 'peer' | 'sector', Key> = { named: 'pgEvNamed', peer: 'pgEvPeer', sector: 'pgEvSector' };

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : DASH);
const theme = (id: string) => id.replace(/_/g, ' ');

export function MacroEventsPanel({ p, ticker, sector }: { p: MacroEventsPayload | null; ticker: string; sector?: string | null }) {
    const { t } = useLanguage();
    const items = macroEventsFor(p, ticker, sector);
    if (!p || items.length === 0) return null;
    const stale = macroEventsStale(p);
    return (
        <section className="mt-4 border-l-2 border-rule-14 px-4 py-3 text-[13px] leading-relaxed text-ink">
            <div className="flex flex-wrap items-baseline gap-x-3">
                <b className="font-semibold">{t('pgEvTitle')}</b>
                <span className="font-mono text-[11px] text-ink-3">{fill(t('pgEvAsOf'), { date: p.register_as_of_date ?? DASH })}</span>
                {stale && <span className="font-mono text-[11px] text-warn">{t('pgEvStale')}</span>}
            </div>
            <ul className="mt-1 space-y-2">
                {items.map(({ tier, c }) => {
                    const scored = c.market.filter((m) => m.result !== 'display_only' && m.result !== 'not_scored');
                    const company = c.company.find((k) => k.ticker === ticker.toUpperCase());
                    return (
                        <li key={c.candidate_id}>
                            <div>{c.title ?? DASH}</div>
                            <div className="font-mono text-[11px] text-ink-3">
                                {[
                                    day(c.onset),
                                    t(TIER_KEY[tier]),
                                    c.corroboration === 'single_source' ? t('pgEvSingle') : fill(t('pgEvSources'), { n: String(c.publisher_count ?? DASH) }),
                                    c.status === 'closed' ? t('pgEvClosed') : null,
                                    c.classified ? null : t('pgEvUnclassified'),
                                ].filter(Boolean).join(' · ')}
                            </div>
                            {scored.length > 0 && (
                                <div className="font-mono text-[11px] text-ink-2">
                                    {t('pgEvMarket')}{' '}
                                    {scored.map((m) => `${theme(m.theme_id)}: ${t(RESULT_KEY[m.result] ?? 'pgEvResNoData')}${m.provisional ? ` (${t('pgEvProvisional')})` : ''}`).join('; ')}
                                </div>
                            )}
                            {company && (
                                <div className="font-mono text-[11px] text-ink-2">
                                    {fill(t('pgEvCompany'), {
                                        bench: company.benchmark ?? DASH,
                                        res: t(RESULT_KEY[company.result] ?? 'pgEvResNoData'),
                                        z: company.z == null ? DASH : company.z.toFixed(1),
                                    })}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
            <p className="mt-2 text-[12px] text-ink-3">{t('pgEvNote')}</p>
        </section>
    );
}

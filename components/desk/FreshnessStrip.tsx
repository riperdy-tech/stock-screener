'use client';

// Mono 11px strip under the masthead: prices as of, book scored, latest verdict, health dot, and
// (only when the MRI file loaded) the macro chip, which links to /macro. A stale stamp turns warn with a leading dot.
// Handoff README 4.2.

import React from 'react';
import Link from 'next/link';
import { useLanguage } from '@/components/LanguageContext';
import type { MriCostOfCapital, MriRegime } from '@/lib/data-service';
import { fmtMd, fmtMdHm, pctText, strengthKey, type Freshness, type Health, type HealthLevel } from '@/lib/desk/health';

export const LEVEL_COLOR: Record<HealthLevel, string> = {
    ok: 'var(--pos)', warn: 'var(--warn)', neg: 'var(--neg)',
};

function Stamp({ label, value, stale }: { label: string; value: string; stale?: boolean }) {
    return (
        <span className={stale ? 'text-warn' : undefined}>
            {stale && <span aria-hidden>● </span>}
            {label} {value}
        </span>
    );
}

export function FreshnessStrip({ fresh, health, regime, anchor, onOpenHealth }: {
    fresh: Freshness;
    health: Health;
    regime: MriRegime | null;
    anchor: MriCostOfCapital | null;
    onOpenHealth: () => void;
}) {
    const { t } = useLanguage();
    const strength = strengthKey(regime?.confidence);

    return (
        <div className="border-b border-rule-10">
            <div className="mx-auto flex max-w-desk flex-wrap items-baseline gap-x-[18px] gap-y-1 px-5 py-2 font-mono text-[11px] text-ink-2 sm:px-10">
                <Stamp label={t('fsPrices')} value={fmtMdHm(fresh.pricesAsOf)} stale={fresh.pricesStale} />
                <Stamp label={t('fsBook')} value={fmtMd(fresh.bookScoredAt)} stale={fresh.bookStale} />
                {fresh.phase === 'A'
                    ? <Stamp label={`${t('fsVerdict')}:`} value={t('fsAnalystNotLive')} stale />
                    : <Stamp label={t('fsVerdict')} value={fmtMd(fresh.verdictAt)} stale={fresh.verdictStale} />}
                <button
                    type="button"
                    onClick={onOpenHealth}
                    aria-label={t('hdOpen')}
                    title={health.reasons.join(' · ') || undefined}
                    className="hover:text-ink"
                >
                    {t('fsHealth')} <span style={{ color: LEVEL_COLOR[health.level] }}>●</span>
                </button>

                {regime && (
                    <Link href="/macro" className="w-full hover:text-ink sm:ml-auto sm:w-auto">
                        {t('fsMacro')}: {regime.reported_regime?.replace(/_/g, ' ') ?? '—'}{' '}
                        {pctText(regime.reported_regime_probability, 0)}
                        {strength && <> · {t(strength)}</>}
                        {' '}· {t('fsCoE')} {pctText(anchor?.implied_cost_of_equity, 2)} ›
                    </Link>
                )}
            </div>
        </div>
    );
}

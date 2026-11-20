'use client';

// Measured sensitivities of this stock to the drivers that moved (WO_MS1): what it gained or lost against the index when
// the market, rates or oil moved, measured on its own past prices. The sentences are the file's own, shown in every
// language. Display only: nothing here changes a score, rank or verdict.

import React from 'react';
import { useLanguage } from '@/components/LanguageContext';
import type { StockDriverFlags } from '@/lib/data-service';
import { driverFlagsFor } from '@/lib/desk/marketState';
import { fill } from '@/lib/desk/text';
import { DASH } from './stockParts';

export function DriverFlagsPanel({ p, ticker }: { p: StockDriverFlags | null; ticker: string }) {
    const { t } = useLanguage();
    const flags = driverFlagsFor(p, ticker);
    if (flags === null) return null;
    return (
        <section className="mt-4 border-l-2 border-rule-14 px-4 py-3 text-[13px] leading-relaxed text-ink">
            <div className="flex flex-wrap items-baseline gap-x-3">
                <b className="font-semibold">{t('pgDfTitle')}</b>
                <span className="font-mono text-[11px] text-ink-3">{fill(t('pgDfAsOf'), { date: p?.as_of ?? DASH })}</span>
            </div>
            {flags.length === 0
                ? <p className="mt-1 text-ink-2">{t('pgDfNone')}</p>
                : <ul className="mt-1 space-y-2">{flags.map((f, i) => <li key={i}>{f}</li>)}</ul>}
            <p className="mt-2 text-[12px] text-off">{t('pgDfNote')}</p>
        </section>
    );
}

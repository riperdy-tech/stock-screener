'use client';

// Hits from searchUniverse (lib/desk/funnel.ts): ticker, company name, and what the screen said about
// the name. Shared by the funnel's search box (steps 1-2) and the Desk filter row, so a company that
// is not on the list (e.g. NVDA, which cleared no door) can still be found and read.

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/components/LanguageContext';
import type { FactorScoresPayload } from '@/lib/data-service';
import { searchUniverse, type UniverseHit } from '@/lib/desk/funnel';
import { fill } from '@/lib/desk/text';
import { vetoFallback, vetoKey } from '@/lib/desk/veto';
import { useStockHref } from '@/lib/desk/useStockHref';
import type { StockInfo } from '@/lib/desk/useDeskData';

type Tr = (k: never) => string;

function hitLine(t: Tr, c: UniverseHit['check']): string {
    const tt = t as unknown as (k: string) => string;
    if (c.kind === 'vetoed') {
        const k = vetoKey(c.code);
        return fill(tt('dsVetoed'), { reason: `${k ? tt(k) : vetoFallback(c.code)}${c.detail ? ` (${c.detail})` : ''}` });
    }
    if (c.kind === 'scored') {
        const band = c.band === 'research_now' ? tt('bandResearchNow') : c.band === 'watchlist' ? tt('bandWatchlist') : tt('srchNoDoor');
        // The rank only means something inside the list (queue position); for a name that cleared no door it is just a score order.
        const onList = c.band === 'research_now' || c.band === 'watchlist';
        return fill(tt('srchScored'), { band: onList && c.rank != null ? `${band} #${c.rank}` : band });
    }
    return '';
}

/**
 * The matches for `query`, one line each. `exclude` drops symbols the page already shows elsewhere.
 * With no match it prints the "nothing matches" line (unless `quietWhenEmpty`).
 */
export function UniverseHits({ factor, stockInfo, query, exclude, quietWhenEmpty = false }: {
    factor: FactorScoresPayload | null;
    stockInfo: Record<string, StockInfo> | null;
    query: string;
    exclude?: ReadonlySet<string>;
    quietWhenEmpty?: boolean;
}) {
    const { t } = useLanguage();
    const stockLink = useStockHref();
    const hits = useMemo(
        () => searchUniverse(factor, stockInfo, query, 12).filter((h) => !exclude?.has(h.symbol)).slice(0, 6),
        [factor, stockInfo, query, exclude],
    );
    const asked = query.trim().length > 0 && factor != null;
    if (!asked) return null;
    if (hits.length === 0) return quietWhenEmpty ? null : <p className="font-mono text-[12px] text-ink-2">{fill(t('srchUnknown'), { t: query.trim() })}</p>;
    return (
        <div className="space-y-1 font-mono text-[12px] text-ink-2">
            {hits.map((h) => (
                <p key={h.symbol} className="flex flex-wrap items-baseline gap-x-3">
                    <Link href={stockLink(h.symbol)} className="font-semibold text-accent hover:text-ink">{h.symbol}</Link>
                    {h.name && <span className="text-ink">{h.name}</span>}
                    <span>{hitLine(t as unknown as Tr, h.check)}</span>
                </p>
            ))}
        </div>
    );
}

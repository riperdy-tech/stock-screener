'use client';

// Builds the link from a Desk surface to a stock page, carrying the Desk's own URL state
// (`?step`, `how`, filters) in `?from=` so the stock page's back link returns to exactly this view.

import { useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { stockHref } from './stockPage';

export function useStockHref(): (ticker: string) => string {
    const path = usePathname();
    const params = useSearchParams();
    const qs = params.toString();
    const here = `${path || '/'}${qs ? `?${qs}` : ''}`;
    return useCallback((ticker: string) => stockHref(ticker, here), [here]);
}
